import Link from "next/link";
import { CheckCircle2, ExternalLink, MapPin, SearchX, ShieldCheck, Users } from "lucide-react";
import type { RoomAvailabilityResult } from "@/lib/availability";
import {
  buildBookingHandoffHref,
  getLocationLabel,
  getSlotRangeLabel,
  roomFinderHref,
  summarizeUnavailable,
  toBookingHandoff,
  toFinderCard,
  type RoomFinderQuery,
  type RoomFinderSearchState,
} from "@/lib/room-finder";
import { formatAcademicDate, getRoomCapabilityLabel, getRoomFinderErrorMessage } from "@/lib/ui-terms";

// Presentational only, shared by /rooms and the dashboard panel. No availability
// logic here - every status and number comes from the Feature 3 engine via toFinderCard.

export function RoomFinderResults({
  search,
  showPermalink = false,
}: {
  search: RoomFinderSearchState | null;
  /** Dashboard: offer this search as a shareable /rooms link. */
  showPermalink?: boolean;
}) {
  if (search === null) {
    return (
      <div className="card py-10 text-center text-gray-500">
        <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p>เลือกจำนวนผู้ใช้ วันที่ และคาบ แล้วกด “ค้นหาห้อง”</p>
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

  const { query, available, unavailable, statusCounts, availableTruncated, capabilityHasNoRooms } = search;
  const reasons = summarizeUnavailable(statusCounts);
  const unavailableTotal = reasons.reduce((sum, reason) => sum + reason.count, 0);

  return (
    <section aria-labelledby="finder-results-heading">
      <div className="mb-4">
        <h2 id="finder-results-heading" className="text-lg font-semibold text-gray-900">
          {available.length > 0 ? `ห้องว่าง ${available.length}${availableTruncated ? "+" : ""} ห้อง` : "ไม่พบห้องว่าง"}
        </h2>
        <QuerySummary query={query} />
        {available.length > 1 && (
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

      {available.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {available.map((result) => (
            <RoomCard key={result.room.id} result={result} query={query} />
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

      {availableTruncated && (
        <p className="mt-4 text-sm text-gray-600">
          แสดง {available.length} ห้องแรกที่เหมาะสมที่สุด ลองระบุอาคารหรือชั้นเพื่อจำกัดผลลัพธ์
        </p>
      )}

      {unavailableTotal > 0 && (
        <div className="mt-6">
          <p className="text-sm text-gray-600">
            ห้องอื่นอีก {unavailableTotal} ห้องไม่ว่าง:{" "}
            {reasons.map((reason) => `${reason.label} ${reason.count}`).join(" · ")}
          </p>
          {unavailable.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:underline">
                ดูห้องที่ไม่ว่าง ({unavailable.length}
                {unavailable.length < unavailableTotal ? ` จาก ${unavailableTotal}` : ""})
              </summary>
              <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unavailable.map((result) => (
                  <RoomCard key={result.room.id} result={result} query={query} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function QuerySummary({ query }: { query: RoomFinderQuery }) {
  const location = getLocationLabel(query.building, query.floor);
  const parts = [
    formatAcademicDate(query.date),
    getSlotRangeLabel(query.slots),
    `${query.partySize} คน`,
    query.capability ? getRoomCapabilityLabel(query.capability) : "ทุกประเภท",
    ...(location ? [location] : []),
  ];
  return <p className="mt-1 text-sm text-gray-500">{parts.join(" · ")}</p>;
}

function RoomCard({ result, query }: { result: RoomAvailabilityResult; query: RoomFinderQuery }) {
  const card = toFinderCard(result);

  return (
    <li className={`card flex flex-col gap-3 ${card.available ? "" : "bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{card.roomCode}</p>
          <p className="truncate text-sm text-gray-600">{card.name}</p>
        </div>
        <span
          className={`badge shrink-0 ${card.available ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
        >
          {card.statusLabel}
        </span>
      </div>

      {card.capabilityLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.capabilityLabels.map((label) => (
            <span key={label} className="badge bg-blue-50 text-blue-700">
              {label}
            </span>
          ))}
        </div>
      )}

      {card.locationLabel && (
        <p className="flex items-center gap-1 text-sm text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {card.locationLabel}
        </p>
      )}

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

      {card.slotIssues.length > 0 && (
        <ul className="text-xs text-gray-600">
          {card.slotIssues.map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      )}

      <p
        className={`flex items-center gap-1 text-sm ${card.requiresApproval ? "text-amber-700" : "text-green-700"}`}
      >
        {card.requiresApproval ? (
          <ShieldCheck className="h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        )}
        {card.approvalLabel}
      </p>

      {card.available && (
        <div className="mt-auto pt-1">
          {/* Feature 7 turns this into a link to data-booking-href. Nothing is written here. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-booking-href={buildBookingHandoffHref(toBookingHandoff(card.roomId, query))}
            className="btn-primary w-full cursor-not-allowed opacity-50"
          >
            จองห้อง
          </button>
          <p className="mt-1 text-center text-xs text-gray-400">เปิดให้จองเร็ว ๆ นี้</p>
        </div>
      )}
    </li>
  );
}
