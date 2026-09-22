import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { computeParticipantFingerprint } from "@/lib/room-booking-rules";
import { createRoomBooking } from "@/lib/room-booking";
import { decideRoomBooking } from "@/lib/room-booking-decision";
import { ROOM_LOCK_NAMESPACE, USER_LOCK_NAMESPACE } from "@/lib/room-booking-locks";
import type { AcademicSlot, AccountStatus, BookingStatus, Role } from "@/lib/types";

// LOCAL database integration tests for Feature 8 approve/reject (VITEST_DB=1). Every
// row belongs to disposable ZZD rooms/groups/users, all removed in afterAll.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("room-booking-decision.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZD-${Date.now().toString(36).toUpperCase()}`;
const MONDAY = "2030-01-07";
const NOW = new Date("2030-01-01T10:00:00+07:00");
const ALL_SLOTS: AcademicSlot[] = ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"];

const roomIds: string[] = [];
const groupIds: string[] = [];
let serial = 0;

async function makeUser(role: Role = "STUDENT", status: AccountStatus = "APPROVED") {
  serial += 1;
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}-${serial}@example.test`, name: `ZZDEC${serial}`, role, status },
  });
  return user.id;
}

async function makeRoom(code: string, opts: { capacity?: number } = {}) {
  const room = await prisma.room.create({
    data: {
      roomCode: `${RUN}-${code}`,
      name: `ห้องทดสอบ ${code}`,
      building: RUN,
      floor: 1,
      capacity: opts.capacity ?? 10,
      capabilities: ["WORKSHOP"],
      isActive: true,
      bookingEnabled: true,
      approvalPolicy: "MANUAL",
    },
  });
  roomIds.push(room.id);
  await prisma.roomAvailabilityWindow.createMany({ data: ALL_SLOTS.map((slot) => ({ roomId: room.id, dayOfWeek: 1, slot })) });
  return room.id;
}

async function makeGroup(ownerId: string, memberIds: string[]) {
  const group = await prisma.group.create({ data: { name: `ZZD Group ${groupIds.length + 1}`, ownerId } });
  groupIds.push(group.id);
  const ids = new Set([ownerId, ...memberIds]);
  await prisma.groupMember.createMany({ data: [...ids].map((userId) => ({ groupId: group.id, userId })) });
  return { groupId: group.id, members: [...ids] };
}

/** A real PENDING request through the Feature 7 creation path. */
async function requestPending(creatorId: string, roomId: string, opts: { slots?: AcademicSlot[]; members?: string[] } = {}) {
  let participants: unknown = { kind: "SELF" };
  if (opts.members) {
    const { groupId, members } = await makeGroup(creatorId, opts.members);
    participants = { kind: "GROUP", groupId, fingerprint: computeParticipantFingerprint(members) };
  }
  const result = await createRoomBooking({
    userId: creatorId,
    now: NOW,
    input: { roomId, date: MONDAY, slots: opts.slots ?? ["SLOT_2"], participants },
  });
  if (!result.ok || result.status !== "PENDING") throw new Error(`expected PENDING, got ${JSON.stringify(result)}`);
  return result.bookingId;
}

/** Direct insert, bypassing creation rules - to set up state creation would refuse. */
async function insertBooking(userId: string, roomId: string, slots: AcademicSlot[], status: BookingStatus, participantIds = [userId], partySize = participantIds.length) {
  const booking = await prisma.roomBooking.create({
    data: {
      roomId,
      userId,
      date: new Date(`${MONDAY}T00:00:00Z`),
      partySize,
      status,
      slots: { create: slots.map((slot) => ({ slot, ...resolveSlotRange(MONDAY, slot) })) },
      participants: { create: participantIds.map((id) => ({ userId: id, source: "SELF" as const })) },
    },
  });
  return booking.id;
}

const approve = (bookingId: string, deciderId: string, now = NOW) => decideRoomBooking({ bookingId, deciderId, decision: "APPROVE", now });
const reject = (bookingId: string, deciderId: string, note?: unknown) =>
  decideRoomBooking({ bookingId, deciderId, decision: "REJECT", note, now: NOW });

const row = (id: string) =>
  prisma.roomBooking.findUniqueOrThrow({ where: { id }, include: { participants: { orderBy: { userId: "asc" } } } });
const decisionLogs = (bookingId: string) =>
  prisma.log.findMany({
    where: { action: { in: ["ROOM_BOOKING_APPROVED", "ROOM_BOOKING_REJECTED"] }, details: { contains: bookingId } },
  });

let admin = "";
let superAdmin = "";

beforeAll(async () => {
  admin = await makeUser("ADMIN");
  superAdmin = await makeUser("SUPER_ADMIN");
});

afterAll(async () => {
  const userFilter = { email: { startsWith: RUN.toLowerCase() } };
  const users = (await prisma.user.findMany({ where: userFilter, select: { id: true } })).map((u) => u.id);
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: roomIds } } }); // cascades slots + participants
  await prisma.log.deleteMany({ where: { OR: [{ roomId: { in: roomIds } }, { userId: { in: users } }] } });
  await prisma.classSchedule.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.roomClosure.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  await prisma.groupMember.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: userFilter });
  expect(await prisma.room.count({ where: { roomCode: { startsWith: RUN } } })).toBe(0);
  expect(await prisma.user.count({ where: userFilter })).toBe(0);
  await prisma.$disconnect();
});

describe("who may decide (authoritative database role)", () => {
  it("STUDENT and GUEST deciders are refused even if they reach the lib; nothing changes", async () => {
    const room = await makeRoom("ROLE");
    const student = await makeUser();
    const booking = await requestPending(student, room);
    for (const decider of [await makeUser("STUDENT"), await makeUser("GUEST", "APPROVED")]) {
      expect(await approve(booking, decider)).toEqual({ ok: false, error: "NOT_ALLOWED" });
      expect(await reject(booking, decider)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    }
    expect((await row(booking)).status).toBe("PENDING");
    expect(await decisionLogs(booking)).toHaveLength(0);
  });

  it("an admin demoted since their session started is refused", async () => {
    const room = await makeRoom("DEMOTED");
    const booking = await requestPending(await makeUser(), room);
    const demoted = await makeUser("ADMIN");
    await prisma.user.update({ where: { id: demoted }, data: { role: "STUDENT" } });
    expect(await approve(booking, demoted)).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });
});

describe("approve", () => {
  it.each([
    ["ADMIN", () => admin],
    ["SUPER_ADMIN", () => superAdmin],
  ])("%s: PENDING -> APPROVED with decider + time, one audit log, participant snapshot unchanged", async (_label, decider) => {
    const room = await makeRoom(`APP-${_label}`);
    const creator = await makeUser();
    const other = await makeUser();
    const booking = await requestPending(creator, room, { members: [other] });
    const before = (await row(booking)).participants;

    expect(await approve(booking, decider())).toEqual({ ok: true, status: "APPROVED" });

    const after = await row(booking);
    expect(after).toMatchObject({ status: "APPROVED", decidedById: decider(), decisionReason: null, partySize: 2 });
    expect(after.decidedAt?.toISOString()).toBe(NOW.toISOString());
    expect(after.participants).toEqual(before);

    const logs = await decisionLogs(booking);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "ROOM_BOOKING_APPROVED", userId: decider(), roomId: room });
    expect(logs[0].details).toBe(`booking ${booking} ${MONDAY} SLOT_2 decision=APPROVED participants=2 note=no`);
    expect(logs[0].details).not.toContain(creator);
    expect(logs[0].details).not.toContain(other);
  });

  it("uses CURRENT availability: fit at request time, full now -> refused, booking untouched, no log", async () => {
    const room = await makeRoom("FULLNOW", { capacity: 2 });
    const pending = await requestPending(await makeUser(), room, { members: [await makeUser()] }); // 2 of 2 seats when requested
    await insertBooking(await makeUser(), room, ["SLOT_2"], "APPROVED"); // someone else approved since
    const before = await row(pending);

    expect(await approve(pending, admin)).toEqual({ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 1 });
    expect(await row(pending)).toEqual(before);
    expect(await decisionLogs(pending)).toHaveLength(0);
  });

  it("re-checks a class, a closure and the room being disabled since the request", async () => {
    const student = await makeUser();
    const classRoom = await makeRoom("CLASSNOW");
    const b1 = await requestPending(student, classRoom);
    await prisma.classSchedule.create({
      data: { userId: student, roomId: classRoom, dayOfWeek: 1, startTime: "12:00", endTime: "14:20", slot: "SLOT_2" },
    });
    expect(await approve(b1, admin)).toMatchObject({ ok: false, error: "CLASS_IN_SESSION" });

    const closedRoom = await makeRoom("CLOSEDNOW");
    const b2 = await requestPending(await makeUser(), closedRoom);
    await prisma.roomClosure.create({
      data: { roomId: closedRoom, startDate: new Date(`${MONDAY}T00:00:00Z`), endDate: new Date(`${MONDAY}T00:00:00Z`), slots: [] },
    });
    expect(await approve(b2, admin)).toMatchObject({ ok: false, error: "CLOSED" });

    const disabledRoom = await makeRoom("DISABLEDNOW");
    const b3 = await requestPending(await makeUser(), disabledRoom);
    await prisma.room.update({ where: { id: disabledRoom }, data: { bookingEnabled: false } });
    expect(await approve(b3, admin)).toMatchObject({ ok: false, error: "ROOM_NOT_BOOKABLE" });

    for (const id of [b1, b2, b3]) expect((await row(id)).status).toBe("PENDING");
  });

  it("re-checks participant overlap (excluding this booking) and live participant eligibility", async () => {
    const room = await makeRoom("OVL-A");
    const elsewhere = await makeRoom("OVL-B");
    const creator = await makeUser();
    const member = await makeUser();
    const booking = await requestPending(creator, room, { members: [member] });
    // State creation would refuse: the member now holds an approved overlapping booking elsewhere.
    const blocker = await insertBooking(member, elsewhere, ["SLOT_2"], "APPROVED");
    const result = await approve(booking, admin);
    expect(result).toMatchObject({ ok: false, error: "OVERLAPPING_BOOKING" });
    expect(result).toHaveProperty("participantName");
    await prisma.roomBooking.update({ where: { id: blocker }, data: { status: "CANCELLED" } });

    // Same eligibility rule as creation (canBookRoom): a member who is now a not-yet-approved GUEST.
    await prisma.user.update({ where: { id: member }, data: { role: "GUEST", status: "PENDING" } });
    expect(await approve(booking, admin)).toMatchObject({ ok: false, error: "INELIGIBLE_PARTICIPANT" });
    await prisma.user.update({ where: { id: member }, data: { role: "STUDENT", status: "APPROVED" } });

    // Its own PENDING row never counts as a conflict with itself.
    expect(await approve(booking, admin)).toEqual({ ok: true, status: "APPROVED" });
  });

  it("a booking whose slots have all ended cannot be approved", async () => {
    const room = await makeRoom("EXPIRED");
    const booking = await requestPending(await makeUser(), room);
    expect(await approve(booking, admin, new Date(`${MONDAY}T18:00:00+07:00`))).toEqual({ ok: false, error: "BOOKING_EXPIRED" });
  });
});

describe("reject", () => {
  it("PENDING -> REJECTED with decider, time and the optional note; the log never contains the note text", async () => {
    const room = await makeRoom("REJ");
    const booking = await requestPending(await makeUser(), room);
    expect(await reject(booking, admin, "  ห้องสงวนไว้สำหรับกิจกรรมภาควิชา  ")).toEqual({ ok: true, status: "REJECTED" });
    const after = await row(booking);
    expect(after).toMatchObject({ status: "REJECTED", decidedById: admin, decisionReason: "ห้องสงวนไว้สำหรับกิจกรรมภาควิชา" });
    expect(after.decidedAt?.toISOString()).toBe(NOW.toISOString());
    const logs = await decisionLogs(booking);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "ROOM_BOOKING_REJECTED", userId: admin });
    expect(logs[0].details).toContain("note=yes");
    expect(logs[0].details).not.toContain("ห้องสงวน");
  });

  it("rejects a note over 500 characters without touching the booking", async () => {
    const room = await makeRoom("REJNOTE");
    const booking = await requestPending(await makeUser(), room);
    expect(await reject(booking, admin, "x".repeat(501))).toEqual({ ok: false, error: "INVALID_NOTE" });
    expect((await row(booking)).status).toBe("PENDING");
  });

  it("reject needs no availability: a booking that could no longer be approved can still be rejected", async () => {
    const room = await makeRoom("REJFULL", { capacity: 1 });
    const booking = await requestPending(await makeUser(), room);
    await insertBooking(await makeUser(), room, ["SLOT_2"], "APPROVED");
    expect(await reject(booking, admin)).toEqual({ ok: true, status: "REJECTED" });
  });
});

describe("terminal states cannot be decided again (no mutation, no extra log)", () => {
  it.each(["APPROVED", "REJECTED", "CANCELLED"] as const)("%s", async (status) => {
    const room = await makeRoom(`TERM-${status}`);
    const student = await makeUser();
    const booking = await insertBooking(student, room, ["SLOT_2"], status);
    const before = await row(booking);
    expect(await approve(booking, admin)).toEqual({ ok: false, error: "NOT_PENDING", currentStatus: status });
    expect(await reject(booking, superAdmin, "late")).toEqual({ ok: false, error: "NOT_PENDING", currentStatus: status });
    expect(await row(booking)).toEqual(before);
    expect(await decisionLogs(booking)).toHaveLength(0);
  });

  it("repeating a successful approval is a no-op: still exactly one audit log", async () => {
    const room = await makeRoom("REPEAT");
    const booking = await requestPending(await makeUser(), room);
    expect(await approve(booking, admin)).toEqual({ ok: true, status: "APPROVED" });
    expect(await approve(booking, admin)).toEqual({ ok: false, error: "NOT_PENDING", currentStatus: "APPROVED" });
    expect(await decisionLogs(booking)).toHaveLength(1);
  });

  it("unknown / malformed booking ids", async () => {
    expect(await approve("does-not-exist", admin)).toEqual({ ok: false, error: "BOOKING_NOT_FOUND" });
    expect(await decideRoomBooking({ bookingId: 42, deciderId: admin, decision: "APPROVE", now: NOW })).toEqual({
      ok: false,
      error: "BOOKING_NOT_FOUND",
    });
  });
});

describe("races", () => {
  it("two admins approve the same booking at once: exactly one wins, one audit log", async () => {
    const room = await makeRoom("RACE-AA");
    const booking = await requestPending(await makeUser(), room);
    const results = await Promise.all([approve(booking, admin), approve(booking, superAdmin)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "NOT_PENDING", currentStatus: "APPROVED" }]);
    const after = await row(booking);
    expect(after.status).toBe("APPROVED");
    expect(await decisionLogs(booking)).toHaveLength(1);
    expect((await decisionLogs(booking))[0].userId).toBe(after.decidedById);
  });

  it("approve vs reject at once: exactly one terminal transition, and the stored state matches the winner", async () => {
    const room = await makeRoom("RACE-AR");
    const booking = await requestPending(await makeUser(), room);
    const [a, r] = await Promise.all([approve(booking, admin), reject(booking, superAdmin, "no")]);
    expect([a.ok, r.ok].filter(Boolean)).toHaveLength(1);
    const winner = a.ok ? a : r;
    const after = await row(booking);
    expect(winner).toEqual({ ok: true, status: after.status });
    expect(after.decidedById).toBe(a.ok ? admin : superAdmin);
    const logs = await decisionLogs(booking);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe(a.ok ? "ROOM_BOOKING_APPROVED" : "ROOM_BOOKING_REJECTED");
  });

  it("two pending bookings compete for the final seats: at most capacity is approved", async () => {
    const room = await makeRoom("RACE-CAP", { capacity: 1 });
    const first = await requestPending(await makeUser(), room);
    const second = await requestPending(await makeUser(), room); // PENDING does not consume capacity
    const results = await Promise.all([approve(first, admin), approve(second, superAdmin)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "CAPACITY_INSUFFICIENT", remainingCapacity: 0 }]);
    const statuses = (await prisma.roomBooking.findMany({ where: { roomId: room }, select: { status: true } })).map((b) => b.status);
    expect(statuses.sort()).toEqual(["APPROVED", "PENDING"]);
  });

  it("three 2-person group requests for 3 seats approved at once: capacity is never exceeded", async () => {
    const room = await makeRoom("RACE-GRP", { capacity: 3 });
    const bookings = [];
    for (let i = 0; i < 3; i += 1) {
      bookings.push(await requestPending(await makeUser(), room, { members: [await makeUser()] }));
    }
    const results = await Promise.all(bookings.map((id, i) => approve(id, i % 2 ? admin : superAdmin)));
    expect(results.filter((r) => r.ok)).toHaveLength(1); // 2 + 2 > 3
    const seats = await prisma.roomBooking.aggregate({ where: { roomId: room, status: "APPROVED" }, _sum: { partySize: true } });
    expect(seats._sum.partySize).toBeLessThanOrEqual(3);
  });

  it("waits for a participant's USER lock and for the ROOM+DATE lock held by another booking transaction", async () => {
    const room = await makeRoom("LOCKWAIT");
    const creator = await makeUser();
    const booking = await requestPending(creator, room);

    for (const [namespace, key] of [
      [USER_LOCK_NAMESPACE, creator],
      [ROOM_LOCK_NAMESPACE, `${room}:${MONDAY}`],
    ]) {
      await prisma.roomBooking.update({ where: { id: booking }, data: { status: "PENDING", decidedById: null, decidedAt: null } });
      await prisma.log.deleteMany({ where: { details: { contains: booking } , action: "ROOM_BOOKING_APPROVED" } });
      const events: string[] = [];
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      const holder = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
        locked();
        await held;
        events.push("holder-release");
      });
      await lockTaken;
      const decision = approve(booking, admin).then((r) => {
        events.push("decided");
        return r;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(events).toEqual([]); // blocked on the lock
      release();
      await holder;
      expect(await decision).toEqual({ ok: true, status: "APPROVED" });
      expect(events).toEqual(["holder-release", "decided"]);
    }
  });
});
