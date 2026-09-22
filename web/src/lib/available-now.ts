import { ACADEMIC_SLOTS, resolveSlotRange, toAcademicDateString } from "@/lib/academic-slots";
import type { AcademicSlot } from "@/lib/types";

// Available Now - PURE. Works out which AcademicSlot "now" is in (Asia/Bangkok), so the
// dashboard finder can open on today + the current slot. Availability itself always
// comes from the Feature 3 engine for that slot, through the normal finder search.
//
// Meaning: rooms that pass the current slot's availability rules right now.
// NOT a live head-count (Sessions are deliberately not used) and NOT a promise that
// a booking can still be created mid-slot - that policy belongs to Feature 7.

export type AvailableNowContext =
  | { kind: "IN_SLOT"; today: string; slot: AcademicSlot; startsAt: string; endsAt: string; minutesLeft: number }
  | { kind: "BETWEEN"; today: string; nextSlot: AcademicSlot; nextStartsAt: string }
  | { kind: "DAY_OVER"; today: string };

/**
 * Where `now` falls in today's Bangkok slot grid. Slots are [start, end): at the
 * exact end instant the slot is over. Instants come only from resolveSlotRange.
 */
export function getAvailableNowContext(now: Date): AvailableNowContext {
  const today = toAcademicDateString(now);
  const at = now.getTime();

  for (const definition of ACADEMIC_SLOTS) {
    const { startAt, endAt } = resolveSlotRange(today, definition.slot);
    if (at < startAt.getTime()) {
      return { kind: "BETWEEN", today, nextSlot: definition.slot, nextStartsAt: startAt.toISOString() };
    }
    if (at < endAt.getTime()) {
      return {
        kind: "IN_SLOT",
        today,
        slot: definition.slot,
        startsAt: startAt.toISOString(),
        endsAt: endAt.toISOString(),
        minutesLeft: Math.ceil((endAt.getTime() - at) / 60_000),
      };
    }
  }

  return { kind: "DAY_OVER", today };
}
