"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  DoorOpen,
  Clock,
  User,
  Users,
  X,
  Filter,
} from "lucide-react";
import {
  getCalendarDataAction,
  getAllRoomsForCalendarAction,
} from "@/actions/calendar";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────
interface Booking {
  id: string;
  type: "booking";
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  groupName: string | null;
  start: string;
  end: string;
  isUsed: boolean;
}

interface Session {
  id: string;
  type: "session";
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  start: string;
  end: string | null;
  status: string;
}

type CalendarEvent = Booking | Session;

interface RoomInfo {
  id: string;
  name: string;
  roomCode: string;
}

function parseRoomCode(roomCode: string): { building: string; floor: string } {
  const normalized = roomCode.trim().toUpperCase();
  const match = normalized.match(/^([A-Z]\d)-([1-9])\d{2}$/);
  if (!match) {
    return { building: "OTHER", floor: "OTHER" };
  }

  return {
    building: match[1],
    floor: match[2],
  };
}

// ─── Color Palette ─────────────────────────────────────
const ROOM_COLORS = [
  {
    bg: "bg-blue-100",
    border: "border-blue-300",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  {
    bg: "bg-emerald-100",
    border: "border-emerald-300",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
  },
  {
    bg: "bg-amber-100",
    border: "border-amber-300",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  {
    bg: "bg-purple-100",
    border: "border-purple-300",
    text: "text-purple-800",
    dot: "bg-purple-500",
  },
  {
    bg: "bg-rose-100",
    border: "border-rose-300",
    text: "text-rose-800",
    dot: "bg-rose-500",
  },
  {
    bg: "bg-cyan-100",
    border: "border-cyan-300",
    text: "text-cyan-800",
    dot: "bg-cyan-500",
  },
  {
    bg: "bg-sky-100",
    border: "border-sky-300",
    text: "text-sky-800",
    dot: "bg-sky-500",
  },
  {
    bg: "bg-indigo-100",
    border: "border-indigo-300",
    text: "text-indigo-800",
    dot: "bg-indigo-500",
  },
];

// ─── Helpers ───────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day + 1); // Mon
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDay(date: Date): string {
  return date.toLocaleDateString("th-TH", { weekday: "short", day: "numeric" });
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00

// ─── Main Component ────────────────────────────────────
export function CalendarClient() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"overview" | "room">("overview");
  const [timeRange, setTimeRange] = useState<"day" | "week">("week");
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [selectedFloor, setSelectedFloor] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "STUDENT" | "GUEST">(
    "ALL",
  );
  const [showFilter, setShowFilter] = useState(false);

  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );

  // Room color map
  const roomColorMap = useMemo(() => {
    const map: Record<string, (typeof ROOM_COLORS)[number]> = {};
    rooms.forEach((r, i) => {
      map[r.id] = ROOM_COLORS[i % ROOM_COLORS.length];
    });
    return map;
  }, [rooms]);

  const buildingOptions = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((room) => {
      set.add(parseRoomCode(room.roomCode).building);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const floorOptions = useMemo(() => {
    if (!selectedBuilding) return [];
    const set = new Set<string>();
    rooms.forEach((room) => {
      const parsed = parseRoomCode(room.roomCode);
      if (parsed.building === selectedBuilding) {
        set.add(parsed.floor);
      }
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [rooms, selectedBuilding]);

  const filteredRooms = useMemo(() => {
    if (!selectedBuilding || !selectedFloor) return [];
    return rooms
      .filter((room) => {
        const parsed = parseRoomCode(room.roomCode);
        return (
          parsed.building === selectedBuilding && parsed.floor === selectedFloor
        );
      })
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  }, [rooms, selectedBuilding, selectedFloor]);

  // Calculate date range
  const dateRange = useMemo(() => {
    if (timeRange === "week") {
      return { start: getWeekStart(currentDate), end: getWeekEnd(currentDate) };
    }
    return { start: getDayStart(currentDate), end: getDayEnd(currentDate) };
  }, [currentDate, timeRange]);

  // Get week days for header
  const weekDays = useMemo(() => {
    if (timeRange === "day") return [new Date(currentDate)];
    const days: Date[] = [];
    const start = getWeekStart(currentDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate, timeRange]);

  // Load rooms
  useEffect(() => {
    getAllRoomsForCalendarAction().then((res) => setRooms(res.rooms));
  }, []);

  // Load events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    const res = await getCalendarDataAction({
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString(),
      roomId: viewMode === "room" ? selectedRoom : undefined,
      roleFilter,
    });
    if (!("error" in res)) {
      setEvents([...res.bookings, ...res.sessions]);
    }
    setLoading(false);
  }, [dateRange, viewMode, selectedRoom, roleFilter]);

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, viewMode, selectedRoom, roleFilter]);

  // Navigation
  function goToday() {
    setCurrentDate(new Date());
  }
  function goPrev() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - (timeRange === "week" ? 7 : 1));
    setCurrentDate(d);
  }
  function goNext() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (timeRange === "week" ? 7 : 1));
    setCurrentDate(d);
  }

  // Header label
  const headerLabel = useMemo(() => {
    if (timeRange === "day") {
      return currentDate.toLocaleDateString("th-TH", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    const start = getWeekStart(currentDate);
    const end = getWeekEnd(currentDate);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}`;
    }
    return `${formatDate(start)} – ${formatDate(end)}`;
  }, [currentDate, timeRange]);

  return (
    <div>
      {/* ─── Top Bar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-purple-600" />
            ตารางการจองห้อง
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ภาพรวมการจองและการใช้ห้องทั้งหมด
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter button */}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
              showFilter
                ? "bg-purple-50 border-purple-200 text-purple-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            <Filter className="h-4 w-4" />
            ตัวกรอง
          </button>
        </div>
      </div>

      {/* ─── Filters ─── */}
      {showFilter && (
        <div className="bg-white border rounded-xl p-4 mb-4 flex flex-wrap items-center gap-4">
          {/* View Mode */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              มุมมอง
            </label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setViewMode("overview")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "overview"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                ภาพรวม
              </button>
              <button
                onClick={() => {
                  setViewMode("room");
                  if (!selectedBuilding && buildingOptions.length > 0) {
                    setSelectedBuilding(buildingOptions[0]);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l",
                  viewMode === "room"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                รายห้อง
              </button>
            </div>
          </div>

          {/* Time Range */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              ช่วงเวลา
            </label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setTimeRange("day")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  timeRange === "day"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                วัน
              </button>
              <button
                onClick={() => setTimeRange("week")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors border-l",
                  timeRange === "week"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                สัปดาห์
              </button>
            </div>
          </div>

          {/* Room Selector (Single Room mode) */}
          {viewMode === "room" && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  อาคาร
                </label>
                <select
                  className="border rounded-lg px-3 py-1.5 text-sm bg-white min-w-32"
                  value={selectedBuilding}
                  onChange={(e) => {
                    setSelectedBuilding(e.target.value);
                    setSelectedFloor("");
                    setSelectedRoom("");
                  }}
                >
                  <option value="">เลือกอาคาร</option>
                  {buildingOptions.map((building) => (
                    <option key={building} value={building}>
                      {building}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  ชั้น
                </label>
                <select
                  className="border rounded-lg px-3 py-1.5 text-sm bg-white min-w-28"
                  value={selectedFloor}
                  onChange={(e) => {
                    setSelectedFloor(e.target.value);
                    setSelectedRoom("");
                  }}
                  disabled={!selectedBuilding}
                >
                  <option value="">เลือกชั้น</option>
                  {floorOptions.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor === "OTHER" ? "OTHER" : `ชั้น ${floor}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  เลือกห้อง
                </label>
                <select
                  className="border rounded-lg px-3 py-1.5 text-sm bg-white min-w-48"
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  disabled={!selectedFloor}
                >
                  <option value="">เลือกห้อง</option>
                  {filteredRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.roomCode})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Role Filter */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Role
            </label>
            <select
              className="border rounded-lg px-3 py-1.5 text-sm bg-white"
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(e.target.value as typeof roleFilter)
              }
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="STUDENT">STUDENT</option>
              <option value="GUEST">GUEST</option>
            </select>
          </div>
        </div>
      )}

      {/* ─── Date Navigation ─── */}
      <div className="flex items-center justify-between bg-white border rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            วันนี้
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">{headerLabel}</h2>
        <div className="text-sm text-gray-500">{events.length} รายการ</div>
      </div>

      {/* ─── Calendar Body ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-600 border-t-transparent" />
        </div>
      ) : viewMode === "overview" ? (
        <OverviewGrid
          rooms={rooms}
          events={events}
          weekDays={weekDays}
          timeRange={timeRange}
          roomColorMap={roomColorMap}
          onEventClick={setSelectedEvent}
        />
      ) : (
        <SingleRoomCalendar
          events={events}
          weekDays={weekDays}
          timeRange={timeRange}
          roomColorMap={roomColorMap}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ─── Event Detail Modal ─── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// Overview Grid: Rows = Rooms, Columns = Hours
// ═════════════════════════════════════════════════════════
function OverviewGrid({
  rooms,
  events,
  weekDays,
  timeRange,
  roomColorMap,
  onEventClick,
}: {
  rooms: RoomInfo[];
  events: CalendarEvent[];
  weekDays: Date[];
  timeRange: "day" | "week";
  roomColorMap: Record<string, (typeof ROOM_COLORS)[number]>;
  onEventClick: (e: CalendarEvent) => void;
}) {
  if (rooms.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
        <DoorOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>ยังไม่มีห้องในระบบ</p>
      </div>
    );
  }

  if (timeRange === "day") {
    return (
      <DayOverview
        rooms={rooms}
        events={events}
        date={weekDays[0]}
        roomColorMap={roomColorMap}
        onEventClick={onEventClick}
      />
    );
  }

  // Week overview: For each day, show room usage blocks
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="grid border-b"
        style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}
      >
        <div className="px-3 py-2.5 bg-gray-50 font-medium text-sm text-gray-600 border-r">
          ห้อง
        </div>
        {weekDays.map((day, i) => {
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div
              key={i}
              className={cn(
                "px-2 py-2.5 text-center text-sm font-medium border-r last:border-r-0",
                isToday
                  ? "bg-purple-50 text-purple-700"
                  : "bg-gray-50 text-gray-600",
              )}
            >
              {formatShortDay(day)}
            </div>
          );
        })}
      </div>

      {/* Room rows */}
      {rooms.map((room) => {
        const color = roomColorMap[room.id];
        return (
          <div
            key={room.id}
            className="grid border-b last:border-b-0"
            style={{
              gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)`,
            }}
          >
            {/* Room label */}
            <div className="px-3 py-3 border-r flex items-center gap-2">
              <div
                className={cn("w-2.5 h-2.5 rounded-full shrink-0", color.dot)}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {room.name}
                </p>
                <p className="text-xs text-gray-400">{room.roomCode}</p>
              </div>
            </div>

            {/* Day cells */}
            {weekDays.map((day, di) => {
              const dayStart = getDayStart(day);
              const dayEnd = getDayEnd(day);
              const dayEvents = events.filter((e) => {
                if (e.roomId !== room.id) return false;
                const eStart = new Date(e.start);
                const eEnd = e.end ? new Date(e.end) : new Date();
                return eStart <= dayEnd && eEnd >= dayStart;
              });

              return (
                <div
                  key={di}
                  className={cn(
                    "px-1.5 py-2 border-r last:border-r-0 min-h-15",
                    day.toDateString() === new Date().toDateString() &&
                      "bg-purple-50/30",
                  )}
                >
                  {dayEvents.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((evt) => (
                        <button
                          key={evt.id}
                          onClick={() => onEventClick(evt)}
                          className={cn(
                            "w-full text-left px-1.5 py-1 rounded text-xs truncate border transition-all hover:shadow-sm",
                            color.bg,
                            color.border,
                            color.text,
                          )}
                          title={`${evt.userName} ${formatTime(evt.start)}`}
                        >
                          <span className="font-medium">
                            {formatTime(evt.start)}
                          </span>{" "}
                          <span className="opacity-75">{evt.userName}</span>
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="text-xs text-gray-400 text-center">
                          +{dayEvents.length - 3} อีก
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// Day Overview (All Rooms × Hours)
// ═════════════════════════════════════════════════════════
function DayOverview({
  rooms,
  events,
  date,
  roomColorMap,
  onEventClick,
}: {
  rooms: RoomInfo[];
  events: CalendarEvent[];
  date: Date;
  roomColorMap: Record<string, (typeof ROOM_COLORS)[number]>;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const dayStart = getDayStart(date);
  const dayEnd = getDayEnd(date);

  return (
    <div className="bg-white border rounded-xl overflow-x-auto">
      <div className="min-w-225">
        {/* Time header */}
        <div
          className="grid border-b"
          style={{ gridTemplateColumns: `140px repeat(${HOURS.length}, 1fr)` }}
        >
          <div className="px-3 py-2.5 bg-gray-50 font-medium text-sm text-gray-600 border-r sticky left-0 z-10">
            ห้อง
          </div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="px-1 py-2.5 text-center text-xs font-medium text-gray-500 bg-gray-50 border-r last:border-r-0"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Room rows with time blocks */}
        {rooms.map((room) => {
          const color = roomColorMap[room.id];
          const roomEvents = events.filter((e) => {
            if (e.roomId !== room.id) return false;
            const eStart = new Date(e.start);
            const eEnd = e.end ? new Date(e.end) : new Date();
            return eStart <= dayEnd && eEnd >= dayStart;
          });

          return (
            <div
              key={room.id}
              className="grid border-b last:border-b-0"
              style={{
                gridTemplateColumns: `140px repeat(${HOURS.length}, 1fr)`,
              }}
            >
              {/* Room label */}
              <div className="px-3 py-3 border-r flex items-center gap-2 sticky left-0 bg-white z-10">
                <div
                  className={cn("w-2.5 h-2.5 rounded-full shrink-0", color.dot)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {room.name}
                  </p>
                  <p className="text-xs text-gray-400">{room.roomCode}</p>
                </div>
              </div>

              {/* Hour cells */}
              {HOURS.map((h) => {
                const cellStart = new Date(date);
                cellStart.setHours(h, 0, 0, 0);
                const cellEnd = new Date(date);
                cellEnd.setHours(h + 1, 0, 0, 0);

                const cellEvents = roomEvents.filter((e) => {
                  const eStart = new Date(e.start);
                  const eEnd = e.end ? new Date(e.end) : new Date();
                  return eStart < cellEnd && eEnd > cellStart;
                });

                const isNow = new Date() >= cellStart && new Date() < cellEnd;

                return (
                  <div
                    key={h}
                    className={cn(
                      "border-r last:border-r-0 min-h-12 relative",
                      isNow && "bg-purple-50/50",
                    )}
                  >
                    {isNow && (
                      <div className="absolute top-0 left-0 w-0.5 h-full bg-purple-500 z-10" />
                    )}
                    {cellEvents.map((evt) => (
                      <button
                        key={evt.id}
                        onClick={() => onEventClick(evt)}
                        className={cn(
                          "w-full text-left px-1 py-0.5 text-xs truncate border-l-2 hover:opacity-80 transition-opacity",
                          color.bg,
                          color.text,
                          evt.type === "session"
                            ? "border-l-green-500"
                            : `border-l-current`,
                        )}
                        title={evt.userName}
                      >
                        {evt.userName}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// Single Room Calendar (Google Calendar style)
// ═════════════════════════════════════════════════════════
function SingleRoomCalendar({
  events,
  weekDays,
  timeRange,
  roomColorMap,
  onEventClick,
}: {
  events: CalendarEvent[];
  weekDays: Date[];
  timeRange: "day" | "week";
  roomColorMap: Record<string, (typeof ROOM_COLORS)[number]>;
  onEventClick: (e: CalendarEvent) => void;
}) {
  if (events.length === 0 && weekDays.length > 0) {
    // still show the grid
  }

  const columns = timeRange === "day" ? 1 : 7;

  return (
    <div className="bg-white border rounded-xl overflow-x-auto">
      <div className="min-w-150">
        {/* Day headers */}
        <div
          className="grid border-b"
          style={{ gridTemplateColumns: `60px repeat(${columns}, 1fr)` }}
        >
          <div className="bg-gray-50 border-r" />
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div
                key={i}
                className={cn(
                  "px-2 py-3 text-center border-r last:border-r-0",
                  isToday ? "bg-purple-50" : "bg-gray-50",
                )}
              >
                <p className="text-xs text-gray-500">
                  {day.toLocaleDateString("th-TH", { weekday: "short" })}
                </p>
                <p
                  className={cn(
                    "text-lg font-semibold mt-0.5",
                    isToday ? "text-purple-700" : "text-gray-800",
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="grid border-b last:border-b-0"
            style={{ gridTemplateColumns: `60px repeat(${columns}, 1fr)` }}
          >
            {/* Time label */}
            <div className="px-2 py-2 text-xs text-gray-400 text-right border-r bg-gray-50/50 font-medium">
              {String(h).padStart(2, "0")}:00
            </div>

            {/* Day columns */}
            {weekDays.map((day, di) => {
              const cellStart = new Date(day);
              cellStart.setHours(h, 0, 0, 0);
              const cellEnd = new Date(day);
              cellEnd.setHours(h + 1, 0, 0, 0);

              const cellEvents = events.filter((e) => {
                const eStart = new Date(e.start);
                const eEnd = e.end ? new Date(e.end) : new Date();
                return eStart < cellEnd && eEnd > cellStart;
              });

              const isNow = new Date() >= cellStart && new Date() < cellEnd;

              return (
                <div
                  key={di}
                  className={cn(
                    "border-r last:border-r-0 min-h-12 p-0.5 relative",
                    isNow && "bg-purple-50/40",
                  )}
                >
                  {isNow && (
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-purple-500 z-10" />
                  )}
                  {cellEvents.map((evt) => {
                    const color = roomColorMap[evt.roomId] || ROOM_COLORS[0];
                    return (
                      <button
                        key={evt.id}
                        onClick={() => onEventClick(evt)}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-xs border mb-0.5 transition-all hover:shadow-sm",
                          color.bg,
                          color.border,
                          color.text,
                        )}
                      >
                        <p className="font-medium truncate">{evt.userName}</p>
                        <p className="opacity-70 truncate">
                          {formatTime(evt.start)}
                          {evt.end
                            ? ` – ${formatTime(evt.end)}`
                            : " (ใช้งานอยู่)"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// Event Detail Modal
// ═════════════════════════════════════════════════════════
function EventDetailModal({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const isBooking = event.type === "booking";
  const booking = isBooking ? (event as Booking) : null;
  const session = !isBooking ? (event as Session) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className={cn(
              "p-2.5 rounded-xl",
              isBooking ? "bg-blue-50" : "bg-green-50",
            )}
          >
            {isBooking ? (
              <CalendarDays className={cn("h-6 w-6", "text-blue-600")} />
            ) : (
              <Clock className={cn("h-6 w-6", "text-green-600")} />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {isBooking ? "การจองห้อง" : "Session การใช้งาน"}
            </h3>
            <p className="text-sm text-gray-500">{event.roomName}</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3 mb-4">
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="ผู้ใช้"
            value={`${event.userName} (${event.userEmail})`}
          />
          <DetailRow
            icon={<DoorOpen className="h-4 w-4" />}
            label="ห้อง"
            value={`${event.roomName} (${event.roomCode})`}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="เวลาเริ่ม"
            value={new Date(event.start).toLocaleString("th-TH")}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="เวลาสิ้นสุด"
            value={
              event.end
                ? new Date(event.end).toLocaleString("th-TH")
                : "กำลังใช้งาน"
            }
          />

          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">Role:</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                event.userRole === "STUDENT"
                  ? "bg-blue-100 text-blue-700"
                  : event.userRole === "SUPER_ADMIN"
                    ? "bg-amber-100 text-amber-700"
                    : event.userRole === "ADMIN"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-700",
              )}
            >
              {event.userRole}
            </span>
          </div>

          {/* Booking specific */}
          {booking && (
            <>
              {booking.groupName && (
                <DetailRow
                  icon={<Users className="h-4 w-4" />}
                  label="กลุ่ม"
                  value={booking.groupName}
                />
              )}
              <div className="flex items-center gap-2">
                <div className="h-4 w-4" />
                <span className="text-sm text-gray-500">สถานะ:</span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    booking.isUsed
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700",
                  )}
                >
                  {booking.isUsed ? "ใช้แล้ว" : "ยังไม่ใช้"}
                </span>
              </div>
            </>
          )}

          {/* Session specific */}
          {session && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4" />
              <span className="text-sm text-gray-500">สถานะ:</span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  session.status === "ACTIVE"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600",
                )}
              >
                {session.status === "ACTIVE" ? "กำลังใช้งาน" : "เสร็จสิ้น"}
              </span>
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn-secondary w-full mt-2">
          ปิด
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    </div>
  );
}
