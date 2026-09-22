import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AdminPageHeaderServer } from "@/components/admin-page-header-server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { listAdminBookings } from "@/lib/room-booking-admin";
import { adminBookingQueryString, ADMIN_BOOKING_STATUS_FILTERS, parseAdminBookingQuery } from "@/lib/room-booking-rules";
import { getSlotRangeLabel } from "@/lib/room-finder";
import { formatAcademicDate, getApprovalPolicyLabel, getBookingStatusLabel } from "@/lib/ui-terms";
import { BookingStatusBadge } from "./status-badge";

// Feature 8: the admin booking queue. PENDING first by default.

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) redirect("/dashboard");

  const query = parseAdminBookingQuery(await searchParams);
  const list = await listAdminBookings(query);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div>
      <AdminPageHeaderServer pathname="/admin/bookings" />

      <form method="get" className="card mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">สถานะ</span>
          <select name="status" defaultValue={query.status} className="input">
            {ADMIN_BOOKING_STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? "ทั้งหมด" : getBookingStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">วันที่ใช้ห้อง</span>
          <input type="date" name="date" defaultValue={query.date ?? ""} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">ห้อง</span>
          <select name="roomId" defaultValue={query.roomId ?? ""} className="input">
            <option value="">ทุกห้อง</option>
            {list.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.roomCode} · {room.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            กรอง
          </button>
          <Link href="/admin/bookings" className="btn-secondary">
            ล้างตัวกรอง
          </Link>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        {list.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">
            {query.status === "PENDING" ? "ไม่มีคำขอจองที่รออนุมัติ" : "ไม่พบการจองตามตัวกรองนี้"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">ห้อง</th>
                <th className="px-4 py-3 font-medium">วันที่ / คาบ</th>
                <th className="px-4 py-3 font-medium">ผู้จอง</th>
                <th className="px-4 py-3 font-medium">ผู้เข้าร่วม</th>
                <th className="px-4 py-3 font-medium">การอนุมัติของห้อง</th>
                <th className="px-4 py-3 font-medium">ส่งคำขอเมื่อ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{item.roomCode}</span>
                    <span className="block text-xs text-gray-500">{item.roomName}</span>
                  </td>
                  <td className="px-4 py-3">
                    {formatAcademicDate(item.date)}
                    <span className="block text-xs text-gray-500">{getSlotRangeLabel(item.slots)}</span>
                  </td>
                  <td className="px-4 py-3">{item.creatorName}</td>
                  <td className="px-4 py-3">{item.participantCount} คน</td>
                  <td className="px-4 py-3">{getApprovalPolicyLabel(item.approvalPolicy)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{dateTime(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <BookingStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/bookings/${encodeURIComponent(item.id)}`}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700"
                    >
                      {item.status === "PENDING" ? "ตรวจสอบ" : "ดูรายละเอียด"}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            ทั้งหมด {list.total} รายการ · หน้า {list.page}/{pages}
          </span>
          <div className="flex gap-2">
            {list.page > 1 && (
              <Link href={`/admin/bookings${adminBookingQueryString(query, { page: list.page - 1 })}`} className="btn-secondary">
                ก่อนหน้า
              </Link>
            )}
            {list.page < pages && (
              <Link href={`/admin/bookings${adminBookingQueryString(query, { page: list.page + 1 })}`} className="btn-secondary">
                ถัดไป
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
