import {
  ACADEMIC_SLOT_VALUES,
  getSlotDefinition,
  getSlotLabel,
  getSlotShortLabel,
  hasSlotEnded,
  isAcademicSlot,
  isContiguousSlotSelection,
  isValidAcademicDate,
} from "@/lib/academic-slots";
import { isWithinBookingHorizon } from "@/lib/booking-rules";
import { ROOM_CAPACITY_MAX } from "@/lib/room-config";
import type { AvailabilityStatus, RoomAvailabilityResult } from "@/lib/availability";
import { ROOM_CAPABILITY_VALUES } from "@/lib/types";
import type { AcademicSlot, RoomCapability } from "@/lib/types";
import {
  getApprovalPolicyLabel,
  getAvailabilityStatusLabel,
  getRoomCapabilityLabel,
} from "@/lib/ui-terms";

// Student Room Finder - PURE. URL state, input validation, slot-range picking,
// result ordering and card view data. Availability itself is never decided here:
// every status comes from the Feature 3 engine unchanged.

export const ROOM_FINDER_PATH = "/rooms";
/** Rooms returned per search (available rooms first). */
export const ROOM_FINDER_RESULT_LIMIT = 50;

export interface RoomFinderQuery {
  date: string; // "YYYY-MM-DD", Asia/Bangkok
  slots: AcademicSlot[]; // contiguous, in slot order
  partySize: number;
  capability: RoomCapability | null; // null = ทุกประเภท
  building: string | null;
  floor: number | null;
}

export type RoomFinderError =
  | "INVALID_PARTY_SIZE"
  | "INVALID_DATE"
  | "DATE_OUT_OF_RANGE"
  | "NO_SLOTS"
  | "INVALID_SLOT"
  | "SLOTS_NOT_CONTIGUOUS"
  | "SLOT_ENDED"
  | "INVALID_CAPABILITY"
  | "INVALID_BUILDING"
  | "INVALID_FLOOR";

export type RoomFinderOutcome = { ok: true; query: RoomFinderQuery } | { ok: false; error: RoomFinderError };

export interface RoomFinderClock {
  today: string; // Asia/Bangkok calendar date
  now: Date;
}

export interface RoomFinderInput {
  date?: unknown;
  slots?: unknown;
  partySize?: unknown;
  capability?: unknown;
  building?: unknown;
  floor?: unknown;
}

function parsePartySize(value: unknown): number | null {
  const number =
    typeof value === "number" ? value : typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 1 && number <= ROOM_CAPACITY_MAX ? number : null;
}

function parseFloor(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const number =
    typeof value === "number" ? value : typeof value === "string" && /^-?\d{1,3}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) && number >= -10 && number <= 200 ? number : undefined;
}

function sortSlots(slots: AcademicSlot[]): AcademicSlot[] {
  return [...slots].sort((a, b) => getSlotDefinition(a).order - getSlotDefinition(b).order);
}

/**
 * Validates a finder request. Rejects rather than repairs, like the Feature 3
 * validator it feeds: a gap between slots is an error, never silently filled.
 */
export function validateRoomFinderQuery(input: RoomFinderInput, clock: RoomFinderClock): RoomFinderOutcome {
  const partySize = parsePartySize(input.partySize);
  if (partySize === null) return { ok: false, error: "INVALID_PARTY_SIZE" };

  if (
    typeof input.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !isValidAcademicDate(input.date)
  ) {
    return { ok: false, error: "INVALID_DATE" };
  }
  const date = input.date;
  if (!isWithinBookingHorizon(date, clock.today)) return { ok: false, error: "DATE_OUT_OF_RANGE" };

  if (!Array.isArray(input.slots) || input.slots.length === 0) return { ok: false, error: "NO_SLOTS" };
  if (!input.slots.every((slot) => typeof slot === "string" && isAcademicSlot(slot))) {
    return { ok: false, error: "INVALID_SLOT" };
  }
  if (!isContiguousSlotSelection(input.slots as string[])) return { ok: false, error: "SLOTS_NOT_CONTIGUOUS" };
  const slots = sortSlots(input.slots as AcademicSlot[]);
  if (date === clock.today && slots.some((slot) => hasSlotEnded(date, slot, clock.now))) {
    return { ok: false, error: "SLOT_ENDED" };
  }

  let capability: RoomCapability | null = null;
  if (input.capability !== undefined && input.capability !== null && input.capability !== "") {
    if (typeof input.capability !== "string" || !ROOM_CAPABILITY_VALUES.includes(input.capability as RoomCapability)) {
      return { ok: false, error: "INVALID_CAPABILITY" };
    }
    capability = input.capability as RoomCapability;
  }

  let building: string | null = null;
  if (input.building !== undefined && input.building !== null && input.building !== "") {
    if (typeof input.building !== "string" || input.building !== input.building.trim() || input.building.length > 20) {
      return { ok: false, error: "INVALID_BUILDING" };
    }
    building = input.building;
  }

  const floor = parseFloor(input.floor);
  // A floor only means something inside a building; the form never sends one alone.
  if (floor === undefined || (floor !== null && building === null)) return { ok: false, error: "INVALID_FLOOR" };

  return { ok: true, query: { date, slots, partySize, capability, building, floor } };
}

// --- Shared page/panel state (plain data, safe to send to the browser) --------

/** What a finder search produced. Built by room-finder-search, rendered by RoomFinderResults. */
export type RoomFinderSearchState =
  | { kind: "INVALID"; error: RoomFinderError }
  | { kind: "FAILED" }
  | { kind: "NOT_ALLOWED" }
  | {
      kind: "DONE";
      query: RoomFinderQuery;
      available: RoomAvailabilityResult[];
      unavailable: RoomAvailabilityResult[];
      statusCounts: Partial<Record<AvailabilityStatus, number>>;
      /** More available rooms exist than are shown. */
      availableTruncated: boolean;
      /** Proven: no active, bookable, configured room of the requested capability exists at all. */
      capabilityHasNoRooms: boolean;
    };

/** Everything the finder form needs before the first search. Server clock, Asia/Bangkok. */
export interface RoomFinderSetup {
  today: string;
  maxDate: string;
  now: string; // ISO instant, for disabling slots that have ended
  locations: Array<{ building: string; floor: number | null }>;
}

/** A fresh form: today, no slot chosen, optional filters empty. */
export function emptyRoomFinderForm(today: string, partySize = "1"): RoomFinderFormValues {
  return { date: today, slots: [], partySize, capability: "", building: "", floor: "" };
}

// --- URL state --------------------------------------------------------------

type SearchParamValue = string | string[] | undefined;

/** What the form shows. Strings, so partially typed or invalid values survive a round trip. */
export interface RoomFinderFormValues {
  date: string;
  slots: AcademicSlot[];
  partySize: string;
  capability: string;
  building: string;
  floor: string;
}

export interface ParsedRoomFinderUrl {
  form: RoomFinderFormValues;
  /** A search was requested (the form always sends `slots`). The dashboard card sends only partySize. */
  submitted: boolean;
  outcome: RoomFinderOutcome | null;
}

export function parseRoomFinderSearchParams(
  params: Record<string, SearchParamValue>,
  clock: RoomFinderClock
): ParsedRoomFinderUrl {
  const read = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const rawSlots = read("slots");
  const slotList = rawSlots === undefined || rawSlots === "" ? [] : rawSlots.split(",");
  const form: RoomFinderFormValues = {
    date: read("date") ?? clock.today,
    // Only recognisable slots can be shown as selected; validation still sees the raw list.
    slots: sortSlots([...new Set(slotList.filter(isAcademicSlot))]),
    partySize: read("partySize") ?? "1",
    capability: read("capability") ?? "",
    building: read("building") ?? "",
    floor: read("floor") ?? "",
  };

  const submitted = rawSlots !== undefined;
  const outcome = submitted
    ? validateRoomFinderQuery(
        {
          date: form.date,
          slots: slotList,
          partySize: form.partySize,
          capability: form.capability,
          building: form.building,
          floor: form.floor,
        },
        clock
      )
    : null;

  return { form, submitted, outcome };
}

function queryParams(query: RoomFinderQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("date", query.date);
  params.set("slots", query.slots.join(","));
  params.set("partySize", String(query.partySize));
  if (query.capability) params.set("capability", query.capability);
  if (query.building) params.set("building", query.building);
  if (query.floor !== null) params.set("floor", String(query.floor));
  return params;
}

export function roomFinderHref(query: RoomFinderQuery): string {
  return `${ROOM_FINDER_PATH}?${queryParams(query)}`;
}

// --- Slot range picking -----------------------------------------------------

/**
 * Next selection after tapping a slot:
 *  - nothing selected, or a tap inside the current range -> just that slot
 *  - tapping the only selected slot -> cleared
 *  - otherwise -> the whole run from the current range to the tapped slot (gaps filled)
 * The result is always contiguous.
 */
export function selectSlotRange(current: readonly AcademicSlot[], tapped: AcademicSlot): AcademicSlot[] {
  if (current.length === 1 && current[0] === tapped) return [];
  if (current.length === 0 || current.includes(tapped)) return [tapped];

  const orders = [...current, tapped].map((slot) => getSlotDefinition(slot).order);
  const low = Math.min(...orders);
  const high = Math.max(...orders);
  return ACADEMIC_SLOT_VALUES.filter((slot) => {
    const order = getSlotDefinition(slot).order;
    return order >= low && order <= high;
  });
}

/** "คาบ 3 · 14:30–16:50" or, for a run, "คาบ 2–3 · 12:00–16:50". Times come from academic-slots. */
export function getSlotRangeLabel(slots: readonly AcademicSlot[]): string {
  if (slots.length === 0) return "";
  const ordered = sortSlots([...slots]);
  if (ordered.length === 1) return getSlotLabel(ordered[0]);
  const first = getSlotDefinition(ordered[0]);
  const last = getSlotDefinition(ordered[ordered.length - 1]);
  return `${first.label}–${last.order} · ${first.startTime}–${last.endTime}`;
}

// --- Ordering ---------------------------------------------------------------

/**
 * Available rooms first, then the tightest fit: smallest remaining capacity
 * that still fits, then the smaller room, then roomCode. Unavailable rooms
 * follow in roomCode order. Deterministic - no scoring.
 */
export function compareFinderResults(a: RoomAvailabilityResult, b: RoomAvailabilityResult): number {
  if (a.available !== b.available) return a.available ? -1 : 1;
  if (a.available) {
    if (a.remainingCapacity !== b.remainingCapacity) return a.remainingCapacity - b.remainingCapacity;
    if (a.room.capacity !== b.room.capacity) return a.room.capacity - b.room.capacity;
  }
  return a.room.roomCode < b.room.roomCode ? -1 : a.room.roomCode > b.room.roomCode ? 1 : 0;
}

// --- Result view data -------------------------------------------------------

export interface FinderCard {
  roomId: string;
  roomCode: string;
  name: string;
  capabilityLabels: string[];
  locationLabel: string | null;
  capacityLabel: string;
  remainingLabel: string | null;
  available: boolean;
  statusLabel: string;
  approvalLabel: string;
  requiresApproval: boolean;
  /** Per-slot reasons for a multi-slot request that is not available. */
  slotIssues: string[];
}

export function getLocationLabel(building: string | null, floor: number | null): string | null {
  if (building && floor !== null) return `อาคาร ${building} · ชั้น ${floor}`;
  if (building) return `อาคาร ${building}`;
  if (floor !== null) return `ชั้น ${floor}`;
  return null;
}

export function toFinderCard(result: RoomAvailabilityResult): FinderCard {
  const multiSlot = result.requestedSlots.length > 1;
  // Remaining seats only mean something once a slot was actually evaluated for capacity.
  const showRemaining = result.available || result.status === "FULL";

  return {
    roomId: result.room.id,
    roomCode: result.room.roomCode,
    name: result.room.name,
    capabilityLabels: result.room.capabilities.map(getRoomCapabilityLabel),
    locationLabel: getLocationLabel(result.room.building, result.room.floor),
    capacityLabel: `รองรับ ${result.room.capacity} คน`,
    remainingLabel: showRemaining
      ? `เหลือ ${result.remainingCapacity} ที่${multiSlot ? " ตลอดช่วงที่เลือก" : ""}`
      : null,
    available: result.available,
    statusLabel: getAvailabilityStatusLabel(result.status),
    approvalLabel: getApprovalPolicyLabel(result.room.approvalPolicy),
    requiresApproval: result.requiresApproval,
    slotIssues:
      multiSlot && !result.available
        ? result.slots
            .filter((slot) => !slot.available)
            .map((slot) => `${getSlotShortLabel(slot.slot)}: ${getAvailabilityStatusLabel(slot.status)}`)
        : [],
  };
}

const UNAVAILABLE_ORDER: readonly AvailabilityStatus[] = [
  "CLASS_IN_SESSION",
  "FULL",
  "CLOSED",
  "OUTSIDE_WINDOW",
  "CAPABILITY_MISMATCH",
  "NOT_CONFIGURED_CAPACITY",
  "NOT_CONFIGURED_CAPABILITIES",
  "BOOKING_DISABLED",
  "ROOM_INACTIVE",
];

/** Why the other rooms were not available, from Feature 3 status counts. */
export function summarizeUnavailable(
  statusCounts: Partial<Record<AvailabilityStatus, number>>
): Array<{ status: AvailabilityStatus; label: string; count: number }> {
  return UNAVAILABLE_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0).map((status) => ({
    status,
    label: getAvailabilityStatusLabel(status),
    count: statusCounts[status] as number,
  }));
}

// --- Feature 7 hand-off -----------------------------------------------------

/** What "จองห้อง" will carry into booking (Feature 7). Untrusted: Feature 7 re-validates and re-evaluates. */
export interface RoomBookingHandoff {
  roomId: string;
  date: string;
  slots: AcademicSlot[];
  partySize: number;
  requiredCapability?: RoomCapability;
}

export function toBookingHandoff(roomId: string, query: RoomFinderQuery): RoomBookingHandoff {
  return {
    roomId,
    date: query.date,
    slots: query.slots,
    partySize: query.partySize,
    ...(query.capability ? { requiredCapability: query.capability } : {}),
  };
}

export function buildBookingHandoffHref(handoff: RoomBookingHandoff): string {
  const params = new URLSearchParams();
  params.set("date", handoff.date);
  params.set("slots", handoff.slots.join(","));
  params.set("partySize", String(handoff.partySize));
  if (handoff.requiredCapability) params.set("capability", handoff.requiredCapability);
  return `${ROOM_FINDER_PATH}/${encodeURIComponent(handoff.roomId)}/book?${params}`;
}

export function parseBookingHandoff(
  roomId: string,
  params: Record<string, SearchParamValue>,
  clock: RoomFinderClock
): { ok: true; handoff: RoomBookingHandoff } | { ok: false; error: RoomFinderError | "INVALID_ROOM" } {
  if (typeof roomId !== "string" || roomId.length === 0 || roomId.length > 64) return { ok: false, error: "INVALID_ROOM" };
  const read = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const outcome = validateRoomFinderQuery(
    {
      date: read("date"),
      slots: read("slots")?.split(",") ?? [],
      partySize: read("partySize"),
      capability: read("capability"),
    },
    clock
  );
  if (!outcome.ok) return outcome;
  return { ok: true, handoff: toBookingHandoff(roomId, outcome.query) };
}
