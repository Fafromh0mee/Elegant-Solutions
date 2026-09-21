import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the real server actions with auth and the data layer mocked, so we
// can prove non-admins never reach the database and bad input is rejected.

const authMock = vi.hoisted(() => vi.fn());
const data = vi.hoisted(() => ({
  listAdminRooms: vi.fn(async () => ({ rooms: [], total: 0, page: 1, pageSize: 25, buildings: [], healthCounts: {} })),
  getAdminRoomDetail: vi.fn(async () => null),
  createRoom: vi.fn(async () => ({ ok: true, value: { id: "new-room" } })),
  updateRoomConfiguration: vi.fn(async () => ({ ok: true, value: undefined })),
  replaceRoomAvailabilityWindows: vi.fn(async () => ({ ok: true, value: { count: 0 } })),
  createRoomClosure: vi.fn(async () => ({ ok: true, value: { id: "closure" } })),
  deleteRoomClosure: vi.fn(async () => ({ ok: true, value: undefined })),
  deactivateRoom: vi.fn(async () => ({ ok: true, value: undefined })),
  deleteRoomIfUnused: vi.fn(async () => ({ ok: true, value: { roomCode: "X" } })),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/room-admin", () => data);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The student-facing action in the same file uses prisma; it must never be touched here.
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: () => { throw new Error("prisma must not be used by admin actions"); } }),
}));

const actions = await import("@/actions/rooms");

const VALID_CONFIG = {
  name: "ห้อง Lab",
  roomCode: "LAB-01",
  description: "",
  building: "",
  floor: null,
  capacity: 15,
  capabilities: ["LAB"],
  isActive: true,
  bookingEnabled: true,
  approvalPolicy: "MANUAL",
  guestAccess: false,
  staffOnly: false,
};

const mutations: Array<[string, () => Promise<unknown>]> = [
  ["listAdminRoomsAction", () => actions.listAdminRoomsAction({})],
  ["getAdminRoomDetailAction", () => actions.getAdminRoomDetailAction("room-1")],
  ["createRoomAction", () => actions.createRoomAction({ name: "x", roomCode: "X-1", capacity: 1 })],
  ["updateRoomConfigurationAction", () => actions.updateRoomConfigurationAction("room-1", VALID_CONFIG)],
  ["replaceRoomAvailabilityWindowsAction", () => actions.replaceRoomAvailabilityWindowsAction("room-1", [])],
  [
    "createRoomClosureAction",
    () => actions.createRoomClosureAction("room-1", { startDate: "2099-01-05", endDate: "2099-01-05", slots: [] }),
  ],
  ["deleteRoomClosureAction", () => actions.deleteRoomClosureAction("room-1", "closure-1")],
  ["deactivateRoomAction", () => actions.deactivateRoomAction("room-1")],
  ["deleteRoomAction", () => actions.deleteRoomAction("room-1")],
];

const dataCalls = () => Object.values(data).reduce((sum, fn) => sum + fn.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("1. admin authorization", () => {
  const nonAdmins: Array<[string, unknown]> = [
    ["no session", null],
    ["STUDENT", { user: { id: "u1", role: "STUDENT" } }],
    ["GUEST", { user: { id: "u2", role: "GUEST" } }],
  ];

  for (const [who, session] of nonAdmins) {
    it.each(mutations)(`${who}: %s is refused and never reaches the data layer`, async (_name, call) => {
      authMock.mockResolvedValue(session);
      const result = await call();
      expect(result).toMatchObject({ errorCode: "UNAUTHORIZED", error: "ไม่มีสิทธิ์ดำเนินการ" });
      expect(dataCalls()).toBe(0);
    });
  }

  it.each(["ADMIN", "SUPER_ADMIN"])("%s may run every action", async (role) => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role } });
    for (const [, call] of mutations) {
      const result = (await call()) as { errorCode?: string };
      expect(result.errorCode).not.toBe("UNAUTHORIZED");
    }
    expect(dataCalls()).toBeGreaterThan(0);
  });
});

describe("server-side validation (client input is not trusted)", () => {
  beforeEach(() => authMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } }));

  it.each([
    [{}, 25],
    [{ pageSize: 10 }, 10],
    [{ pageSize: 50 }, 50],
    [{ pageSize: 404 }, 25],
    [{ pageSize: "10" }, 25],
  ])("listAdminRoomsAction(%j) queries with pageSize %i", async (input, pageSize) => {
    data.listAdminRooms.mockClear();
    await actions.listAdminRoomsAction({ q: "A4", booking: "ENABLED", page: 1, ...input });
    expect(data.listAdminRooms).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize, q: "A4", booking: "ENABLED", page: 1 })
    );
  });

  it("rejects an invalid enum without touching the data layer", async () => {
    const result = await actions.updateRoomConfigurationAction("room-1", { ...VALID_CONFIG, approvalPolicy: "YOLO" });
    expect(result).toMatchObject({ errorCode: "INVALID_APPROVAL_POLICY" });
    expect(data.updateRoomConfiguration).not.toHaveBeenCalled();
  });

  it("rejects an invalid window grid without touching the data layer", async () => {
    const result = await actions.replaceRoomAvailabilityWindowsAction("room-1", [{ dayOfWeek: 9, slot: "SLOT_1" }]);
    expect(result).toMatchObject({ errorCode: "INVALID_DAY" });
    expect(data.replaceRoomAvailabilityWindows).not.toHaveBeenCalled();
  });

  it("rejects a closure ending before it starts", async () => {
    const result = await actions.createRoomClosureAction("room-1", {
      startDate: "2099-01-10",
      endDate: "2099-01-05",
      slots: [],
    });
    expect(result).toMatchObject({ errorCode: "END_BEFORE_START" });
    expect(data.createRoomClosure).not.toHaveBeenCalled();
  });

  it("rejects a non-string room id", async () => {
    const result = await actions.deactivateRoomAction(42 as unknown as string);
    expect(result).toMatchObject({ errorCode: "ROOM_NOT_FOUND" });
    expect(data.deactivateRoom).not.toHaveBeenCalled();
  });

  it("createRoomAction cannot smuggle in bookability or capabilities", async () => {
    await actions.createRoomAction({
      name: "ใหม่",
      roomCode: "NEW-1",
      capacity: 10,
      bookingEnabled: true,
      capabilities: ["LAB"],
      approvalPolicy: "MANUAL",
    });
    expect(data.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ bookingEnabled: false, capabilities: [], approvalPolicy: "AUTO" }),
      "admin-1"
    );
  });

  it("passes the authenticated admin as the actor (closure createdById)", async () => {
    await actions.createRoomClosureAction("room-1", { startDate: "2099-01-05", endDate: "2099-01-05", slots: ["SLOT_2"] });
    expect(data.createRoomClosure).toHaveBeenCalledWith(
      "room-1",
      { startDate: "2099-01-05", endDate: "2099-01-05", slots: ["SLOT_2"], reason: null },
      "admin-1"
    );
  });

  it("maps a history-blocked delete to the specific Thai message", async () => {
    data.deleteRoomIfUnused.mockResolvedValueOnce({
      ok: false,
      error: "ROOM_HAS_HISTORY",
      dependencies: { bookings: 1, sessions: 0, accessTokens: 0, classSchedules: 0, logs: 0, agentMachines: 0 },
    } as never);
    const result = await actions.deleteRoomAction("room-1");
    expect(result).toMatchObject({
      errorCode: "ROOM_HAS_HISTORY",
      error: "ไม่สามารถลบห้องนี้ได้เนื่องจากมีประวัติการใช้งาน กรุณาปิดใช้งานห้องแทน",
    });
  });
});
