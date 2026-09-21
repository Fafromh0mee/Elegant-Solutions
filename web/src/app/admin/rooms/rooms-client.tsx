"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, DoorOpen, Plus, Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin-page-header";
import { HEALTH_STYLE, HealthBadge } from "./health-badge";
import { TablePagination } from "@/components/table-pagination";
import { createRoomAction, listAdminRoomsAction } from "@/actions/rooms";
import type { AdminRoomListItem, AdminRoomListResult } from "@/lib/room-admin";
import {
  applyRoomListChange,
  BUILDING_NONE,
  ROOM_LIST_PAGE_SIZES,
  roomListQueryString,
  type RoomConfigurationHealth,
} from "@/lib/room-config";
import { ROOM_CAPABILITY_VALUES } from "@/lib/types";
import {
  getApprovalPolicyLabel,
  getRoomCapabilityLabel,
  getRoomConfigHealthLabel,
  getRoomConfigIssueLabel,
} from "@/lib/ui-terms";

const HEALTH_ORDER: RoomConfigurationHealth[] = ["READY", "INCOMPLETE", "BOOKING_DISABLED", "INACTIVE"];

interface Filters {
  q: string;
  building: string;
  capability: string;
  operational: "ALL" | "ACTIVE" | "INACTIVE";
  booking: "ALL" | "ENABLED" | "DISABLED";
  health: "ALL" | RoomConfigurationHealth;
  page: number;
  pageSize: number;
}

const EMPTY_FILTERS: Filters = {
  q: "",
  building: "",
  capability: "",
  operational: "ALL",
  booking: "ALL",
  health: "ALL",
  page: 1,
  pageSize: 25,
};

/** Client filter state from the (already parsed) URL query, paired with the server's page/pageSize. */
function initialFilters(query: Record<string, unknown>, initial: AdminRoomListResult): Filters {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    ...EMPTY_FILTERS,
    q: text(query.q),
    building: text(query.building),
    capability: text(query.capability),
    operational: (query.operational as Filters["operational"]) ?? "ALL",
    booking: (query.booking as Filters["booking"]) ?? "ALL",
    health: (query.health as Filters["health"]) ?? "ALL",
    page: initial.page,
    pageSize: initial.pageSize,
  };
}

export function RoomsClient({
  initial,
  initialQuery,
}: {
  initial: AdminRoomListResult;
  initialQuery: Record<string, unknown>;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<Filters>(() => initialFilters(initialQuery, initial));
  // Latest filters, readable synchronously. Two changes in the same tick (TablePagination
  // calls onPageSizeChange then onPageChange(1)) must build on each other, not on the
  // same stale render - that is what used to reset the page size back to 25.
  const filtersRef = useRef(filters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const requestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(next: Filters) {
    const id = ++requestId.current;
    setLoading(true);
    const result = await listAdminRoomsAction({
      q: next.q,
      building: next.building,
      capability: next.capability,
      operational: next.operational,
      booking: next.booking,
      health: next.health,
      page: next.page,
      pageSize: next.pageSize,
    });
    if (id !== requestId.current) return; // a newer request superseded this one
    setLoading(false);
    if ("success" in result) {
      setData(result);
      setError("");
    } else {
      setError(result.error);
    }
  }

  function update(patch: Partial<Filters>, debounce = false) {
    // Any filter change returns to page 1 unless the page itself is changing.
    const next = applyRoomListChange(filtersRef.current, patch);
    filtersRef.current = next;
    setFilters(next);
    // Keep the list state shareable and refresh-safe without a server navigation.
    window.history.replaceState(null, "", `?${roomListQueryString(next)}`);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (debounce) {
      searchTimer.current = setTimeout(() => void load(next), 300);
    } else {
      void load(next);
    }
  }

  return (
    <div>
      <AdminPageHeader />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {HEALTH_ORDER.map((health) => (
            <button
              key={health}
              type="button"
              onClick={() => update({ health: filters.health === health ? "ALL" : health })}
              className={`badge ${HEALTH_STYLE[health]} cursor-pointer ${filters.health === health ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
            >
              {getRoomConfigHealthLabel(health)} · {data.healthCounts[health]}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate((open) => !open)} className="btn-primary">
          <Plus className="h-4 w-4" />
          เพิ่มห้อง
        </button>
      </div>

      {showCreate && (
        <CreateRoomForm
          onCancel={() => setShowCreate(false)}
          onCreated={(roomId) => router.push(`/admin/rooms/${roomId}`)}
        />
      )}

      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="ค้นหารหัสห้องหรือชื่อห้อง"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value }, true)}
            />
          </div>
          <select className="input" value={filters.building} onChange={(e) => update({ building: e.target.value })}>
            <option value="">ทุกอาคาร</option>
            {data.buildings.map((building) => (
              <option key={building ?? BUILDING_NONE} value={building ?? BUILDING_NONE}>
                {building ? `อาคาร ${building}` : "ไม่ระบุอาคาร"}
              </option>
            ))}
          </select>
          <select className="input" value={filters.capability} onChange={(e) => update({ capability: e.target.value })}>
            <option value="">ทุกประเภทพื้นที่</option>
            {ROOM_CAPABILITY_VALUES.map((capability) => (
              <option key={capability} value={capability}>
                {getRoomCapabilityLabel(capability)}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.operational}
            onChange={(e) => update({ operational: e.target.value as Filters["operational"] })}
          >
            <option value="ALL">ทุกสถานะการใช้งาน</option>
            <option value="ACTIVE">เปิดใช้งาน</option>
            <option value="INACTIVE">ปิดใช้งาน</option>
          </select>
          <select
            className="input"
            value={filters.booking}
            onChange={(e) => update({ booking: e.target.value as Filters["booking"] })}
          >
            <option value="ALL">ทุกสถานะการจอง</option>
            <option value="ENABLED">เปิดให้จอง</option>
            <option value="DISABLED">ไม่เปิดให้จอง</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <TablePagination
          total={data.total}
          page={filters.page}
          pageSize={filters.pageSize}
          pageSizeOptions={[...ROOM_LIST_PAGE_SIZES]}
          onPageChange={(page) => {
            if (page !== filtersRef.current.page) update({ page });
          }}
          onPageSizeChange={(pageSize) => update({ pageSize })}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className={`card p-0 overflow-hidden ${loading ? "opacity-60" : ""}`}>
        {data.rooms.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <DoorOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p>ไม่พบห้องตามเงื่อนไขที่เลือก</p>
          </div>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">ห้อง</th>
                  <th className="px-4 py-3 font-medium">อาคาร / ชั้น</th>
                  <th className="px-4 py-3 font-medium">ความจุ</th>
                  <th className="px-4 py-3 font-medium">ประเภทพื้นที่</th>
                  <th className="px-4 py-3 font-medium">การอนุมัติ</th>
                  <th className="px-4 py-3 font-medium">สถานะการตั้งค่า</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rooms.map((room) => (
                  <RoomRow key={room.id} room={room} />
                ))}
              </tbody>
            </table>
            <ul className="divide-y md:hidden">
              {data.rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Capabilities({ room }: { room: AdminRoomListItem }) {
  if (room.capabilities.length === 0) {
    return <span className="text-xs text-amber-700">ยังไม่ได้ตั้งค่าประเภทพื้นที่</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {room.capabilities.map((capability) => (
        <span key={capability} className="badge bg-blue-50 text-blue-700">
          {getRoomCapabilityLabel(capability)}
        </span>
      ))}
    </div>
  );
}

function CapacityText({ capacity }: { capacity: number }) {
  return capacity > 0 ? <>{capacity} คน</> : <span className="text-amber-700">ยังไม่ได้ตั้งค่าความจุ</span>;
}

function HealthCell({ room }: { room: AdminRoomListItem }) {
  return (
    <div>
      <HealthBadge health={room.health} />
      {room.issues.length > 0 && (
        <ul className="mt-1 text-xs text-amber-700">
          {room.issues.map((issue) => (
            <li key={issue}>• {getRoomConfigIssueLabel(issue)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomRow({ room }: { room: AdminRoomListItem }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <Link href={`/admin/rooms/${room.id}`} className="font-medium text-gray-900 hover:underline">
          {room.roomCode}
        </Link>
        <p className="text-xs text-gray-500">{room.name}</p>
      </td>
      <td className="px-4 py-3 text-gray-600">
        {room.building ?? "—"}
        {room.floor !== null && ` / ชั้น ${room.floor}`}
      </td>
      <td className="px-4 py-3">
        <CapacityText capacity={room.capacity} />
      </td>
      <td className="px-4 py-3">
        <Capabilities room={room} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {room.bookingEnabled ? getApprovalPolicyLabel(room.approvalPolicy) : "—"}
      </td>
      <td className="px-4 py-3">
        <HealthCell room={room} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/admin/rooms/${room.id}`} className="btn-secondary px-3 py-1.5 text-xs">
          ตั้งค่า
          <ChevronRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function RoomCard({ room }: { room: AdminRoomListItem }) {
  return (
    <li>
      <Link href={`/admin/rooms/${room.id}`} className="block space-y-2 p-4 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-gray-900">{room.roomCode}</p>
            <p className="text-xs text-gray-500">{room.name}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
        <p className="text-xs text-gray-600">
          ความจุ: <CapacityText capacity={room.capacity} />
        </p>
        <Capabilities room={room} />
        <HealthCell room={room} />
      </Link>
    </li>
  );
}

function CreateRoomForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (roomId: string) => void }) {
  const [form, setForm] = useState({ name: "", roomCode: "", description: "", building: "", floor: "", capacity: "0" });
  const [guestAccess, setGuestAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const result = await createRoomAction({
      name: form.name,
      roomCode: form.roomCode,
      description: form.description,
      building: form.building,
      floor: form.floor === "" ? null : Number(form.floor),
      capacity: Number(form.capacity),
      guestAccess,
    });
    setSaving(false);
    if ("success" in result) onCreated(result.roomId);
    else setError(result.error);
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="card mb-4">
      <h2 className="mb-1 text-lg font-semibold">เพิ่มห้องใหม่</h2>
      <p className="mb-4 text-sm text-gray-500">
        ห้องใหม่จะเปิดใช้งานทันทีแต่ยังไม่เปิดให้จอง สามารถตั้งค่าประเภทพื้นที่และช่วงเวลาที่เปิดให้จองได้ในขั้นตอนถัดไป
      </p>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">ชื่อห้อง</label>
            <input className="input" required placeholder="เช่น ห้องประชุม A" {...field("name")} />
          </div>
          <div>
            <label className="label">รหัสห้อง</label>
            <input
              className="input"
              required
              placeholder="เช่น A4-404"
              value={form.roomCode}
              onChange={(e) => setForm({ ...form, roomCode: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="label">ความจุ (คน)</label>
            <input className="input" type="number" min={0} step={1} {...field("capacity")} />
          </div>
          <div>
            <label className="label">อาคาร</label>
            <input className="input" placeholder="เช่น A4" {...field("building")} />
          </div>
          <div>
            <label className="label">ชั้น</label>
            <input className="input" type="number" step={1} {...field("floor")} />
          </div>
          <div>
            <label className="label">รายละเอียด</label>
            <input className="input" {...field("description")} />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={guestAccess} onChange={(e) => setGuestAccess(e.target.checked)} className="h-4 w-4" />
          อนุญาตผู้เยี่ยมชมเข้าใช้ห้องนี้
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "กำลังสร้าง..." : "สร้างห้องและตั้งค่าต่อ"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}
