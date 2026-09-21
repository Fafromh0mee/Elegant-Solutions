import type { Prisma } from "@prisma/client";
import { isAcademicSlot, isValidAcademicDate, getSlotDefinition } from "@/lib/academic-slots";
import { ROOM_CAPABILITY_VALUES } from "@/lib/types";
import type { AcademicSlot, RoomApprovalPolicy, RoomCapability } from "@/lib/types";

// Admin room configuration rules - PURE. No Prisma client, no I/O, no clock reads.
// (The Prisma import above is type-only, for the list `where` builder.)
//
// Every server action validates through here, so business rules never live
// only in React state.

// --- Room configuration -----------------------------------------------------

export const ROOM_CAPACITY_MAX = 10_000;
export const ROOM_FLOOR_MIN = -10;
export const ROOM_FLOOR_MAX = 200;
const ROOM_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export interface RoomConfiguration {
  name: string;
  roomCode: string;
  description: string | null;
  building: string | null;
  floor: number | null;
  capacity: number;
  capabilities: RoomCapability[];
  isActive: boolean;
  bookingEnabled: boolean;
  approvalPolicy: RoomApprovalPolicy;
  guestAccess: boolean;
  staffOnly: boolean;
}

export type RoomConfigurationError =
  | "INVALID_NAME"
  | "INVALID_ROOM_CODE"
  | "INVALID_DESCRIPTION"
  | "INVALID_BUILDING"
  | "INVALID_FLOOR"
  | "INVALID_CAPACITY"
  | "INVALID_CAPABILITIES"
  | "DUPLICATE_CAPABILITIES"
  | "INVALID_FLAG"
  | "INVALID_APPROVAL_POLICY";

export type Outcome<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

/** Optional free text: trims, turns "" into null, rejects over-length. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? undefined : trimmed;
}

/**
 * Validates a full room configuration. Incomplete-but-valid values are
 * ACCEPTED: capabilities=[] and capacity=0 are legal and simply make the room
 * not ready for booking (see deriveRoomConfigurationHealth). Nothing is inferred.
 */
export function validateRoomConfiguration(input: Record<string, unknown>): Outcome<RoomConfiguration, RoomConfigurationError> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0 || name.length > 100) return { ok: false, error: "INVALID_NAME" };

  if (typeof input.roomCode !== "string" || !ROOM_CODE_PATTERN.test(input.roomCode) || input.roomCode.length > 32) {
    return { ok: false, error: "INVALID_ROOM_CODE" };
  }

  const description = optionalText(input.description, 500);
  if (description === undefined) return { ok: false, error: "INVALID_DESCRIPTION" };

  const building = optionalText(input.building, 20);
  if (building === undefined) return { ok: false, error: "INVALID_BUILDING" };

  let floor: number | null = null;
  if (input.floor !== undefined && input.floor !== null) {
    if (
      typeof input.floor !== "number" ||
      !Number.isInteger(input.floor) ||
      input.floor < ROOM_FLOOR_MIN ||
      input.floor > ROOM_FLOOR_MAX
    ) {
      return { ok: false, error: "INVALID_FLOOR" };
    }
    floor = input.floor;
  }

  if (
    typeof input.capacity !== "number" ||
    !Number.isInteger(input.capacity) ||
    input.capacity < 0 ||
    input.capacity > ROOM_CAPACITY_MAX
  ) {
    return { ok: false, error: "INVALID_CAPACITY" };
  }

  if (!Array.isArray(input.capabilities)) return { ok: false, error: "INVALID_CAPABILITIES" };
  for (const capability of input.capabilities) {
    if (typeof capability !== "string" || !ROOM_CAPABILITY_VALUES.includes(capability as RoomCapability)) {
      return { ok: false, error: "INVALID_CAPABILITIES" };
    }
  }
  const capabilities = input.capabilities as RoomCapability[];
  if (new Set(capabilities).size !== capabilities.length) return { ok: false, error: "DUPLICATE_CAPABILITIES" };

  for (const flag of ["isActive", "bookingEnabled", "guestAccess", "staffOnly"] as const) {
    if (typeof input[flag] !== "boolean") return { ok: false, error: "INVALID_FLAG" };
  }

  if (input.approvalPolicy !== "AUTO" && input.approvalPolicy !== "MANUAL") {
    return { ok: false, error: "INVALID_APPROVAL_POLICY" };
  }

  return {
    ok: true,
    value: {
      name,
      roomCode: input.roomCode,
      description,
      building,
      floor,
      capacity: input.capacity,
      // Canonical order for stable storage and display.
      capabilities: ROOM_CAPABILITY_VALUES.filter((c) => capabilities.includes(c)),
      isActive: input.isActive as boolean,
      bookingEnabled: input.bookingEnabled as boolean,
      approvalPolicy: input.approvalPolicy,
      guestAccess: input.guestAccess as boolean,
      staffOnly: input.staffOnly as boolean,
    },
  };
}

/** Defaults for a newly created room: operational, NOT bookable, nothing inferred. */
export const NEW_ROOM_DEFAULTS = {
  capabilities: [] as RoomCapability[],
  isActive: true,
  bookingEnabled: false,
  approvalPolicy: "AUTO" as RoomApprovalPolicy,
  guestAccess: false,
  staffOnly: false,
};

// --- Configuration health (derived, never stored) ---------------------------

export type RoomConfigurationHealth = "READY" | "INCOMPLETE" | "BOOKING_DISABLED" | "INACTIVE";
export type RoomConfigurationIssue = "MISSING_CAPABILITIES" | "MISSING_CAPACITY" | "MISSING_WINDOWS";

export interface RoomHealthInput {
  isActive: boolean;
  bookingEnabled: boolean;
  capabilities: RoomCapability[];
  capacity: number;
  availabilityWindowCount: number;
}

/**
 * Admin configuration health. Distinct from the Feature 3 availability status:
 * this answers "is the room set up correctly", not "is it free on a date".
 */
export function deriveRoomConfigurationHealth(room: RoomHealthInput): {
  health: RoomConfigurationHealth;
  issues: RoomConfigurationIssue[];
} {
  if (!room.isActive) return { health: "INACTIVE", issues: [] };
  if (!room.bookingEnabled) return { health: "BOOKING_DISABLED", issues: [] };

  const issues: RoomConfigurationIssue[] = [];
  if (room.capabilities.length === 0) issues.push("MISSING_CAPABILITIES");
  if (room.capacity <= 0) issues.push("MISSING_CAPACITY");
  if (room.availabilityWindowCount === 0) issues.push("MISSING_WINDOWS");

  return { health: issues.length > 0 ? "INCOMPLETE" : "READY", issues };
}

// --- Availability windows ---------------------------------------------------

export interface AvailabilityWindowInput {
  dayOfWeek: number;
  slot: AcademicSlot;
}

export type AvailabilityWindowError = "INVALID_WINDOWS" | "INVALID_DAY" | "INVALID_SLOT" | "DUPLICATE_WINDOW";

/**
 * Validates the desired window set. An EMPTY set is valid and intentionally
 * means "no ad-hoc availability" (fail-closed). Output order is deterministic.
 */
export function validateAvailabilityWindows(input: unknown): Outcome<AvailabilityWindowInput[], AvailabilityWindowError> {
  if (!Array.isArray(input) || input.length > 7 * 4) return { ok: false, error: "INVALID_WINDOWS" };

  const seen = new Set<string>();
  const windows: AvailabilityWindowInput[] = [];

  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) return { ok: false, error: "INVALID_WINDOWS" };
    const { dayOfWeek, slot } = entry as { dayOfWeek?: unknown; slot?: unknown };

    if (typeof dayOfWeek !== "number" || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return { ok: false, error: "INVALID_DAY" };
    }
    if (typeof slot !== "string" || !isAcademicSlot(slot)) return { ok: false, error: "INVALID_SLOT" };

    const key = `${dayOfWeek}:${slot}`;
    if (seen.has(key)) return { ok: false, error: "DUPLICATE_WINDOW" };
    seen.add(key);
    windows.push({ dayOfWeek, slot });
  }

  windows.sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || getSlotDefinition(a.slot).order - getSlotDefinition(b.slot).order
  );
  return { ok: true, value: windows };
}

/** Grid row order: Monday first, Sunday last. Values are ClassSchedule dayOfWeek (0=Sunday). */
export const ADMIN_WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

// --- Closures ---------------------------------------------------------------

export interface RoomClosureInput {
  startDate: string; // "YYYY-MM-DD", Asia/Bangkok calendar date, inclusive
  endDate: string;
  slots: AcademicSlot[]; // [] = the whole date range
  reason: string | null;
}

export type RoomClosureError =
  | "INVALID_START_DATE"
  | "INVALID_END_DATE"
  | "END_BEFORE_START"
  | "END_IN_PAST"
  | "INVALID_SLOT"
  | "DUPLICATE_SLOTS"
  | "INVALID_REASON";

function isStrictDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidAcademicDate(value);
}

/**
 * `today` is the Asia/Bangkok calendar date, passed in so this stays pure.
 * Duplicate slots are rejected rather than silently de-duplicated.
 */
export function validateRoomClosure(input: Record<string, unknown>, today: string): Outcome<RoomClosureInput, RoomClosureError> {
  if (!isStrictDate(input.startDate)) return { ok: false, error: "INVALID_START_DATE" };
  if (!isStrictDate(input.endDate)) return { ok: false, error: "INVALID_END_DATE" };
  // "YYYY-MM-DD" compares chronologically as a string.
  if (input.endDate < input.startDate) return { ok: false, error: "END_BEFORE_START" };
  if (input.endDate < today) return { ok: false, error: "END_IN_PAST" };

  if (!Array.isArray(input.slots)) return { ok: false, error: "INVALID_SLOT" };
  for (const slot of input.slots) {
    if (typeof slot !== "string" || !isAcademicSlot(slot)) return { ok: false, error: "INVALID_SLOT" };
  }
  const slots = input.slots as AcademicSlot[];
  if (new Set(slots).size !== slots.length) return { ok: false, error: "DUPLICATE_SLOTS" };

  const reason = optionalText(input.reason, 200);
  if (reason === undefined) return { ok: false, error: "INVALID_REASON" };

  return {
    ok: true,
    value: {
      startDate: input.startDate,
      endDate: input.endDate,
      slots: [...slots].sort((a, b) => getSlotDefinition(a).order - getSlotDefinition(b).order),
      reason,
    },
  };
}

// --- Deletion safety --------------------------------------------------------

export interface RoomDependencyCounts {
  bookings: number;
  sessions: number;
  accessTokens: number;
  classSchedules: number;
  logs: number; // usage/audit events only - not the room's own configuration trail
  agentMachines: number;
}

export type RoomDependencyKind = keyof RoomDependencyCounts;

/**
 * A room may be hard-deleted only when it has no history or dependents at all.
 * Anything else must be deactivated instead - history is never deleted to make
 * a delete succeed. Availability windows and closures are configuration and may
 * cascade with a genuinely unused room.
 */
export function evaluateRoomDeletion(counts: RoomDependencyCounts): {
  allowed: boolean;
  blockers: Array<{ kind: RoomDependencyKind; count: number }>;
} {
  const blockers = (Object.keys(counts) as RoomDependencyKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, count: counts[kind] }));
  return { allowed: blockers.length === 0, blockers };
}

// --- Admin room list --------------------------------------------------------

export const ROOM_LIST_PAGE_SIZES = [10, 25, 50] as const;
export const ROOM_LIST_DEFAULT_PAGE_SIZE = 25;
/** Sentinel for "rooms with no building recorded" in the building filter. */
export const BUILDING_NONE = "__NONE__";

export interface RoomListFilters {
  q: string | null;
  building: string | null;
  capability: RoomCapability | null;
  operational: "ALL" | "ACTIVE" | "INACTIVE";
  booking: "ALL" | "ENABLED" | "DISABLED";
  health: "ALL" | RoomConfigurationHealth;
  page: number;
  pageSize: number;
}

export type RoomListFilterError =
  | "INVALID_QUERY"
  | "INVALID_BUILDING"
  | "INVALID_CAPABILITY"
  | "INVALID_OPERATIONAL"
  | "INVALID_BOOKING"
  | "INVALID_HEALTH"
  | "INVALID_PAGE";

const HEALTH_VALUES = ["ALL", "READY", "INCOMPLETE", "BOOKING_DISABLED", "INACTIVE"] as const;

export function isRoomListPageSize(value: unknown): value is number {
  return typeof value === "number" && (ROOM_LIST_PAGE_SIZES as readonly number[]).includes(value);
}

/**
 * The list state after a UI change. Any change other than the page itself
 * (filters, search, page size) returns to page 1; everything else is kept.
 */
export function applyRoomListChange<T extends { page: number }>(current: T, patch: Partial<T>): T {
  return { ...current, page: 1, ...patch };
}

type SearchParamValue = string | string[] | undefined;

/**
 * Raw list filters from the /admin/rooms query string. Lenient: a malformed or
 * unknown value is dropped (so its default applies) instead of breaking the page.
 * The result still goes through validateRoomListFilters.
 */
export function parseRoomListSearchParams(params: Record<string, SearchParamValue>): Record<string, unknown> {
  const read = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const oneOf = (key: string, allowed: readonly string[]) => {
    const value = read(key);
    return value !== undefined && allowed.includes(value) ? value : undefined;
  };
  const integer = (key: string) => {
    const value = read(key);
    return value !== undefined && /^\d{1,5}$/.test(value) ? Number(value) : undefined;
  };

  const raw: Record<string, unknown> = {
    q: read("q"),
    building: read("building"),
    capability: oneOf("capability", ROOM_CAPABILITY_VALUES),
    operational: oneOf("operational", ["ALL", "ACTIVE", "INACTIVE"]),
    booking: oneOf("booking", ["ALL", "ENABLED", "DISABLED"]),
    health: oneOf("health", HEALTH_VALUES),
    page: integer("page"),
    pageSize: integer("pageSize"),
  };
  if (typeof raw.q === "string" && raw.q.length > 100) raw.q = undefined;
  if (typeof raw.building === "string" && raw.building.length > 20) raw.building = undefined;
  if (typeof raw.page === "number" && (raw.page < 1 || raw.page > 10_000)) raw.page = undefined;

  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
}

/** Query string for the list state. page and pageSize are always present; default filters are omitted. */
export function roomListQueryString(state: {
  q?: string | null;
  building?: string | null;
  capability?: string | null;
  operational?: string;
  booking?: string;
  health?: string;
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  if (state.q?.trim()) params.set("q", state.q.trim());
  if (state.building) params.set("building", state.building);
  if (state.capability) params.set("capability", state.capability);
  if (state.operational && state.operational !== "ALL") params.set("operational", state.operational);
  if (state.booking && state.booking !== "ALL") params.set("booking", state.booking);
  if (state.health && state.health !== "ALL") params.set("health", state.health);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params.toString();
}

export function validateRoomListFilters(input: Record<string, unknown>): Outcome<RoomListFilters, RoomListFilterError> {
  const q = optionalText(input.q, 100);
  if (q === undefined) return { ok: false, error: "INVALID_QUERY" };

  const building = optionalText(input.building, 20);
  if (building === undefined) return { ok: false, error: "INVALID_BUILDING" };

  let capability: RoomCapability | null = null;
  if (input.capability !== undefined && input.capability !== null && input.capability !== "") {
    if (typeof input.capability !== "string" || !ROOM_CAPABILITY_VALUES.includes(input.capability as RoomCapability)) {
      return { ok: false, error: "INVALID_CAPABILITY" };
    }
    capability = input.capability as RoomCapability;
  }

  const operational = input.operational ?? "ALL";
  if (operational !== "ALL" && operational !== "ACTIVE" && operational !== "INACTIVE") {
    return { ok: false, error: "INVALID_OPERATIONAL" };
  }

  const booking = input.booking ?? "ALL";
  if (booking !== "ALL" && booking !== "ENABLED" && booking !== "DISABLED") {
    return { ok: false, error: "INVALID_BOOKING" };
  }

  const health = input.health ?? "ALL";
  if (typeof health !== "string" || !(HEALTH_VALUES as readonly string[]).includes(health)) {
    return { ok: false, error: "INVALID_HEALTH" };
  }

  const page = input.page ?? 1;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 10_000) {
    return { ok: false, error: "INVALID_PAGE" };
  }

  // Anything other than a supported size falls back to the default rather than failing the list.
  const pageSize = isRoomListPageSize(input.pageSize) ? input.pageSize : ROOM_LIST_DEFAULT_PAGE_SIZE;

  return {
    ok: true,
    value: {
      q,
      building,
      capability,
      operational,
      booking,
      health: health as RoomListFilters["health"],
      page,
      pageSize,
    },
  };
}

/**
 * Health as a Prisma predicate. MUST mirror deriveRoomConfigurationHealth - the
 * DB integration test checks every listed room against the pure derivation.
 */
export function healthWhere(health: RoomConfigurationHealth): Prisma.RoomWhereInput {
  switch (health) {
    case "INACTIVE":
      return { isActive: false };
    case "BOOKING_DISABLED":
      return { isActive: true, bookingEnabled: false };
    case "INCOMPLETE":
      return {
        isActive: true,
        bookingEnabled: true,
        OR: [{ capabilities: { isEmpty: true } }, { capacity: { lte: 0 } }, { availabilityWindows: { none: {} } }],
      };
    case "READY":
      return {
        isActive: true,
        bookingEnabled: true,
        capabilities: { isEmpty: false },
        capacity: { gt: 0 },
        availabilityWindows: { some: {} },
      };
  }
}

export function buildRoomListWhere(filters: RoomListFilters): Prisma.RoomWhereInput {
  const and: Prisma.RoomWhereInput[] = [];

  if (filters.q) {
    and.push({
      OR: [
        { roomCode: { contains: filters.q, mode: "insensitive" } },
        { name: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.building) {
    and.push({ building: filters.building === BUILDING_NONE ? null : filters.building });
  }
  if (filters.capability) and.push({ capabilities: { has: filters.capability } });
  if (filters.operational !== "ALL") and.push({ isActive: filters.operational === "ACTIVE" });
  if (filters.booking !== "ALL") and.push({ bookingEnabled: filters.booking === "ENABLED" });
  if (filters.health !== "ALL") and.push(healthWhere(filters.health));

  return and.length > 0 ? { AND: and } : {};
}
