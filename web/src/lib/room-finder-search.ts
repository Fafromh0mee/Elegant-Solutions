import { toAcademicDateString } from "@/lib/academic-slots";
import { validateAvailabilityRequest, validateRoomSearchFilters } from "@/lib/availability";
import {
  countBookableRoomsWithCapability,
  listBookableLocations,
  searchRoomAvailability,
  searchRoomDayAvailability,
} from "@/lib/availability-context";
import { getBookingHorizonEnd } from "@/lib/booking-rules";
import { getAvailableNowContext, type AvailableNowContext } from "@/lib/available-now";
import { canBookRoom, getRoomAudience, type RoomAudience } from "@/lib/permissions";
import {
  bookingClosedSlotsOn,
  compareDayResults,
  compareFinderResults,
  emptyRoomFinderForm,
  openSlotsOn,
  ROOM_FINDER_SHORTLIST,
  parseRoomFinderSearchParams,
  ROOM_FINDER_RESULT_LIMIT,
  validateRoomFinderQuery,
  type RoomFinderFormValues,
  type RoomFinderInput,
  type RoomFinderQuery,
  type RoomFinderSearchState,
  type RoomFinderSetup,
} from "@/lib/room-finder";
import type { AccountStatus, Role } from "@/lib/types";

// Server-side Room Finder. Server-only, deliberately NOT "use server": the /rooms
// page calls it directly and actions/room-finder.ts wraps it for the dashboard.
// Every availability decision comes from the Feature 3 engine.

export type { RoomFinderSearchState, RoomFinderSetup } from "@/lib/room-finder";

export type RoomFinderPageState =
  | { kind: "UNAUTHENTICATED" }
  | { kind: "NOT_ALLOWED" }
  | ({ kind: "READY"; form: RoomFinderFormValues; search: RoomFinderSearchState | null } & RoomFinderSetup);

/**
 * The one path from a finder query into the Feature 3 search, shared by Room Finder
 * and Available Now. The finder validator is stricter than Feature 3's, so these
 * always pass; running them keeps Feature 3 the gatekeeper of what reaches the engine.
 */
async function searchWithEngine(
  query: RoomFinderQuery,
  options: { onlyAvailable: boolean; limit: number },
  audience: RoomAudience
) {
  const request = validateAvailabilityRequest({
    date: query.date,
    slots: query.slots,
    partySize: query.partySize,
    requiredCapability: query.capability ?? undefined,
  });
  const filters = validateRoomSearchFilters({
    building: query.building ?? undefined,
    floor: query.floor ?? undefined,
    ...options,
  });
  if (!request.ok || !filters.ok) return null;
  return searchRoomAvailability(request.request, filters.filters, { compare: compareFinderResults, audience });
}

async function capabilityProvenEmpty(query: RoomFinderQuery, foundAny: boolean, audience: RoomAudience): Promise<boolean> {
  return !foundAny && query.capability !== null
    ? (await countBookableRoomsWithCapability(query.capability, audience)) === 0
    : false;
}

/**
 * No slot chosen: every open slot of the date evaluated separately from one context
 * load (Feature 3 searchRoomDayAvailability). Never a single all-slots request.
 */
async function runDaySearch(
  query: RoomFinderQuery,
  limit: number,
  now: Date,
  audience: RoomAudience
): Promise<RoomFinderSearchState> {
  const consideredSlots = openSlotsOn(query.date, { today: toAcademicDateString(now), now });
  const request = validateAvailabilityRequest({
    date: query.date,
    slots: consideredSlots,
    partySize: query.partySize,
    requiredCapability: query.capability ?? undefined,
  });
  const filters = validateRoomSearchFilters({
    building: query.building ?? undefined,
    floor: query.floor ?? undefined,
    limit,
  });
  if (!request.ok || !filters.ok) return { kind: "FAILED" };

  const outcome = await searchRoomDayAvailability(request.request, filters.filters, compareDayResults, audience);
  const available = outcome.results.filter((result) => result.available);
  return {
    kind: "DAY",
    query,
    consideredSlots,
    available,
    unavailable: outcome.results.filter((result) => !result.available),
    totalAvailable: outcome.totalAvailable,
    totalUnavailable: outcome.totalUnavailable,
    limit,
    availableTruncated: outcome.candidatesTruncated || outcome.totalAvailable > available.length,
    capabilityHasNoRooms: await capabilityProvenEmpty(query, available.length > 0, audience),
    bookingClosedSlots: bookingClosedSlotsOn(query.date, consideredSlots, now),
  };
}

/**
 * `audience` decides which rooms are candidates at all: "GUEST" narrows the SQL
 * prefilter to guest-eligible rooms, so nothing else is ever loaded or returned.
 */
export async function runRoomFinderSearch(
  query: RoomFinderQuery,
  limit = ROOM_FINDER_RESULT_LIMIT,
  now = new Date(),
  audience: RoomAudience = "ALL"
): Promise<RoomFinderSearchState> {
  if (query.slots.length === 0) return runDaySearch(query, limit, now, audience);

  // Unavailable rooms are kept so reasons can be shown; available ones sort first,
  // so the limit never cuts an available room in favour of an unavailable one.
  // "แสดงเพิ่ม" asks again with a larger limit: Feature 3 has no offset, and each
  // search is bounded by its candidate cap and ROOM_FINDER_MAX_RESULTS.
  const outcome = await searchWithEngine(query, { onlyAvailable: false, limit }, audience);
  if (!outcome) return { kind: "FAILED" };
  const available = outcome.results.filter((result) => result.available);
  const unavailable = outcome.results.filter((result) => !result.available);

  const capabilityHasNoRooms = await capabilityProvenEmpty(query, available.length > 0, audience);

  return {
    kind: "DONE",
    query,
    available,
    unavailable,
    statusCounts: outcome.statusCounts,
    totalAvailable: outcome.statusCounts.AVAILABLE ?? 0,
    limit,
    availableTruncated: outcome.candidatesTruncated || (outcome.statusCounts.AVAILABLE ?? 0) > available.length,
    capabilityHasNoRooms,
    bookingClosedSlots: bookingClosedSlotsOn(query.date, query.slots, now),
  };
}

async function runSafely(
  query: RoomFinderQuery,
  now: Date,
  limit: number | undefined,
  audience: RoomAudience
): Promise<RoomFinderSearchState> {
  try {
    return await runRoomFinderSearch(query, limit, now, audience);
  } catch (error) {
    console.error("Room finder search failed:", error);
    return { kind: "FAILED" };
  }
}

/** Validates untrusted input against the server clock, then searches. Never throws. */
export async function searchRoomFinder(
  input: RoomFinderInput,
  now: Date,
  limit = ROOM_FINDER_RESULT_LIMIT,
  audience: RoomAudience = "ALL"
): Promise<RoomFinderSearchState> {
  const outcome = validateRoomFinderQuery(input, { today: toAcademicDateString(now), now });
  if (!outcome.ok) return { kind: "INVALID", error: outcome.error };
  return runSafely(outcome.query, now, limit, audience);
}

/** Who is searching: decides the room set and whether results link to booking. */
export interface RoomFinderViewer {
  role: Role;
  status: AccountStatus | null | undefined;
}

export async function getRoomFinderSetup(
  now: Date,
  audience: RoomAudience = "ALL",
  canBook = false
): Promise<RoomFinderSetup> {
  const today = toAcademicDateString(now);
  let locations: RoomFinderSetup["locations"] = [];
  try {
    locations = await listBookableLocations(audience);
  } catch (error) {
    // Location filters are optional; the finder still works without them.
    console.error("Room finder locations failed:", error);
  }
  return { today, maxDate: getBookingHorizonEnd(today), now: now.toISOString(), locations, canBook };
}

/** /rooms: role check, URL state, and a search only when one was submitted. */
export async function loadRoomFinder(input: {
  viewer: RoomFinderViewer | null;
  params: Record<string, string | string[] | undefined>;
  now: Date;
}): Promise<RoomFinderPageState> {
  if (input.viewer === null) return { kind: "UNAUTHENTICATED" };
  const audience = getRoomAudience(input.viewer.role, input.viewer.status);
  if (audience === null) return { kind: "NOT_ALLOWED" };
  const canBook = canBookRoom(input.viewer.role, input.viewer.status);

  const today = toAcademicDateString(input.now);
  const parsed = parseRoomFinderSearchParams(input.params, { today, now: input.now });

  let search: RoomFinderSearchState | null = null;
  if (parsed.outcome && !parsed.outcome.ok) {
    search = { kind: "INVALID", error: parsed.outcome.error };
  } else if (parsed.outcome?.ok) {
    search = await runSafely(parsed.outcome.query, input.now, undefined, audience);
  }

  return { kind: "READY", form: parsed.form, search, ...(await getRoomFinderSetup(input.now, audience, canBook)) };
}

// --- Dashboard ---------------------------------------------------------------

/** The dashboard finder as first shown: form defaults and, inside a slot, current availability. */
export interface DashboardRoomFinder {
  setup: RoomFinderSetup;
  form: RoomFinderFormValues;
  search: RoomFinderSearchState | null;
  /** Where "now" is in the slot grid: the current-slot banner, or why nothing was searched. */
  now: AvailableNowContext;
}

/**
 * Dashboard entry: party size 1, today, and - only when now is inside an AcademicSlot -
 * that slot, searched once with the SAME finder search as "ค้นหาห้อง" (shortlist of 6).
 * Outside every slot nothing is searched. Sessions are not read. Never throws.
 */
export async function loadDashboardRoomFinder(input: {
  viewer: RoomFinderViewer | null;
  now: Date;
}): Promise<DashboardRoomFinder | null> {
  if (input.viewer === null) return null;
  const audience = getRoomAudience(input.viewer.role, input.viewer.status);
  if (audience === null) return null;

  const setup = await getRoomFinderSetup(input.now, audience, canBookRoom(input.viewer.role, input.viewer.status));
  const context = getAvailableNowContext(input.now);
  const form = emptyRoomFinderForm(setup.today, "1");
  if (context.kind !== "IN_SLOT") return { setup, form, search: null, now: context };

  const current = { ...form, date: context.today, slots: [context.slot] };
  const search = await searchRoomFinder(current, input.now, ROOM_FINDER_SHORTLIST, audience);
  return { setup, form: current, search, now: context };
}
