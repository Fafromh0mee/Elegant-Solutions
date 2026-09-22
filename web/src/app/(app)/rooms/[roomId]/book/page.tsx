import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMyOwnedGroupsAction } from "@/actions/groups";
import { getLocationLabel, getSlotRangeLabel } from "@/lib/room-finder";
import { loadBookingReview } from "@/lib/room-booking";
import { formatAcademicDate, getApprovalPolicyLabel, getBookingErrorMessage, getRoomCapabilityLabel } from "@/lib/ui-terms";
import { BookingParticipantsPanel } from "./booking-participants-panel";

// Booking review (Feature 7 / 7.5). The URL only names what was asked for; every
// value shown is re-read on the server. Room facts (name, date, time, location,
// capability, room capacity) never change with participant mode and stay here;
// everything that depends on "จองสำหรับ" (solo vs group) lives in the client panel
// below, which re-previews via previewGroupBookingAction. Nothing is written until
// "ยืนยันการจอง", which re-checks everything again under the booking locks.

export default async function BookingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { roomId } = await params;
  const resolvedSearchParams = await searchParams;
  const [review, ownedGroups] = await Promise.all([
    loadBookingReview({
      viewer: { userId: session.user.id, role: session.user.role, status: session.user.status },
      roomId,
      searchParams: resolvedSearchParams,
      now: new Date(),
    }),
    getMyOwnedGroupsAction(),
  ]);

  if (review.kind === "NOT_ALLOWED") {
    return (
      <Notice title="จองห้อง" backHref="/dashboard" backLabel="กลับหน้าภาพรวม">
        บัญชีนี้ไม่สามารถจองห้องได้
      </Notice>
    );
  }

  if (review.kind === "INVALID") {
    return (
      <Notice title="ไม่สามารถจองห้องนี้ได้" backHref={review.backHref} backLabel="กลับไปค้นหาห้อง">
        {getBookingErrorMessage(review.error)}
      </Notice>
    );
  }

  const { handoff, room } = review;
  const location = getLocationLabel(room.building, room.floor);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={review.backHref}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปผลการค้นหา
      </Link>

      <div className="card">
        <h1 className="text-xl font-bold text-gray-900">จองห้อง {room.roomCode}</h1>
        <p className="text-gray-600">{room.name}</p>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <Row label="วันที่">{formatAcademicDate(handoff.date)}</Row>
          <Row label="เวลา">{getSlotRangeLabel(handoff.slots)}</Row>
          {location && <Row label="สถานที่">{location}</Row>}
          <Row label="ประเภทพื้นที่">
            {room.capabilities.map(getRoomCapabilityLabel).join(" · ") || "-"}
            {handoff.requiredCapability && (
              <span className="block text-xs text-gray-500">
                ค้นหา: {getRoomCapabilityLabel(handoff.requiredCapability)}
              </span>
            )}
          </Row>
          <Row label="ความจุห้อง">รองรับ {room.capacity} คน</Row>
          <Row label="การอนุมัติ">
            <span
              className={`inline-flex items-center gap-1 ${room.approvalPolicy === "MANUAL" ? "text-amber-700" : "text-green-700"}`}
            >
              {room.approvalPolicy === "MANUAL" ? <ShieldCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {getApprovalPolicyLabel(room.approvalPolicy)}
            </span>
          </Row>
        </dl>

        <BookingParticipantsPanel
          roomId={roomId}
          searchParams={resolvedSearchParams}
          initialReview={review}
          initialGroups={ownedGroups.groups}
        />
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

function Notice({
  title,
  children,
  backHref,
  backLabel,
}: {
  title: string;
  children: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="card mx-auto max-w-xl text-center">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">{children}</p>
      <Link href={backHref} className="btn-secondary mt-4 inline-flex">
        {backLabel}
      </Link>
    </div>
  );
}
