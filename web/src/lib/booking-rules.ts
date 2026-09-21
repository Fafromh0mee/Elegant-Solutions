import { addAcademicDays, isValidAcademicDate } from "@/lib/academic-slots";

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
