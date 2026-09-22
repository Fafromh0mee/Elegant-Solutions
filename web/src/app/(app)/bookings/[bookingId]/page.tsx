import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CheckCircle2, Clock, User, Users, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { getLocationLabel, getSlotRangeLabel } from "@/lib/room-finder";
import { getOwnBooking } from "@/lib/room-booking";
import { formatAcademicDate, getApprovalPolicyLabel, getBookingStatusLabel } from "@/lib/ui-terms";

// Booking result / detail (Feature 7 / 7.5). Viewable by any participant the booking
// covers, not just its creator (RoomBookingParticipant is the source of truth for who
// that is) - a booking id the viewer does not participate in is a 404, the same as a
// missing one. Where the confirm redirect lands (post-redirect-get). The roster shown
// here is read-only: no add/remove-member controls live on this page.

export default async function BookingResultPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { bookingId } = await params;
  const booking = await getOwnBooking(bookingId, session.user.id);
  if (!booking) notFound();

  const slots = booking.slots.map((entry) => entry.slot);
  const location = getLocationLabel(booking.room.building, booking.room.floor);
  const viewerIsCreator = booking.participants.some((p) => p.isCreator && p.userId === session.user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card">
        <StatusHeader status={booking.status} />
        {!viewerIsCreator && <p className="mt-2 text-sm text-gray-500">จองโดย {booking.creatorName}</p>}

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <Row label="ห้อง">
            {booking.room.roomCode}
            <span className="block text-gray-600">{booking.room.name}</span>
          </Row>
          {location && <Row label="สถานที่">{location}</Row>}
          <Row label="วันที่">{formatAcademicDate(booking.date)}</Row>
          <Row label="เวลา">{getSlotRangeLabel(slots)}</Row>
          <Row label="จำนวนผู้เข้าร่วม">{booking.partySize} คน</Row>
          <Row label="สถานะ">{getBookingStatusLabel(booking.status)}</Row>
          <Row label="การอนุมัติ">{getApprovalPolicyLabel(booking.room.approvalPolicy)}</Row>
          <Row label="หมายเลขการจอง">
            <span className="font-mono text-xs break-all">{booking.id}</span>
          </Row>
        </dl>

        <div className="mt-6 border-t pt-5">
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-900">
            <Users className="h-4 w-4" />
            ผู้เข้าร่วมการจอง ({booking.participants.length} คน)
          </p>
          <ul className="space-y-1.5">
            {booking.participants.map((participant) => (
              <li key={participant.userId} className="flex items-center gap-2 text-sm text-gray-700">
                <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span>{participant.name}</span>
                {participant.identityLabel && <span className="text-xs text-gray-500">({participant.identityLabel})</span>}
                {participant.isCreator && <span className="badge bg-blue-50 text-blue-700">ผู้จอง</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t pt-5 sm:flex-row">
          <Link href="/dashboard" className="btn-primary">
            กลับหน้าภาพรวม
          </Link>
          <Link href="/dashboard/rooms" className="btn-secondary">
            ค้นหาห้องอื่น
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusHeader({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">จองห้องสำเร็จ</h1>
          <p className="text-sm text-gray-600">การจองของคุณได้รับการยืนยันแล้ว</p>
        </div>
      </div>
    );
  }
  if (status === "PENDING") {
    return (
      <div className="flex items-start gap-3">
        <Clock className="h-8 w-8 shrink-0 text-amber-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">ส่งคำขอจองแล้ว</h1>
          <p className="text-sm text-amber-800">
            รอผู้ดูแลระบบอนุมัติ — ยังไม่สามารถใช้ห้องตามการจองนี้ได้จนกว่าจะได้รับการอนุมัติ
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <XCircle className="h-8 w-8 shrink-0 text-gray-400" />
      <div>
        <h1 className="text-xl font-bold text-gray-900">การจอง{getBookingStatusLabel(status)}</h1>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </>
  );
}
