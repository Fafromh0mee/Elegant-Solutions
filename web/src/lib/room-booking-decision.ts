import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import {
  BOOKING_ROOM_SELECT,
  evaluateRoom,
  findGuestRoomConflict,
  findIneligibleParticipant,
  loadActiveBookingsForParticipants,
  loadParticipantEligibility,
} from "@/lib/room-booking";
import { isContentionError, lockForBooking } from "@/lib/room-booking-locks";
import {
  bookingDecisionLogDetails,
  bookingErrorForStatus,
  classifyParticipantConflicts,
  parseDecisionNote,
  type BookingDecision,
  type BookingDecisionError,
} from "@/lib/room-booking-rules";
import type { AcademicSlot, BookingStatus, Role } from "@/lib/types";

// Feature 8: an admin approves or rejects a PENDING booking. Server-only, deliberately
// NOT "use server" (actions/room-booking-admin.ts wraps it).
//
// One transaction, under the shared booking lock order (lib/room-booking-locks.ts):
// participant USER locks sorted ascending, then ROOM+DATE last - the same order
// creation uses, so a decision can never deadlock against a booking attempt.
//
// PENDING never consumes capacity, so an approval is decided against CURRENT state,
// never against what was true when the request was made: live participant
// eligibility, participant overlap (excluding this booking) and the Feature 3
// evaluator are all re-run under the locks. Two pending requests competing for the
// last seats serialize on the room+date lock; the second sees the first as APPROVED.
//
// The status flip itself is a conditional UPDATE ... WHERE status = 'PENDING'. The
// locks already serialize approve/approve and approve/reject; the condition is the
// final guard (e.g. against a future writer that forgets the locks). A non-PENDING
// booking is never mutated and never logged, so a repeated or losing decision
// leaves exactly one audit row.

export type DecideRoomBookingResult =
  | { ok: true; status: Extract<BookingStatus, "APPROVED" | "REJECTED"> }
  | {
      ok: false;
      error: BookingDecisionError;
      /** NOT_PENDING: what the booking already is. */
      currentStatus?: BookingStatus;
      remainingCapacity?: number;
      participantName?: string;
    };

type TerminalDecision = Extract<BookingStatus, "APPROVED" | "REJECTED">;

export async function decideRoomBooking(params: {
  bookingId: unknown;
  /** Always the session user - re-checked against the database inside the transaction. */
  deciderId: string;
  decision: BookingDecision;
  note?: unknown;
  now: Date;
}): Promise<DecideRoomBookingResult> {
  const { bookingId, deciderId, decision, now } = params;
  if (typeof bookingId !== "string" || bookingId.length === 0 || bookingId.length > 64) {
    return { ok: false, error: "BOOKING_NOT_FOUND" };
  }
  const parsedNote = decision === "REJECT" ? parseDecisionNote(params.note) : { ok: true as const, note: null };
  if (!parsedNote.ok) return { ok: false, error: "INVALID_NOTE" };
  const note = parsedNote.note;

  try {
    return await prisma.$transaction(
      async (tx): Promise<DecideRoomBookingResult> => {
        const decider = await tx.user.findUnique({ where: { id: deciderId }, select: { role: true } });
        if (!decider || !isAdminRole(decider.role as Role)) return { ok: false, error: "NOT_ALLOWED" };

        // Lock keys only. roomId, date and the participant snapshot never change after
        // creation, so reading them before the locks is safe; status is re-read after.
        const keys = await tx.roomBooking.findUnique({
          where: { id: bookingId },
          select: { roomId: true, userId: true, date: true, status: true, participants: { select: { userId: true } } },
        });
        if (!keys) return { ok: false, error: "BOOKING_NOT_FOUND" };
        // Terminal states never return to PENDING: no need to lock just to say no.
        if (keys.status !== "PENDING") return { ok: false, error: "NOT_PENDING", currentStatus: keys.status as BookingStatus };

        const date = keys.date.toISOString().slice(0, 10);
        const participantIds = keys.participants.map((p) => p.userId);
        await lockForBooking(tx, [...participantIds, keys.userId], keys.roomId, date);

        const booking = await tx.roomBooking.findUniqueOrThrow({
          where: { id: bookingId },
          select: {
            status: true,
            partySize: true,
            slots: { select: { slot: true, startAt: true, endAt: true }, orderBy: { startAt: "asc" } },
          },
        });
        if (booking.status !== "PENDING") {
          return { ok: false, error: "NOT_PENDING", currentStatus: booking.status as BookingStatus };
        }
        const slots = booking.slots.map((entry) => entry.slot as AcademicSlot);

        if (decision === "APPROVE") {
          const blocked = await findApprovalBlocker(tx, {
            bookingId,
            roomId: keys.roomId,
            date,
            slots,
            lastEndAt: booking.slots.at(-1)?.endAt ?? null,
            partySize: booking.partySize,
            participantIds,
            now,
          });
          if (blocked) return blocked;
        }

        const status: TerminalDecision = decision === "APPROVE" ? "APPROVED" : "REJECTED";
        const updated = await tx.roomBooking.updateMany({
          where: { id: bookingId, status: "PENDING" },
          data: { status, decidedById: deciderId, decidedAt: now, decisionReason: note },
        });
        if (updated.count !== 1) {
          const current = await tx.roomBooking.findUnique({ where: { id: bookingId }, select: { status: true } });
          return { ok: false, error: "NOT_PENDING", currentStatus: current?.status as BookingStatus | undefined };
        }

        await tx.log.create({
          data: {
            action: status === "APPROVED" ? "ROOM_BOOKING_APPROVED" : "ROOM_BOOKING_REJECTED",
            userId: deciderId,
            roomId: keys.roomId,
            details: bookingDecisionLogDetails({
              bookingId,
              date,
              slots,
              decision: status,
              participantCount: participantIds.length,
              hasNote: note !== null,
            }),
          },
        });

        return { ok: true, status };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
  } catch (error) {
    if (isContentionError(error)) return { ok: false, error: "BUSY" };
    console.error("Room booking decision failed:", error);
    return { ok: false, error: "FAILED" };
  }
}

type Tx = Prisma.TransactionClient;

/** Why this PENDING booking cannot be approved right now; null = approvable. Runs under the locks. */
async function findApprovalBlocker(
  tx: Tx,
  input: {
    bookingId: string;
    roomId: string;
    date: string;
    slots: AcademicSlot[];
    lastEndAt: Date | null;
    partySize: number;
    participantIds: string[];
    now: Date;
  }
): Promise<Extract<DecideRoomBookingResult, { ok: false }> | null> {
  if (!input.lastEndAt || input.lastEndAt.getTime() <= input.now.getTime()) {
    return { ok: false, error: "BOOKING_EXPIRED" };
  }

  const room = await tx.room.findUnique({ where: { id: input.roomId }, select: BOOKING_ROOM_SELECT });
  if (!room) return { ok: false, error: "FAILED" };

  // Live eligibility, same rule as creation: an account rejected or demoted since the
  // request was made must not gain room access through an approval.
  const eligibility = await loadParticipantEligibility(tx, input.participantIds);
  const ineligible = findIneligibleParticipant(eligibility);
  if (ineligible) return { ok: false, error: "INELIGIBLE_PARTICIPANT", participantName: ineligible.name };
  const guestConflict = findGuestRoomConflict(eligibility, room);
  if (guestConflict) return { ok: false, error: "GUEST_ROOM_NOT_ALLOWED", participantName: guestConflict.name };

  const rows = (await loadActiveBookingsForParticipants(tx, input.participantIds, input.date)).filter(
    (row) => row.id !== input.bookingId
  );
  const conflict = classifyParticipantConflicts({ roomId: input.roomId, slots: input.slots }, input.participantIds, rows);
  if (conflict?.kind === "SAME") return { ok: false, error: "DUPLICATE_BOOKING" };
  if (conflict?.kind === "CONFLICT") {
    return {
      ok: false,
      error: conflict.conflictKind === "DUPLICATE" ? "DUPLICATE_BOOKING" : "OVERLAPPING_BOOKING",
      participantName: eligibility.find((row) => row.userId === conflict.userId)?.name,
    };
  }

  // This booking is PENDING, so the evaluator's capacity (APPROVED only) excludes it.
  const result = await evaluateRoom(tx, room, { date: input.date, slots: input.slots, requiredCapability: null }, input.partySize);
  if (!result) return { ok: false, error: "FAILED" };
  const availabilityError = bookingErrorForStatus(result.status);
  if (availabilityError) {
    return {
      ok: false,
      error: availabilityError as BookingDecisionError,
      ...(result.status === "FULL" ? { remainingCapacity: result.remainingCapacity } : {}),
    };
  }
  return null;
}
