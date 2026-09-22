import { addAcademicDays, isValidAcademicDate, resolveSlotRange } from "@/lib/academic-slots";
import type { AcademicSlot } from "@/lib/types";

// Booking policy shared by Room Finder (Feature 5) and booking creation (Feature 7).
// Pure: callers pass "today" as an Asia/Bangkok calendar date.

/** Rooms can be searched/booked from today through today + this many days, inclusive. */
export const ROOM_BOOKING_HORIZON_DAYS = 30;

/** The last bookable Asia/Bangkok calendar date for a given today. */
export function getBookingHorizonEnd(today: string): string {
  return addAcademicDays(today, ROOM_BOOKING_HORIZON_DAYS);
}

/** today <= date <= today + ROOM_BOOKING_HORIZON_DAYS, all "YYYY-MM-DD" in Asia/Bangkok. */
export function isWithinBookingHorizon(date: string, today: string): boolean {
  const strict = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidAcademicDate(value);
  if (!strict(date) || !strict(today)) return false;
  // Zero-padded ISO dates compare correctly as strings.
  return date >= today && date <= getBookingHorizonEnd(today);
}

/**
 * A slot already in progress can still be booked while at least this many minutes
 * remain (Feature 7, policy C). This is a time rule ONLY: the room must still be
 * AVAILABLE for that slot under Feature 3 (no class in session, window, closure,
 * capacity) - that check is separate and always runs.
 */
export const BOOKING_MIN_MINUTES_BEFORE_SLOT_END = 15;

/** Not started yet, or running with at least BOOKING_MIN_MINUTES_BEFORE_SLOT_END left. */
export function isSlotStillBookable(date: string, slot: AcademicSlot, now: Date): boolean {
  const { endAt } = resolveSlotRange(date, slot);
  return endAt.getTime() - now.getTime() >= BOOKING_MIN_MINUTES_BEFORE_SLOT_END * 60_000;
}
