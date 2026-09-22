import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { resolveRoomEntitlement } from "@/lib/room-entitlement";
import type { AcademicSlot, BookingStatus } from "@/lib/types";

// LOCAL database tests for the Gate/Face access matrix (VITEST_DB=1). Disposable ZZE
// rows only. The ACTIVE_SEMESTER setting is saved and restored.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("room-entitlement.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZE-${Date.now().toString(36).toUpperCase()}`;
const SEMESTER = `${RUN}-S1`;
const MONDAY = "2030-01-07"; // dayOfWeek 1 in Bangkok
const ACTIVE_SEMESTER_KEY = "ACTIVE_SEMESTER";
const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

const roomIds: string[] = [];
const groupIds: string[] = [];
let savedSemester: string | null = null;
let serial = 0;

async function makeUser(role: "STUDENT" | "GUEST" | "ADMIN" = "STUDENT") {
  serial += 1;
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}-${serial}@example.test`, name: `ZZENT${serial}`, role, status: "APPROVED" },
  });
  return user.id;
}

async function makeRoom(code: string) {
  const room = await prisma.room.create({
    data: { roomCode: `${RUN}-${code}`, name: `ห้องทดสอบ ${code}`, building: RUN, capacity: 10, capabilities: ["WORKSHOP"] },
  });
  roomIds.push(room.id);
  return room.id;
}

async function makeClass(userId: string, roomId: string, opts: { slot?: AcademicSlot | null; start?: string; end?: string; semester?: string | null; day?: number } = {}) {
  const slot = opts.slot === undefined ? "SLOT_2" : opts.slot;
  const row = await prisma.classSchedule.create({
    data: {
      userId,
      roomId,
      dayOfWeek: opts.day ?? 1,
      startTime: opts.start ?? "12:00",
      endTime: opts.end ?? "14:20",
      slot,
      semester: opts.semester === undefined ? SEMESTER : opts.semester,
    },
  });
  return row.id;
}

async function makeBooking(
  creatorId: string,
  roomId: string,
  opts: { status?: BookingStatus; slots?: AcademicSlot[]; participants?: string[]; groupId?: string } = {}
) {
  const participants = opts.participants ?? [creatorId];
  const booking = await prisma.roomBooking.create({
    data: {
      roomId,
      userId: creatorId,
      date: new Date(`${MONDAY}T00:00:00Z`),
      partySize: participants.length,
      status: opts.status ?? "APPROVED",
      slots: { create: (opts.slots ?? ["SLOT_3"]).map((slot) => ({ slot, ...resolveSlotRange(MONDAY, slot) })) },
      participants: {
        create: participants.map((userId) => ({
          userId,
          source: opts.groupId ? ("GROUP" as const) : ("SELF" as const),
          groupId: opts.groupId ?? null,
        })),
      },
    },
  });
  return booking.id;
}

const resolve = (userId: string, roomId: string, now: Date) => resolveRoomEntitlement({ userId, roomId, now });
const allowed = async (userId: string, roomId: string, now: Date) => (await resolve(userId, roomId, now)).allowed;

beforeAll(async () => {
  const setting = await prisma.systemSetting.findUnique({ where: { key: ACTIVE_SEMESTER_KEY } });
  savedSemester = setting?.value ?? null;
  await prisma.systemSetting.upsert({
    where: { key: ACTIVE_SEMESTER_KEY },
    update: { value: SEMESTER },
    create: { key: ACTIVE_SEMESTER_KEY, value: SEMESTER },
  });
});

afterAll(async () => {
  if (savedSemester === null) await prisma.systemSetting.deleteMany({ where: { key: ACTIVE_SEMESTER_KEY } });
  else await prisma.systemSetting.update({ where: { key: ACTIVE_SEMESTER_KEY }, data: { value: savedSemester } });
  const userFilter = { email: { startsWith: RUN.toLowerCase() } };
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.accessToken.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.classSchedule.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  await prisma.groupMember.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: userFilter });
  expect(await prisma.user.count({ where: userFilter })).toBe(0);
  expect(await prisma.systemSetting.findUnique({ where: { key: ACTIVE_SEMESTER_KEY } }).then((s) => s?.value ?? null)).toBe(savedSemester);
  await prisma.$disconnect();
});

describe("A. class schedule", () => {
  it("1. active class for this room in the current slot -> ALLOW (source CLASS, until class end)", async () => {
    const student = await makeUser();
    const roomA = await makeRoom("A1");
    const classId = await makeClass(student, roomA);
    const result = await resolve(student, roomA, bkk(MONDAY, "12:30"));
    expect(result).toEqual({
      allowed: true,
      grants: [{ source: "CLASS", id: classId, validUntil: bkk(MONDAY, "14:20") }],
      validUntil: bkk(MONDAY, "14:20"),
    });
  });

  it("2. right time, other room -> DENY", async () => {
    const student = await makeUser();
    const roomA = await makeRoom("A2-A");
    const roomB = await makeRoom("A2-B");
    await makeClass(student, roomA);
    expect(await allowed(student, roomB, bkk(MONDAY, "12:30"))).toBe(false);
  });

  it("3. outside the class access window (30 min early .. end, end exclusive) -> DENY; inside -> ALLOW", async () => {
    const student = await makeUser();
    const room = await makeRoom("A3");
    await makeClass(student, room);
    expect(await allowed(student, room, bkk(MONDAY, "11:29"))).toBe(false);
    expect(await allowed(student, room, bkk(MONDAY, "11:30"))).toBe(true);
    expect(await allowed(student, room, bkk(MONDAY, "14:19"))).toBe(true);
    expect(await allowed(student, room, bkk(MONDAY, "14:20"))).toBe(false);
    expect(await allowed(student, room, bkk("2030-01-08", "12:30"))).toBe(false); // Tuesday
  });

  it("4a. active semester: other-semester and unscoped rows never grant while a semester is active", async () => {
    const student = await makeUser();
    const room = await makeRoom("A4");
    await makeClass(student, room, { semester: "1/2020" });
    await makeClass(student, room, { semester: null, start: "12:00", end: "14:21", slot: null });
    expect(await allowed(student, room, bkk(MONDAY, "12:30"))).toBe(false);
  });

  it("4b. Bangkok timezone: Monday 06:15 in Bangkok is still Sunday in UTC - the Bangkok day and wall clock decide", async () => {
    const student = await makeUser();
    const room = await makeRoom("A4-TZ");
    await makeClass(student, room, { slot: null, start: "06:00", end: "07:00" });
    const now = new Date("2030-01-06T23:15:00.000Z"); // Mon 06:15 Bangkok, Sun 2030-01-06 in UTC
    expect(now.getUTCDay()).toBe(0);
    expect(await allowed(student, room, now)).toBe(true);
    expect(await allowed(student, room, new Date("2030-01-07T00:00:00.000Z"))).toBe(false); // 07:00 Bangkok, ended
    // Sunday in Bangkok: a Monday class never matches.
    expect(await allowed(student, room, new Date("2030-01-06T06:15:00.000Z"))).toBe(false); // Sun 13:15 Bangkok
  });

  it("4c. canonical AcademicSlot times are used for slotted rows", async () => {
    const student = await makeUser();
    const room = await makeRoom("A4-SLOT");
    // Stale strings that disagree with SLOT_3 (14:30-16:50): the slot wins.
    await makeClass(student, room, { slot: "SLOT_3", start: "08:00", end: "09:00" });
    expect(await allowed(student, room, bkk(MONDAY, "08:30"))).toBe(false);
    expect(await allowed(student, room, bkk(MONDAY, "14:00"))).toBe(true);
  });
});

describe("B. approved room booking", () => {
  it("1-3. every participant is allowed individually - creator is not special", async () => {
    const creator = await makeUser();
    const member = await makeUser();
    const room = await makeRoom("B1");
    const bookingId = await makeBooking(creator, room, { participants: [creator, member] });
    for (const user of [creator, member]) {
      expect(await resolve(user, room, bkk(MONDAY, "15:00"))).toEqual({
        allowed: true,
        grants: [{ source: "BOOKING", id: bookingId, validUntil: bkk(MONDAY, "16:50") }],
        validUntil: bkk(MONDAY, "16:50"),
      });
    }
  });

  it("4-5. not in the participant snapshot -> DENY, even as a current (or late-joining) Group member", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const room = await makeRoom("B4");
    const group = await prisma.group.create({ data: { name: `${RUN} group`, ownerId: owner } });
    groupIds.push(group.id);
    await prisma.groupMember.createMany({ data: [owner, member].map((userId) => ({ groupId: group.id, userId })) });
    await makeBooking(owner, room, { participants: [owner, member], groupId: group.id });

    const lateJoiner = await makeUser();
    await prisma.groupMember.create({ data: { groupId: group.id, userId: lateJoiner } });
    expect(await allowed(lateJoiner, room, bkk(MONDAY, "15:00"))).toBe(false);
    // Leaving the group later never revokes a snapshot participant either.
    await prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: member } });
    expect(await allowed(member, room, bkk(MONDAY, "15:00"))).toBe(true);
  });

  it.each(["PENDING", "REJECTED", "CANCELLED"] as const)("6-8. %s booking -> DENY", async (status) => {
    const student = await makeUser();
    const room = await makeRoom(`B-${status}`);
    await makeBooking(student, room, { status });
    expect(await allowed(student, room, bkk(MONDAY, "15:00"))).toBe(false);
  });

  it("9. correct participant, wrong room -> DENY", async () => {
    const student = await makeUser();
    const roomA = await makeRoom("B9-A");
    const roomB = await makeRoom("B9-B");
    await makeBooking(student, roomA);
    expect(await allowed(student, roomB, bkk(MONDAY, "15:00"))).toBe(false);
  });

  it("10. outside the booking window [first slot start, last slot end) -> DENY", async () => {
    const student = await makeUser();
    const room = await makeRoom("B10");
    await makeBooking(student, room); // SLOT_3 14:30-16:50
    expect(await allowed(student, room, bkk(MONDAY, "14:29"))).toBe(false);
    expect(await allowed(student, room, bkk(MONDAY, "14:30"))).toBe(true);
    expect(await allowed(student, room, bkk(MONDAY, "16:49"))).toBe(true);
    expect(await allowed(student, room, bkk(MONDAY, "16:50"))).toBe(false);
    expect(await allowed(student, room, bkk("2030-01-14", "15:00"))).toBe(false); // next Monday
  });

  it("a multi-slot booking covers the break between its own contiguous slots", async () => {
    const student = await makeUser();
    const room = await makeRoom("B-MULTI");
    await makeBooking(student, room, { slots: ["SLOT_1", "SLOT_2"] }); // 08:40-11:00, 12:00-14:20
    expect(await allowed(student, room, bkk(MONDAY, "11:30"))).toBe(true);
    expect((await resolve(student, room, bkk(MONDAY, "09:00")) as { validUntil: Date }).validUntil).toEqual(bkk(MONDAY, "14:20"));
  });

  it("an approved GUEST participant resolves like anyone else (face matching is a separate limitation)", async () => {
    const guest = await makeUser("GUEST");
    const room = await makeRoom("B-GUEST");
    await makeBooking(guest, room);
    expect(await allowed(guest, room, bkk(MONDAY, "15:00"))).toBe(true);
  });
});

describe("overlapping sources and legacy tokens", () => {
  it("class + booking at the same time: allowed once, both grants reported, latest end wins", async () => {
    const student = await makeUser();
    const room = await makeRoom("OVERLAP");
    await makeClass(student, room); // SLOT_2 until 14:20
    await makeBooking(student, room, { slots: ["SLOT_2", "SLOT_3"] }); // until 16:50
    const result = await resolve(student, room, bkk(MONDAY, "12:30"));
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.grants.map((g) => g.source).sort()).toEqual(["BOOKING", "CLASS"]);
    expect(result.validUntil).toEqual(bkk(MONDAY, "16:50"));
  });

  it("legacy token issued to the user -> LEGACY_TOKEN; a legacy GROUP token never authorizes other group members", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const room = await makeRoom("TOKEN");
    const group = await prisma.group.create({ data: { name: `${RUN} token group`, ownerId: owner } });
    groupIds.push(group.id);
    await prisma.groupMember.createMany({ data: [owner, member].map((userId) => ({ groupId: group.id, userId })) });
    await prisma.accessToken.create({
      data: { userId: owner, roomId: room, groupId: group.id, validFrom: bkk(MONDAY, "09:00"), validTo: bkk(MONDAY, "10:00") },
    });
    expect((await resolve(owner, room, bkk(MONDAY, "09:30")) as { grants: Array<{ source: string }> }).grants[0].source).toBe("LEGACY_TOKEN");
    expect(await allowed(member, room, bkk(MONDAY, "09:30"))).toBe(false);
    expect(await allowed(owner, room, bkk(MONDAY, "10:01"))).toBe(false);
  });

  it("no source at all -> DENY", async () => {
    expect(await allowed(await makeUser(), await makeRoom("NONE"), bkk(MONDAY, "12:30"))).toBe(false);
  });
});
