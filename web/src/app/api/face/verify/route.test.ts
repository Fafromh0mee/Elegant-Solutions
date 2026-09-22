import { beforeEach, describe, expect, it, vi } from "vitest";

// Face verify route with the database, AI service, sessions and resolver mocked:
// authorization comes only from the face match (userId) and the room looked up by
// code (roomId), is decided by resolveRoomEntitlement, and affects exactly one user.

const db = vi.hoisted(() => ({
  room: { findUnique: vi.fn() },
  faceProfile: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  log: { create: vi.fn() },
}));
const checkInAction = vi.hoisted(() => vi.fn());
const checkOutAction = vi.hoisted(() => vi.fn());
const resolveRoomEntitlement = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/actions/sessions", () => ({ checkInAction, checkOutAction }));
vi.mock("@/lib/room-entitlement", () => ({ resolveRoomEntitlement }));

const { POST } = await import("@/app/api/face/verify/route");

const ROOM = { id: "room-a", roomCode: "LAB-A", isActive: true, staffOnly: false };
const UNTIL = new Date("2030-01-07T09:50:00.000Z");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/face/verify", { method: "POST", body: JSON.stringify(body) }) as never;
}

function aiMatches(userId: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ matched: true, user_id: userId, score: 0.9, face_detected: true })))
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  for (const model of Object.values(db)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  checkInAction.mockReset();
  checkOutAction.mockReset();
  resolveRoomEntitlement.mockReset();
  db.room.findUnique.mockResolvedValue(ROOM);
  db.faceProfile.findMany.mockResolvedValue([{ userId: "stu-1", embedding: [0.1] }]);
  db.log.create.mockResolvedValue({});
  checkInAction.mockResolvedValue({ success: true, sessionId: "s1" });
});

describe("face -> entitlement -> one session", () => {
  it("STUDENT with an entitlement: resolver gets the MATCHED user and the looked-up room; exactly one check-in", async () => {
    aiMatches("stu-1");
    db.user.findUnique.mockResolvedValue({ id: "stu-1", name: "A", role: "STUDENT" });
    resolveRoomEntitlement.mockResolvedValue({
      allowed: true,
      grants: [{ source: "BOOKING", id: "bk1", validUntil: UNTIL }],
      validUntil: UNTIL,
    });

    // Client-supplied identity fields are ignored.
    const res = await POST(request({ image_base64: "x", room_code: "LAB-A", user_id: "someone-else", roomId: "room-z" }));
    const body = await res.json();

    expect(body).toMatchObject({ access_granted: true, user: { id: "stu-1" } });
    expect(db.room.findUnique).toHaveBeenCalledWith({ where: { roomCode: "LAB-A" } });
    expect(resolveRoomEntitlement).toHaveBeenCalledTimes(1);
    expect(resolveRoomEntitlement).toHaveBeenCalledWith(expect.objectContaining({ userId: "stu-1", roomId: "room-a" }));
    expect(checkInAction).toHaveBeenCalledTimes(1);
    expect(checkInAction).toHaveBeenCalledWith({ userId: "stu-1", roomId: "room-a", scheduledCheckOut: UNTIL });
  });

  it("STUDENT without an entitlement: denied, logged, no session", async () => {
    aiMatches("stu-1");
    db.user.findUnique.mockResolvedValue({ id: "stu-1", name: "A", role: "STUDENT" });
    resolveRoomEntitlement.mockResolvedValue({ allowed: false });

    const body = await (await POST(request({ image_base64: "x", room_code: "LAB-A" }))).json();

    expect(body).toMatchObject({ matched: true, access_granted: false });
    expect(checkInAction).not.toHaveBeenCalled();
    expect(checkOutAction).not.toHaveBeenCalled();
    expect(db.log.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESS_DENIED", userId: "stu-1" }) });
  });

  it("a GUEST that matched would also be entitlement-checked (never bypassed)", async () => {
    aiMatches("guest-1");
    db.user.findUnique.mockResolvedValue({ id: "guest-1", name: "G", role: "GUEST" });
    resolveRoomEntitlement.mockResolvedValue({ allowed: false });
    const body = await (await POST(request({ image_base64: "x", room_code: "LAB-A" }))).json();
    expect(body.access_granted).toBe(false);
    expect(resolveRoomEntitlement).toHaveBeenCalledWith(expect.objectContaining({ userId: "guest-1" }));
    expect(checkInAction).not.toHaveBeenCalled();
  });
});

describe("current policy, pinned so a change is deliberate", () => {
  it("KNOWN LIMITATION: GUEST face profiles are excluded from matching", async () => {
    aiMatches("stu-1");
    db.user.findUnique.mockResolvedValue({ id: "stu-1", name: "A", role: "STUDENT" });
    resolveRoomEntitlement.mockResolvedValue({ allowed: false });
    await POST(request({ image_base64: "x", room_code: "LAB-A" }));
    expect(db.faceProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { role: { not: "GUEST" } } } }));
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("%s is NOT entitlement-checked (existing staff policy) - one check-in for that user only", async (role) => {
    aiMatches("adm-1");
    db.user.findUnique.mockResolvedValue({ id: "adm-1", name: "Adm", role });
    const body = await (await POST(request({ image_base64: "x", room_code: "LAB-A" }))).json();
    expect(body.access_granted).toBe(true);
    expect(resolveRoomEntitlement).not.toHaveBeenCalled();
    expect(checkInAction).toHaveBeenCalledTimes(1);
    expect(checkInAction).toHaveBeenCalledWith(expect.objectContaining({ userId: "adm-1", roomId: "room-a" }));
  });
});
