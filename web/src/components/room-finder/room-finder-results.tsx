import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, CheckCircle2, ChevronDown, Clock, ExternalLink, Loader2, MapPin, SearchX, ShieldCheck, Users } from "lucide-react";
import type { RoomAvailabilityResult, RoomDayAvailabilityResult } from "@/lib/availability";
import {
  buildBookingHandoffHref,
  getLocationLabel,
  getSlotRangeLabel,
  ROOM_FINDER_MAX_RESULTS,
  ROOM_FINDER_SHORTLIST,
  roomFinderHref,
  summarizeUnavailable,
  toBookingHandoff,
  toDayCard,
  toFinderCard,
  type RoomFinderQuery,
  type RoomFinderSearchState,
} from "@/lib/room-finder";
import type { AcademicSlot } from "@/lib/types";
import { formatAcademicDate, getRoomCapabilityLabel, getRoomFinderErrorMessage } from "@/lib/ui-terms";

// Presentational only, shared by /rooms and the dashboard panel. No availability
// logic here - every status and number comes from the Feature 3 engine via
// toFinderCard / toDayCard.

export function RoomFinderResults({
  search,
  canBook = false,
  showPermalink = false,
  paging,
  onSelectSlot,
}: {
  search: RoomFinderSearchState | null;
  /** STUDENT / approved GUEST: "จองห้อง" and free-slot chips open booking review. */
  canBook?: boolean;
  /** Dashboard: offer this search as a shareable /rooms link. */
  showPermalink?: boolean;
  /** Dashboard: "ดูห้องเพิ่มเติม" / "แสดงเพิ่ม" re-run the same search with a larger limit. */
  paging?: { onShowMore?: () => void; loading: boolean };
  /** No-slot results for a viewer who cannot book: a free-slot chip narrows the search to that slot. */
  onSelectSlot?: (slot: AcademicSlot) => void;
}) {
  if (search === null) {
    return (
      <div className="card py-10 text-center text-gray-500">
        <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p>เลือกจำนวนผู้ใช้และวันที่ แล้วกด “ค้นหาห้อง”</p>
        <p className="mt-1 text-sm">ระบบจะแสดงเฉพาะห้องที่ตรงกับเงื่อนไขของคุณ</p>
      </div>
    );
  }

  if (search.kind === "INVALID") {
    return (
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {getRoomFinderErrorMessage(search.error)}
      </div>
    );
  }

  if (search.kind === "NOT_ALLOWED") {
    return (
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        บัญชีนี้ไม่สามารถใช้การค้นหาห้องได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง
      </div>
    );
  }

  if (search.kind === "FAILED") {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        ค้นหาห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  const { query, totalAvailable, limit, availableTruncated, capabilityHasNoRooms, bookingClosedSlots } = search;
  const booking: BookingLinks = { canBook, closedSlots: bookingClosedSlots };
  const isDay = search.kind === "DAY";
  const shown = search.available.length;
  // Unavailable rooms matter only once every available match is on screen (or there are none).
  const showUnavailable = shown === 0 || !availableTruncated;

  const heading = isDay
    ? `ห้องที่มีคาบว่างในวันที่ ${formatAcademicDate(query.date)}`
    : shown > 0
      ? `ห้องว่าง ${totalAvailable} ห้อง`
      : "ไม่พบห้องว่าง";

  let unavailableSection: ReactNode;
  if (search.kind === "DAY") {
    unavailableSection = (
      <UnavailableSection
        summary={`ห้องอื่นอีก ${search.totalUnavailable} ห้องไม่มีคาบว่างในวันนี้`}
        total={search.totalUnavailable}
        cards={search.unavailable.map((result) => (
          <DayResultCard key={result.room.id} result={result} query={query} booking={booking} />
        ))}
      />
    );
  } else {
    const reasons = summarizeUnavailable(search.statusCounts);
    const total = reasons.reduce((sum, reason) => sum + reason.count, 0);
    unavailableSection = (
      <UnavailableSection
        summary={`ห้องอื่นอีก ${total} ห้องไม่ว่าง: ${reasons.map((r) => `${r.label} ${r.count}`).join(" · ")}`}
        total={total}
        cards={search.unavailable.map((result) => (
          <RoomResultCard key={result.room.id} result={result} query={query} booking={booking} />
        ))}
      />
    );
  }

  return (
    <section aria-labelledby="finder-results-heading">
      <div className="mb-4">
        <h2 id="finder-results-heading" className="text-lg font-semibold text-gray-900">
          {heading}
          {isDay && shown > 0 && <span className="ml-1 font-normal text-gray-600">({totalAvailable} ห้อง)</span>}
        </h2>
        <QuerySummary query={query} />
        {isDay && (
          <p className="mt-1 text-xs text-gray-500">
            ไม่ได้เลือกคาบ: แสดงห้องที่มีอย่างน้อย 1 คาบว่าง พร้อมคาบที่ว่าง (ไม่ได้หมายความว่าว่างทั้งวัน) ·
            เรียงจากห้องที่มีคาบว่างมากที่สุด
          </p>
        )}
        {!isDay && shown > 1 && (
          <p className="mt-1 text-xs text-gray-500">เรียงจากห้องที่มีที่ว่างใกล้เคียงกับจำนวนผู้ใช้มากที่สุด</p>
        )}
        {showPermalink && (
          <Link
            href={roomFinderHref(query)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            เปิดผลการค้นหานี้ในหน้าแยก (แชร์ลิงก์ได้)
          </Link>
        )}
      </div>

      {shown > 0 ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {search.kind === "DAY"
            ? search.available.map((result) => (
                <DayResultCard
                  key={result.room.id}
                  result={result}
                  query={query}
                  booking={booking}
                  onSelectSlot={onSelectSlot}
                />
              ))
            : search.available.map((result) => (
                <RoomResultCard key={result.room.id} result={result} query={query} booking={booking} />
              ))}
        </ul>
      ) : (
        <div className="card py-8 text-center">
          <SearchX className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          {capabilityHasNoRooms && query.capability ? (
            <>
              <p className="text-gray-700">
                ยังไม่มีห้องประเภท{getRoomCapabilityLabel(query.capability)}เปิดให้จอง
              </p>
              <p className="mt-1 text-sm text-gray-500">ลองเลือกประเภทพื้นที่เป็น “ทุกประเภท”</p>
            </>
          ) : (
            <p className="text-gray-700">
              ไม่พบห้องที่ตรงกับเงื่อนไขนี้ ลองเปลี่ยนจำนวนผู้ใช้ วันที่ คาบ หรือประเภทพื้นที่
            </p>
          )}
        </div>
      )}

      {shown > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          “จองเพิ่มได้อีก” คิดจากการจองที่อนุมัติแล้ว ไม่ใช่จำนวนคนที่อยู่ในห้องขณะนั้น
        </p>
      )}

      {availableTruncated &&
        (paging ? (
          <ShowMore
            shown={shown}
            total={totalAvailable}
            limit={limit}
            onShowMore={paging.onShowMore}
            loading={paging.loading}
          />
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            แสดง {shown} จาก {totalAvailable} ห้อง ลองระบุอาคารหรือชั้นเพื่อจำกัดผลลัพธ์
          </p>
        ))}

      {showUnavailable && unavailableSection}
    </section>
  );
}

function UnavailableSection({ summary, total, cards }: { summary: string; total: number; cards: ReactNode[] }) {
  if (total === 0) return null;
  return (
    <div className="mt-6">
      <p className="text-sm text-gray-600">{summary}</p>
      {cards.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:underline">
            ดูห้องที่ไม่ว่าง ({cards.length}
            {cards.length < total ? ` จาก ${total}` : ""})
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</ul>
        </details>
      )}
    </div>
  );
}

/**
 * "แสดง 6 จาก 37 ห้อง" + "ดูห้องเพิ่มเติม" from the shortlist, then "แสดงเพิ่ม" in batches.
 * Each click is a new bounded server search, never a client-side list.
 */
function ShowMore({
  shown,
  total,
  limit,
  onShowMore,
  loading,
}: {
  shown: number;
  total: number;
  limit: number;
  onShowMore?: () => void;
  loading: boolean;
}) {
  const atCap = limit >= ROOM_FINDER_MAX_RESULTS;
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600">
        แสดง {shown} จาก {total} ห้อง
        {atCap && " · ระบุอาคารหรือชั้นเพื่อดูห้องอื่น"}
      </p>
      {!atCap && onShowMore && (
        <button type="button" onClick={onShowMore} disabled={loading} className="btn-secondary w-full sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
          {limit <= ROOM_FINDER_SHORTLIST ? "ดูห้องเพิ่มเติม" : "แสดงเพิ่ม"}
        </button>
      )}
    </div>
  );
}

function QuerySummary({ query }: { query: RoomFinderQuery }) {
  const location = getLocationLabel(query.building, query.floor);
  const parts = [
    formatAcademicDate(query.date),
    query.slots.length > 0 ? getSlotRangeLabel(query.slots) : "ไม่ระบุคาบ",
    `${query.partySize} คน`,
    query.capability ? getRoomCapabilityLabel(query.capability) : "ทุกประเภท",
    ...(location ? [location] : []),
  ];
  return <p className="mt-1 text-sm text-gray-500">{parts.join(" · ")}</p>;
}

/** Shared top of every room card. */
function CardHeader({
  roomCode,
  name,
  statusLabel,
  available,
  capabilityLabels,
  locationLabel,
}: {
  roomCode: string;
  name: string;
  statusLabel: string;
  available: boolean;
  capabilityLabels: string[];
  locationLabel: string | null;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{roomCode}</p>
          <p className="truncate text-sm text-gray-600">{name}</p>
        </div>
        <span className={`badge shrink-0 ${available ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>
          {statusLabel}
        </span>
      </div>

      {capabilityLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {capabilityLabels.map((label) => (
            <span key={label} className="badge bg-blue-50 text-blue-700">
              {label}
            </span>
          ))}
        </div>
      )}

      {locationLabel && (
        <p className="flex items-center gap-1 text-sm text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {locationLabel}
        </p>
      )}
    </>
  );
}

function ApprovalLine({ requiresApproval, label }: { requiresApproval: boolean; label: string }) {
  return (
    <p className={`flex items-center gap-1 text-sm ${requiresApproval ? "text-amber-700" : "text-green-700"}`}>
      {requiresApproval ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {label}
    </p>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="text-xs text-gray-600">
      {issues.map((issue) => (
        <li key={issue}>• {issue}</li>
      ))}
    </ul>
  );
}

/** Whether cards link to booking review, and which slots' booking has already closed. */
interface BookingLinks {
  canBook: boolean;
  closedSlots: AcademicSlot[];
}

const SLOT_TOO_LATE_NOTE = "เหลือเวลาน้อยกว่า 15 นาที จองคาบนี้ไม่ได้แล้ว";

/** A slot-specific result: one remaining capacity that holds for the whole selected range. */
function RoomResultCard({
  result,
  query,
  booking,
}: {
  result: RoomAvailabilityResult;
  query: RoomFinderQuery;
  booking: BookingLinks;
}) {
  const card = toFinderCard(result);
  const tooLate = query.slots.some((slot) => booking.closedSlots.includes(slot));

  return (
    <li className={`card flex flex-col gap-3 ${card.available ? "" : "bg-gray-50"}`}>
      <CardHeader {...card} />

      <p className="text-sm text-gray-700">
        {card.capacityLabel}
        {card.remainingLabel && (
          <>
            {" · "}
            <span className={`font-semibold ${card.available ? "text-green-700" : "text-gray-700"}`}>
              {card.remainingLabel}
            </span>
          </>
        )}
      </p>

      <IssueList issues={card.slotIssues} />
      <ApprovalLine requiresApproval={card.requiresApproval} label={card.approvalLabel} />

      {card.available && booking.canBook && (
        <div className="mt-auto pt-1">
          {tooLate ? (
            <>
              <button type="button" disabled className="btn-primary w-full cursor-not-allowed opacity-50">
                จองห้อง
              </button>
              <p className="mt-1 flex items-center justify-center gap-1 text-center text-xs text-amber-700">
                <Clock className="h-3.5 w-3.5" />
                {SLOT_TOO_LATE_NOTE}
              </p>
            </>
          ) : (
            // Review only: nothing is written until "ยืนยันการจอง" on the next page.
            <Link href={buildBookingHandoffHref(toBookingHandoff(card.roomId, query))} className="btn-primary w-full">
              <CalendarCheck className="h-4 w-4" />
              จองห้อง
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A no-slot result: each free slot with ITS OWN reservable capacity - never one flattened number.
 * For a viewer who can book, a chip opens booking review for that ONE slot (never all-day).
 */
function DayResultCard({
  result,
  query,
  booking,
  onSelectSlot,
}: {
  result: RoomDayAvailabilityResult;
  query: RoomFinderQuery;
  booking: BookingLinks;
  onSelectSlot?: (slot: AcademicSlot) => void;
}) {
  const card = toDayCard(result);

  return (
    <li className={`card flex flex-col gap-3 ${card.available ? "" : "bg-gray-50"}`}>
      <CardHeader {...card} />
      <p className="text-sm text-gray-700">{card.capacityLabel}</p>

      {card.slotChips.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">ว่าง:</p>
          <div className="flex flex-wrap gap-2">
            {card.slotChips.map((chip) => {
              const content = (
                <>
                  <span className="font-semibold">{chip.label}</span>
                  <span className="text-gray-500"> · {chip.time}</span>
                  <span className="block text-green-700">{chip.remainingLabel}</span>
                </>
              );
              const chipClass = "rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-left text-xs";
              if (booking.canBook) {
                return booking.closedSlots.includes(chip.slot) ? (
                  <span key={chip.slot} title={SLOT_TOO_LATE_NOTE} className={`${chipClass} opacity-60`}>
                    {content}
                    <span className="block text-amber-700">จองไม่ได้แล้ว (เหลือไม่ถึง 15 นาที)</span>
                  </span>
                ) : (
                  <Link
                    key={chip.slot}
                    href={buildBookingHandoffHref(toBookingHandoff(card.roomId, { ...query, slots: [chip.slot] }))}
                    title="จองห้องนี้ในคาบนี้"
                    className={`${chipClass} hover:border-green-400`}
                  >
                    {content}
                  </Link>
                );
              }
              return onSelectSlot ? (
                <button
                  key={chip.slot}
                  type="button"
                  onClick={() => onSelectSlot(chip.slot)}
                  title="เลือกคาบนี้แล้วค้นหา"
                  className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-left text-xs hover:border-green-400"
                >
                  {content}
                </button>
              ) : (
                <span key={chip.slot} className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs">
                  {content}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <IssueList issues={card.slotIssues} />
      <ApprovalLine requiresApproval={card.requiresApproval} label={card.approvalLabel} />

      {card.available && booking.canBook && (
        <p className="mt-auto pt-1 text-center text-xs text-gray-500">แตะคาบที่ว่างเพื่อจองห้องในคาบนั้น</p>
      )}
    </li>
  );
}
