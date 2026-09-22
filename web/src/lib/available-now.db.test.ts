import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { loadDashboardRoomFinder, searchRoomFinder } from "@/lib/room-finder-search";
import type { AcademicSlot, BookingStatus } from "@/lib/types";

// LOCAL database integration tests for Available Now (VITEST_DB=1). Disposable
// ZZTEST rooms in their own building plus one disposable user, all removed in
// afterAll. Seeded demo data is only read, never written.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("available-now.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZN-${Date.now().toString(36).toUpperCase()}`; // also the building
const MONDAY = "2030-01-07";
const NOW = new Date(`${MONDAY}T09:00:00+07:00`); // inside SLOT_1
let userId = "";
const ids: Record<string, string> = {};

async function makeRoom(
  code: string,
  opts: {
    capacity: number;
    bookings?: Array<[BookingStatus, number] | [BookingStatus, number, AcademicSlot]>;
    classAt?: boolean;
    closed?: boolean;
    sessions?: number;
    windows?: AcademicSlot[];
    floor?: number;
  }
) {
  const room = await prisma.room.create({
    data: {
      roomCode: `${RUN}-${code}`,
      name: `ห้องทดสอบ ${code}`,
      building: RUN,
      floor: opts.floor ?? 1,
      capacity: opts.capacity,
      capabilities: ["MEETING"],
      isActive: true,
      bookingEnabled: true,
      approvalPolicy: "AUTO",
      availabilityWindows: { create: (opts.windows ?? ["SLOT_1"]).map((slot) => ({ dayOfWeek: 1, slot })) },
    },
  });
  ids[code] = room.id;
  for (const [status, partySize, slot = "SLOT_1"] of opts.bookings ?? []) {
    await prisma.roomBooking.create({
      data: {
        roomId: room.id,
        userId,
        date: new Date(`${MONDAY}T00:00:00Z`),
        partySize,
        status,
        slots: { create: [{ slot, ...resolveSlotRange(MONDAY, slot) }] },
      },
    });
  }
  if (opts.classAt) {
    await prisma.classSchedule.create({
      data: { userId, roomId: room.id, dayOfWeek: 1, startTime: "08:40", endTime: "11:00", slot: "SLOT_1", semester: null },
    });
  }
  if (opts.closed) {
    await prisma.roomClosure.create({
      data: { roomId: room.id, startDate: new Date(`${MONDAY}T00:00:00Z`), endDate: new Date(`${MONDAY}T00:00:00Z`), slots: [] },
    });
  }
  if (opts.sessions) {
    await prisma.session.createMany({
      data: Array.from({ length: opts.sessions }, () => ({ userId, roomId: room.id, status: "ACTIVE" as const })),
    });
  }
}

let seeded = "";
async function fingerprint() {
  const notMine = { NOT: { roomCode: { startsWith: RUN } } };
  return JSON.stringify(
    await Promise.all([
      prisma.room.count({ where: notMine }),
      prisma.roomBooking.count({ where: { room: notMine } }),
      prisma.roomClosure.count({ where: { room: notMine } }),
      prisma.classSchedule.count({ where: { room: notMine } }),
      prisma.session.count({ where: { room: notMine } }),
    ])
  );
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: "ZZTEST now", role: "STUDENT" },
  });
  userId = user.id;
  seeded = await fingerprint();

  await makeRoom("A", { capacity: 10 }); // 10 reservable
  await makeRoom("B", { capacity: 8, sessions: 9 }); // 8 reservable; 9 ACTIVE sessions must not matter
  await makeRoom("C", { capacity: 20, bookings: [["APPROVED", 13]] }); // 7 reservable
  await makeRoom("D", { capacity: 30 }); // 30
  await makeRoom("E", { capacity: 12, bookings: [["PENDING", 10], ["CANCELLED", 5], ["REJECTED", 5]] }); // still 12
  await makeRoom("CLASS", { capacity: 20, classAt: true });
  await makeRoom("CLOSED", { capacity: 20, closed: true });
  await makeRoom("FULL", { capacity: 8, bookings: [["APPROVED", 5]] }); // 3 left < 6
  await makeRoom("HUGE", { capacity: 9000 }); // only room able to take 8000

  // Floor 2: whole-day (no slot) fixtures.
  const ALL: AcademicSlot[] = ["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"];
  // Class in SLOT_1 (08:40-11:00), 5 of 10 booked in SLOT_3 -> free SLOT_2 (10), SLOT_3 (5), SLOT_4 (10).
  await makeRoom("DAY-A", { capacity: 10, floor: 2, windows: ALL, classAt: true, bookings: [["APPROVED", 5, "SLOT_3"]] });
  await makeRoom("DAY-B", { capacity: 10, floor: 2, windows: ["SLOT_2"] }); // free SLOT_2 only
  await makeRoom("DAY-C", { capacity: 10, floor: 2, windows: ALL, closed: true }); // nothing free
});

afterAll(async () => {
  const roomIds = Object.values(ids);
  await prisma.roomBookingSlot.deleteMany({ where: { booking: { roomId: { in: roomIds } } } });
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.session.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { roomCode: { startsWith: RUN } } });
  expect(await fingerprint()).toBe(seeded);
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

const code = (roomCode: string) => roomCode.slice(RUN.length + 1);

/** The finder search for today + SLOT_1 at NOW, scoped to this run's building. */
async function find(partySize: number, limit = 50) {
  const search = await searchRoomFinder(
    // Floor 1 only: floor 2 holds the whole-day fixtures.
    { date: MONDAY, slots: ["SLOT_1"], partySize: String(partySize), capability: "", building: RUN, floor: "1" },
    NOW,
    limit
  );
  if (search.kind !== "DONE") throw new Error(JSON.stringify(search));
  return search;
}

describe("dashboard entry against the real engine", () => {
  it("inside a slot: searches today + the current Bangkok slot once, shortlist of 6", async () => {
    const finder = await loadDashboardRoomFinder({ viewer: { role: "STUDENT", status: "APPROVED" }, now: NOW });
    expect(finder?.now).toMatchObject({ kind: "IN_SLOT", today: MONDAY, slot: "SLOT_1" });
    expect(finder?.form).toMatchObject({ date: MONDAY, slots: ["SLOT_1"], partySize: "1" });
    if (finder?.search?.kind !== "DONE") throw new Error("expected results");
    // Whole database (seeded + fixture rooms): at most 6 shown, the total counts every match.
    expect(finder.search.available.length).toBeLessThanOrEqual(6);
    expect(finder.search.totalAvailable).toBeGreaterThanOrEqual(finder.search.available.length);
    expect(finder.search.totalAvailable).toBeGreaterThanOrEqual(6); // this run alone adds 6+
    const remaining = finder.search.available.map((r) => r.remainingCapacity);
    expect(remaining).toEqual([...remaining].sort((a, b) => a - b));
  });

  it("outside a slot nothing is searched, even with rooms configured", async () => {
    const finder = await loadDashboardRoomFinder({ viewer: { role: "STUDENT", status: "APPROVED" }, now: new Date(`${MONDAY}T11:30:00+07:00`) });
    expect(finder).toMatchObject({
      search: null,
      now: { kind: "BETWEEN", today: MONDAY, nextSlot: "SLOT_2", nextStartsAt: `${MONDAY}T05:00:00.000Z` },
    });
  });
});

describe("shortlist, total and แสดงเพิ่ม against the real engine", () => {
  it("6/12. tightest fit first, with every available room counted", async () => {
    const search = await find(6);
    expect(search.available.map((r) => `${code(r.room.roomCode)}:${r.remainingCapacity}`)).toEqual([
      "C:7",
      "B:8",
      "A:10",
      "E:12",
      "D:30",
      "HUGE:9000",
    ]);
    expect(search.totalAvailable).toBe(6);
  });

  it("a smaller limit shows the best fits and still reports the full total", async () => {
    const search = await find(6, 2);
    expect(search.available.map((r) => code(r.room.roomCode))).toEqual(["C", "B"]);
    expect(search.totalAvailable).toBe(6);
    expect(search.availableTruncated).toBe(true);
    expect(search.unavailable).toEqual([]); // available rooms always fill the window first
  });

  it("a larger limit extends the same ordered list (แสดงเพิ่ม)", async () => {
    const shortlist = await find(6, 3);
    const more = await find(6, 5);
    expect(more.available.slice(0, 3).map((r) => r.room.id)).toEqual(shortlist.available.map((r) => r.room.id));
    expect(more.available).toHaveLength(5);
  });

  it("7/8/9. class-blocked, closed and FULL rooms are not available, with Feature 3 reasons", async () => {
    const search = await find(6);
    expect(search.unavailable.map((r) => `${code(r.room.roomCode)}:${r.status}`)).toEqual([
      "CLASS:CLASS_IN_SESSION",
      "CLOSED:CLOSED",
      "FULL:FULL",
    ]);
  });

  it("10. PENDING, CANCELLED and REJECTED do not consume capacity", async () => {
    const search = await find(12);
    expect(search.available.find((r) => code(r.room.roomCode) === "E")?.remainingCapacity).toBe(12);
  });

  it("11. party size changes the result set", async () => {
    const search = await find(11);
    expect(search.available.map((r) => code(r.room.roomCode))).toEqual(["E", "D", "HUGE"]);
  });

  it("16. ACTIVE Sessions do not reduce reservable capacity", async () => {
    const search = await find(8);
    expect(search.available.find((r) => code(r.room.roomCode) === "B")?.remainingCapacity).toBe(8);
  });
});

describe("no slot selected: each slot evaluated on its own, against the real engine", () => {
  async function day(partySize: number, limit = 50, at = NOW, date = MONDAY) {
    const search = await searchRoomFinder(
      { date, slots: [], partySize: String(partySize), capability: "", building: RUN, floor: "2" },
      at,
      limit
    );
    if (search.kind !== "DAY") throw new Error(JSON.stringify(search));
    return search;
  }
  const free = (r: { availableSlots: Array<{ slot: string; remainingCapacity: number }> }) =>
    r.availableSlots.map((s) => `${s.slot}:${s.remainingCapacity}`);

  it("lists rooms with at least one free slot, with each slot's own capacity", async () => {
    // A future date, so all four slots are considered.
    const search = await day(4, 50, new Date("2029-12-31T09:00:00+07:00"));
    expect(search.consideredSlots).toEqual(["SLOT_1", "SLOT_2", "SLOT_3", "SLOT_4"]);
    expect(search.available.map((r) => `${code(r.room.roomCode)}=${free(r).join(",")}`)).toEqual([
      "DAY-A=SLOT_2:10,SLOT_3:5,SLOT_4:10",
      "DAY-B=SLOT_2:10",
    ]);
    expect(search.totalAvailable).toBe(2);
  });

  it("a room busy in one slot is NOT excluded (not a multi-slot all-day request)", async () => {
    const search = await day(4, 50, new Date("2029-12-31T09:00:00+07:00"));
    const a = search.available.find((r) => code(r.room.roomCode) === "DAY-A");
    expect(a?.slots.find((s) => s.requestedSlots[0] === "SLOT_1")?.status).toBe("CLASS_IN_SESSION");
  });

  it("a room with no free slot is unavailable, with every slot's reason", async () => {
    const search = await day(4, 50, new Date("2029-12-31T09:00:00+07:00"));
    expect(search.unavailable.map((r) => code(r.room.roomCode))).toEqual(["DAY-C"]);
    expect(search.unavailable[0].slots.every((s) => s.status === "CLOSED")).toBe(true);
    expect(search.totalUnavailable).toBe(1);
  });

  it("party size drops only the slots that cannot fit", async () => {
    const search = await day(6, 50, new Date("2029-12-31T09:00:00+07:00"));
    const a = search.available.find((r) => code(r.room.roomCode) === "DAY-A");
    expect(free(a!)).toEqual(["SLOT_2:10", "SLOT_4:10"]); // SLOT_3 has 5 left
  });

  it("today skips slots that have ended", async () => {
    // Monday 15:00 Bangkok: SLOT_1 and SLOT_2 are over.
    const search = await day(4, 50, new Date(`${MONDAY}T15:00:00+07:00`));
    expect(search.consideredSlots).toEqual(["SLOT_3", "SLOT_4"]);
    expect(search.available.map((r) => code(r.room.roomCode))).toEqual(["DAY-A"]);
    expect(free(search.available[0])).toEqual(["SLOT_3:5", "SLOT_4:10"]);
  });

  it("the limit keeps the rooms with the most free slots and still counts every match", async () => {
    const search = await day(4, 1, new Date("2029-12-31T09:00:00+07:00"));
    expect(search.available.map((r) => code(r.room.roomCode))).toEqual(["DAY-A"]);
    expect(search.totalAvailable).toBe(2);
    expect(search.availableTruncated).toBe(true);
  });
});
