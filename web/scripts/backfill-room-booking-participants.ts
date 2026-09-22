import "dotenv/config";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Feature 7.5 one-off backfill: every existing RoomBooking gets exactly one SELF
// participant row (its own creator). Additive only - never touches partySize, never
// fabricates additional identities for legacy bookings whose partySize > 1 (see
// plan §3: that mismatch is a known historical fact, surfaced at read time, not
// silently rewritten).
//
// Idempotent: bookings that already have a participant row (a prior run, or a
// booking created after this migration by the new participant-aware code) are
// skipped. Safe to re-run.
//
// Usage: npx tsx scripts/backfill-room-booking-participants.ts
// Refuses to run against a non-local database, matching every other *.db.test.ts
// / scripts/*.ts safety check in this repo.

export interface BackfillResult {
  totalBookings: number;
  alreadyBackfilledBefore: number;
  created: number;
  flaggedLegacyPartySize: Array<{ id: string; partySize: number }>;
}

/** The backfill itself, reusable so it can also be exercised by room-booking.db.test.ts. */
export async function backfillRoomBookingParticipants(db: Prisma.TransactionClient | typeof prisma = prisma): Promise<BackfillResult> {
  const totalBookings = await db.roomBooking.count();
  const alreadyBackfilledBefore = await db.roomBookingParticipant.count();

  const missing = await db.roomBooking.findMany({
    where: { participants: { none: {} } },
    select: { id: true, userId: true, partySize: true },
  });
  const flaggedLegacyPartySize = missing.filter((b) => b.partySize > 1).map((b) => ({ id: b.id, partySize: b.partySize }));

  let created = 0;
  if (missing.length > 0) {
    const result = await db.roomBookingParticipant.createMany({
      data: missing.map((b) => ({ bookingId: b.id, userId: b.userId, source: "SELF" as const })),
    });
    created = result.count;
  }

  const stillMissing = await db.roomBooking.count({ where: { participants: { none: {} } } });
  if (stillMissing !== 0) {
    throw new Error(`Backfill verification failed: ${stillMissing} booking(s) still have no participant row`);
  }

  return { totalBookings, alreadyBackfilledBefore, created, flaggedLegacyPartySize };
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
    throw new Error("backfill-room-booking-participants refuses to run against a non-local database");
  }

  const result = await backfillRoomBookingParticipants(prisma);
  console.log(`RoomBooking rows: ${result.totalBookings}`);
  console.log(`RoomBookingParticipant rows before: ${result.alreadyBackfilledBefore}`);
  if (result.flaggedLegacyPartySize.length > 0) {
    console.log(
      `${result.flaggedLegacyPartySize.length} booking(s) have partySize > 1 but only the creator's identity is on ` +
        `record; backfill creates ONE SELF participant each, partySize is left untouched:`
    );
    for (const b of result.flaggedLegacyPartySize) console.log(`  - ${b.id}: partySize=${b.partySize}`);
  }
  console.log(`Created ${result.created} participant row(s).`);

  const distinctBookingsWithParticipants = await prisma.roomBookingParticipant.groupBy({ by: ["bookingId"] });
  console.log(`Distinct bookings with >=1 participant row: ${distinctBookingsWithParticipants.length}`);
  console.log(`RoomBookingParticipant rows after: ${await prisma.roomBookingParticipant.count()}`);
  if (distinctBookingsWithParticipants.length !== result.totalBookings) {
    throw new Error(
      `Backfill verification failed: ${distinctBookingsWithParticipants.length} of ${result.totalBookings} bookings have a participant row`
    );
  }

  console.log("✅ Backfill verified: every RoomBooking has at least one RoomBookingParticipant row.");
}

// Only run main() as a CLI script, not when imported by tests (ESM-safe check).
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
