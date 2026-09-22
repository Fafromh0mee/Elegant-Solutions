import {
  getSlotDefinition,
  isAcademicSlot,
  isValidAcademicDate,
  resolveSlotRange,
  slotTimeToMinutes,
} from "@/lib/academic-slots";
import { ROOM_CAPABILITY_VALUES } from "@/lib/types";
import type {
  AcademicSlot,
  BookingStatus,
  RoomApprovalPolicy,
  RoomCapability,
} from "@/lib/types";

// Central availability engine - PURE. No Prisma, no I/O, no clock reads.
//
// Everything this needs arrives in a RoomAvailabilityContext, so the exact same
// function can be re-run inside a write transaction at booking/approval time
// (Features 7/8) instead of growing a second, subtly different copy of the rules.
// SQL prefilters in the data layer are optimizations only: this module is the
// final authority on every availability decision.

export type AvailabilityStatus =
  | "AVAILABLE"
  | "ROOM_INACTIVE"
  | "BOOKING_DISABLED"
  | "NOT_CONFIGURED_CAPABILITIES"
  | "NOT_CONFIGURED_CAPACITY"
  | "CAPABILITY_MISMATCH"
  | "OUTSIDE_WINDOW"
  | "CLOSED"
  | "CLASS_IN_SESSION"
  | "FULL";

// Precedence: report the blocker that eliminates the most search space and
// survives longest, so the primary reason tells the user whether trying another
// date, slot or party size would help. Index 0 wins.
const STATUS_PRECEDENCE: readonly AvailabilityStatus[] = [
  "ROOM_INACTIVE",
  "BOOKING_DISABLED",
  "NOT_CONFIGURED_CAPABILITIES",
  "NOT_CONFIGURED_CAPACITY",
  "CAPABILITY_MISMATCH",
  "OUTSIDE_WINDOW",
  "CLOSED",
  "CLASS_IN_SESSION",
  "FULL",
  "AVAILABLE",
];

export type AvailabilityConfigWarning =
  | "ACTIVE_SEMESTER_NOT_SET"
  | "CLASS_SCHEDULE_SEMESTER_MISSING";

export interface AvailabilityRequest {
  /** "YYYY-MM-DD" - an Asia/Bangkok CALENDAR DATE, never an instant. */
  date: string;
  slots: AcademicSlot[];
  partySize: number;
  requiredCapability?: RoomCapability;
}

export interface AvailabilityRoom {
  id: string;
  roomCode: string;
  name: string;
  isActive: boolean;
  bookingEnabled: boolean;
  approvalPolicy: RoomApprovalPolicy;
  capabilities: RoomCapability[];
  capacity: number;
  building: string | null;
  floor: number | null;
}

export interface ClosureContext {
  id: string;
  reason: string | null;
  startDate: string; // "YYYY-MM-DD", inclusive
  endDate: string; // "YYYY-MM-DD", inclusive
  slots: AcademicSlot[]; // empty = the whole date range is closed
}

export interface ClassContext {
  id: string;
  slot: AcademicSlot | null; // null = legacy row, matched by time overlap
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  subjectCode: string | null;
  subjectName: string | null;
  section: string | null;
  semester: string | null; // null = legacy/unscoped, always in force
}

/** Everything the evaluator needs, already narrowed to one room and one date. */
export interface RoomAvailabilityContext {
  room: AvailabilityRoom;
  dayOfWeek: number; // 0=Sunday … 6=Saturday, Asia/Bangkok
  activeSemester: string | null; // SystemSetting ACTIVE_SEMESTER; null = unset
  windowSlots: AcademicSlot[]; // windows for this room + dayOfWeek
  closures: ClosureContext[]; // closures for this room covering the date
  classes: ClassContext[]; // candidate schedules for this room + dayOfWeek
  approvedPartySizeBySlot: Partial<Record<AcademicSlot, number>>;
  pendingPartySizeBySlot: Partial<Record<AcademicSlot, number>>;
  configWarnings: AvailabilityConfigWarning[];
}

export interface BlockingClass {
  id: string;
  subjectCode: string | null;
  subjectName: string | null;
  section: string | null;
  semester: string | null;
  startTime: string;
  endTime: string;
  /** TIME_OVERLAP means a legacy row with slot = NULL matched by its time range. */
  matchedBy: "SLOT" | "TIME_OVERLAP";
}

export interface BlockingClosure {
  id: string;
  reason: string | null;
  startDate: string;
  endDate: string;
  wholeRange: boolean;
}

export interface SlotAvailability {
  slot: AcademicSlot;
  startAt: Date;
  endAt: Date;
  available: boolean;
  status: AvailabilityStatus;
  capacity: number;
  bookedCapacity: number; // APPROVED only
  remainingCapacity: number;
  pendingCapacity: number; // reported for admin context, never subtracted
  blockingClass: BlockingClass | null;
  closure: BlockingClosure | null;
}

export interface RoomAvailabilityResult {
  room: AvailabilityRoom;
  date: string;
  requestedSlots: AcademicSlot[];
  partySize: number;
  available: boolean;
  status: AvailabilityStatus;
  capacity: number;
  slots: SlotAvailability[]; // [] when a room-level blocker short-circuits
  remainingCapacity: number; // minimum across requested slots
  requiresApproval: boolean; // consumer hint only - never affects availability
  configWarnings: AvailabilityConfigWarning[];
}

// --- Request validation -----------------------------------------------------

export type AvailabilityRequestError =
  | "INVALID_DATE"
  | "NO_SLOTS"
  | "DUPLICATE_SLOTS"
  | "INVALID_SLOT"
  | "INVALID_PARTY_SIZE"
  | "INVALID_CAPABILITY";

export type ValidationOutcome =
  | { ok: true; request: AvailabilityRequest }
  | { ok: false; error: AvailabilityRequestError };

/**
 * Runs before the evaluator so it can assume a well-formed request. Rejects
 * rather than repairs: nothing invalid is silently normalized.
 * Contiguous-slot validation is deliberately NOT here - that is booking policy
 * (Feature 7), not availability.
 */
export function validateAvailabilityRequest(input: {
  date?: unknown;
  slots?: unknown;
  partySize?: unknown;
  requiredCapability?: unknown;
}): ValidationOutcome {
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "INVALID_DATE" };
  }
  if (!isValidAcademicDate(input.date)) {
    return { ok: false, error: "INVALID_DATE" };
  }

  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    return { ok: false, error: "NO_SLOTS" };
  }

  for (const slot of input.slots) {
    if (typeof slot !== "string" || !isAcademicSlot(slot)) {
      return { ok: false, error: "INVALID_SLOT" };
    }
  }

  const slots = input.slots as AcademicSlot[];
  if (new Set(slots).size !== slots.length) {
    return { ok: false, error: "DUPLICATE_SLOTS" };
  }

  if (
    typeof input.partySize !== "number" ||
    !Number.isInteger(input.partySize) ||
    input.partySize <= 0
  ) {
    return { ok: false, error: "INVALID_PARTY_SIZE" };
  }

  let requiredCapability: RoomCapability | undefined;
  if (input.requiredCapability !== undefined) {
    if (
      typeof input.requiredCapability !== "string" ||
      !ROOM_CAPABILITY_VALUES.includes(input.requiredCapability as RoomCapability)
    ) {
      return { ok: false, error: "INVALID_CAPABILITY" };
    }
    requiredCapability = input.requiredCapability as RoomCapability;
  }

  return {
    ok: true,
    request: {
      date: input.date,
      // Ordering only - the set of slots is exactly what was requested.
      slots: [...slots].sort((a, b) => getSlotDefinition(a).order - getSlotDefinition(b).order),
      partySize: input.partySize,
      requiredCapability,
    },
  };
}

export const ROOM_SEARCH_DEFAULT_LIMIT = 50;
export const ROOM_SEARCH_MAX_LIMIT = 200;

export interface RoomSearchFilters {
  building?: string;
  floor?: number;
  onlyAvailable: boolean;
  limit: number;
}

export type RoomSearchError =
  | "INVALID_BUILDING"
  | "INVALID_FLOOR"
  | "INVALID_ONLY_AVAILABLE"
  | "INVALID_LIMIT";

export type RoomSearchValidationOutcome =
  | { ok: true; filters: RoomSearchFilters }
  | { ok: false; error: RoomSearchError };

/** Validates the Room Finder-only inputs. Out-of-range values are rejected, not clamped. */
export function validateRoomSearchFilters(input: {
  building?: unknown;
  floor?: unknown;
  onlyAvailable?: unknown;
  limit?: unknown;
}): RoomSearchValidationOutcome {
  if (
    input.building !== undefined &&
    (typeof input.building !== "string" ||
      input.building.length === 0 ||
      input.building !== input.building.trim())
  ) {
    return { ok: false, error: "INVALID_BUILDING" };
  }

  if (
    input.floor !== undefined &&
    (typeof input.floor !== "number" || !Number.isInteger(input.floor))
  ) {
    return { ok: false, error: "INVALID_FLOOR" };
  }

  if (input.onlyAvailable !== undefined && typeof input.onlyAvailable !== "boolean") {
    return { ok: false, error: "INVALID_ONLY_AVAILABLE" };
  }

  if (
    input.limit !== undefined &&
    (typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > ROOM_SEARCH_MAX_LIMIT)
  ) {
    return { ok: false, error: "INVALID_LIMIT" };
  }

  return {
    ok: true,
    filters: {
      building: input.building as string | undefined,
      floor: input.floor as number | undefined,
      onlyAvailable: (input.onlyAvailable as boolean | undefined) ?? false,
      limit: (input.limit as number | undefined) ?? ROOM_SEARCH_DEFAULT_LIMIT,
    },
  };
}

// --- Context helpers (pure, shared with the data layer) ---------------------

/**
 * Which schedules are in force. Fail closed:
 *  - ACTIVE_SEMESTER unset -> every row is in force
 *  - set -> rows for that semester AND rows with no semester (legacy/unscoped)
 */
export function isClassScheduleInForce(
  scheduleSemester: string | null,
  activeSemester: string | null
): boolean {
  if (activeSemester === null) return true;
  return scheduleSemester === null || scheduleSemester === activeSemester;
}

export interface BookingCapacityInput {
  status: BookingStatus;
  partySize: number;
  slots: AcademicSlot[];
}

/**
 * Only APPROVED consumes capacity. PENDING is tallied separately for admin
 * context and never reserves. CANCELLED and REJECTED are ignored entirely.
 */
export function summarizeBookingCapacity(bookings: BookingCapacityInput[]): {
  approvedPartySizeBySlot: Partial<Record<AcademicSlot, number>>;
  pendingPartySizeBySlot: Partial<Record<AcademicSlot, number>>;
} {
  const approved: Partial<Record<AcademicSlot, number>> = {};
  const pending: Partial<Record<AcademicSlot, number>> = {};

  for (const booking of bookings) {
    const target =
      booking.status === "APPROVED" ? approved : booking.status === "PENDING" ? pending : null;
    if (!target) continue;

    for (const slot of booking.slots) {
      target[slot] = (target[slot] ?? 0) + booking.partySize;
    }
  }

  return { approvedPartySizeBySlot: approved, pendingPartySizeBySlot: pending };
}

// --- Evaluation -------------------------------------------------------------

function classMatch(klass: ClassContext, slot: AcademicSlot): BlockingClass["matchedBy"] | null {
  if (klass.slot !== null) {
    return klass.slot === slot ? "SLOT" : null;
  }

  // Legacy row: compare its time range against the slot's.
  const definition = getSlotDefinition(slot);
  const classStart = slotTimeToMinutes(klass.startTime);
  const classEnd = slotTimeToMinutes(klass.endTime);
  const slotStart = slotTimeToMinutes(definition.startTime);
  const slotEnd = slotTimeToMinutes(definition.endTime);

  return classStart < slotEnd && classEnd > slotStart ? "TIME_OVERLAP" : null;
}

function closureCovers(closure: ClosureContext, date: string, slot: AcademicSlot): boolean {
  // "YYYY-MM-DD" compares chronologically as a string.
  if (date < closure.startDate || date > closure.endDate) return false;
  return closure.slots.length === 0 || closure.slots.includes(slot);
}

function highestPrecedence(statuses: AvailabilityStatus[]): AvailabilityStatus {
  return statuses.reduce((worst, current) =>
    STATUS_PRECEDENCE.indexOf(current) < STATUS_PRECEDENCE.indexOf(worst) ? current : worst
  );
}

function roomLevelStatus(
  room: AvailabilityRoom,
  request: AvailabilityRequest
): AvailabilityStatus | null {
  if (!room.isActive) return "ROOM_INACTIVE";
  if (!room.bookingEnabled) return "BOOKING_DISABLED";
  if (room.capabilities.length === 0) return "NOT_CONFIGURED_CAPABILITIES";
  // capacity <= 0 is a configuration problem, NOT a full room.
  if (room.capacity <= 0) return "NOT_CONFIGURED_CAPACITY";
  if (request.requiredCapability && !room.capabilities.includes(request.requiredCapability)) {
    return "CAPABILITY_MISMATCH";
  }
  return null;
}

export function evaluateAvailability(
  context: RoomAvailabilityContext,
  request: AvailabilityRequest
): RoomAvailabilityResult {
  const { room } = context;
  const warnings = new Set<AvailabilityConfigWarning>(context.configWarnings);

  if (context.activeSemester === null) {
    warnings.add("ACTIVE_SEMESTER_NOT_SET");
  }

  const classesInForce = context.classes.filter((klass) =>
    isClassScheduleInForce(klass.semester, context.activeSemester)
  );

  // Report unscoped schedules whenever they bear on a requested slot, even if a
  // different blocker wins that slot - the warning is about the data, not the result.
  const unscopedParticipates = classesInForce.some(
    (klass) =>
      klass.semester === null && request.slots.some((slot) => classMatch(klass, slot) !== null)
  );
  if (unscopedParticipates) {
    warnings.add("CLASS_SCHEDULE_SEMESTER_MISSING");
  }

  const common = {
    room,
    date: request.date,
    requestedSlots: request.slots,
    partySize: request.partySize,
    capacity: room.capacity,
    requiresApproval: room.approvalPolicy === "MANUAL",
  };

  const blocked = roomLevelStatus(room, request);
  if (blocked) {
    return {
      ...common,
      available: false,
      status: blocked,
      slots: [],
      remainingCapacity: 0,
      configWarnings: [...warnings],
    };
  }

  const slots: SlotAvailability[] = request.slots.map((slot) => {
    const { startAt, endAt } = resolveSlotRange(request.date, slot);
    const bookedCapacity = context.approvedPartySizeBySlot[slot] ?? 0;
    const pendingCapacity = context.pendingPartySizeBySlot[slot] ?? 0;
    const remainingCapacity = Math.max(0, room.capacity - bookedCapacity);

    const base = {
      slot,
      startAt,
      endAt,
      capacity: room.capacity,
      bookedCapacity,
      remainingCapacity,
      pendingCapacity,
      blockingClass: null,
      closure: null,
    };

    // Fail-closed: no window row for this weekday+slot means not bookable.
    if (!context.windowSlots.includes(slot)) {
      return { ...base, available: false, status: "OUTSIDE_WINDOW" as const };
    }

    const closure = context.closures.find((candidate) =>
      closureCovers(candidate, request.date, slot)
    );
    if (closure) {
      return {
        ...base,
        available: false,
        status: "CLOSED" as const,
        closure: {
          id: closure.id,
          reason: closure.reason,
          startDate: closure.startDate,
          endDate: closure.endDate,
          wholeRange: closure.slots.length === 0,
        },
      };
    }

    // A class occupies the room outright - no capacity sharing during a class.
    for (const klass of classesInForce) {
      const matchedBy = classMatch(klass, slot);
      if (!matchedBy) continue;

      return {
        ...base,
        available: false,
        status: "CLASS_IN_SESSION" as const,
        blockingClass: {
          id: klass.id,
          subjectCode: klass.subjectCode,
          subjectName: klass.subjectName,
          section: klass.section,
          semester: klass.semester,
          startTime: klass.startTime,
          endTime: klass.endTime,
          matchedBy,
        },
      };
    }

    if (remainingCapacity < request.partySize) {
      return { ...base, available: false, status: "FULL" as const };
    }

    return { ...base, available: true, status: "AVAILABLE" as const };
  });

  const failing = slots.filter((entry) => !entry.available);
  const available = failing.length === 0;

  return {
    ...common,
    available,
    status: available ? "AVAILABLE" : highestPrecedence(failing.map((entry) => entry.status)),
    slots,
    remainingCapacity: Math.min(...slots.map((entry) => entry.remainingCapacity)),
    configWarnings: [...warnings],
  };
}

// --- Per-slot evaluation for a whole day (Room Finder, no slot selected) ----

/** One room on one date, each considered slot evaluated ON ITS OWN. */
export interface RoomDayAvailabilityResult {
  room: AvailabilityRoom;
  date: string;
  partySize: number;
  /** At least one considered slot is AVAILABLE. Never "free all day". */
  available: boolean;
  /** The considered slots that are AVAILABLE, each with its own remaining capacity. */
  availableSlots: Array<{ slot: AcademicSlot; remainingCapacity: number }>;
  /** The single-slot evaluation for every considered slot, in slot order - reasons included. */
  slots: RoomAvailabilityResult[];
  requiresApproval: boolean;
}

/**
 * Evaluates each slot separately with evaluateAvailability - NOT one multi-slot
 * request, which would demand availability across every slot at once. The context
 * must have been loaded for (at least) all of `slots`.
 */
export function evaluateDayAvailability(
  context: RoomAvailabilityContext,
  request: Omit<AvailabilityRequest, "slots">,
  slots: readonly AcademicSlot[]
): RoomDayAvailabilityResult {
  const perSlot = [...slots]
    .sort((a, b) => getSlotDefinition(a).order - getSlotDefinition(b).order)
    .map((slot) => evaluateAvailability(context, { ...request, slots: [slot] }));
  const availableSlots = perSlot
    .filter((result) => result.available)
    .map((result) => ({ slot: result.requestedSlots[0], remainingCapacity: result.remainingCapacity }));

  return {
    room: context.room,
    date: request.date,
    partySize: request.partySize,
    available: availableSlots.length > 0,
    availableSlots,
    slots: perSlot,
    requiresApproval: context.room.approvalPolicy === "MANUAL",
  };
}
