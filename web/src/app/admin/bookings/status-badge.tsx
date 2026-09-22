import { getBookingStatusLabel } from "@/lib/ui-terms";

const STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export function BookingStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>{getBookingStatusLabel(status)}</span>;
}
