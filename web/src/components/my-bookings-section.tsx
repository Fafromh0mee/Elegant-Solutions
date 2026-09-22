import Link from "next/link";
import { CalendarCheck, ChevronRight, Clock, Users } from "lucide-react";
import { toDashboardBookingCard, type DashboardBooking } from "@/lib/room-booking-rules";
import { formatAcademicDate } from "@/lib/ui-terms";

/**
 * Dashboard "การจองของฉัน": the viewer's next few PENDING/APPROVED bookings, each
 * linking to its owner-only page. Data is loaded on the server for the session user
 * (loadDashboardBookings); nothing to show = no section. Full list, history and
 * cancellation are Feature 7b.
 */
export function MyBookingsSection({ bookings }: { bookings: DashboardBooking[] | null }) {
  if (!bookings || bookings.length === 0) return null;
  const cards = bookings.map(toDashboardBookingCard);

  return (
    <section className="mb-8" aria-labelledby="my-bookings-heading">
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-(--color-secondary)" />
        <h2 id="my-bookings-heading" className="text-lg font-semibold">
          การจองของฉัน
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const approved = card.status === "APPROVED";
          return (
            <li key={card.id}>
              <Link
                href={card.href}
                className="card flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{card.roomCode}</p>
                    <p className="truncate text-sm text-gray-600">{card.roomName}</p>
                  </div>
                  <span
                    className={`badge shrink-0 ${approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {card.statusLabel}
                  </span>
                </div>
                <p className="flex items-center gap-1 text-sm text-gray-700">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {formatAcademicDate(card.date)} · {card.slotLabel} · {card.timeLabel}
                </p>
                <p className="flex items-center gap-1 text-sm text-gray-700">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {card.partySizeLabel}
                </p>
                {card.creatorLine && <p className="text-xs text-gray-500">{card.creatorLine}</p>}
                {card.note && <p className="text-xs text-amber-800">{card.note}</p>}
                <span className="mt-auto inline-flex items-center gap-0.5 pt-1 text-xs font-medium text-blue-700">
                  ดูรายละเอียด
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
