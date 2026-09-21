import type { AcademicSlot } from "@/lib/types";

// Single source of truth for academic slot times.
// No other file may contain a slot start/end time literal.
//
// All slot times are wall-clock times in ACADEMIC_TIME_ZONE, never server-local.
// Callers that need an instant must go through resolveSlotRange().

export const ACADEMIC_TIME_ZONE = "Asia/Bangkok";

// Thailand has observed no daylight saving since 1952, so a fixed offset is exact
// and avoids pulling in a timezone library. Everything else here derives from Intl.
const ACADEMIC_UTC_OFFSET_MINUTES = 7 * 60;

export interface AcademicSlotDefinition {
  slot: AcademicSlot;
  order: number;
  startTime: string; // "HH:MM" 24-hour, Asia/Bangkok wall clock
  endTime: string; // "HH:MM" 24-hour, Asia/Bangkok wall clock
  label: string;
}

export const ACADEMIC_SLOTS: readonly AcademicSlotDefinition[] = [
  { slot: "SLOT_1", order: 1, startTime: "08:40", endTime: "11:00", label: "คาบ 1" },
  { slot: "SLOT_2", order: 2, startTime: "12:00", endTime: "14:20", label: "คาบ 2" },
  { slot: "SLOT_3", order: 3, startTime: "14:30", endTime: "16:50", label: "คาบ 3" },
  { slot: "SLOT_4", order: 4, startTime: "17:00", endTime: "19:20", label: "คาบ 4" },
];

export const ACADEMIC_SLOT_VALUES: readonly AcademicSlot[] = ACADEMIC_SLOTS.map((s) => s.slot);

const slotMap = new Map<AcademicSlot, AcademicSlotDefinition>(
  ACADEMIC_SLOTS.map((definition) => [definition.slot, definition])
);

export function isAcademicSlot(value: string): value is AcademicSlot {
  return slotMap.has(value as AcademicSlot);
}

export function getSlotDefinition(slot: AcademicSlot): AcademicSlotDefinition {
  const definition = slotMap.get(slot);
  if (!definition) {
    throw new Error(`Unknown academic slot: ${slot}`);
  }
  return definition;
}

/** "คาบ 3 · 14:30–16:50" */
export function getSlotLabel(slot: AcademicSlot): string {
  const { label, startTime, endTime } = getSlotDefinition(slot);
  return `${label} · ${startTime}–${endTime}`;
}

/** "คาบ 3" — for compact UI where the time is shown separately. */
export function getSlotShortLabel(slot: AcademicSlot): string {
  return getSlotDefinition(slot).label;
}

export function slotTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

// --- Asia/Bangkok calendar helpers -----------------------------------------

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function bangkokParts(at: Date) {
  const parts = bangkokFormatter.formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The Asia/Bangkok calendar date of an instant, as "YYYY-MM-DD". */
export function toAcademicDateString(at: Date): string {
  const { year, month, day } = bangkokParts(at);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 0=Sunday … 6=Saturday, in Asia/Bangkok — matches ClassSchedule.dayOfWeek. */
export function getAcademicDayOfWeek(at: Date): number {
  const { year, month, day } = bangkokParts(at);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseAcademicDate(day: string | Date): { year: number; month: number; dayOfMonth: number } {
  const text = typeof day === "string" ? day.trim() : toAcademicDateString(day);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Expected an Asia/Bangkok calendar date as "YYYY-MM-DD", got: ${text}`);
  }

  return { year: Number(match[1]), month: Number(match[2]), dayOfMonth: Number(match[3]) };
}

/**
 * Resolve a slot into concrete instants on a given Asia/Bangkok calendar day.
 * Bookings snapshot these so a later edit to ACADEMIC_SLOTS cannot rewrite history.
 *
 * `day` is a Bangkok calendar date — pass "YYYY-MM-DD", or a Date whose Bangkok
 * calendar date is the one you mean.
 */
export function resolveSlotRange(
  day: string | Date,
  slot: AcademicSlot
): { startAt: Date; endAt: Date } {
  const { year, month, dayOfMonth } = parseAcademicDate(day);
  const { startTime, endTime } = getSlotDefinition(slot);

  const toInstant = (time: string) =>
    new Date(
      Date.UTC(year, month - 1, dayOfMonth, 0, slotTimeToMinutes(time) - ACADEMIC_UTC_OFFSET_MINUTES)
    );

  return { startAt: toInstant(startTime), endAt: toInstant(endTime) };
}

/**
 * Normalize a "HH:MM" time range onto the standard slot grid.
 * Used by schedule import and BU Mobile OCR. Returns null when it does not align.
 */
export function slotForTimeRange(startTime: string, endTime: string): AcademicSlot | null {
  const start = startTime.trim().replace(".", ":");
  const end = endTime.trim().replace(".", ":");

  const match = ACADEMIC_SLOTS.find(
    (definition) => definition.startTime === start && definition.endTime === end
  );

  return match?.slot ?? null;
}

/** Which slot an instant falls inside, in Asia/Bangkok. Used by "Available Now". */
export function slotForInstant(at: Date): AcademicSlot | null {
  const { hour, minute } = bangkokParts(at);
  const minutes = hour * 60 + minute;

  const match = ACADEMIC_SLOTS.find(
    (definition) =>
      minutes >= slotTimeToMinutes(definition.startTime) &&
      minutes < slotTimeToMinutes(definition.endTime)
  );

  return match?.slot ?? null;
}
