import { toAcademicDateString } from "@/lib/academic-slots";
import { validateAvailabilityRequest, validateRoomSearchFilters } from "@/lib/availability";
import {
  countBookableRoomsWithCapability,
  listBookableLocations,
  searchRoomAvailability,
} from "@/lib/availability-context";
import { getBookingHorizonEnd } from "@/lib/booking-rules";
import { canUseRoomFinder } from "@/lib/permissions";
import {
  compareFinderResults,
  parseRoomFinderSearchParams,
  ROOM_FINDER_RESULT_LIMIT,
  validateRoomFinderQuery,
  type RoomFinderFormValues,
  type RoomFinderInput,
  type RoomFinderQuery,
  type RoomFinderSearchState,
  type RoomFinderSetup,
} from "@/lib/room-finder";
import type { Role } from "@/lib/types";

// Server-side Room Finder. Server-only, deliberately NOT "use server": the /rooms
// page calls it directly and actions/room-finder.ts wraps it for the dashboard.
// Every availability decision comes from the Feature 3 engine.

export type { RoomFinderSearchState, RoomFinderSetup } from "@/lib/room-finder";

export type RoomFinderPageState =
  | { kind: "UNAUTHENTICATED" }
  | { kind: "NOT_ALLOWED" }
  | ({ kind: "READY"; form: RoomFinderFormValues; search: RoomFinderSearchState | null } & RoomFinderSetup);

export async function runRoomFinderSearch(query: RoomFinderQuery): Promise<RoomFinderSearchState> {
  // The finder validator is stricter than Feature 3's, so these always pass;
  // running them keeps Feature 3 the gatekeeper of what reaches the engine.
  const request = validateAvailabilityRequest({
    date: query.date,
    slots: query.slots,
    partySize: query.partySize,
    requiredCapability: query.capability ?? undefined,
  });
  const filters = validateRoomSearchFilters({
    building: query.building ?? undefined,
    floor: query.floor ?? undefined,
    // Unavailable rooms are kept so reasons can be shown; available ones sort first,
    // so the limit never cuts an available room in favour of an unavailable one.
    onlyAvailable: false,
    limit: ROOM_FINDER_RESULT_LIMIT,
  });
  if (!request.ok || !filters.ok) return { kind: "FAILED" };

  const outcome = await searchRoomAvailability(request.request, filters.filters, { compare: compareFinderResults });
  const available = outcome.results.filter((result) => result.available);
  const unavailable = outcome.results.filter((result) => !result.available);

  const capabilityHasNoRooms =
    available.length === 0 && query.capability !== null
      ? (await countBookableRoomsWithCapability(query.capability)) === 0
      : false;

  return {
    kind: "DONE",
    query,
    available,
    unavailable,
    statusCounts: outcome.statusCounts,
    availableTruncated: outcome.candidatesTruncated || (outcome.statusCounts.AVAILABLE ?? 0) > available.length,
    capabilityHasNoRooms,
  };
}

async function runSafely(query: RoomFinderQuery): Promise<RoomFinderSearchState> {
  try {
    return await runRoomFinderSearch(query);
  } catch (error) {
    console.error("Room finder search failed:", error);
    return { kind: "FAILED" };
  }
}

/** Validates untrusted input against the server clock, then searches. Never throws. */
export async function searchRoomFinder(input: RoomFinderInput, now: Date): Promise<RoomFinderSearchState> {
  const outcome = validateRoomFinderQuery(input, { today: toAcademicDateString(now), now });
  if (!outcome.ok) return { kind: "INVALID", error: outcome.error };
  return runSafely(outcome.query);
}

export async function getRoomFinderSetup(now: Date): Promise<RoomFinderSetup> {
  const today = toAcademicDateString(now);
  let locations: RoomFinderSetup["locations"] = [];
  try {
    locations = await listBookableLocations();
  } catch (error) {
    // Location filters are optional; the finder still works without them.
    console.error("Room finder locations failed:", error);
  }
  return { today, maxDate: getBookingHorizonEnd(today), now: now.toISOString(), locations };
}

/** /rooms: role check, URL state, and a search only when one was submitted. */
export async function loadRoomFinder(input: {
  role: Role | null;
  params: Record<string, string | string[] | undefined>;
  now: Date;
}): Promise<RoomFinderPageState> {
  if (input.role === null) return { kind: "UNAUTHENTICATED" };
  if (!canUseRoomFinder(input.role)) return { kind: "NOT_ALLOWED" };

  const today = toAcademicDateString(input.now);
  const parsed = parseRoomFinderSearchParams(input.params, { today, now: input.now });

  let search: RoomFinderSearchState | null = null;
  if (parsed.outcome && !parsed.outcome.ok) {
    search = { kind: "INVALID", error: parsed.outcome.error };
  } else if (parsed.outcome?.ok) {
    search = await runSafely(parsed.outcome.query);
  }

  return { kind: "READY", form: parsed.form, search, ...(await getRoomFinderSetup(input.now)) };
}
