"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, Send } from "lucide-react";
import { createRoomBookingAction } from "@/actions/room-booking";
import type { BookingParticipantSelection } from "@/lib/room-booking-rules";
import type { RoomBookingHandoff } from "@/lib/room-finder";
import { getBookingErrorMessage } from "@/lib/ui-terms";

/**
 * "ยืนยันการจอง" / "ส่งคำขอจอง". Sends the hand-off plus whichever participant
 * selection the panel above has resolved (SELF, or a GROUP with its reviewed
 * fingerprint); the server re-checks everything and, on success, redirects to the
 * booking result page. Disabled while pending, or while the panel says confirming
 * is blocked, so a double click or a stale group selection cannot slip through.
 */
export function ConfirmBookingButton({
  handoff,
  participants,
  requiresApproval,
  disabled,
  backHref,
}: {
  handoff: RoomBookingHandoff;
  participants: BookingParticipantSelection;
  requiresApproval: boolean;
  disabled?: boolean;
  backHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRoomBookingAction({
          roomId: handoff.roomId,
          date: handoff.date,
          slots: handoff.slots,
          capability: handoff.requiredCapability,
          participants,
        });
        // Success never returns: the action redirects to /bookings/[id].
        if (result && !result.ok) setError(getBookingErrorMessage(result.error, result.participantName ?? result.remainingCapacity));
      } catch (caught) {
        // The redirect is delivered as a thrown navigation; let Next.js handle it.
        if (caught && typeof caught === "object" && "digest" in caught) throw caught;
        setError(getBookingErrorMessage("FAILED"));
      }
    });
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>{error}</p>
          <Link href={backHref} className="mt-1 inline-block font-medium text-blue-700 hover:underline">
            กลับไปค้นหาห้อง
          </Link>
        </div>
      )}
      <button type="button" onClick={confirm} disabled={pending || disabled} className="btn-primary w-full sm:w-auto">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : requiresApproval ? (
          <Send className="h-4 w-4" />
        ) : (
          <CalendarCheck className="h-4 w-4" />
        )}
        {requiresApproval ? "ส่งคำขอจอง" : "ยืนยันการจอง"}
      </button>
    </div>
  );
}
