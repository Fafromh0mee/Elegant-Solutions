"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Monitor,
  RefreshCw,
  ShieldCheck,
  User,
  Wifi,
} from "lucide-react";

type RoomState = {
  roomCode: string;
  roomName: string;
  occupancy: number;
  capacity: number;
  confidence: number;
};

type UserAppUsage = {
  userName: string;
  roomCode: string;
  app: string;
  website: string;
  status: "NORMAL" | "WATCH";
  minutes: number;
};

type TrackingEvent = {
  at: string;
  type: "DETECTED" | "WARNING" | "CHECKED";
  message: string;
};

const baseRooms: RoomState[] = [
  {
    roomCode: "A101",
    roomName: "Innovation Lab",
    occupancy: 18,
    capacity: 30,
    confidence: 0.92,
  },
  {
    roomCode: "B204",
    roomName: "Data Classroom",
    occupancy: 26,
    capacity: 32,
    confidence: 0.88,
  },
  {
    roomCode: "C301",
    roomName: "Design Studio",
    occupancy: 9,
    capacity: 24,
    confidence: 0.95,
  },
  {
    roomCode: "D102",
    roomName: "Network Lab",
    occupancy: 14,
    capacity: 20,
    confidence: 0.9,
  },
];

const baseUsage: UserAppUsage[] = [
  {
    userName: "Anan P.",
    roomCode: "A101",
    app: "VS Code",
    website: "github.com",
    status: "NORMAL",
    minutes: 37,
  },
  {
    userName: "Mali K.",
    roomCode: "B204",
    app: "Chrome",
    website: "chat.openai.com",
    status: "WATCH",
    minutes: 19,
  },
  {
    userName: "Tee S.",
    roomCode: "D102",
    app: "Figma",
    website: "figma.com",
    status: "NORMAL",
    minutes: 42,
  },
  {
    userName: "Nita R.",
    roomCode: "B204",
    app: "YouTube",
    website: "youtube.com",
    status: "WATCH",
    minutes: 11,
  },
  {
    userName: "Pond W.",
    roomCode: "C301",
    app: "PyCharm",
    website: "docs.python.org",
    status: "NORMAL",
    minutes: 24,
  },
];

const baseEvents: TrackingEvent[] = [
  { at: "10:03", type: "DETECTED", message: "A101 occupancy increased to 18" },
  {
    at: "10:01",
    type: "WARNING",
    message: "B204 unusual website pattern detected",
  },
  { at: "09:58", type: "CHECKED", message: "Agent heartbeat check passed" },
  { at: "09:54", type: "DETECTED", message: "D102 check-in burst observed" },
  { at: "09:49", type: "CHECKED", message: "Model confidence recalibrated" },
];

function jitterRooms(data: RoomState[]) {
  return data.map((room) => {
    const delta = Math.floor(Math.random() * 5) - 2;
    const next = Math.max(0, Math.min(room.capacity, room.occupancy + delta));
    const confidenceDelta = Math.random() * 0.04 - 0.02;
    const confidence = Math.max(
      0.7,
      Math.min(0.99, room.confidence + confidenceDelta),
    );

    return {
      ...room,
      occupancy: next,
      confidence,
    };
  });
}

export function TrackingClient() {
  const [rooms, setRooms] = useState(baseRooms);
  const [usage] = useState(baseUsage);
  const [events, setEvents] = useState(baseEvents);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const anomalies = useMemo(
    () => usage.filter((u) => u.status === "WATCH").length,
    [usage],
  );
  const activeRooms = useMemo(
    () => rooms.filter((r) => r.occupancy > 0).length,
    [rooms],
  );
  const onlineAgents = useMemo(() => rooms.length + 1, [rooms]);
  const avgConfidence = useMemo(() => {
    const total = rooms.reduce((sum, r) => sum + r.confidence, 0);
    return Math.round((total / rooms.length) * 100);
  }, [rooms]);

  function pushHeartbeat() {
    const time = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    setEvents((prev) => [
      {
        at: time,
        type: "CHECKED",
        message: "Agent heartbeat check passed",
      },
      ...prev.slice(0, 6),
    ]);
  }

  function refreshMock() {
    setRefreshing(true);
    setRooms((prev) => jitterRooms(prev));
    pushHeartbeat();
    setLastUpdated(new Date());
    window.setTimeout(() => setRefreshing(false), 400);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRooms((prev) => jitterRooms(prev));
      setLastUpdated(new Date());
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-(--color-cta)" />
            Tracking Agent Dashboard (Mock)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ข้อมูลจำลองสำหรับทดสอบ UI และ workflow ติดตามการใช้งานห้องเรียน
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">
            อัปเดตล่าสุด {lastUpdated.toLocaleTimeString("th-TH")}
          </p>
          <button
            onClick={refreshMock}
            className="btn-secondary"
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Agents Online"
          value={onlineAgents}
          hint="รวม sensor + edge nodes"
          icon={<Wifi className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          label="Active Rooms"
          value={activeRooms}
          hint="ห้องที่มีคนใช้งานตอนนี้"
          icon={<Monitor className="h-5 w-5" />}
          tone="green"
        />
        <MetricCard
          label="Watch Alerts"
          value={anomalies}
          hint="พฤติกรรมที่ควรตรวจสอบ"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="amber"
        />
        <MetricCard
          label="Avg Confidence"
          value={`${avgConfidence}%`}
          hint="คุณภาพการติดตามโดยรวม"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2">
          <h2 className="font-semibold mb-4">Room Occupancy Board</h2>
          <div className="space-y-4">
            {rooms.map((room) => {
              const pct = Math.round((room.occupancy / room.capacity) * 100);
              const barTone =
                pct >= 90
                  ? "bg-red-500"
                  : pct >= 75
                    ? "bg-amber-500"
                    : "bg-emerald-500";

              return (
                <div
                  key={room.roomCode}
                  className="rounded-xl border border-gray-100 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {room.roomName}
                      </p>
                      <p className="text-xs text-gray-500">{room.roomCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {room.occupancy}/{room.capacity}
                      </p>
                      <p className="text-xs text-gray-500">
                        confidence {Math.round(room.confidence * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${barTone}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Live Event Stream</h2>
          <div className="space-y-3">
            {events.map((event, idx) => (
              <div
                key={`${event.at}-${event.message}-${idx}`}
                className="border-b last:border-b-0 pb-3 last:pb-0"
              >
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{event.at}</span>
                  <span
                    className={
                      event.type === "WARNING"
                        ? "text-red-600"
                        : "text-gray-500"
                    }
                  >
                    {event.type}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{event.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-4">User App/Site Snapshot (Mock)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">ผู้ใช้</th>
              <th className="pb-3 pr-4">ห้อง</th>
              <th className="pb-3 pr-4">App</th>
              <th className="pb-3 pr-4">Website</th>
              <th className="pb-3 pr-4">ระยะเวลา</th>
              <th className="pb-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((row) => (
              <tr
                key={`${row.userName}-${row.roomCode}-${row.website}`}
                className="border-b last:border-0"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    {row.userName}
                  </div>
                </td>
                <td className="py-3 pr-4">{row.roomCode}</td>
                <td className="py-3 pr-4">{row.app}</td>
                <td className="py-3 pr-4">{row.website}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Clock3 className="h-3.5 w-3.5" />
                    {row.minutes} นาที
                  </div>
                </td>
                <td className="py-3">
                  <span
                    className={
                      row.status === "WATCH"
                        ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                    }
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "purple";
}) {
  const toneClass: Record<string, string> = {
    blue: "bg-(--color-primary-light) text-(--color-primary)",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${toneClass[tone]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm text-gray-700">{label}</p>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        </div>
      </div>
    </div>
  );
}
