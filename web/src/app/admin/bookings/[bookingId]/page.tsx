import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, User, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { getAdminBookingDetail } from "@/lib/room-booking-admin";
import { getLocationLabel, getSlotRangeLabel } from "@/lib/room-finder";
import { getSlotLabel } from "@/lib/academic-slots";
import { formatAcademicDate, getApprovalPolicyLabel, getRoleLabel, getRoomCapabilityLabel } from "@/lib/ui-terms";
import { BookingStatusBadge } from "../status-badge";
import { DecisionPanel } from "./decision-panel";

// Feature 8: one booking, everything an admin needs to decide. The roster is the
// RoomBookingParticipant snapshot - never partySize or current Group membership.

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) redirect("/dashboard");

  const { bookingId } = await params;
  const booking = await getAdminBookingDetail(bookingId);
  if (!booking) notFound();

  const location = getLocationLabel(booking.room.building, booking.room.floor);
  const slots = booking.slots.map((entry) => entry.slot);
  const { decision } = booking;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-blue-700">
        <ArrowLeft className="h-4 w-4" />
        กลับไปรายการคำขอจอง
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {booking.room.roomCode} · {formatAcademicDate(booking.date)}
            </h1>
            <p className="text-sm text-gray-600">{getSlotRangeLabel(slots)}</p>
          </div>
          <BookingStatusBadge status={booking.status} />
        </div>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <Row label="ห้อง">
            {booking.room.roomCode}
            <span className="block text-gray-600">{booking.room.name}</span>
            {(!booking.room.isActive || !booking.room.bookingEnabled) && (
              <span className="mt-1 inline-block badge bg-red-100 text-red-700">
                {!booking.room.isActive ? "ห้องปิดใช้งานอยู่" : "ห้องปิดการจองอยู่"}
              </span>
            )}
          </Row>
          {location && <Row label="สถานที่">{location}</Row>}
          <Row label="ความจุห้อง">{booking.room.capacity} คน</Row>
          <Row label="ประเภทพื้นที่">
            {booking.room.capabilities.length > 0 ? booking.room.capabilities.map(getRoomCapabilityLabel).join(", ") : "—"}
          </Row>
          <Row label="การอนุมัติของห้อง">{getApprovalPolicyLabel(booking.room.approvalPolicy)}</Row>
          <Row label="วันที่">{formatAcademicDate(booking.date)}</Row>
          <Row label="คาบ">
            <ul>
              {booking.slots.map((entry) => (
                <li key={entry.slot}>
                  {getSlotLabel(entry.slot)} · {time(entry.startAt)}–{time(entry.endAt)}
                </li>
              ))}
            </ul>
          </Row>
          <Row label="ผู้จอง">{booking.creator.name}</Row>
          <Row label="จำนวนที่ขอ (partySize)">{booking.partySize} คน</Row>
          {booking.purpose && <Row label="วัตถุประสงค์">{booking.purpose}</Row>}
          <Row label="ส่งคำขอเมื่อ">{dateTime(booking.createdAt)}</Row>
          <Row label="หมายเลขการจอง">
            <span className="font-mono text-xs break-all">{booking.id}</span>
          </Row>
        </dl>
      </div>

      <div className="card">
        <p className="mb-3 flex items-center gap-1 text-sm font-semibold text-gray-900">
          <Users className="h-4 w-4" />
          ผู้เข้าร่วมการจอง ({booking.participants.length} คน)
        </p>
        {booking.participants.length !== booking.partySize && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            จำนวนผู้เข้าร่วมในรายชื่อ ({booking.participants.length}) ไม่ตรงกับจำนวนที่ขอ ({booking.partySize}) — สิทธิ์เข้าใช้ห้องยึดตามรายชื่อนี้เท่านั้น
          </p>
        )}
        <ul className="divide-y text-sm">
          {booking.participants.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center gap-2 py-2">
              <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="font-medium text-gray-900">{p.name}</span>
              {p.studentId && <span className="text-xs text-gray-500">({p.studentId})</span>}
              <span className="text-xs text-gray-500">{p.email}</span>
              <span className="badge bg-gray-100 text-gray-700">{getRoleLabel(p.role)}</span>
              {p.accountStatus !== "APPROVED" && <span className="badge bg-red-100 text-red-700">บัญชีไม่ได้รับอนุมัติ</span>}
              {p.isCreator && <span className="badge bg-blue-50 text-blue-700">ผู้จอง</span>}
              {p.source === "GROUP" && (
                <span className="text-xs text-gray-500">ผ่านกลุ่ม{p.groupName ? ` ${p.groupName}` : ""}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {booking.status === "PENDING" ? (
        <DecisionPanel bookingId={booking.id} />
      ) : (
        <div className="card text-sm">
          <p className="mb-2 font-semibold text-gray-900">ผลการพิจารณา</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <Row label="สถานะ">
              <BookingStatusBadge status={booking.status} />
            </Row>
            {decision.autoApproved ? (
              <Row label="ผู้อนุมัติ">อนุมัติอัตโนมัติ (ห้องแบบอนุมัติอัตโนมัติ)</Row>
            ) : (
              decision.decidedByName && <Row label="ผู้พิจารณา">{decision.decidedByName}</Row>
            )}
            {decision.decidedAt && <Row label="เมื่อ">{dateTime(decision.decidedAt)}</Row>}
            {decision.reason && <Row label="หมายเหตุ">{decision.reason}</Row>}
            {decision.cancelledAt && <Row label="ยกเลิกเมื่อ">{dateTime(decision.cancelledAt)}</Row>}
          </dl>
        </div>
      )}
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
