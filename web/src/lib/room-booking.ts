import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange, toAcademicDateString } from "@/lib/academic-slots";
import {
  evaluateAvailability,
  validateAvailabilityRequest,
  type AvailabilityRoom,
  type RoomAvailabilityResult,
} from "@/lib/availability";
import { loadRoomAvailabilityContexts, ROOM_SELECT } from "@/lib/availability-context";
import { canBookRoom, isGuestEligibleRoom } from "@/lib/permissions";
import {
  bookingCreatedLogDetails,
  bookingErrorForStatus,
  bookingStatusForPolicy,
  classifyParticipantConflicts,
  computeParticipantFingerprint,
  DASHBOARD_BOOKINGS_LIMIT,
  validateBookingRequest,
  type BookingError,
  type BookingParticipantSelection,
  type DashboardBooking,
  type ParticipantBookingRow,
  type RoomBookingInput,
} from "@/lib/room-booking-rules";
import {
  handoffSearchQuery,
  parseBookingHandoff,
  ROOM_FINDER_PATH,
  roomFinderHref,
  type RoomBookingHandoff,
} from "@/lib/room-finder";
import type {
  AcademicSlot,
  AccountStatus,
  BookingParticipantSource,
  BookingStatus,
  Role,
  RoomApprovalPolicy,
  RoomCapability,
} from "@/lib/types";

// Feature 7 / 7.5 booking creation - the ONE code path that writes a RoomBooking.
// Server-only, deliberately NOT "use server" (actions/room-booking.ts wraps it).
//
// Solo and group bookings share this single function. "Solo" is just the one-
// participant case of the same participant-resolution / locking / eligibility /
// overlap / Feature 3 flow group bookings use - there is no separate code path to
// keep in sync.
//
// Everything is decided inside one transaction, under advisory locks taken in ONE
// fixed order everywhere (Feature 7b cancellation and Feature 8 approval must use
// the same order when they need locks):
//   1. USER lock(s), one per participant, ALWAYS acquired in ascending sorted user-id
//      order - this total order is what makes concurrent bookings with overlapping
//      participant sets deadlock-free, generalizing the old creator-only lock.
//   2. ROOM + DATE lock, always last.
// Then: re-read every participant's role/status, re-check guest eligibility against
// the room, check every participant's own active bookings, re-run the SAME Feature 3
// evaluator with the transaction client, and only then insert. READ COMMITTED is
// enough: every statement after the locks sees what the previous lock holder
// committed.
//
// A booking is a reservation only: no Session, AccessToken, check-in or gate unlock.
// Group membership (GroupMember) is read live exactly ONCE per booking attempt, to
// resolve WHO the booking is for; it is never read again once a RoomBookingParticipant
// row exists - later Group edits never retroactively change what an existing booking
// authorizes.

const USER_LOCK_NAMESPACE = "room-booking:user";
const ROOM_LOCK_NAMESPACE = "room-booking:room";

/** Takes one advisory lock per participant, sorted ascending, then the room+date lock
 *  last. Released automatically at commit/rollback. Sequential, never Promise.all -
 *  concurrency safety depends on lock acquisition actually happening in this order. */
async function lockForBooking(tx: Prisma.TransactionClient, userIds: readonly string[], roomId: string, date: string) {
  // Waiting longer means heavy contention; fail with BUSY instead of hanging the request.
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which cannot be deserialized.
  for (const userId of [...userIds].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${USER_LOCK_NAMESPACE}), hashtext(${userId}))`;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ROOM_LOCK_NAMESPACE}), hashtext(${`${roomId}:${date}`}))`;
}

/** Lock timeout (55P03), deadlock (40P01), or a transaction that could not start/finish in time. */
function isContentionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2028" || error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return detail.includes("55P03") || detail.includes("40P01");
}

/** "YYYY-MM-DD" (Bangkok calendar date) -> the DATE value Postgres stores. */
function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

const BOOKING_ROOM_SELECT = { ...ROOM_SELECT, guestAccess: true, staffOnly: true } satisfies Prisma.RoomSelect;

type BookingRoom = Prisma.RoomGetPayload<{ select: typeof BOOKING_ROOM_SELECT }>;

function toAvailabilityRoom(room: BookingRoom): AvailabilityRoom {
  return {
    id: room.id,
    roomCode: room.roomCode,
    name: room.name,
    isActive: room.isActive,
    bookingEnabled: room.bookingEnabled,
    approvalPolicy: room.approvalPolicy as RoomApprovalPolicy,
    capabilities: room.capabilities as RoomCapability[],
    capacity: room.capacity,
    building: room.building,
    floor: room.floor,
  };
}

/** Feature 3, unchanged: the same loader and evaluator as the finder, on the given client. */
async function evaluateRoom(
  db: Prisma.TransactionClient,
  room: BookingRoom,
  request: { date: string; slots: AcademicSlot[]; requiredCapability: RoomCapability | null },
  partySize: number
): Promise<RoomAvailabilityResult | null> {
  const validated = validateAvailabilityRequest({
    date: request.date,
    slots: request.slots,
    partySize,
    requiredCapability: request.requiredCapability ?? undefined,
  });
  if (!validated.ok) return null;
  const availabilityRoom = toAvailabilityRoom(room);
  const [context] = await loadRoomAvailabilityContexts([availabilityRoom], validated.request, db);
  return evaluateAvailability(context, validated.request);
}

async function loadActiveBookingsForParticipants(
  db: Prisma.TransactionClient,
  userIds: readonly string[],
  date: string
): Promise<ParticipantBookingRow[]> {
  const rows = await db.roomBooking.findMany({
    where: {
      date: toDateColumn(date),
      status: { in: ["PENDING", "APPROVED"] },
      participants: { some: { userId: { in: [...userIds] } } },
    },
    select: {
      id: true,
      roomId: true,
      status: true,
      slots: { select: { slot: true } },
      // ALL participants of each candidate booking (not filtered to our ids), so an
      // exact-set comparison for "SAME" is possible - see classifyParticipantConflicts.
      participants: { select: { userId: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    roomId: row.roomId,
    status: row.status as BookingStatus,
    slots: row.slots.map((entry) => entry.slot as AcademicSlot),
    participantIds: row.participants.map((entry) => entry.userId),
  }));
}

// --- Participant resolution ------------------------------------------------------

interface ResolvedParticipant {
  userId: string;
  source: BookingParticipantSource;
  groupId: string | null;
}

type ResolveParticipantsResult =
  | { ok: true; participants: ResolvedParticipant[] }
  | { ok: false; error: BookingError };

/**
 * Turns a client's participant selection into the actual list of user ids a booking
 * authorizes. For GROUP, this is the ONE place GroupMember is read for this booking:
 * read once here, never again once the booking exists (see module doc comment).
 *
 * The creator is always included (defensively, even though createGroupAction already
 * adds the owner as the group's first member).
 */
async function resolveParticipants(
  db: Prisma.TransactionClient,
  creatorId: string,
  selection: BookingParticipantSelection
): Promise<ResolveParticipantsResult> {
  if (selection.kind === "SELF") {
    return { ok: true, participants: [{ userId: creatorId, source: "SELF", groupId: null }] };
  }

  const group = await db.group.findUnique({ where: { id: selection.groupId }, select: { id: true, ownerId: true } });
  if (!group) return { ok: false, error: "GROUP_NOT_FOUND" };
  if (group.ownerId !== creatorId) return { ok: false, error: "NOT_GROUP_OWNER" };

  const members = await db.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true } });
  const participantIds = new Set(members.map((member) => member.userId));
  participantIds.add(creatorId);

  const sortedIds = [...participantIds];
  const fingerprint = computeParticipantFingerprint(sortedIds);
  // The fingerprint the client echoes back is what they actually reviewed; a mismatch
  // (or a missing one - e.g. confirming without ever previewing) fails closed rather
  // than silently booking a roster the user never saw.
  if (!selection.fingerprint || selection.fingerprint !== fingerprint) {
    return { ok: false, error: "GROUP_MEMBERSHIP_CHANGED" };
  }

  return {
    ok: true,
    participants: sortedIds.map((userId) => ({ userId, source: "GROUP", groupId: group.id })),
  };
}

interface ParticipantEligibility {
  userId: string;
  name: string;
  role: Role;
  status: AccountStatus;
}

async function loadParticipantEligibility(
  db: Prisma.TransactionClient,
  userIds: readonly string[]
): Promise<ParticipantEligibility[]> {
  const rows = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, role: true, status: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return userIds.map((userId) => {
    const row = byId.get(userId);
    return { userId, name: row?.name ?? "", role: (row?.role as Role) ?? "GUEST", status: (row?.status as AccountStatus) ?? "REJECTED" };
  });
}

/** First ineligible participant (STUDENT / approved-GUEST only), sorted for determinism. */
function findIneligibleParticipant(rows: readonly ParticipantEligibility[]): ParticipantEligibility | null {
  return [...rows].sort((a, b) => a.userId.localeCompare(b.userId)).find((row) => !canBookRoom(row.role, row.status)) ?? null;
}

/** First GUEST participant, when the room does not allow guests at all. */
function findGuestRoomConflict(rows: readonly ParticipantEligibility[], room: BookingRoom): ParticipantEligibility | null {
  if (isGuestEligibleRoom(room)) return null;
  return [...rows].sort((a, b) => a.userId.localeCompare(b.userId)).find((row) => row.role === "GUEST") ?? null;
}

// --- Create --------------------------------------------------------------------

export type CreateRoomBookingResult =
  | {
      ok: true;
      bookingId: string;
      status: Extract<BookingStatus, "APPROVED" | "PENDING">;
      /** An identical active booking already existed (double submit / resend) and was returned. */
      reused: boolean;
    }
  | { ok: false; error: BookingError; remainingCapacity?: number; participantName?: string };

/**
 * Creates a booking for `userId` (always from the session, never from input). For a
 * GROUP selection, participant identities always come from a live GroupMember read
 * inside this transaction - never from the client. Never throws; database failures
 * become FAILED or BUSY.
 */
export async function createRoomBooking(params: {
  userId: string;
  input: RoomBookingInput;
  now: Date;
}): Promise<CreateRoomBookingResult> {
  const { userId: creatorId, now } = params;
  const validated = validateBookingRequest(params.input, { today: toAcademicDateString(now), now });
  if (!validated.ok) return validated;
  const request = validated.request;

  try {
    return await prisma.$transaction(
      async (tx): Promise<CreateRoomBookingResult> => {
        const resolved = await resolveParticipants(tx, creatorId, request.participants);
        if (!resolved.ok) return { ok: false, error: resolved.error };
        const participantIds = resolved.participants.map((p) => p.userId);
        const effectivePartySize = resolved.participants.length;

        await lockForBooking(tx, participantIds, request.roomId, request.date);

        const room = await tx.room.findUnique({ where: { id: request.roomId }, select: BOOKING_ROOM_SELECT });
        if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };

        // Authoritative role/status for every participant: a session, or an earlier
        // group-member read, may predate a demotion, rejection or account change.
        const eligibility = await loadParticipantEligibility(tx, participantIds);
        const ineligible = findIneligibleParticipant(eligibility);
        if (ineligible) {
          return ineligible.userId === creatorId
            ? { ok: false, error: "NOT_ALLOWED" }
            : { ok: false, error: "INELIGIBLE_PARTICIPANT", participantName: ineligible.name };
        }
        const guestConflict = findGuestRoomConflict(eligibility, room);
        if (guestConflict) {
          return {
            ok: false,
            error: "GUEST_ROOM_NOT_ALLOWED",
            ...(guestConflict.userId !== creatorId ? { participantName: guestConflict.name } : {}),
          };
        }

        const rows = await loadActiveBookingsForParticipants(tx, participantIds, request.date);
        const conflict = classifyParticipantConflicts(request, participantIds, rows);
        if (conflict?.kind === "SAME") {
          return { ok: true, bookingId: conflict.bookingId, status: conflict.status as "APPROVED" | "PENDING", reused: true };
        }
        if (conflict?.kind === "CONFLICT") {
          const name = eligibility.find((row) => row.userId === conflict.userId)?.name;
          return {
            ok: false,
            error: conflict.conflictKind === "DUPLICATE" ? "DUPLICATE_BOOKING" : "OVERLAPPING_BOOKING",
            ...(conflict.userId !== creatorId && name ? { participantName: name } : {}),
          };
        }

        const result = await evaluateRoom(tx, room, request, effectivePartySize);
        if (!result) return { ok: false, error: "FAILED" };
        const availabilityError = bookingErrorForStatus(result.status);
        if (availabilityError) {
          return {
            ok: false,
            error: availabilityError,
            ...(result.status === "FULL" ? { remainingCapacity: result.remainingCapacity } : {}),
          };
        }

        const policy = room.approvalPolicy as RoomApprovalPolicy;
        const status = bookingStatusForPolicy(policy);
        const booking = await tx.roomBooking.create({
          data: {
            roomId: room.id,
            userId: creatorId,
            date: toDateColumn(request.date),
            partySize: effectivePartySize,
            status,
            // APPROVED with no decider = auto-approved under an AUTO room (schema convention).
            decidedAt: status === "APPROVED" ? now : null,
            slots: {
              create: request.slots.map((slot) => ({ slot, ...resolveSlotRange(request.date, slot) })),
            },
            participants: { create: resolved.participants },
          },
          select: { id: true },
        });

        await tx.log.create({
          data: {
            action: "ROOM_BOOKING_CREATED",
            userId: creatorId,
            roomId: room.id,
            details: bookingCreatedLogDetails({
              bookingId: booking.id,
              date: request.date,
              slots: request.slots,
              participantCount: effectivePartySize,
              source: request.participants.kind,
              policy,
              status,
            }),
          },
        });

        return { ok: true, bookingId: booking.id, status, reused: false };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
  } catch (error) {
    if (isContentionError(error)) return { ok: false, error: "BUSY" };
    console.error("Room booking failed:", error);
    return { ok: false, error: "FAILED" };
  }
}

// --- Review (read-only, before confirming) ---------------------------------------

export interface BookingReviewRoom {
  id: string;
  roomCode: string;
  name: string;
  building: string | null;
  floor: number | null;
  capacity: number;
  capabilities: RoomCapability[];
  approvalPolicy: RoomApprovalPolicy;
}

export type BookingReviewState =
  | { kind: "NOT_ALLOWED" }
  /** The link/selection itself is unusable (bad input, missing room/group, not owned, stale). */
  | { kind: "INVALID"; error: BookingError; backHref: string; participantName?: string }
  | {
      kind: "READY";
      handoff: RoomBookingHandoff;
      /** Which mode this preview reflects. For GROUP, `fingerprint` is already embedded
       *  here (the member set just read) - the confirm form submits this value verbatim,
       *  so the trip-wire check in resolveParticipants always has something to compare. */
      participants: BookingParticipantSelection;
      /** The effective, authoritative count for this mode: 1 for SELF, live member count for GROUP. */
      participantCount: number;
      /** GROUP only: for display ("เลือกกลุ่ม: Project Team A"). */
      groupName?: string;
      room: BookingReviewRoom;
      /** Seats still bookable for `participantCount`, from Feature 3 (APPROVED bookings only). */
      remainingCapacity: number;
      /** Why it cannot be booked right now; null = can confirm. Re-checked on confirm anyway. */
      blocked: BookingError | null;
      /** A participant's name, when `blocked` concerns someone other than the viewer. */
      blockedParticipantName?: string;
      /** The viewer already holds this exact booking (same room/slots/participants). */
      existing: { kind: "SAME"; bookingId: string } | null;
      /** "แก้ไขการค้นหา": back to the finder with this search. */
      backHref: string;
    };

/**
 * The booking review page's data. Everything shown comes from a fresh server read;
 * the URL only says which room/date/slots were asked for, and `participants` says
 * which mode to preview (SELF by default, or GROUP for the "จองสำหรับ" toggle). This
 * is read-only - confirmation re-checks all of it under the locks, including a fresh
 * GroupMember read and fingerprint comparison for GROUP.
 */
export async function loadBookingReview(params: {
  viewer: { userId: string; role: Role; status: AccountStatus | null | undefined };
  roomId: string;
  searchParams: Record<string, string | string[] | undefined>;
  now: Date;
  participants?: BookingParticipantSelection;
}): Promise<BookingReviewState> {
  const { viewer, now } = params;
  if (!canBookRoom(viewer.role, viewer.status)) return { kind: "NOT_ALLOWED" };

  const clock = { today: toAcademicDateString(now), now };
  const parsed = parseBookingHandoff(params.roomId, params.searchParams, clock);
  if (!parsed.ok) return { kind: "INVALID", error: parsed.error, backHref: ROOM_FINDER_PATH };
  const handoff = parsed.handoff;
  const backHref = roomFinderHref(handoffSearchQuery(handoff));
  const selection: BookingParticipantSelection = params.participants ?? { kind: "SELF" };

  const validated = validateBookingRequest(
    {
      roomId: handoff.roomId,
      date: handoff.date,
      slots: handoff.slots,
      capability: handoff.requiredCapability,
      participants: selection,
    },
    clock
  );
  if (!validated.ok) return { kind: "INVALID", error: validated.error, backHref };

  let groupName: string | undefined;
  let participantIds: string[];
  let fingerprint: string | undefined;
  if (selection.kind === "SELF") {
    participantIds = [viewer.userId];
  } else {
    const group = await prisma.group.findUnique({ where: { id: selection.groupId }, select: { id: true, ownerId: true, name: true } });
    if (!group) return { kind: "INVALID", error: "GROUP_NOT_FOUND", backHref };
    if (group.ownerId !== viewer.userId) return { kind: "INVALID", error: "NOT_GROUP_OWNER", backHref };
    const members = await prisma.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true } });
    const ids = new Set(members.map((member) => member.userId));
    ids.add(viewer.userId);
    participantIds = [...ids];
    fingerprint = computeParticipantFingerprint(participantIds);
    groupName = group.name;
  }
  const participantCount = participantIds.length;

  const room = await prisma.room.findUnique({ where: { id: handoff.roomId }, select: BOOKING_ROOM_SELECT });
  if (!room) return { kind: "INVALID", error: "ROOM_NOT_FOUND", backHref };

  const eligibility = await loadParticipantEligibility(prisma, participantIds);
  const ineligible = findIneligibleParticipant(eligibility);
  const guestConflict = findGuestRoomConflict(eligibility, room);

  const [result, rows] = await Promise.all([
    evaluateRoom(prisma, room, validated.request, participantCount),
    loadActiveBookingsForParticipants(prisma, participantIds, handoff.date),
  ]);
  if (!result) return { kind: "INVALID", error: "FAILED", backHref };

  const conflict = classifyParticipantConflicts(validated.request, participantIds, rows);
  const conflictName = conflict?.kind === "CONFLICT" ? eligibility.find((row) => row.userId === conflict.userId)?.name : undefined;

  const blocked: BookingError | null = ineligible
    ? ineligible.userId === viewer.userId
      ? "NOT_ALLOWED"
      : "INELIGIBLE_PARTICIPANT"
    : guestConflict
      ? "GUEST_ROOM_NOT_ALLOWED"
      : conflict?.kind === "CONFLICT"
        ? conflict.conflictKind === "DUPLICATE"
          ? "DUPLICATE_BOOKING"
          : "OVERLAPPING_BOOKING"
        : bookingErrorForStatus(result.status);

  const blockedParticipantName = ineligible
    ? ineligible.userId !== viewer.userId
      ? ineligible.name
      : undefined
    : guestConflict
      ? guestConflict.userId !== viewer.userId
        ? guestConflict.name
        : undefined
      : conflict?.kind === "CONFLICT" && conflict.userId !== viewer.userId
        ? conflictName
        : undefined;

  // GROUP selections carry the just-computed fingerprint from here on, so the confirm
  // form always echoes back exactly what this preview showed (see resolveParticipants).
  const outgoingSelection: BookingParticipantSelection =
    selection.kind === "GROUP" ? { kind: "GROUP", groupId: selection.groupId, fingerprint } : selection;

  return {
    kind: "READY",
    handoff,
    participants: outgoingSelection,
    participantCount,
    ...(groupName ? { groupName } : {}),
    room: {
      id: room.id,
      roomCode: room.roomCode,
      name: room.name,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      capabilities: room.capabilities as RoomCapability[],
      approvalPolicy: room.approvalPolicy as RoomApprovalPolicy,
    },
    remainingCapacity: result.remainingCapacity,
    blocked: conflict?.kind === "SAME" ? null : blocked,
    ...(blockedParticipantName ? { blockedParticipantName } : {}),
    existing: conflict?.kind === "SAME" ? { kind: "SAME", bookingId: conflict.bookingId } : null,
    backHref,
  };
}

// --- Result page ------------------------------------------------------------------

export interface BookingParticipantView {
  userId: string;
  name: string;
  /** A useful existing identity label, when one applies (e.g. a STUDENT's studentId). */
  identityLabel: string | null;
  isCreator: boolean;
}

export interface OwnBooking {
  id: string;
  status: BookingStatus;
  date: string;
  partySize: number;
  createdAt: string;
  slots: Array<{ slot: AcademicSlot; startAt: string; endAt: string }>;
  room: BookingReviewRoom;
  /** Read-only roster: who this booking authorizes. Always includes the creator. */
  participants: BookingParticipantView[];
  creatorName: string;
}

/**
 * A booking viewable by any of its participants (creator or otherwise) - not just the
 * creator. A booking id the viewer does not participate in returns null, exactly like
 * a missing one, so ids cannot be probed.
 */
export async function getOwnBooking(bookingId: string, userId: string): Promise<OwnBooking | null> {
  if (typeof bookingId !== "string" || bookingId.length === 0 || bookingId.length > 64) return null;
  const booking = await prisma.roomBooking.findFirst({
    where: { id: bookingId, participants: { some: { userId } } },
    select: {
      id: true,
      status: true,
      date: true,
      partySize: true,
      createdAt: true,
      userId: true,
      slots: { select: { slot: true, startAt: true, endAt: true }, orderBy: { startAt: "asc" } },
      room: {
        select: {
          id: true,
          roomCode: true,
          name: true,
          building: true,
          floor: true,
          capacity: true,
          capabilities: true,
          approvalPolicy: true,
        },
      },
      participants: {
        select: { userId: true, user: { select: { name: true, studentId: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!booking) return null;

  const creator = booking.participants.find((p) => p.userId === booking.userId);
  return {
    id: booking.id,
    status: booking.status as BookingStatus,
    date: booking.date.toISOString().slice(0, 10),
    partySize: booking.partySize,
    createdAt: booking.createdAt.toISOString(),
    slots: booking.slots.map((entry) => ({
      slot: entry.slot as AcademicSlot,
      startAt: entry.startAt.toISOString(),
      endAt: entry.endAt.toISOString(),
    })),
    room: {
      ...booking.room,
      capabilities: booking.room.capabilities as RoomCapability[],
      approvalPolicy: booking.room.approvalPolicy as RoomApprovalPolicy,
    },
    participants: booking.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      identityLabel: p.user.role === "STUDENT" ? p.user.studentId : null,
      isCreator: p.userId === booking.userId,
    })),
    creatorName: creator?.user.name ?? "",
  };
}

// --- Dashboard "การจองของฉัน" ------------------------------------------------------

/**
 * The viewer's own PENDING/APPROVED bookings that are current or upcoming (a slot has
 * not ended yet), earliest first, at most `limit`. The viewer may be the creator or
 * any other participant (e.g. added via a Group someone else booked with). null =
 * hide the section: not a booking user (STUDENT / approved GUEST), or nothing to show.
 * `userId` must be the session user - it is never taken from client input.
 */
export async function loadDashboardBookings(params: {
  viewer: { userId: string; role: Role; status: AccountStatus | null | undefined };
  now: Date;
  limit?: number;
}): Promise<DashboardBooking[] | null> {
  const { viewer, now } = params;
  if (!canBookRoom(viewer.role, viewer.status)) return null;

  const rows = await prisma.roomBooking.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      // Bangkok today or later (DATE column), and not entirely over.
      date: { gte: toDateColumn(toAcademicDateString(now)) },
      slots: { some: { endAt: { gt: now } } },
      participants: { some: { userId: viewer.userId } },
    },
    select: {
      id: true,
      status: true,
      date: true,
      partySize: true,
      userId: true,
      user: { select: { name: true } },
      room: { select: { roomCode: true, name: true } },
      slots: { select: { slot: true, startAt: true, endAt: true }, orderBy: { startAt: "asc" } },
    },
    // Bookings are bounded by the 30-day horizon; order precisely by first slot below.
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 50,
  });

  const bookings: DashboardBooking[] = rows
    .filter((row) => row.slots.length > 0)
    .map((row) => ({
      id: row.id,
      status: row.status as DashboardBooking["status"],
      date: row.date.toISOString().slice(0, 10),
      partySize: row.partySize,
      roomCode: row.room.roomCode,
      roomName: row.room.name,
      slots: row.slots.map((entry) => entry.slot as AcademicSlot),
      startAt: row.slots[0].startAt.toISOString(),
      endAt: row.slots[row.slots.length - 1].endAt.toISOString(),
      isCreator: row.userId === viewer.userId,
      creatorName: row.user.name,
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id))
    .slice(0, params.limit ?? DASHBOARD_BOOKINGS_LIMIT);

  return bookings.length > 0 ? bookings : null;
}
