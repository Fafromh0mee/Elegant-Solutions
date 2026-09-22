"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canBookRoom } from "@/lib/permissions";
import { createRoomBooking, loadBookingReview, type BookingReviewState } from "@/lib/room-booking";
import type { BookingError, BookingParticipantSelection, RoomBookingInput } from "@/lib/room-booking-rules";

// Confirm on the booking review page. Auth + role only; every rule lives in
// @/lib/room-booking. The user is always the session user - a userId, status,
// capacity, policy or group member list in the payload is never read (a GROUP
// selection names only a groupId; membership always comes from a live server-side
// read). Success redirects to the owner-only result page (post-redirect-get), so a
// refresh cannot resubmit.

export type CreateRoomBookingActionResult = { ok: false; error: BookingError; remainingCapacity?: number; participantName?: string };

export async function createRoomBookingAction(input: RoomBookingInput): Promise<CreateRoomBookingActionResult> {
  const session = await auth();
  if (!session || !canBookRoom(session.user.role, session.user.status)) return { ok: false, error: "NOT_ALLOWED" };

  // Only the known fields are forwarded.
  const { roomId, date, slots, capability, participants } = input ?? {};
  const result = await createRoomBooking({
    userId: session.user.id,
    input: { roomId, date, slots, capability, participants },
    now: new Date(),
  });

  if (!result.ok) return result;
  redirect(`/bookings/${encodeURIComponent(result.bookingId)}`);
}

/**
 * Live re-preview of the booking review page for a GROUP selection (or SELF, for
 * symmetry). Called when the student toggles "จองสำหรับ" -> "กลุ่ม", picks a
 * different group, or presses "รีเฟรชรายชื่อสมาชิก" - never automatically/on a
 * timer. Read-only: shares loadBookingReview with the page's own initial SELF
 * render, so there is exactly one implementation of "what does this booking look
 * like right now".
 */
export async function previewGroupBookingAction(input: {
  roomId: string;
  searchParams: Record<string, string | string[] | undefined>;
  participants: BookingParticipantSelection;
}): Promise<BookingReviewState> {
  const session = await auth();
  if (!session) return { kind: "NOT_ALLOWED" };
  return loadBookingReview({
    viewer: { userId: session.user.id, role: session.user.role, status: session.user.status },
    roomId: input.roomId,
    searchParams: input.searchParams,
    now: new Date(),
    participants: input.participants,
  });
}
