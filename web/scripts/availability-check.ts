import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  evaluateRoomAvailabilityById,
  searchRoomAvailability,
} from "@/lib/availability-context";
import { validateAvailabilityRequest, validateRoomSearchFilters } from "@/lib/availability";
import { toAcademicDateString } from "@/lib/academic-slots";

// READ-ONLY integration check against the seeded LOCAL database.
// Drives the real data layer + pure evaluator. Writes nothing - verified by
// comparing table row counts before and after.

async function counts() {
  const [bookings, bookingSlots, windows, closures, schedules, settings, rooms] = await Promise.all([
    prisma.roomBooking.count(),
    prisma.roomBookingSlot.count(),
    prisma.roomAvailabilityWindow.count(),
    prisma.roomClosure.count(),
    prisma.classSchedule.count(),
    prisma.systemSetting.count(),
    prisma.room.count(),
  ]);
  return { bookings, bookingSlots, windows, closures, schedules, settings, rooms };
}

function req(input: { date: string; slots: string[]; partySize: number; requiredCapability?: string }) {
  const outcome = validateAvailabilityRequest(input);
  assert.ok(outcome.ok, `invalid request ${JSON.stringify(input)}`);
  return outcome.request;
}

async function roomId(code: string) {
  const room = await prisma.room.findUnique({ where: { roomCode: code }, select: { id: true } });
  assert.ok(room, `missing room ${code}`);
  return room.id;
}

async function main() {
  assert.ok((process.env.DATABASE_URL ?? "").includes("localhost"), "refusing to run against a non-local DB");

  const before = await counts();
  const semester = await prisma.systemSetting.findUnique({ where: { key: "ACTIVE_SEMESTER" } });
  console.log(`ACTIVE_SEMESTER = ${semester?.value ?? "(unset)"}\n`);

  const cases: Array<[string, string, string[], number, string, string]> = [
    // room, date, slots, party, expected status, why
    ["LAB-01", "2026-09-28", ["SLOT_1"], 2, "CLASS_IN_SESSION", "Mon SLOT_1 class DEMO101"],
    ["LAB-01", "2026-09-28", ["SLOT_3"], 5, "AVAILABLE", "approved 10 of 15 -> 5 left"],
    ["LAB-01", "2026-09-28", ["SLOT_3"], 6, "FULL", "approved 10 of 15 -> 6 does not fit"],
    ["LAB-01", "2026-09-29", ["SLOT_3"], 2, "CLOSED", "slot-specific closure"],
    ["LAB-01", "2026-09-29", ["SLOT_2"], 2, "AVAILABLE", "same day, not the closed slot"],
    ["LAB-01", "2026-09-29", ["SLOT_1"], 2, "CLASS_IN_SESSION", "Tue SLOT_1 class DEMO201"],
    ["MEETING-A", "2026-09-28", ["SLOT_1"], 20, "AVAILABLE", "PENDING 6 does not reserve"],
    ["MEETING-A", "2026-09-28", ["SLOT_2"], 2, "CLASS_IN_SESSION", "Mon SLOT_2 class DEMO102"],
    ["MEETING-A", "2026-09-28", ["SLOT_4"], 2, "OUTSIDE_WINDOW", "windows are SLOT_1-3 only"],
    ["MEETING-A", "2026-10-01", ["SLOT_1"], 2, "AVAILABLE", "stale 1/2026 class ignored"],
    ["MEETING-B", "2026-09-28", ["SLOT_2"], 8, "AVAILABLE", "CANCELLED 4 does not consume"],
    ["MEETING-B", "2026-09-28", ["SLOT_1", "SLOT_2"], 8, "AVAILABLE", "multi-slot all pass"],
    ["MEETING-B", "2026-09-29", ["SLOT_1", "SLOT_2"], 2, "CLASS_IN_SESSION", "multi-slot, Tue SLOT_1 class"],
    ["SERVER-01", "2026-09-28", ["SLOT_1"], 2, "BOOKING_DISABLED", "not opted into booking"],
    ["A4-404", "2026-09-28", ["SLOT_1"], 2, "BOOKING_DISABLED", "generated inventory stays closed"],
  ];

  console.log("single-room evaluation:");
  for (const [code, date, slots, partySize, expected, why] of cases) {
    const result = await evaluateRoomAvailabilityById(await roomId(code), req({ date, slots, partySize }));
    assert.ok(result);
    const ok = result.status === expected;
    console.log(
      `  ${ok ? "✓" : "✗"} ${code.padEnd(9)} ${date} ${slots.join("+").padEnd(13)} party=${String(partySize).padStart(2)} ` +
        `-> ${result.status.padEnd(16)} rem=${String(result.remainingCapacity).padStart(2)}  (${why})`
    );
    assert.equal(result.status, expected, `${code} ${date} ${slots}`);
    assert.deepEqual(result.configWarnings, [], "no config warnings expected with seeded data");
  }

  // Detail checks on seeded fixtures.
  const pending = await evaluateRoomAvailabilityById(await roomId("MEETING-A"), req({ date: "2026-09-28", slots: ["SLOT_1"], partySize: 1 }));
  assert.equal(pending!.slots[0].pendingCapacity, 6);
  assert.equal(pending!.slots[0].bookedCapacity, 0);
  assert.equal(pending!.requiresApproval, true, "MEETING-A is MANUAL");

  const multi = await evaluateRoomAvailabilityById(await roomId("LAB-01"), req({ date: "2026-09-28", slots: ["SLOT_2"], partySize: 1 }));
  assert.equal(multi!.slots[0].bookedCapacity, 8, "multi-slot APPROVED booking counts in SLOT_2");
  console.log("\n  ✓ PENDING reported (6) not consumed; MEETING-A requiresApproval=true");
  console.log("  ✓ multi-slot APPROVED booking (8) consumes SLOT_2 on LAB-01");

  // Timezone: instant -> Bangkok calendar date -> seeded closure applies.
  const tzDate = toAcademicDateString(new Date("2026-09-28T17:30:00Z"));
  assert.equal(tzDate, "2026-09-29");
  const tz = await evaluateRoomAvailabilityById(await roomId("LAB-01"), req({ date: tzDate, slots: ["SLOT_3"], partySize: 1 }));
  assert.equal(tz!.status, "CLOSED");
  assert.equal(tz!.slots[0].closure?.id, "demo-closure-lab01-slot3");
  console.log(`  ✓ 2026-09-28T17:30Z -> Bangkok ${tzDate} -> LAB-01 SLOT_3 CLOSED (seeded closure)`);

  // Room Finder.
  const filters = (input: object) => {
    const outcome = validateRoomSearchFilters(input);
    assert.ok(outcome.ok);
    return outcome.filters;
  };
  const monSlot1 = req({ date: "2026-09-28", slots: ["SLOT_1"], partySize: 2 });

  const all = await searchRoomAvailability(monSlot1, filters({}));
  console.log(`\nfinder Mon SLOT_1 party=2: ${all.results.map((r) => `${r.room.roomCode}=${r.status}`).join(", ")}`);
  assert.deepEqual(all.results.map((r) => r.room.roomCode), ["LAB-01", "MEETING-A", "MEETING-B"]);
  assert.ok(!all.results.some((r) => r.room.roomCode === "SERVER-01"), "non-bookable rooms are not candidates");

  // Regression: limit must apply AFTER evaluation. LAB-01 sorts first but is
  // unavailable; the old code took 1 candidate and returned nothing.
  const firstAvailable = await searchRoomAvailability(monSlot1, filters({ onlyAvailable: true, limit: 1 }));
  assert.deepEqual(firstAvailable.results.map((r) => r.room.roomCode), ["MEETING-A"]);
  assert.equal(firstAvailable.truncated, true);
  console.log("  ✓ onlyAvailable+limit=1 -> [MEETING-A], truncated=true (limit applied after evaluation)");

  const labOnly = await searchRoomAvailability(
    req({ date: "2026-09-28", slots: ["SLOT_3"], partySize: 2, requiredCapability: "LAB" }),
    filters({})
  );
  assert.deepEqual(labOnly.results.map((r) => `${r.room.roomCode}=${r.status}`), ["LAB-01=AVAILABLE"]);
  console.log("  ✓ capability=LAB -> [LAB-01] only (SERVER-01 has LAB but is not bookable)");

  const tooBig = await searchRoomAvailability(req({ date: "2026-09-28", slots: ["SLOT_1"], partySize: 16 }), filters({}));
  assert.deepEqual(tooBig.results.map((r) => r.room.roomCode), ["MEETING-A"], "only capacity>=16 remains");
  console.log("  ✓ party=16 -> [MEETING-A] (capacity prefilter)");

  const after = await counts();
  assert.deepEqual(after, before, "integration check must not write");
  console.log(`\nrow counts unchanged: ${JSON.stringify(after)}`);
  console.log("✅ integration check passed (read-only)");
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
