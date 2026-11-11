import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createRoom,
  createRoomClosure,
  deactivateRoom,
  deleteRoomIfUnused,
  getAdminRoomDetail,
  listAdminRooms,
  replaceRoomAvailabilityWindows,
  updateRoomConfiguration,
} from "@/lib/room-admin";
import {
  deriveRoomConfigurationHealth,
  NEW_ROOM_DEFAULTS,
  validateRoomListFilters,
  type RoomConfiguration,
  type RoomConfigurationHealth,
} from "@/lib/room-config";
import { evaluateRoomAvailabilityById } from "@/lib/availability-context";
import { validateAvailabilityRequest } from "@/lib/availability";

// LOCAL database integration tests (VITEST_DB=1). Every row these tests create
// belongs to disposable ZZTEST rooms and a disposable user, and is removed in
// afterAll. Seeded demo data is only read, never written.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("room-admin.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZTEST-${Date.now().toString(36).toUpperCase()}`;
const MONDAY = "2030-01-07"; // a Monday, safely in the future
let actorId = "";
const roomIds: Record<string, string> = {};

function config(code: string, patch: Partial<RoomConfiguration> = {}): RoomConfiguration {
  return {
    ...NEW_ROOM_DEFAULTS,
    name: `ห้องทดสอบ ${code}`,
    roomCode: `${RUN}-${code}`,
    description: null,
    building: null,
    floor: null,
    capacity: 10,
    ...patch,
  };
}

async function makeRoom(code: string, patch: Partial<RoomConfiguration> = {}) {
  const result = await createRoom(config(code, patch), actorId);
  if (!result.ok) throw new Error(result.error);
  roomIds[code] = result.value.id;
  return result.value.id;
}

async function windowSet(roomId: string) {
  const rows = await prisma.roomAvailabilityWindow.findMany({ where: { roomId }, select: { dayOfWeek: true, slot: true } });
  return rows.map((row) => `${row.dayOfWeek}:${row.slot}`).sort();
}

function request(slots: string[], partySize = 2) {
  const outcome = validateAvailabilityRequest({ date: MONDAY, slots, partySize });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.request;
}

let seededRoomCount = 0;
let seededSnapshot = "";

async function seededFingerprint() {
  // Everything NOT owned by this test run must be identical before and after.
  const [rooms, windows, closures, bookings, schedules] = await Promise.all([
    prisma.room.count({ where: { NOT: { roomCode: { startsWith: RUN } } } }),
    prisma.roomAvailabilityWindow.count({ where: { room: { NOT: { roomCode: { startsWith: RUN } } } } }),
    prisma.roomClosure.count({ where: { room: { NOT: { roomCode: { startsWith: RUN } } } } }),
    prisma.roomBooking.count({ where: { room: { NOT: { roomCode: { startsWith: RUN } } } } }),
    prisma.classSchedule.count({ where: { room: { NOT: { roomCode: { startsWith: RUN } } } } }),
  ]);
  return JSON.stringify({ rooms, windows, closures, bookings, schedules });
}

beforeAll(async () => {
  seededRoomCount = await prisma.room.count();
  seededSnapshot = await seededFingerprint();
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: "ZZTEST admin", role: "ADMIN" },
  });
  actorId = user.id;
});

afterAll(async () => {
  const ids = Object.values(roomIds);
  // Test-owned history must be removed explicitly - RoomBooking is ON DELETE RESTRICT.
  await prisma.roomBookingSlot.deleteMany({ where: { booking: { roomId: { in: ids } } } });
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: ids } } });
  await prisma.session.deleteMany({ where: { roomId: { in: ids } } });
  await prisma.accessToken.deleteMany({ where: { roomId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { roomId: { in: ids } } });
  await prisma.log.deleteMany({ where: { OR: [{ roomId: { in: ids } }, { userId: actorId }] } });
  await prisma.room.deleteMany({ where: { roomCode: { startsWith: RUN } } });
  await prisma.user.deleteMany({ where: { id: actorId } });

  expect(await prisma.room.count()).toBe(seededRoomCount);
  expect(await seededFingerprint()).toBe(seededSnapshot);
  await prisma.$disconnect();
});

describe("availability windows", () => {
  it("7. the selected grid persists exactly", async () => {
    const roomId = await makeRoom("GRID");
    const selection = [
      { dayOfWeek: 1, slot: "SLOT_1" as const },
      { dayOfWeek: 1, slot: "SLOT_2" as const },
      { dayOfWeek: 3, slot: "SLOT_4" as const },
      { dayOfWeek: 0, slot: "SLOT_3" as const },
    ];
    const result = await replaceRoomAvailabilityWindows(roomId, selection, actorId);
    expect(result).toEqual({ ok: true, value: { count: 4 } });
    expect(await windowSet(roomId)).toEqual(["0:SLOT_3", "1:SLOT_1", "1:SLOT_2", "3:SLOT_4"]);
  });

  it("8. replacing removes deselected rows and touches no other room", async () => {
    const roomId = roomIds.GRID;
    const other = await makeRoom("OTHER");
    await replaceRoomAvailabilityWindows(other, [{ dayOfWeek: 2, slot: "SLOT_1" }], actorId);

    await replaceRoomAvailabilityWindows(roomId, [{ dayOfWeek: 1, slot: "SLOT_2" }, { dayOfWeek: 5, slot: "SLOT_1" }], actorId);

    expect(await windowSet(roomId)).toEqual(["1:SLOT_2", "5:SLOT_1"]);
    expect(await windowSet(other)).toEqual(["2:SLOT_1"]);
  });

  it("9. an empty set leaves zero rows", async () => {
    const result = await replaceRoomAvailabilityWindows(roomIds.GRID, [], actorId);
    expect(result).toEqual({ ok: true, value: { count: 0 } });
    expect(await windowSet(roomIds.GRID)).toEqual([]);
  });

  it("an unknown room is reported, not created", async () => {
    expect(await replaceRoomAvailabilityWindows("does-not-exist", [], actorId)).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });
});

describe("configuration, health and Feature 3", () => {
  it("a fully configured room is READY and Feature 3 sees it as AVAILABLE", async () => {
    const roomId = await makeRoom("READY", { bookingEnabled: true, capabilities: ["LAB"], capacity: 12 });
    await replaceRoomAvailabilityWindows(roomId, [{ dayOfWeek: 1, slot: "SLOT_1" }], actorId);

    const detail = await getAdminRoomDetail(roomId, "2026-01-01");
    expect(detail).toMatchObject({ health: "READY", issues: [] });

    const availability = await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"]));
    expect(availability).toMatchObject({ status: "AVAILABLE", available: true, remainingCapacity: 12 });
    // No window for SLOT_2 -> fail-closed.
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_2"])))?.status).toBe("OUTSIDE_WINDOW");
  });

  it("configuration changes flow straight through to the availability engine", async () => {
    const roomId = roomIds.READY;
    const base = config("READY", { bookingEnabled: true, capabilities: ["LAB"], capacity: 12 });

    await updateRoomConfiguration(roomId, { ...base, approvalPolicy: "MANUAL" }, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.requiresApproval).toBe(true);

    await updateRoomConfiguration(roomId, { ...base, capabilities: [] }, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("NOT_CONFIGURED_CAPABILITIES");
    expect((await getAdminRoomDetail(roomId, "2026-01-01"))?.health).toBe("INCOMPLETE");

    await updateRoomConfiguration(roomId, { ...base, capacity: 0 }, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("NOT_CONFIGURED_CAPACITY");

    await updateRoomConfiguration(roomId, { ...base, bookingEnabled: false }, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("BOOKING_DISABLED");

    await updateRoomConfiguration(roomId, { ...base, isActive: false }, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("ROOM_INACTIVE");

    await updateRoomConfiguration(roomId, base, actorId);
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("AVAILABLE");
  });

  it("6. bookingEnabled with zero windows is INCOMPLETE and not bookable", async () => {
    const roomId = await makeRoom("NOWIN", { bookingEnabled: true, capabilities: ["MEETING"], capacity: 8 });
    expect(await getAdminRoomDetail(roomId, "2026-01-01")).toMatchObject({ health: "INCOMPLETE", issues: ["MISSING_WINDOWS"] });
    expect((await evaluateRoomAvailabilityById(roomId, request(["SLOT_1"])))?.status).toBe("OUTSIDE_WINDOW");
  });

  it("a duplicate roomCode is a clean error, not a raw Prisma exception", async () => {
    const result = await updateRoomConfiguration(roomIds.NOWIN, config("READY"), actorId);
    expect(result).toEqual({ ok: false, error: "DUPLICATE_ROOM_CODE" });
  });
});

describe("closures", () => {
  it("10. whole-range closure (slots=[]) closes every slot", async () => {
    const roomId = roomIds.READY;
    await replaceRoomAvailabilityWindows(
      roomId,
      ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"].map((slot) => ({ dayOfWeek: 1, slot: slot as "SLOT_1" })),
      actorId
    );
    const created = await createRoomClosure(roomId, { startDate: MONDAY, endDate: MONDAY, slots: [], reason: "ทั้งวัน" }, actorId);
    expect(created.ok).toBe(true);

    const result = await evaluateRoomAvailabilityById(roomId, request(["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"]));
    expect(result?.slots.map((slot) => slot.status)).toEqual(["CLOSED", "CLOSED", "CLOSED", "CLOSED"]);

    const stored = await prisma.roomClosure.findFirst({ where: { roomId }, select: { slots: true, createdById: true } });
    expect(stored).toEqual({ slots: [], createdById: actorId });
    await prisma.roomClosure.deleteMany({ where: { roomId } });
  });

  it("11. slot-specific closure closes only the listed slot", async () => {
    const roomId = roomIds.READY;
    await createRoomClosure(roomId, { startDate: MONDAY, endDate: MONDAY, slots: ["SLOT_2"], reason: null }, actorId);

    const result = await evaluateRoomAvailabilityById(roomId, request(["SLOT_1", "SLOT_2", "SLOT_3"]));
    expect(result?.slots.map((slot) => slot.status)).toEqual(["AVAILABLE", "CLOSED", "AVAILABLE"]);

    const detail = await getAdminRoomDetail(roomId, "2026-01-01");
    expect(detail?.closures).toEqual([
      expect.objectContaining({ startDate: MONDAY, endDate: MONDAY, slots: ["SLOT_2"], createdByName: "ZZTEST admin" }),
    ]);
  });

  it("past closures are not listed as current/upcoming", async () => {
    expect((await getAdminRoomDetail(roomIds.READY, "2030-01-08"))?.closures).toEqual([]);
  });
});

describe("delete / deactivate safety", () => {
  async function historyRoom(code: string, add: (roomId: string) => Promise<unknown>) {
    const roomId = await makeRoom(code);
    await add(roomId);
    return roomId;
  }

  it("14. a room with booking history cannot be hard-deleted", async () => {
    const roomId = await historyRoom("BOOKED", (id) =>
      prisma.roomBooking.create({ data: { roomId: id, userId: actorId, date: new Date(`${MONDAY}T00:00:00Z`), partySize: 2 } })
    );
    const result = await deleteRoomIfUnused(roomId, actorId);
    expect(result).toMatchObject({ ok: false, error: "ROOM_HAS_HISTORY", dependencies: { bookings: 1 } });
    expect(await prisma.room.count({ where: { id: roomId } })).toBe(1);
    expect(await prisma.roomBooking.count({ where: { roomId } })).toBe(1);
  });

  it.each([
    ["SESSION", "sessions", (id: string) => prisma.session.create({ data: { roomId: id, userId: actorId } })],
    [
      "SCHEDULE",
      "classSchedules",
      (id: string) =>
        prisma.classSchedule.create({ data: { roomId: id, userId: actorId, dayOfWeek: 1, startTime: "08:40", endTime: "11:00", slot: "SLOT_1" } }),
    ],
    [
      "TOKEN",
      "accessTokens",
      (id: string) =>
        prisma.accessToken.create({ data: { roomId: id, userId: actorId, validFrom: new Date(), validTo: new Date(Date.now() + 3_600_000) } }),
    ],
  ])("15. a room with %s history is refused, not cascade-deleted", async (code, kind, add) => {
    const roomId = await historyRoom(code, add);
    const result = await deleteRoomIfUnused(roomId, actorId);
    expect(result).toMatchObject({ ok: false, error: "ROOM_HAS_HISTORY", dependencies: { [kind]: 1 } });
    expect(await prisma.room.count({ where: { id: roomId } })).toBe(1);
  });

  it("16. deactivation preserves every historical row", async () => {
    const roomId = roomIds.BOOKED;
    await prisma.session.create({ data: { roomId, userId: actorId } });
    const before = await Promise.all([prisma.roomBooking.count({ where: { roomId } }), prisma.session.count({ where: { roomId } })]);

    expect(await deactivateRoom(roomId, actorId)).toEqual({ ok: true, value: undefined });

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { isActive: true } });
    const after = await Promise.all([prisma.roomBooking.count({ where: { roomId } }), prisma.session.count({ where: { roomId } })]);
    expect(room?.isActive).toBe(false);
    expect(after).toEqual(before);
  });

  it("a genuinely unused room is deleted, cascading only its configuration", async () => {
    const roomId = await makeRoom("UNUSED");
    await replaceRoomAvailabilityWindows(roomId, [{ dayOfWeek: 1, slot: "SLOT_1" }], actorId);
    await createRoomClosure(roomId, { startDate: MONDAY, endDate: MONDAY, slots: [], reason: null }, actorId);

    const result = await deleteRoomIfUnused(roomId, actorId);
    expect(result).toEqual({ ok: true, value: { roomCode: `${RUN}-UNUSED` } });
    expect(await prisma.room.count({ where: { id: roomId } })).toBe(0);
    expect(await prisma.roomAvailabilityWindow.count({ where: { roomId } })).toBe(0);
    expect(await prisma.roomClosure.count({ where: { roomId } })).toBe(0);
  });
});

describe("18. admin room list", () => {
  function filters(input: Record<string, unknown>) {
    const outcome = validateRoomListFilters(input);
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.value;
  }

  it("is bounded by page size even across the full 404-room inventory", async () => {
    const page = await listAdminRooms(filters({ pageSize: 10 }));
    expect(page.rooms).toHaveLength(10);
    expect(page.total).toBeGreaterThanOrEqual(404);
    expect(page.rooms.map((room) => room.roomCode)).toEqual([...page.rooms.map((room) => room.roomCode)].sort());
  });

  it.each([
    [{}, 25],
    [{ pageSize: 10 }, 10],
    [{ pageSize: 50 }, 50],
  ])("returns exactly the selected page size (%j -> %i rows)", async (input, size) => {
    const page = await listAdminRooms(filters(input));
    expect(page.pageSize).toBe(size);
    expect(page.rooms).toHaveLength(size);
  });

  it("skips by the selected page size", async () => {
    const all = await listAdminRooms(filters({ pageSize: 50, page: 1 }));
    const second = await listAdminRooms(filters({ pageSize: 10, page: 2 }));
    expect(second.rooms.map((room) => room.id)).toEqual(all.rooms.slice(10, 20).map((room) => room.id));
  });

  it("paginates deterministically without overlap", async () => {
    const first = await listAdminRooms(filters({ pageSize: 10, page: 1 }));
    const second = await listAdminRooms(filters({ pageSize: 10, page: 2 }));
    const overlap = first.rooms.filter((room) => second.rooms.some((other) => other.id === room.id));
    expect(overlap).toEqual([]);
  });

  it("search matches room code and name, case-insensitively", async () => {
    const byCode = await listAdminRooms(filters({ q: RUN.toLowerCase() }));
    expect(byCode.rooms.length).toBeGreaterThan(0);
    expect(byCode.rooms.every((room) => room.roomCode.startsWith(RUN))).toBe(true);

    const byName = await listAdminRooms(filters({ q: "ห้องทดสอบ" }));
    expect(byName.rooms.every((room) => room.name.includes("ห้องทดสอบ"))).toBe(true);
  });

  it("building, capability, operational and booking filters apply", async () => {
    const a4 = await listAdminRooms(filters({ building: "A4", pageSize: 50 }));
    expect(a4.total).toBe(32);
    expect(a4.rooms.every((room) => room.building === "A4")).toBe(true);

    const meeting = await listAdminRooms(filters({ capability: "MEETING", pageSize: 50 }));
    expect(meeting.rooms.every((room) => room.capabilities.includes("MEETING"))).toBe(true);

    const inactive = await listAdminRooms(filters({ operational: "INACTIVE", pageSize: 50 }));
    expect(inactive.rooms.every((room) => !room.isActive)).toBe(true);

    const bookable = await listAdminRooms(filters({ booking: "ENABLED", pageSize: 50 }));
    expect(bookable.rooms.every((room) => room.bookingEnabled)).toBe(true);
    expect(bookable.rooms.map((room) => room.id)).toEqual(expect.arrayContaining([roomIds.READY, roomIds.NOWIN]));
  });

  it("the SQL health filter agrees with the pure derivation for every room it returns", async () => {
    for (const health of ["READY", "INCOMPLETE", "BOOKING_DISABLED", "INACTIVE"] as RoomConfigurationHealth[]) {
      const page = await listAdminRooms(filters({ health, pageSize: 50 }));
      expect(page.total).toBe(page.healthCounts[health]);
      for (const room of page.rooms) {
        expect(deriveRoomConfigurationHealth(room).health).toBe(health);
      }
    }
  });
});

describe("usage logs vs configuration logs", () => {
  it("configuration audit logs alone do not block deletion; usage logs do", async () => {
    const configured = await makeRoom("CONFIGONLY");
    await replaceRoomAvailabilityWindows(configured, [{ dayOfWeek: 1, slot: "SLOT_1" }], actorId);
    expect(await prisma.log.count({ where: { roomId: configured } })).toBeGreaterThan(0);
    expect((await deleteRoomIfUnused(configured, actorId)).ok).toBe(true);

    const used = await makeRoom("DENIED");
    await prisma.log.create({ data: { roomId: used, userId: actorId, action: "ACCESS_DENIED", details: "test" } });
    expect(await deleteRoomIfUnused(used, actorId)).toMatchObject({ ok: false, dependencies: { logs: 1 } });
  });
});
