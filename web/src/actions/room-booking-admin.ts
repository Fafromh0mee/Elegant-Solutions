"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { decideRoomBooking, type DecideRoomBookingResult } from "@/lib/room-booking-decision";

// Feature 8 admin decisions. Auth + role only; every rule lives in
// @/lib/room-booking-decision, which re-checks the decider's role in the database.
// The decider is always the session user - never taken from input.

async function decide(bookingId: unknown, decision: "APPROVE" | "REJECT", note?: unknown): Promise<DecideRoomBookingResult> {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) return { ok: false, error: "NOT_ALLOWED" };
  const result = await decideRoomBooking({ bookingId, deciderId: session.user.id, decision, note, now: new Date() });
  if (result.ok) {
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${encodeURIComponent(String(bookingId))}`);
  }
  return result;
}

export async function approveRoomBookingAction(bookingId: unknown): Promise<DecideRoomBookingResult> {
  return decide(bookingId, "APPROVE");
}

export async function rejectRoomBookingAction(bookingId: unknown, note?: unknown): Promise<DecideRoomBookingResult> {
  return decide(bookingId, "REJECT", note);
}
