import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { computeParticipantFingerprint } from "@/lib/room-booking-rules";
import { createRoomBooking, getOwnBooking, loadBookingReview, loadDashboardBookings } from "@/lib/room-booking";
import { runRoomFinderSearch } from "@/lib/room-finder-search";
import type { AcademicSlot, AccountStatus, Role, RoomCapability } from "@/lib/types";
import { backfillRoomBookingParticipants } from "../../scripts/backfill-room-booking-participants";

// LOCAL database integration tests for Feature 7 / 7.5 booking (VITEST_DB=1). Every
// row belongs to disposable ZZB rooms/groups/users, all removed in afterAll. Seeded
// demo data is only read, never written.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("room-booking.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZB-${Date.now().toString(36).toUpperCase()}`; // also the building, <= 20 chars
const MONDAY = "2030-01-07";
// A fixed clock six days earlier, so MONDAY is inside the 30-day horizon.
const NOW = new Date("2030-01-01T10:00:00+07:00");
const ALL_SLOTS: AcademicSlot[] = ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"];
const SELF = { kind: "SELF" as const };

const roomIds: string[] = [];
const userIds: string[] = [];
const groupIds: string[] = [];
let fixtureUserId = "";
let serial = 0;

async function makeUser(role: Role = "STUDENT", status: AccountStatus = "APPROVED") {
  serial += 1;
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}-${serial}@example.test`, name: `ZZTEST${serial}`, role, status },
  });
  userIds.push(user.id);
  return user.id;
}

/** A group owned by `ownerId` with `memberIds` (owner included) as its live membership. */
async function makeGroup(ownerId: string, memberIds: string[] = []) {
  const group = await prisma.group.create({ data: { name: `ZZ Group ${groupIds.length + 1}`, ownerId } });
  groupIds.push(group.id);
  const ids = new Set([ownerId, ...memberIds]);
  await prisma.groupMember.createMany({ data: [...ids].map((userId) => ({ groupId: group.id, userId })) });
  return group.id;
}

/** The GROUP participant selection a client would submit, with a correct fingerprint. */
function groupSelection(groupId: string, memberIds: string[]) {
  return { kind: "GROUP" as const, groupId, fingerprint: computeParticipantFingerprint(memberIds) };
}

async function makeRoom(
  code: string,
  opts: {
    capacity?: number;
    policy?: "AUTO" | "MANUAL";
    capabilities?: RoomCapability[];
    windows?: AcademicSlot[];
    isActive?: boolean;
    bookingEnabled?: boolean;
    guestAccess?: boolean;
    staffOnly?: boolean;
    classAt?: AcademicSlot;
    closed?: boolean;
    floor?: number;
  } = {}
) {
  const room = await prisma.room.create({
    data: {
      roomCode: `${RUN}-${code}`,
      name: `ห้องทดสอบ ${code}`,
      building: RUN,
      floor: opts.floor ?? 1,
      capacity: opts.capacity ?? 10,
      capabilities: opts.capabilities ?? ["WORKSHOP"],
      isActive: opts.isActive ?? true,
      bookingEnabled: opts.bookingEnabled ?? true,
      approvalPolicy: opts.policy ?? "AUTO",
      guestAccess: opts.guestAccess ?? false,
      staffOnly: opts.staffOnly ?? false,
    },
  });
  roomIds.push(room.id);
  const windows = opts.windows ?? ALL_SLOTS;
  if (windows.length > 0) {
    await prisma.roomAvailabilityWindow.createMany({
      data: windows.map((slot) => ({ roomId: room.id, dayOfWeek: 1, slot })),
    });
  }
  if (opts.classAt) {
    // semester null: always in force (fail closed), whatever the active semester is.
    await prisma.classSchedule.create({
      data: { userId: fixtureUserId, roomId: room.id, dayOfWeek: 1, startTime: "12:00", endTime: "14:20", slot: opts.classAt },
    });
  }
  if (opts.closed) {
    await prisma.roomClosure.create({
      data: { roomId: room.id, startDate: new Date(`${MONDAY}T00:00:00Z`), endDate: new Date(`${MONDAY}T00:00:00Z`), slots: [] },
    });
  }
  return room.id;
}

const book = (userId: string, roomId: string, patch: Record<string, unknown> = {}, now = NOW) =>
  createRoomBooking({ userId, now, input: { roomId, date: MONDAY, slots: ["SLOT_2"], participants: SELF, ...patch } });

async function bookingsIn(roomId: string) {
  return prisma.roomBooking.findMany({ where: { roomId }, include: { slots: true, participants: true } });
}

async function fingerprintDb() {
  const notMineRoom = { NOT: { roomCode: { startsWith: RUN } } };
  const counts = await Promise.all([
    prisma.room.count({ where: notMineRoom }),
    prisma.roomAvailabilityWindow.count({ where: { room: notMineRoom } }),
    prisma.roomBooking.count({ where: { room: notMineRoom } }),
    prisma.roomBookingSlot.count({ where: { booking: { room: notMineRoom } } }),
    prisma.roomBookingParticipant.count({ where: { booking: { room: notMineRoom } } }),
    prisma.classSchedule.count({ where: { room: notMineRoom } }),
    prisma.roomClosure.count({ where: { room: notMineRoom } }),
    prisma.group.count(),
    prisma.groupMember.count(),
    // Every test log is deleted before the final check, so the plain total must match.
    // (A NOT IN filter would silently skip logs whose roomId/userId is NULL.)
    prisma.log.count(),
    // 26. booking never creates sessions, access tokens or check-ins.
    prisma.session.count(),
    prisma.accessToken.count(),
    prisma.user.count({ where: { NOT: { email: { startsWith: RUN.toLowerCase() } } } }),
  ]);
  return JSON.stringify(counts);
}

let seeded = "";

beforeAll(async () => {
  fixtureUserId = await makeUser();
  seeded = await fingerprintDb();
});

afterAll(async () => {
  await prisma.roomBookingParticipant.deleteMany({ where: { booking: { roomId: { in: roomIds } } } });
  await prisma.roomBookingSlot.deleteMany({ where: { booking: { roomId: { in: roomIds } } } });
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.log.deleteMany({ where: { OR: [{ roomId: { in: roomIds } }, { userId: { in: userIds } }] } });
  await prisma.classSchedule.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { roomCode: { startsWith: RUN } } });
  await prisma.groupMember.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: RUN.toLowerCase() } } });
  // All cleanup first, then assertions - a failed check must not leave rows behind.
  expect(await fingerprintDb()).toBe(seeded);
  expect(await prisma.room.count({ where: { roomCode: { startsWith: RUN } } })).toBe(0);
  expect(await prisma.user.count({ where: { email: { startsWith: RUN.toLowerCase() } } })).toBe(0);
  await prisma.$disconnect();
});

describe("0. advisory locks work through the pg adapter", () => {
  it("serializes two transactions on the same key", async () => {
    const events: string[] = [];
    const hold = (name: string, ms: number) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zz-test'), hashtext(${RUN}))`;
        events.push(`${name}+`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        events.push(`${name}-`);
      });
    await Promise.all([hold("A", 300), new Promise((r) => setTimeout(r, 50)).then(() => hold("B", 1))]);
    expect(events).toEqual(["A+", "A-", "B+", "B-"]);
  });
});

describe("AUTO / MANUAL creation, solo", () => {
  it("16. AUTO -> APPROVED, auto-approved marker, exact slot instants, one SELF participant, one audit log", async () => {
    const student = await makeUser();
    const room = await makeRoom("AUTO");
    const result = await book(student, room, { slots: ["SLOT_2", "SLOT_3"] });
    expect(result).toMatchObject({ ok: true, status: "APPROVED", reused: false });

    const [row] = await bookingsIn(room);
    // A solo booking always has partySize=1, whatever party size the finder search used.
    expect(row).toMatchObject({ userId: student, status: "APPROVED", partySize: 1, decidedById: null });
    expect(row.decidedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.date.toISOString().slice(0, 10)).toBe(MONDAY);
    expect(row.participants).toEqual([expect.objectContaining({ userId: student, source: "SELF", groupId: null })]);
    // 18. one RoomBookingSlot per slot with the resolved Bangkok instants.
    const slots = row.slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    expect(slots.map((s) => s.slot)).toEqual(["SLOT_2", "SLOT_3"]);
    expect(slots[0].startAt.toISOString()).toBe(resolveSlotRange(MONDAY, "SLOT_2").startAt.toISOString());
    expect(slots[0].startAt.toISOString()).toBe("2030-01-07T05:00:00.000Z"); // 12:00 Bangkok
    expect(slots[1].endAt.toISOString()).toBe("2030-01-07T09:50:00.000Z"); // 16:50 Bangkok

    const logs = await prisma.log.findMany({ where: { roomId: room } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "ROOM_BOOKING_CREATED", userId: student });
    expect(logs[0].details).toBe(`booking ${row.id} ${MONDAY} SLOT_2,SLOT_3 participants=1 source=SELF policy=AUTO status=APPROVED`);
    expect(logs[0].details).not.toContain(student); // no participant identities in free text
  });

  it("a solo booking always creates partySize=1, even if a caller smuggles a larger number", async () => {
    const student = await makeUser();
    const room = await makeRoom("FORCE1");
    // partySize is not even a field of RoomBookingInput any more; a caller cannot
    // request more than 1 for SELF no matter what they pass.
    const result = await book(student, room, { partySize: 99 } as never);
    expect(result).toMatchObject({ ok: true, status: "APPROVED" });
    const [row] = await bookingsIn(room);
    expect(row.partySize).toBe(1);
    expect(row.participants).toHaveLength(1);
  });

  it("17. MANUAL -> PENDING, undecided", async () => {
    const student = await makeUser();
    const room = await makeRoom("MANUAL", { policy: "MANUAL" });
    expect(await book(student, room)).toMatchObject({ ok: true, status: "PENDING" });
    const [row] = await bookingsIn(room);
    expect(row).toMatchObject({ status: "PENDING", decidedById: null, decidedAt: null });
  });

  it("15. PENDING never consumes capacity; APPROVED does", async () => {
    const room = await makeRoom("PENDCAP", { capacity: 2, policy: "MANUAL" });
    // Two MANUAL solo requests in a room of 2: both may be PENDING at once (1+1=2 <= 2, but
    // even past capacity PENDING never blocks another PENDING request).
    expect(await book(await makeUser(), room)).toMatchObject({ ok: true, status: "PENDING" });
    expect(await book(await makeUser(), room)).toMatchObject({ ok: true, status: "PENDING" });

    const auto = await makeRoom("PENDAUTO", { capacity: 1 });
    await prisma.roomBooking.create({
      data: {
        roomId: auto,
        userId: fixtureUserId,
        date: new Date(`${MONDAY}T00:00:00Z`),
        partySize: 1,
        status: "PENDING",
        slots: { create: [{ slot: "SLOT_2", ...resolveSlotRange(MONDAY, "SLOT_2") }] },
      },
    });
    const first = await makeUser();
    expect(await book(first, auto)).toMatchObject({ ok: true, status: "APPROVED" }); // 1 of 1, pending ignored
    expect(await book(await makeUser(), auto)).toEqual({
      ok: false,
      error: "CAPACITY_INSUFFICIENT",
      remainingCapacity: 0,
    });
  });
});

describe("rejections come from the Feature 3 evaluator, inside the transaction", () => {
  it.each([
    ["5. missing room", null, "ROOM_NOT_FOUND"],
    ["6. inactive room", { isActive: false }, "ROOM_NOT_BOOKABLE"],
    ["6. booking disabled", { bookingEnabled: false }, "ROOM_NOT_BOOKABLE"],
    ["11. class in session", { classAt: "SLOT_2" }, "CLASS_IN_SESSION"],
    ["12. closure", { closed: true }, "CLOSED"],
    ["13. outside availability window", { windows: ["SLOT_1"] }, "OUTSIDE_WINDOW"],
  ] as const)("%s -> %s, nothing written", async (label, opts, error) => {
    const student = await makeUser();
    const room = opts === null ? "zz-missing-room" : await makeRoom(`REJ${roomIds.length}`, opts as never);
    const result = await book(student, room);
    expect(result).toMatchObject({ ok: false, error });
    expect(await prisma.roomBooking.count({ where: { userId: student } })).toBe(0);
    expect(await prisma.log.count({ where: { userId: student } })).toBe(0);
  });

  it("14. capacity insufficient (a single solo request needs 1; a full room rejects a second)", async () => {
    const room = await makeRoom("REJCAP", { capacity: 1 });
    expect(await book(await makeUser(), room)).toMatchObject({ ok: true });
    const student = await makeUser();
    const result = await book(student, room);
    expect(result).toEqual({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 0 });
    expect(await prisma.roomBooking.count({ where: { userId: student } })).toBe(0);
    expect(await prisma.log.count({ where: { userId: student } })).toBe(0);
  });

  it("input errors never reach the database", async () => {
    const student = await makeUser();
    const room = await makeRoom("INPUT");
    expect(await book(student, room, { slots: [] })).toEqual({ ok: false, error: "NO_SLOTS" });
    expect(await book(student, room, { slots: ["SLOT_1", "SLOT_3"] })).toEqual({ ok: false, error: "SLOTS_NOT_CONTIGUOUS" });
    expect(await book(student, room, { date: "2030-03-01" })).toEqual({ ok: false, error: "DATE_OUT_OF_RANGE" });
    expect(await book(student, room, { participants: { kind: "NONSENSE" } })).toEqual({ ok: false, error: "INVALID_PARTICIPANTS" });
    expect(await bookingsIn(room)).toHaveLength(0);
  });

  it("19. a stale hand-off is rejected once the room has filled (single-seat room)", async () => {
    const room = await makeRoom("STALE", { capacity: 1 });
    const reviewer = await makeUser();
    const review = await loadBookingReview({
      viewer: { userId: reviewer, role: "STUDENT", status: "APPROVED" },
      roomId: room,
      searchParams: { date: MONDAY, slots: "SLOT_2", partySize: "4" }, // search partySize is discovery context only
      now: NOW,
    });
    expect(review).toMatchObject({ kind: "READY", blocked: null, remainingCapacity: 1, participantCount: 1 });
    expect(await book(await makeUser(), room)).toMatchObject({ ok: true });
    // Same hand-off, confirmed after someone else filled the room.
    expect(await book(reviewer, room)).toEqual({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 0 });
  });

  it("22. requiredCapability is re-validated: removed from the room -> CAPABILITY_CHANGED", async () => {
    const room = await makeRoom("CAP", { capabilities: ["LAB", "WORKSHOP"] });
    const student = await makeUser();
    await prisma.room.update({ where: { id: room }, data: { capabilities: ["WORKSHOP"] } });
    expect(await book(student, room, { capability: "LAB" })).toEqual({ ok: false, error: "CAPABILITY_CHANGED" });
    // Without a capability constraint the same room is bookable.
    expect(await book(student, room)).toMatchObject({ ok: true });
  });
});

describe("D3. the running slot", () => {
  // MONDAY SLOT_2 = 12:00-14:20 Bangkok; `today` is MONDAY.
  const at = (time: string) => new Date(`${MONDAY}T${time}:00+07:00`);

  it("a class in the running slot blocks it, whatever the remaining capacity", async () => {
    const room = await makeRoom("NOWCLASS", { capacity: 100, classAt: "SLOT_2" });
    expect(await book(await makeUser(), room, {}, at("12:30"))).toEqual({ ok: false, error: "CLASS_IN_SESSION" });
  });

  it("a genuinely AVAILABLE room can be booked for the running slot with >= 15 min left", async () => {
    const room = await makeRoom("NOWOK");
    expect(await book(await makeUser(), room, {}, at("14:05"))).toMatchObject({ ok: true, status: "APPROVED" });
  });

  it("< 15 min left -> SLOT_TOO_LATE, even when the room is free", async () => {
    const room = await makeRoom("NOWLATE");
    expect(await book(await makeUser(), room, {}, at("14:06"))).toEqual({ ok: false, error: "SLOT_TOO_LATE" });
    expect(await bookingsIn(room)).toHaveLength(0);
  });

  it("the running slot still obeys closures and approved capacity", async () => {
    const closed = await makeRoom("NOWCLOSED", { closed: true });
    expect(await book(await makeUser(), closed, {}, at("12:30"))).toEqual({ ok: false, error: "CLOSED" });
    const small = await makeRoom("NOWFULL", { capacity: 1 });
    expect(await book(await makeUser(), small, {}, at("12:30"))).toMatchObject({ ok: true });
    expect(await book(await makeUser(), small, {}, at("12:31"))).toMatchObject({
      ok: false,
      error: "CAPACITY_INSUFFICIENT",
    });
  });
});

describe("duplicates and overlaps (D2, D4)", () => {
  it("21. a concurrent double submit creates ONE booking and returns it to both calls", async () => {
    const student = await makeUser();
    const room = await makeRoom("DOUBLE");
    const [a, b] = await Promise.all([book(student, room), book(student, room)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.bookingId).toBe(b.bookingId);
    expect([a.reused, b.reused].sort()).toEqual([false, true]);
    expect(await bookingsIn(room)).toHaveLength(1);
    expect(await prisma.log.count({ where: { roomId: room, action: "ROOM_BOOKING_CREATED" } })).toBe(1);
  });

  it("same room, overlapping, different slot range -> DUPLICATE_BOOKING (D4: exact slot match required for SAME)", async () => {
    const student = await makeUser();
    const room = await makeRoom("DUP");
    expect(await book(student, room, { slots: ["SLOT_2", "SLOT_3"] })).toMatchObject({ ok: true });
    expect(await book(student, room, { slots: ["SLOT_3", "SLOT_4"] })).toEqual({ ok: false, error: "DUPLICATE_BOOKING" });
    expect(await book(student, room, { slots: ["SLOT_2"] })).toEqual({ ok: false, error: "DUPLICATE_BOOKING" });
    // A non-overlapping slot in the same room is fine.
    expect(await book(student, room, { slots: ["SLOT_1"] })).toMatchObject({ ok: true });
  });

  it("STUDENT: overlapping booking in another room -> OVERLAPPING_BOOKING; cancelled/rejected do not block", async () => {
    const student = await makeUser();
    const first = await makeRoom("OVA");
    const second = await makeRoom("OVB");
    const made = await book(student, first);
    expect(made).toMatchObject({ ok: true });
    expect(await book(student, second)).toEqual({ ok: false, error: "OVERLAPPING_BOOKING" });

    if (!made.ok) return;
    await prisma.roomBooking.update({ where: { id: made.bookingId }, data: { status: "CANCELLED", cancelledAt: NOW } });
    expect(await book(student, second)).toMatchObject({ ok: true });
  });

  it("concurrent cross-room requests by one user: exactly one wins (user lock)", async () => {
    const student = await makeUser();
    const rooms = [await makeRoom("RACEA"), await makeRoom("RACEB")];
    const results = await Promise.all(rooms.map((room) => book(student, room)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "OVERLAPPING_BOOKING" });
  });
});

describe("20. concurrency: no overbooking (solo, single-seat contention)", () => {
  it("capacity 1, two students race - exactly one APPROVED, 10 rounds", async () => {
    for (let round = 0; round < 10; round += 1) {
      const room = await makeRoom(`CC${round}`, { capacity: 1 });
      const [s1, s2] = [await makeUser(), await makeUser()];
      const results = await Promise.all([book(s1, room), book(s2, room)]);

      expect(results.filter((r) => r.ok && r.status === "APPROVED"), `round ${round}`).toHaveLength(1);
      expect(results.find((r) => !r.ok), `round ${round}`).toEqual({
        ok: false,
        error: "CAPACITY_INSUFFICIENT",
        remainingCapacity: 0,
      });
      const approved = (await bookingsIn(room)).filter((b) => b.status === "APPROVED");
      expect(approved.reduce((sum, b) => sum + b.partySize, 0)).toBeLessThanOrEqual(1);
    }
  });

  it("a burst of five single-seat requests fills a room of five exactly", async () => {
    const room = await makeRoom("BURST", { capacity: 5 });
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    const results = await Promise.all(users.map((user) => book(user, room)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === "CAPACITY_INSUFFICIENT")).toBe(true);
    expect(await bookingsIn(room)).toHaveLength(5);
  });
});

describe("authorization is re-read inside the transaction", () => {
  it("pending/rejected GUEST and ADMIN cannot book, even if called directly", async () => {
    const room = await makeRoom("AUTHZ", { guestAccess: true });
    for (const [role, status] of [
      ["GUEST", "PENDING"],
      ["GUEST", "REJECTED"],
      ["ADMIN", "APPROVED"],
      ["SUPER_ADMIN", "APPROVED"],
    ] as const) {
      expect(await book(await makeUser(role, status), room)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    }
    expect(await bookingsIn(room)).toHaveLength(0);
  });

  it("a user demoted after sign-in is refused (the database role wins over the session)", async () => {
    const guest = await makeUser("GUEST", "APPROVED");
    const room = await makeRoom("DEMOTE", { guestAccess: true });
    await prisma.user.update({ where: { id: guest }, data: { status: "REJECTED" } });
    expect(await book(guest, room)).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });
});

describe("approved GUEST (solo)", () => {
  it("finder shows only guestAccess && !staffOnly rooms; STUDENT sees all", async () => {
    await makeRoom("G-OK", { guestAccess: true, floor: 7 });
    await makeRoom("G-STAFF", { guestAccess: true, staffOnly: true, floor: 7 });
    await makeRoom("G-NO", { guestAccess: false, floor: 7 });
    const query = { date: MONDAY, slots: ["SLOT_1"] as AcademicSlot[], partySize: 1, capability: null, building: RUN, floor: 7 };
    const code = (roomCode: string) => roomCode.slice(RUN.length + 1);

    const guest = await runRoomFinderSearch(query, 50, NOW, "GUEST");
    if (guest.kind !== "DONE") throw new Error(guest.kind);
    expect([...guest.available, ...guest.unavailable].map((r) => code(r.room.roomCode))).toEqual(["G-OK"]);

    const student = await runRoomFinderSearch(query, 50, NOW, "ALL");
    if (student.kind !== "DONE") throw new Error(student.kind);
    expect(student.available.map((r) => code(r.room.roomCode)).sort()).toEqual(["G-NO", "G-OK", "G-STAFF"]);

    const day = await runRoomFinderSearch({ ...query, slots: [] }, 50, NOW, "GUEST");
    if (day.kind !== "DAY") throw new Error(day.kind);
    expect([...day.available, ...day.unavailable].map((r) => code(r.room.roomCode))).toEqual(["G-OK"]);
  });

  it("reaches review for an eligible room, but not for a non-guest or staff-only room", async () => {
    const guest = await makeUser("GUEST", "APPROVED");
    const viewer = { userId: guest, role: "GUEST" as const, status: "APPROVED" as const };
    const searchParams = { date: MONDAY, slots: "SLOT_2", partySize: "2" };
    const ok = await makeRoom("GR-OK", { guestAccess: true });
    const no = await makeRoom("GR-NO");
    const staff = await makeRoom("GR-STAFF", { guestAccess: true, staffOnly: true });

    expect(await loadBookingReview({ viewer, roomId: ok, searchParams, now: NOW })).toMatchObject({
      kind: "READY",
      blocked: null,
      room: { id: ok, approvalPolicy: "AUTO" },
    });
    for (const room of [no, staff]) {
      expect(await loadBookingReview({ viewer, roomId: room, searchParams, now: NOW })).toMatchObject({
        kind: "READY",
        blocked: "GUEST_ROOM_NOT_ALLOWED",
      });
    }
    // STUDENT is not restricted by guestAccess.
    const student = await makeUser();
    expect(
      await loadBookingReview({
        viewer: { userId: student, role: "STUDENT", status: "APPROVED" },
        roomId: no,
        searchParams,
        now: NOW,
      })
    ).toMatchObject({ kind: "READY", blocked: null });
  });

  it("creates AUTO -> APPROVED and MANUAL -> PENDING under the room's own policy", async () => {
    const auto = await makeRoom("G-AUTO", { guestAccess: true });
    const manual = await makeRoom("G-MAN", { guestAccess: true, policy: "MANUAL" });
    expect(await book(await makeUser("GUEST", "APPROVED"), auto)).toMatchObject({ ok: true, status: "APPROVED" });
    expect(await book(await makeUser("GUEST", "APPROVED"), manual)).toMatchObject({ ok: true, status: "PENDING" });
  });

  it("is rejected when guestAccess is removed, or staffOnly set, after review (caught in the transaction)", async () => {
    const guest = await makeUser("GUEST", "APPROVED");
    const viewer = { userId: guest, role: "GUEST" as const, status: "APPROVED" as const };
    const searchParams = { date: MONDAY, slots: "SLOT_2", partySize: "4" };

    const revoked = await makeRoom("G-REVOKE", { guestAccess: true });
    expect(await loadBookingReview({ viewer, roomId: revoked, searchParams, now: NOW })).toMatchObject({ kind: "READY" });
    await prisma.room.update({ where: { id: revoked }, data: { guestAccess: false } });
    expect(await book(guest, revoked)).toEqual({ ok: false, error: "GUEST_ROOM_NOT_ALLOWED" });

    const staffed = await makeRoom("G-STAFFED", { guestAccess: true });
    expect(await loadBookingReview({ viewer, roomId: staffed, searchParams, now: NOW })).toMatchObject({ kind: "READY" });
    await prisma.room.update({ where: { id: staffed }, data: { staffOnly: true } });
    expect(await book(guest, staffed)).toEqual({ ok: false, error: "GUEST_ROOM_NOT_ALLOWED" });

    expect(await prisma.roomBooking.count({ where: { userId: guest } })).toBe(0);
  });

  it("obeys cross-room overlap protection like a STUDENT", async () => {
    const guest = await makeUser("GUEST", "APPROVED");
    const a = await makeRoom("G-OVA", { guestAccess: true });
    const b = await makeRoom("G-OVB", { guestAccess: true });
    expect(await book(guest, a)).toMatchObject({ ok: true });
    expect(await book(guest, b)).toEqual({ ok: false, error: "OVERLAPPING_BOOKING" });
  });
});

describe("group booking", () => {
  it("only the owner may book with a group; membership is never trusted from the client", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const member = await makeUser();
    const group = await makeGroup(owner, [member]);
    const room = await makeRoom("GRP-OWNER");

    expect(await book(other, room, { participants: groupSelection(group, [owner, member]) })).toEqual({
      ok: false,
      error: "NOT_GROUP_OWNER",
    });
    expect(await book(owner, room, { participants: { kind: "GROUP", groupId: "zz-missing-group" } })).toEqual({
      ok: false,
      error: "GROUP_NOT_FOUND",
    });
    expect(await bookingsIn(room)).toHaveLength(0);
  });

  it("creates one participant per live member (owner included), partySize = member count", async () => {
    const owner = await makeUser();
    const m1 = await makeUser();
    const m2 = await makeUser();
    const group = await makeGroup(owner, [m1, m2]);
    const room = await makeRoom("GRP-3");

    const result = await book(owner, room, { participants: groupSelection(group, [owner, m1, m2]) });
    expect(result).toMatchObject({ ok: true, status: "APPROVED" });
    const [row] = await bookingsIn(room);
    expect(row.partySize).toBe(3);
    expect(row.participants.map((p) => p.userId).sort()).toEqual([m1, m2, owner].sort());
    expect(row.participants.every((p) => p.source === "GROUP" && p.groupId === group)).toBe(true);

    const logs = await prisma.log.findMany({ where: { roomId: room } });
    expect(logs[0].details).toContain("participants=3 source=GROUP");
  });

  it("D2 (revised): a stale fingerprint (or none) is rejected with GROUP_MEMBERSHIP_CHANGED - nothing created", async () => {
    const owner = await makeUser();
    const m1 = await makeUser();
    const group = await makeGroup(owner, [m1]);
    const room = await makeRoom("GRP-STALE");

    // No fingerprint at all (never previewed).
    expect(await book(owner, room, { participants: { kind: "GROUP", groupId: group } })).toEqual({
      ok: false,
      error: "GROUP_MEMBERSHIP_CHANGED",
    });
    // Fingerprint of a set that no longer matches (someone joined since).
    const staleFingerprint = computeParticipantFingerprint([owner]); // reviewed before m1 joined
    expect(await book(owner, room, { participants: { kind: "GROUP", groupId: group, fingerprint: staleFingerprint } })).toEqual({
      ok: false,
      error: "GROUP_MEMBERSHIP_CHANGED",
    });
    expect(await bookingsIn(room)).toHaveLength(0);

    // The correct, current fingerprint succeeds.
    expect(await book(owner, room, { participants: groupSelection(group, [owner, m1]) })).toMatchObject({ ok: true });
  });

  it("a group with a pending GUEST, a rejected GUEST or an ADMIN member is rejected wholesale", async () => {
    const owner = await makeUser();
    for (const [role, status] of [
      ["GUEST", "PENDING"],
      ["GUEST", "REJECTED"],
      ["ADMIN", "APPROVED"],
    ] as const) {
      const ineligible = await makeUser(role, status);
      const group = await makeGroup(owner, [ineligible]);
      const room = await makeRoom(`GRP-INEL-${roomIds.length}`);
      expect(await book(owner, room, { participants: groupSelection(group, [owner, ineligible]) })).toMatchObject({
        ok: false,
        error: "INELIGIBLE_PARTICIPANT",
        participantName: expect.any(String),
      });
      expect(await bookingsIn(room)).toHaveLength(0);
    }
  });

  it("if the OWNER themself is ineligible (e.g. demoted), the group booking is NOT_ALLOWED (matches solo wording)", async () => {
    const owner = await makeUser("GUEST", "APPROVED");
    const member = await makeUser();
    const group = await makeGroup(owner, [member]);
    const room = await makeRoom("GRP-OWNER-DEMOTED");
    await prisma.user.update({ where: { id: owner }, data: { status: "REJECTED" } });
    expect(await book(owner, room, { participants: groupSelection(group, [owner, member]) })).toEqual({
      ok: false,
      error: "NOT_ALLOWED",
    });
  });

  it("an approved GUEST member requires a guest-eligible room, even when the owner is a STUDENT", async () => {
    const owner = await makeUser();
    const guestMember = await makeUser("GUEST", "APPROVED");
    const group = await makeGroup(owner, [guestMember]);
    const notGuestRoom = await makeRoom("GRP-NOGUEST");
    const guestRoom = await makeRoom("GRP-GUESTOK", { guestAccess: true });

    expect(await book(owner, notGuestRoom, { participants: groupSelection(group, [owner, guestMember]) })).toMatchObject({
      ok: false,
      error: "GUEST_ROOM_NOT_ALLOWED",
      participantName: expect.any(String),
    });
    expect(await book(owner, guestRoom, { participants: groupSelection(group, [owner, guestMember]) })).toMatchObject({ ok: true });
  });

  it("a non-creator member's own conflicting booking rejects the WHOLE group booking, naming them", async () => {
    const owner = await makeUser();
    const bob = await makeUser();
    const carol = await makeUser();
    const bobsRoom = await makeRoom("GRP-BOB-EXISTING");
    expect(await book(bob, bobsRoom)).toMatchObject({ ok: true }); // Bob already has SLOT_2 on MONDAY

    const group = await makeGroup(owner, [bob, carol]);
    const room = await makeRoom("GRP-CONFLICT");
    const result = await book(owner, room, { participants: groupSelection(group, [owner, bob, carol]) });
    expect(result).toEqual({ ok: false, error: "OVERLAPPING_BOOKING", participantName: expect.stringContaining("ZZTEST") });
    expect(await bookingsIn(room)).toHaveLength(0); // atomic: Alice/Carol having no conflict doesn't matter
  });

  it("CANCELLED/REJECTED bookings of a member never block a group booking", async () => {
    const owner = await makeUser();
    const bob = await makeUser();
    const bobsRoom = await makeRoom("GRP-BOB-CANCELLED");
    const made = await book(bob, bobsRoom);
    if (!made.ok) throw new Error(made.error);
    await prisma.roomBooking.update({ where: { id: made.bookingId }, data: { status: "CANCELLED" } });

    const group = await makeGroup(owner, [bob]);
    const room = await makeRoom("GRP-BOB-OK");
    expect(await book(owner, room, { participants: groupSelection(group, [owner, bob]) })).toMatchObject({ ok: true });
  });

  it("a resubmit of the identical group (same members, room, slots) is idempotent", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const group = await makeGroup(owner, [member]);
    const room = await makeRoom("GRP-RESUBMIT");
    const selection = groupSelection(group, [owner, member]);
    const [a, b] = await Promise.all([
      book(owner, room, { participants: selection }),
      book(owner, room, { participants: selection }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.bookingId).toBe(b.bookingId);
    expect(await bookingsIn(room)).toHaveLength(1);
  });

  it("review (previews) reflect the live member count and re-check capacity for it, not the searched partySize", async () => {
    const owner = await makeUser();
    const m1 = await makeUser();
    const m2 = await makeUser();
    const group = await makeGroup(owner, [m1, m2]); // 3 total
    const room = await makeRoom("GRP-PREVIEW", { capacity: 5 });
    const viewer = { userId: owner, role: "STUDENT" as const, status: "APPROVED" as const };
    const searchParams = { date: MONDAY, slots: "SLOT_2", partySize: "1" }; // searched solo, then switched to this group

    const preview = await loadBookingReview({
      viewer,
      roomId: room,
      searchParams,
      now: NOW,
      participants: { kind: "GROUP", groupId: group },
    });
    expect(preview).toMatchObject({ kind: "READY", participantCount: 3, remainingCapacity: 5, blocked: null });
    if (preview.kind !== "READY") return;
    expect(preview.participants).toMatchObject({ kind: "GROUP", groupId: group });
    expect(typeof (preview.participants as { fingerprint?: string }).fingerprint).toBe("string");

    // A group too big for the room is blocked at preview time already (informational).
    const tooSmallRoom = await makeRoom("GRP-TOOSMALL", { capacity: 2 });
    const blockedPreview = await loadBookingReview({
      viewer,
      roomId: tooSmallRoom,
      searchParams,
      now: NOW,
      participants: { kind: "GROUP", groupId: group },
    });
    expect(blockedPreview).toMatchObject({ kind: "READY", blocked: "CAPACITY_INSUFFICIENT", remainingCapacity: 2 });
  });

  describe("concurrency", () => {
    it("two groups sharing a member race for overlapping slots - exactly one wins, naming the shared member, no deadlock", async () => {
      for (let round = 0; round < 5; round += 1) {
        const ownerX = await makeUser();
        const ownerY = await makeUser();
        const shared = await makeUser(); // Bob, in both groups
        const groupX = await makeGroup(ownerX, [shared]);
        const groupY = await makeGroup(ownerY, [shared]);
        const roomA = await makeRoom(`GRPX${round}`);
        const roomB = await makeRoom(`GRPY${round}`);

        const results = await Promise.all([
          book(ownerX, roomA, { participants: groupSelection(groupX, [ownerX, shared]) }),
          book(ownerY, roomB, { participants: groupSelection(groupY, [ownerY, shared]) }),
        ]);

        expect(results.filter((r) => r.ok), `round ${round}`).toHaveLength(1);
        const loser = results.find((r) => !r.ok);
        expect(loser, `round ${round}`).toEqual({ ok: false, error: "OVERLAPPING_BOOKING", participantName: expect.any(String) });
      }
    });

    it("two 3-person groups race for a 5-seat room - exactly one APPROVED, sum never exceeds capacity, 5 rounds", async () => {
      for (let round = 0; round < 5; round += 1) {
        const room = await makeRoom(`GRPCAP${round}`, { capacity: 5 });
        const ownerA = await makeUser();
        const groupA = await makeGroup(ownerA, [await makeUser(), await makeUser()]); // 3 total
        const membersA = (await prisma.groupMember.findMany({ where: { groupId: groupA } })).map((m) => m.userId);
        const ownerB = await makeUser();
        const groupB = await makeGroup(ownerB, [await makeUser(), await makeUser()]); // 3 total
        const membersB = (await prisma.groupMember.findMany({ where: { groupId: groupB } })).map((m) => m.userId);

        const results = await Promise.all([
          book(ownerA, room, { participants: groupSelection(groupA, membersA) }),
          book(ownerB, room, { participants: groupSelection(groupB, membersB) }),
        ]);

        expect(results.filter((r) => r.ok && r.status === "APPROVED"), `round ${round}`).toHaveLength(1);
        expect(results.find((r) => !r.ok), `round ${round}`).toMatchObject({ ok: false, error: "CAPACITY_INSUFFICIENT" });
        const approved = (await bookingsIn(room)).filter((b) => b.status === "APPROVED");
        expect(approved.reduce((sum, b) => sum + b.partySize, 0)).toBeLessThanOrEqual(5);
      }
    });
  });
});

describe("review and result pages", () => {
  it("1. review shows authoritative room data, never URL values", async () => {
    const student = await makeUser();
    const room = await makeRoom("REVIEW", { capacity: 12, policy: "MANUAL", capabilities: ["LAB"] });
    const review = await loadBookingReview({
      viewer: { userId: student, role: "STUDENT", status: "APPROVED" },
      roomId: room,
      searchParams: { date: MONDAY, slots: "SLOT_2,SLOT_3", partySize: "4", capability: "LAB", building: RUN, floor: "1" },
      now: NOW,
    });
    expect(review).toMatchObject({
      kind: "READY",
      room: { id: room, capacity: 12, approvalPolicy: "MANUAL", capabilities: ["LAB"] },
      remainingCapacity: 12,
      participantCount: 1,
      blocked: null,
      existing: null,
    });
    if (review.kind !== "READY") return;
    // แก้ไขการค้นหา goes back to the same finder search.
    const back = new URL(review.backHref, "http://x");
    expect(back.pathname).toBe("/dashboard/rooms");
    expect(Object.fromEntries(back.searchParams)).toMatchObject({ slots: "SLOT_2,SLOT_3", partySize: "4", building: RUN });
  });

  it("review reports an existing identical booking and blocks overlapping (not identical) slots", async () => {
    const student = await makeUser();
    const room = await makeRoom("REVDUP");
    const made = await book(student, room); // SLOT_2
    if (!made.ok) throw new Error(made.error);
    const viewer = { userId: student, role: "STUDENT" as const, status: "APPROVED" as const };
    expect(
      await loadBookingReview({ viewer, roomId: room, searchParams: { date: MONDAY, slots: "SLOT_2", partySize: "1" }, now: NOW })
    ).toMatchObject({ kind: "READY", existing: { kind: "SAME", bookingId: made.bookingId }, blocked: null });
    expect(
      await loadBookingReview({
        viewer,
        roomId: room,
        searchParams: { date: MONDAY, slots: "SLOT_2,SLOT_3", partySize: "1" },
        now: NOW,
      })
    ).toMatchObject({ kind: "READY", blocked: "DUPLICATE_BOOKING" });
  });

  it("the result page is viewable by any participant, not just the creator; a non-participant gets null", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const stranger = await makeUser();
    const group = await makeGroup(owner, [member]);
    const room = await makeRoom("ROSTER");
    const made = await book(owner, room, { participants: groupSelection(group, [owner, member]) });
    if (!made.ok) throw new Error(made.error);

    const asOwner = await getOwnBooking(made.bookingId, owner);
    const asMember = await getOwnBooking(made.bookingId, member);
    expect(asOwner).toMatchObject({ id: made.bookingId, status: "APPROVED", date: MONDAY, partySize: 2 });
    expect(asMember).toMatchObject({ id: made.bookingId, partySize: 2 });
    // D6: read-only roster - names, an identity label for STUDENT, count, creator distinction.
    expect(asOwner?.participants).toHaveLength(2);
    expect(asOwner?.participants.map((p) => p.userId).sort()).toEqual([member, owner].sort());
    expect(asOwner?.participants.find((p) => p.userId === owner)).toMatchObject({ isCreator: true });
    expect(asOwner?.participants.find((p) => p.userId === member)).toMatchObject({ isCreator: false });
    expect(asOwner?.creatorName).toBe(asOwner?.participants.find((p) => p.isCreator)?.name);

    expect(await getOwnBooking(made.bookingId, stranger)).toBeNull();
    expect(await getOwnBooking("zz-missing", owner)).toBeNull();
  });

  it("a STUDENT participant's identityLabel is their studentId when set", async () => {
    const owner = await makeUser();
    const student = await prisma.user.update({
      where: { id: await makeUser() },
      data: { studentId: `${RUN}-6600000001` },
    });
    const group = await makeGroup(owner, [student.id]);
    const room = await makeRoom("ROSTER-SID");
    const made = await book(owner, room, { participants: groupSelection(group, [owner, student.id]) });
    if (!made.ok) throw new Error(made.error);
    const result = await getOwnBooking(made.bookingId, owner);
    expect(result?.participants.find((p) => p.userId === student.id)).toMatchObject({ identityLabel: `${RUN}-6600000001` });
  });
});

describe("dashboard การจองของฉัน (loadDashboardBookings)", () => {
  async function insertBooking(
    userId: string,
    roomId: string,
    date: string,
    slots: AcademicSlot[],
    status: "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED"
  ) {
    const row = await prisma.roomBooking.create({
      data: {
        roomId,
        userId,
        date: new Date(`${date}T00:00:00Z`),
        partySize: 1,
        status,
        slots: { create: slots.map((slot) => ({ slot, ...resolveSlotRange(date, slot) })) },
        participants: { create: [{ userId, source: "SELF" }] },
      },
    });
    return row.id;
  }
  const load = (userId: string, role: Role = "STUDENT", status: AccountStatus = "APPROVED", now = NOW) =>
    loadDashboardBookings({ viewer: { userId, role, status }, now });

  it("STUDENT sees own APPROVED and PENDING, current first, from RoomBooking + RoomBookingSlot", async () => {
    const student = await makeUser();
    const room = await makeRoom("DASH-S");
    const later = await book(student, room, { slots: ["SLOT_3", "SLOT_4"] }); // APPROVED, MONDAY
    const pending = await insertBooking(student, room, MONDAY, ["SLOT_1"], "PENDING");
    // TODAY (2030-01-01) SLOT_1 = 08:40-11:00; NOW is 10:00, so it is in progress.
    const current = await insertBooking(student, room, "2030-01-01", ["SLOT_1"], "APPROVED");
    if (!later.ok) throw new Error(later.error);

    const list = await load(student);
    expect(list?.map((b) => b.id)).toEqual([current, pending, later.bookingId]);
    expect(list?.[2]).toEqual({
      id: later.bookingId,
      status: "APPROVED",
      date: MONDAY,
      partySize: 1,
      roomCode: `${RUN}-DASH-S`,
      roomName: "ห้องทดสอบ DASH-S",
      slots: ["SLOT_3", "SLOT_4"],
      startAt: "2030-01-07T07:30:00.000Z", // 14:30 Bangkok
      endAt: "2030-01-07T12:20:00.000Z", // 19:20 Bangkok
      inAccessWindow: false,
      isCreator: true,
      creatorName: expect.stringContaining("ZZTEST"),
    });
    expect(list?.[1]).toMatchObject({ id: pending, status: "PENDING", inAccessWindow: false });
    // Feature 8: the in-progress APPROVED booking is "ใช้งานได้" on the dashboard.
    expect(list?.[0]).toMatchObject({ id: current, status: "APPROVED", inAccessWindow: true });
  });

  it("a non-creator PARTICIPANT (added via a group) also sees the booking, with isCreator=false and the creator's name", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const group = await makeGroup(owner, [member]);
    const room = await makeRoom("DASH-GROUP");
    const made = await book(owner, room, { participants: groupSelection(group, [owner, member]) });
    if (!made.ok) throw new Error(made.error);

    const ownerList = await load(owner);
    const memberList = await load(member);
    expect(ownerList?.[0]).toMatchObject({ id: made.bookingId, isCreator: true });
    expect(memberList?.[0]).toMatchObject({ id: made.bookingId, isCreator: false, partySize: 2 });
    expect(memberList?.[0].creatorName).toBe(ownerList?.[0].creatorName);
  });

  it("approved GUEST sees own APPROVED and PENDING", async () => {
    const guest = await makeUser("GUEST", "APPROVED");
    const auto = await makeRoom("DASH-GA", { guestAccess: true });
    const manual = await makeRoom("DASH-GM", { guestAccess: true, policy: "MANUAL" });
    expect(await book(guest, auto, { slots: ["SLOT_1"] })).toMatchObject({ ok: true, status: "APPROVED" });
    expect(await book(guest, manual, { slots: ["SLOT_2"] })).toMatchObject({ ok: true, status: "PENDING" });
    expect((await load(guest, "GUEST"))?.map((b) => b.status)).toEqual(["APPROVED", "PENDING"]);
  });

  it("never shows another user's bookings", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    const room = await makeRoom("DASH-O");
    await insertBooking(theirs, room, MONDAY, ["SLOT_2"], "APPROVED");
    const own = await insertBooking(mine, room, MONDAY, ["SLOT_3"], "APPROVED");
    expect((await load(mine))?.map((b) => b.id)).toEqual([own]);
  });

  it("REJECTED, CANCELLED and ended bookings are left out; nothing left -> null (section hidden)", async () => {
    const student = await makeUser();
    const room = await makeRoom("DASH-X");
    await insertBooking(student, room, MONDAY, ["SLOT_1"], "REJECTED");
    await insertBooking(student, room, MONDAY, ["SLOT_2"], "CANCELLED");
    await insertBooking(student, room, "2029-12-31", ["SLOT_1"], "APPROVED"); // yesterday
    // Today's SLOT_1 has ended by 11:30.
    await insertBooking(student, room, "2030-01-01", ["SLOT_1"], "APPROVED");
    expect(await load(student, "STUDENT", "APPROVED", new Date("2030-01-01T11:30:00+07:00"))).toBeNull();
    expect(await load(await makeUser())).toBeNull(); // no bookings at all
  });

  it("shows at most 3", async () => {
    const student = await makeUser();
    const room = await makeRoom("DASH-3");
    for (const slot of ALL_SLOTS) await insertBooking(student, room, MONDAY, [slot], "APPROVED");
    expect((await load(student))?.map((b) => b.slots[0])).toEqual(["SLOT_1", "SLOT_2", "SLOT_3"]);
  });

  it("ADMIN and pending GUEST get no widget", async () => {
    const room = await makeRoom("DASH-R");
    for (const [role, status] of [
      ["ADMIN", "APPROVED"],
      ["SUPER_ADMIN", "APPROVED"],
      ["GUEST", "PENDING"],
    ] as const) {
      const user = await makeUser(role, status);
      await insertBooking(user, room, MONDAY, ["SLOT_4"], "APPROVED");
      expect(await load(user, role, status)).toBeNull();
    }
  });
});

describe("backfill invariant: every RoomBooking has a participant row before participant-aware reads go live", () => {
  it("backfills legacy-style bookings (created with no participant row) with exactly one SELF row, idempotently, and never touches partySize", async () => {
    const legacyUser = await makeUser();
    const room = await makeRoom("LEGACY");
    // Simulate a pre-migration booking: created directly, no participant row, partySize > 1
    // (exactly the historical mismatch §3 describes - never fabricated, only surfaced).
    const legacy = await prisma.roomBooking.create({
      data: {
        roomId: room,
        userId: legacyUser,
        date: new Date(`${MONDAY}T00:00:00Z`),
        partySize: 6,
        status: "APPROVED",
        slots: { create: [{ slot: "SLOT_1", ...resolveSlotRange(MONDAY, "SLOT_1") }] },
      },
    });
    expect(await prisma.roomBookingParticipant.count({ where: { bookingId: legacy.id } })).toBe(0);

    const first = await backfillRoomBookingParticipants(prisma);
    expect(first.flaggedLegacyPartySize.map((b) => b.id)).toContain(legacy.id);
    const participants = await prisma.roomBookingParticipant.findMany({ where: { bookingId: legacy.id } });
    expect(participants).toEqual([expect.objectContaining({ bookingId: legacy.id, userId: legacyUser, source: "SELF" })]);
    // partySize is never rewritten - the historical claim stays on record, participants tell the truth.
    expect((await prisma.roomBooking.findUniqueOrThrow({ where: { id: legacy.id } })).partySize).toBe(6);

    const second = await backfillRoomBookingParticipants(prisma);
    expect(second.created).toBe(0); // idempotent: nothing left to backfill from this run
    expect(await prisma.roomBookingParticipant.count({ where: { bookingId: legacy.id } })).toBe(1); // no duplicate
  });
});
