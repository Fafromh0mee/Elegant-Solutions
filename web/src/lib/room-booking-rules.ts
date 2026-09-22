import { ACADEMIC_TIME_ZONE, getSlotDefinition, getSlotShortLabel } from "@/lib/academic-slots";
import type { AvailabilityStatus } from "@/lib/availability";
import { isSlotStillBookable } from "@/lib/booking-rules";
import { validateRoomFinderQuery, type RoomFinderClock, type RoomFinderError } from "@/lib/room-finder";
import type { AcademicSlot, BookingParticipantSource, BookingStatus, RoomApprovalPolicy, RoomCapability } from "@/lib/types";

// Feature 7 / 7.5 booking rules - PURE. Request validation, the policy -> status
// mapping, Feature 3 status -> booking error mapping, and the participant-conflict
// classifier. Availability itself is never decided here: that is the Feature 3
// evaluator, re-run inside the booking transaction (lib/room-booking.ts).

export type BookingError =
  | RoomFinderError
  | "INVALID_ROOM"
  /** The first slot is running with fewer than BOOKING_MIN_MINUTES_BEFORE_SLOT_END left. */
  | "SLOT_TOO_LATE"
  /** Not a STUDENT or approved GUEST (re-read from the database at booking time). */
  | "NOT_ALLOWED"
  | "ROOM_NOT_FOUND"
  /** Malformed participant selection (not {kind:"SELF"} or {kind:"GROUP", groupId}). */
  | "INVALID_PARTICIPANTS"
  /** GROUP selection, but no Group with that id exists. */
  | "GROUP_NOT_FOUND"
  /** GROUP selection, but the caller does not own that Group. */
  | "NOT_GROUP_OWNER"
  /** GROUP selection: the live member set no longer matches the fingerprint the caller
   *  reviewed (someone joined/left between preview and confirm). Nothing is created;
   *  the caller must re-preview the group before confirming again. */
  | "GROUP_MEMBERSHIP_CHANGED"
  /** A resolved participant (creator or group member) is not STUDENT/approved-GUEST. */
  | "INELIGIBLE_PARTICIPANT"
  /** A resolved participant is an approved GUEST, and the room is not guest-eligible. */
  | "GUEST_ROOM_NOT_ALLOWED"
  /** Room inactive, not bookable, or no longer configured. */
  | "ROOM_NOT_BOOKABLE"
  /** The finder's requiredCapability is no longer one of the room's capabilities. */
  | "CAPABILITY_CHANGED"
  | "OUTSIDE_WINDOW"
  | "CLOSED"
  | "CLASS_IN_SESSION"
  | "CAPACITY_INSUFFICIENT"
  /** Identical participant set + room + slots already active - a different request. */
  | "DUPLICATE_BOOKING"
  /** A participant already has an overlapping active booking in another room. */
  | "OVERLAPPING_BOOKING"
  /** Lock wait or transaction timeout: many people booking the same room at once. */
  | "BUSY"
  | "FAILED";

/** Untrusted "who is this booking for" input. The client names a Group; membership
 *  itself always comes from a live server-side GroupMember read, never from here. */
export type BookingParticipantSelection =
  | { kind: "SELF" }
  | {
      kind: "GROUP";
      groupId: string;
      /** Echo of the fingerprint the caller reviewed (see computeParticipantFingerprint).
       *  Missing or mismatched at confirm time -> GROUP_MEMBERSHIP_CHANGED, nothing created. */
      fingerprint?: string;
    };

/** Untrusted booking input (the confirm form). Only these fields are ever read. */
export interface RoomBookingInput {
  roomId?: unknown;
  date?: unknown;
  slots?: unknown;
  capability?: unknown;
  participants?: unknown;
}

export interface RoomBookingRequest {
  roomId: string;
  date: string; // "YYYY-MM-DD", Asia/Bangkok
  /** Non-empty, contiguous, in slot order. */
  slots: AcademicSlot[];
  participants: BookingParticipantSelection;
  /** From the finder: when present, the room must still have it (re-checked by Feature 3). */
  requiredCapability: RoomCapability | null;
}

export type BookingRequestOutcome = { ok: true; request: RoomBookingRequest } | { ok: false; error: BookingError };

function parseParticipantSelection(value: unknown): BookingParticipantSelection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "SELF") return { kind: "SELF" };
  if (record.kind === "GROUP") {
    if (typeof record.groupId !== "string" || record.groupId.length === 0 || record.groupId.length > 64) return null;
    const fingerprint = typeof record.fingerprint === "string" && record.fingerprint.length <= 4000 ? record.fingerprint : undefined;
    return { kind: "GROUP", groupId: record.groupId, fingerprint };
  }
  return null;
}

/**
 * The finder's rules (horizon today..+30, valid contiguous slots, not ended) plus:
 * at least one explicit slot, every slot still bookable (a running slot needs
 * BOOKING_MIN_MINUTES_BEFORE_SLOT_END left - a time rule only, the room must
 * separately be AVAILABLE under Feature 3), and a well-formed participant selection.
 * Party size is never taken from input - it is always derived from the resolved
 * participants (lib/room-booking.ts), 1 for SELF or the live group size for GROUP.
 */
export function validateBookingRequest(input: RoomBookingInput, clock: RoomFinderClock): BookingRequestOutcome {
  const source = input ?? {};
  if (typeof source.roomId !== "string" || source.roomId.length === 0 || source.roomId.length > 64) {
    return { ok: false, error: "INVALID_ROOM" };
  }
  const participants = parseParticipantSelection(source.participants);
  if (!participants) return { ok: false, error: "INVALID_PARTICIPANTS" };

  // validateRoomFinderQuery needs a numeric partySize structurally; date/slot/capability
  // validity never depends on its value, so a fixed placeholder is discarded below.
  const outcome = validateRoomFinderQuery(
    { date: source.date, slots: source.slots ?? [], partySize: 1, capability: source.capability },
    clock
  );
  if (!outcome.ok) return outcome;
  const { date, slots, capability } = outcome.query;
  // A booking is always for explicit slots; "no slot" is a search mode only.
  if (slots.length === 0) return { ok: false, error: "NO_SLOTS" };
  if (!slots.every((slot) => isSlotStillBookable(date, slot, clock.now))) return { ok: false, error: "SLOT_TOO_LATE" };
  return { ok: true, request: { roomId: source.roomId, date, slots, participants, requiredCapability: capability } };
}

/** Sorted, deduplicated, joined - the trip-wire compared between preview and confirm. */
export function computeParticipantFingerprint(userIds: readonly string[]): string {
  return [...new Set(userIds)].sort().join("|");
}

/** AUTO rooms confirm immediately; MANUAL rooms queue for an admin (Feature 8). */
export function bookingStatusForPolicy(policy: RoomApprovalPolicy): Extract<BookingStatus, "APPROVED" | "PENDING"> {
  return policy === "AUTO" ? "APPROVED" : "PENDING";
}

/** Feature 3 status -> why the booking cannot be made. null = AVAILABLE. */
export function bookingErrorForStatus(status: AvailabilityStatus): BookingError | null {
  switch (status) {
    case "AVAILABLE":
      return null;
    case "ROOM_INACTIVE":
    case "BOOKING_DISABLED":
    case "NOT_CONFIGURED_CAPABILITIES":
    case "NOT_CONFIGURED_CAPACITY":
      return "ROOM_NOT_BOOKABLE";
    case "CAPABILITY_MISMATCH":
      return "CAPABILITY_CHANGED";
    case "OUTSIDE_WINDOW":
      return "OUTSIDE_WINDOW";
    case "CLOSED":
      return "CLOSED";
    case "CLASS_IN_SESSION":
      return "CLASS_IN_SESSION";
    case "FULL":
      return "CAPACITY_INSUFFICIENT";
  }
}

/** One booking that touches at least one of the participants being checked. */
export interface ParticipantBookingRow {
  id: string;
  roomId: string;
  status: BookingStatus;
  slots: AcademicSlot[];
  /** ALL participants of this booking (not just the ones being checked), so an
   *  exact-set comparison for SAME is possible. */
  participantIds: string[];
}

export type ParticipantConflict =
  /** Every requested participant matches one existing active booking exactly (same
   *  room, same slot set, same participant set) - a resubmission, return it. */
  | { kind: "SAME"; bookingId: string; status: BookingStatus }
  /** The first conflicting participant found (deterministic, sorted order): same
   *  room + slot overlap = DUPLICATE; different room + slot overlap = OVERLAP. */
  | { kind: "CONFLICT"; userId: string; conflictKind: "DUPLICATE" | "OVERLAP"; bookingId: string };

/**
 * How a request relates to its participants' own active bookings that day. Checked
 * against a single batched query result (lib/room-booking.ts) - never one query per
 * participant. PENDING and APPROVED block; CANCELLED and REJECTED never do.
 */
export function classifyParticipantConflicts(
  request: { roomId: string; slots: readonly AcademicSlot[] },
  participantIds: readonly string[],
  rows: readonly ParticipantBookingRow[]
): ParticipantConflict | null {
  const active = rows.filter((row) => row.status === "PENDING" || row.status === "APPROVED");
  const requestedSlots = new Set(request.slots);
  const requestedParticipants = new Set(participantIds);

  const overlapsSlots = (row: ParticipantBookingRow) => row.slots.some((slot) => requestedSlots.has(slot));
  const sameSlotsExactly = (row: ParticipantBookingRow) =>
    row.slots.length === request.slots.length && row.slots.every((slot) => requestedSlots.has(slot));
  const sameParticipantsExactly = (row: ParticipantBookingRow) => {
    const rowSet = new Set(row.participantIds);
    return rowSet.size === requestedParticipants.size && [...rowSet].every((id) => requestedParticipants.has(id));
  };

  const same = active.find(
    (row) => row.roomId === request.roomId && sameSlotsExactly(row) && sameParticipantsExactly(row)
  );
  if (same) return { kind: "SAME", bookingId: same.id, status: same.status };

  for (const userId of [...participantIds].sort()) {
    const conflict = active.find((row) => row.participantIds.includes(userId) && overlapsSlots(row));
    if (conflict) {
      return { kind: "CONFLICT", userId, conflictKind: conflict.roomId === request.roomId ? "DUPLICATE" : "OVERLAP", bookingId: conflict.id };
    }
  }
  return null;
}

/** Audit details for ROOM_BOOKING_CREATED. IDs and codes only - no names, emails or
 *  free text, and never lists individual participant user ids (the participant rows
 *  themselves are the durable record of who's covered). */
export function bookingCreatedLogDetails(input: {
  bookingId: string;
  date: string;
  slots: readonly AcademicSlot[];
  participantCount: number;
  source: BookingParticipantSource;
  policy: RoomApprovalPolicy;
  status: BookingStatus;
}): string {
  const slots = [...input.slots].sort((a, b) => getSlotDefinition(a).order - getSlotDefinition(b).order);
  return `booking ${input.bookingId} ${input.date} ${slots.join(",")} participants=${input.participantCount} source=${input.source} policy=${input.policy} status=${input.status}`;
}

// --- Dashboard "การจองของฉัน" (compact; the full list is Feature 7b) ------------------

/** How many active bookings the dashboard shows. */
export const DASHBOARD_BOOKINGS_LIMIT = 3;

/** One of the viewer's own active (PENDING/APPROVED) bookings, from RoomBooking +
 *  RoomBookingSlot. The viewer may be the creator or any other participant. */
export interface DashboardBooking {
  id: string;
  status: Extract<BookingStatus, "APPROVED" | "PENDING">;
  date: string; // "YYYY-MM-DD", Asia/Bangkok
  partySize: number;
  roomCode: string;
  roomName: string;
  slots: AcademicSlot[]; // in slot order
  startAt: string; // ISO instant: first slot's stored start
  endAt: string; // ISO instant: last slot's stored end
  /** True when the viewer made this booking; false when they're an authorized
   *  participant added via a Group someone else booked with. */
  isCreator: boolean;
  /** The creator's display name - shown only when the viewer is not the creator. */
  creatorName: string;
}

export interface DashboardBookingCard {
  id: string;
  href: string;
  roomCode: string;
  roomName: string;
  date: string;
  slotLabel: string; // "คาบ 2–3"
  timeLabel: string; // "12:00–16:50", from the stored instants in Asia/Bangkok
  partySizeLabel: string;
  status: DashboardBooking["status"];
  statusLabel: string;
  /** PENDING only: says plainly that nothing is confirmed yet. */
  note: string | null;
  /** "จองโดย {name}" when the viewer is not the creator; null when they are. */
  creatorLine: string | null;
}

export const PENDING_BOOKING_NOTE = "ยังไม่ได้รับสิทธิ์เข้าใช้ห้องจนกว่าจะได้รับการอนุมัติ";

function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ACADEMIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function slotListLabel(slots: readonly AcademicSlot[]): string {
  if (slots.length === 0) return "";
  const first = getSlotDefinition(slots[0]);
  const last = getSlotDefinition(slots[slots.length - 1]);
  return slots.length === 1 ? getSlotShortLabel(slots[0]) : `${first.label}–${last.order}`;
}

export function toDashboardBookingCard(booking: DashboardBooking): DashboardBookingCard {
  const approved = booking.status === "APPROVED";
  return {
    id: booking.id,
    href: `/bookings/${encodeURIComponent(booking.id)}`,
    roomCode: booking.roomCode,
    roomName: booking.roomName,
    date: booking.date,
    slotLabel: slotListLabel(booking.slots),
    timeLabel: `${bangkokTime(booking.startAt)}–${bangkokTime(booking.endAt)}`,
    partySizeLabel: `${booking.partySize} คน`,
    status: booking.status,
    statusLabel: approved ? "จองแล้ว" : "รออนุมัติ",
    note: approved ? null : PENDING_BOOKING_NOTE,
    creatorLine: booking.isCreator ? null : `จองโดย ${booking.creatorName}`,
  };
}
