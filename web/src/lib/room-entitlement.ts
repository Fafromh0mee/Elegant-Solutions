import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAcademicDayOfWeek, resolveSlotRange, toAcademicDateString } from "@/lib/academic-slots";
import { getActiveSemester } from "@/lib/system";
import type { AcademicSlot } from "@/lib/types";

// Whether a user may enter a room right now, and why. Server-only, read-only: never
// creates Sessions, never reads client input - callers pass an authoritative userId
// (e.g. from a face match) and roomId. Sources, all evaluated in Asia/Bangkok:
//   CLASS         a ClassSchedule for this user+room today (active semester), from
//                 CLASS_EARLY_ACCESS_MINUTES before class start until class end
//   BOOKING       the user is a RoomBookingParticipant of an APPROVED booking for this
//                 room and `now` is inside [first slot start, last slot end). The
//                 participant snapshot is the only source of who a booking covers -
//                 GroupMember is never read here, so a Group never authorizes anyone.
//   LEGACY_TOKEN  transition compatibility: an AccessToken issued to THIS user for this
//                 room and currently valid. Group tokens are NOT expanded to members.

export type EntitlementSource = "CLASS" | "BOOKING" | "LEGACY_TOKEN";

export interface EntitlementGrant {
  source: EntitlementSource;
  /** ClassSchedule / RoomBooking / AccessToken id. */
  id: string;
  validUntil: Date;
}

export type RoomEntitlement =
  | {
      allowed: true;
      /** Every source currently in force (overlapping sources still allow once). */
      grants: EntitlementGrant[];
      /** Latest end across grants: when access naturally expires. */
      validUntil: Date;
    }
  | { allowed: false };

/** Plan §9: scheduled access begins 30 minutes before class and ends at class end. */
export const CLASS_EARLY_ACCESS_MINUTES = 30;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A Bangkok wall-clock time on a Bangkok date, as an instant (Thailand has no DST). */
function bangkokInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

/** [class start - early access, class end) on `date`; canonical slot times when the row has a slot. null = unusable row. */
export function classAccessWindow(
  date: string,
  row: { slot: AcademicSlot | null; startTime: string; endTime: string }
): { startAt: Date; endAt: Date } | null {
  let startAt: Date;
  let endAt: Date;
  if (row.slot) {
    ({ startAt, endAt } = resolveSlotRange(date, row.slot));
  } else {
    // Legacy off-grid rows keep only startTime/endTime (Bangkok wall clock).
    if (!HHMM.test(row.startTime) || !HHMM.test(row.endTime)) return null;
    startAt = bangkokInstant(date, row.startTime);
    endAt = bangkokInstant(date, row.endTime);
    if (endAt.getTime() <= startAt.getTime()) return null;
  }
  return { startAt: new Date(startAt.getTime() - CLASS_EARLY_ACCESS_MINUTES * 60_000), endAt };
}

export async function resolveRoomEntitlement(params: {
  userId: string;
  roomId: string;
  now: Date;
  db?: Prisma.TransactionClient;
}): Promise<RoomEntitlement> {
  const { userId, roomId, now, db = prisma } = params;
  const today = toAcademicDateString(now);
  const activeSemester = await getActiveSemester(db);

  const [classes, bookings, tokens] = await Promise.all([
    db.classSchedule.findMany({
      where: {
        userId,
        roomId,
        dayOfWeek: getAcademicDayOfWeek(now),
        // Granting is the risky direction: with an active semester set, only its rows count.
        ...(activeSemester ? { semester: activeSemester } : {}),
      },
      select: { id: true, slot: true, startTime: true, endTime: true },
    }),
    db.roomBooking.findMany({
      where: {
        roomId,
        status: "APPROVED",
        participants: { some: { userId } },
        // min(startAt) <= now < max(endAt)
        AND: [{ slots: { some: { startAt: { lte: now } } } }, { slots: { some: { endAt: { gt: now } } } }],
      },
      select: { id: true, slots: { select: { endAt: true } } },
    }),
    db.accessToken.findMany({
      where: { userId, roomId, validFrom: { lte: now }, validTo: { gte: now } },
      select: { id: true, validTo: true },
    }),
  ]);

  const grants: EntitlementGrant[] = [];
  for (const row of classes) {
    const window = classAccessWindow(today, { ...row, slot: (row.slot as AcademicSlot | null) ?? null });
    if (window && window.startAt.getTime() <= now.getTime() && now.getTime() < window.endAt.getTime()) {
      grants.push({ source: "CLASS", id: row.id, validUntil: window.endAt });
    }
  }
  for (const booking of bookings) {
    const end = Math.max(...booking.slots.map((slot) => slot.endAt.getTime()));
    grants.push({ source: "BOOKING", id: booking.id, validUntil: new Date(end) });
  }
  for (const token of tokens) {
    grants.push({ source: "LEGACY_TOKEN", id: token.id, validUntil: token.validTo });
  }

  if (grants.length === 0) return { allowed: false };
  return {
    allowed: true,
    grants,
    validUntil: new Date(Math.max(...grants.map((grant) => grant.validUntil.getTime()))),
  };
}
