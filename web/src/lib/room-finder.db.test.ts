import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { validateAvailabilityRequest, validateRoomSearchFilters } from "@/lib/availability";
import {
  countBookableRoomsWithCapability,
  listBookableLocations,
  searchRoomAvailability,
} from "@/lib/availability-context";
import { compareFinderResults } from "@/lib/room-finder";
import { runRoomFinderSearch } from "@/lib/room-finder-search";
import type { AcademicSlot, RoomCapability } from "@/lib/types";

// LOCAL database integration tests for Room Finder (VITEST_DB=1). Every row
// belongs to disposable ZZTEST rooms in their own building plus one disposable
// user, all removed in afterAll. Seeded demo data is only read, never written.

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("room-finder.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZF-${Date.now().toString(36).toUpperCase()}`; // also the building, <= 20 chars
const MONDAY = "2030-01-07";
let userId = "";
const ids: Record<string, string> = {};

async function makeRoom(
  code: string,
  opts: {
    capacity: number;
    floor?: number;
    capabilities?: RoomCapability[];
    windows?: AcademicSlot[];
    bookingEnabled?: boolean;
    approved?: number;
    classAt?: AcademicSlot;
  }
) {
  const room = await prisma.room.create({
    data: {
      roomCode: `${RUN}-${code}`,
      name: `ห้องทดสอบ ${code}`,
      building: RUN,
      floor: opts.floor ?? 1,
      capacity: opts.capacity,
      capabilities: opts.capabilities ?? ["WORKSHOP"],
      isActive: true,
      bookingEnabled: opts.bookingEnabled ?? true,
      approvalPolicy: "AUTO",
    },
  });
  ids[code] = room.id;
  const windows = opts.windows ?? ["SLOT_1", "SLOT_2"];
  if (windows.length > 0) {
    await prisma.roomAvailabilityWindow.createMany({
      data: windows.map((slot) => ({ roomId: room.id, dayOfWeek: 1, slot })),
    });
  }
  if (opts.approved) {
    await prisma.roomBooking.create({
      data: {
        roomId: room.id,
        userId,
        date: new Date(`${MONDAY}T00:00:00Z`),
        partySize: opts.approved,
        status: "APPROVED",
        slots: { create: [{ slot: "SLOT_1", ...resolveSlotRange(MONDAY, "SLOT_1") }] },
      },
    });
  }
  if (opts.classAt) {
    await prisma.classSchedule.create({
      data: { userId, roomId: room.id, dayOfWeek: 1, startTime: "08:40", endTime: "11:00", slot: opts.classAt, semester: null },
    });
  }
  return room.id;
}

let seeded = "";
async function fingerprint() {
  const notMine = { NOT: { roomCode: { startsWith: RUN } } };
  const counts = await Promise.all([
    prisma.room.count({ where: notMine }),
    prisma.roomAvailabilityWindow.count({ where: { room: notMine } }),
    prisma.roomBooking.count({ where: { room: notMine } }),
    prisma.classSchedule.count({ where: { room: notMine } }),
    prisma.user.count({ where: { NOT: { id: userId } } }),
  ]);
  return JSON.stringify(counts);
}

let eventBefore = 0;

beforeAll(async () => {
  eventBefore = await countBookableRoomsWithCapability("EVENT");
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: "ZZTEST finder", role: "STUDENT" },
  });
  userId = user.id;
  seeded = await fingerprint();

  // Party of 6 on MONDAY SLOT_1. Codes deliberately sort AGAINST the expected order.
  await makeRoom("A-BIG", { capacity: 30 }); // remaining 30
  await makeRoom("Z-TIGHT", { capacity: 10, approved: 3 }); // remaining 7
  await makeRoom("M-12", { capacity: 12, approved: 4 }); // remaining 8, bigger room
  await makeRoom("N-8", { capacity: 8, floor: 3 }); // remaining 8, smaller room
  await makeRoom("B-FULL", { capacity: 8, approved: 5 }); // remaining 3 -> FULL
  await makeRoom("C-CLASS", { capacity: 20, classAt: "SLOT_1" }); // CLASS_IN_SESSION
  await makeRoom("D-SLOT2ONLY", { capacity: 20, windows: ["SLOT_2"] }); // OUTSIDE_WINDOW for SLOT_1+2
  await makeRoom("E-SMALL", { capacity: 4 }); // too small: excluded by the prefilter
  // Capability proof fixtures.
  await makeRoom("EV-OK", { capacity: 10, capabilities: ["EVENT"], floor: 9 });
  await makeRoom("EV-NOWIN", { capacity: 10, capabilities: ["EVENT"], windows: [], floor: 8 });
  await makeRoom("EV-OFF", { capacity: 10, capabilities: ["EVENT"], bookingEnabled: false, floor: 7 });
});

afterAll(async () => {
  const roomIds = Object.values(ids);
  await prisma.roomBookingSlot.deleteMany({ where: { booking: { roomId: { in: roomIds } } } });
  await prisma.roomBooking.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.classSchedule.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { roomCode: { startsWith: RUN } } });
  expect(await fingerprint()).toBe(seeded);
  await prisma.user.deleteMany({ where: { id: userId } });
  expect(await prisma.room.count({ where: { roomCode: { startsWith: RUN } } })).toBe(0);
  await prisma.$disconnect();
});

function request(slots: AcademicSlot[], partySize = 6, requiredCapability?: RoomCapability) {
  const out = validateAvailabilityRequest({ date: MONDAY, slots, partySize, requiredCapability });
  if (!out.ok) throw new Error(out.error);
  return out.request;
}
function filters(input: Record<string, unknown> = {}) {
  const out = validateRoomSearchFilters({ building: RUN, ...input });
  if (!out.ok) throw new Error(out.error);
  return out.filters;
}
const code = (roomCode: string) => roomCode.slice(RUN.length + 1);

describe("ordering on real availability", () => {
  it("tightest fit first: 7 left, 8 (smaller room first), 10, 30; unavailable last", async () => {
    const out = await searchRoomAvailability(request(["SLOT_1"]), filters(), { compare: compareFinderResults });
    expect(out.results.map((r) => `${code(r.room.roomCode)}:${r.status}`)).toEqual([
      "Z-TIGHT:AVAILABLE",
      "N-8:AVAILABLE",
      "M-12:AVAILABLE",
      "EV-OK:AVAILABLE",
      "A-BIG:AVAILABLE",
      "B-FULL:FULL",
      "C-CLASS:CLASS_IN_SESSION",
    ]);
  });

  it("the limit keeps the best-fitting available rooms, never an unavailable one", async () => {
    const out = await searchRoomAvailability(request(["SLOT_1"]), filters({ limit: 2 }), {
      compare: compareFinderResults,
    });
    expect(out.results.map((r) => code(r.room.roomCode))).toEqual(["Z-TIGHT", "N-8"]);
    expect(out.truncated).toBe(true);
  });

  it("without a comparator Feature 3 keeps its roomCode order (unchanged behaviour)", async () => {
    const out = await searchRoomAvailability(request(["SLOT_1"]), filters());
    const codes = out.results.map((r) => r.room.roomCode);
    expect(codes).toEqual([...codes].sort());
  });
});

describe("status counts", () => {
  it("count every evaluated candidate by Feature 3 status, before the limit", async () => {
    const out = await searchRoomAvailability(request(["SLOT_1"]), filters({ limit: 1 }), {
      compare: compareFinderResults,
    });
    // D-SLOT2ONLY has no SLOT_1 window, so the Feature 3 prefilter never makes it a candidate.
    expect(out.statusCounts).toEqual({ AVAILABLE: 5, FULL: 1, CLASS_IN_SESSION: 1 });
    expect(out.candidatesTruncated).toBe(false);
  });

  it("multi-slot: a room without a window for every slot is OUTSIDE_WINDOW", async () => {
    const out = await searchRoomAvailability(request(["SLOT_1", "SLOT_2"]), filters(), {
      compare: compareFinderResults,
    });
    const d = out.results.find((r) => code(r.room.roomCode) === "D-SLOT2ONLY");
    expect(d?.status).toBe("OUTSIDE_WINDOW");
    expect(out.statusCounts.OUTSIDE_WINDOW).toBe(1);
  });
});

describe("runRoomFinderSearch end to end", () => {
  it("returns available rooms in fit order and the rest as unavailable", async () => {
    const state = await runRoomFinderSearch({
      date: MONDAY,
      slots: ["SLOT_1"],
      partySize: 6,
      capability: "WORKSHOP",
      building: RUN,
      floor: null,
    });
    if (state.kind !== "DONE") throw new Error(state.kind);
    expect(state.available.map((r) => code(r.room.roomCode))).toEqual(["Z-TIGHT", "N-8", "M-12", "A-BIG"]);
    expect(state.unavailable.map((r) => code(r.room.roomCode))).toEqual(["B-FULL", "C-CLASS"]);
    expect(state.available[0].remainingCapacity).toBe(7);
    expect(state.availableTruncated).toBe(false);
    expect(state.capabilityHasNoRooms).toBe(false);
  });

  it("floor filter narrows within the building", async () => {
    const state = await runRoomFinderSearch({
      date: MONDAY,
      slots: ["SLOT_1"],
      partySize: 6,
      capability: null,
      building: RUN,
      floor: 3,
    });
    if (state.kind !== "DONE") throw new Error(state.kind);
    expect(state.available.map((r) => code(r.room.roomCode))).toEqual(["N-8"]);
  });

  it("an empty search where rooms of the type exist stays generic", async () => {
    const state = await runRoomFinderSearch({
      date: MONDAY,
      slots: ["SLOT_1"],
      partySize: 500,
      capability: "WORKSHOP",
      building: RUN,
      floor: null,
    });
    if (state.kind !== "DONE") throw new Error(state.kind);
    expect(state.available).toEqual([]);
    expect(state.capabilityHasNoRooms).toBe(false);
  });
});

describe("capability proof and locations", () => {
  it("counts only active, bookable, sized, windowed rooms of the capability", async () => {
    // EV-OK counts; EV-NOWIN (no windows) and EV-OFF (booking disabled) do not.
    expect(await countBookableRoomsWithCapability("EVENT")).toBe(eventBefore + 1);
  });

  it("locations list only bookable rooms' building/floor pairs", async () => {
    const mine = (await listBookableLocations()).filter((location) => location.building === RUN);
    // Floors 1 and 3 (WORKSHOP rooms) and 9 (EV-OK). 8 has no windows, 7 is not bookable.
    expect(mine.map((location) => location.floor)).toEqual([1, 3, 9]);
  });
});
