"use client";

import {
  Activity,
  Clock,
  DoorOpen,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AnalyticsData } from "@/actions/analytics";

// ─── Mini Charts ─────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 400;
  const H = 64;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - (d.count / max) * H * 0.9 - H * 0.05,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spk)" />
      <path d={line} stroke="#3b82f6" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HourlyBars({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const peakHour = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  return (
    <div className="flex items-end gap-px h-20 w-full">
      {data.map((d) => {
        const isPeak = d.hour === peakHour.hour;
        const h = max > 0 ? Math.max((d.count / max) * 72, d.count > 0 ? 3 : 0) : 0;
        return (
          <div key={d.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className={`w-full rounded-t-sm transition-all ${isPeak ? "bg-blue-500" : "bg-blue-200 group-hover:bg-blue-400"}`}
              style={{ height: `${h}px` }}
            />
            <span className="text-[9px] text-gray-400 hidden sm:block">
              {d.hour % 6 === 0 ? `${d.hour}` : ""}
            </span>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
              {d.hour}:00 — {d.count} ครั้ง
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBar({
  label,
  sub,
  count,
  max,
  color = "bg-blue-500",
}: {
  label: string;
  sub?: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
      <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-10 text-right shrink-0">
        {count}
      </span>
    </div>
  );
}

// ─── Role pill colors ────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-indigo-100 text-indigo-700",
  STUDENT: "bg-blue-100 text-blue-700",
  GUEST: "bg-gray-100 text-gray-600",
};

const ROLE_BAR: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-500",
  ADMIN: "bg-indigo-500",
  STUDENT: "bg-blue-500",
  GUEST: "bg-gray-400",
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const { summary, topRooms, buildingSummary, dailySessions, hourlyDistribution, weekdayDistribution, roleDistribution, securityEvents } = data;

  const maxRoom = topRooms[0]?.sessionCount ?? 1;
  const maxWeekday = Math.max(...weekdayDistribution.map((d) => d.count), 1);
  const totalRoles = roleDistribution.reduce((s, r) => s + r.count, 0);

  const peakDay = weekdayDistribution.reduce((a, b) => (b.count > a.count ? b : a), weekdayDistribution[0]);
  const peakHour = hourlyDistribution.reduce((a, b) => (b.count > a.count ? b : a), hourlyDistribution[0]);

  const faceRate =
    summary.totalUsers > 0
      ? Math.round((summary.faceEnrolled / summary.totalUsers) * 100)
      : 0;

  return (
    <div className="space-y-6">

      {/* ─── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DoorOpen className="h-5 w-5" />}
          label="Session ทั้งหมด"
          value={summary.totalSessions.toLocaleString()}
          sub={`${summary.activeSessions} กำลังใช้งาน`}
          tone="blue"
        />
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          label="ผู้ใช้งาน 30 วัน"
          value={summary.uniqueUsersLast30.toLocaleString()}
          sub="unique users"
          tone="green"
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="เวลาเฉลี่ย/ครั้ง"
          value={`${summary.avgSessionMinutes} นาที`}
          sub="เฉลี่ยต่อ session"
          tone="amber"
        />
        <SummaryCard
          icon={<Activity className="h-5 w-5" />}
          label="Face Enrollment"
          value={`${faceRate}%`}
          sub={`${summary.faceEnrolled} / ${summary.totalUsers} คน`}
          tone="purple"
        />
      </div>

      {/* ─── Sessions Trend ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-800">Sessions 30 วันล่าสุด</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                รวม {dailySessions.reduce((s, d) => s + d.count, 0).toLocaleString()} session
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-blue-400" />
          </div>
          <Sparkline data={dailySessions} />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">
              {dailySessions[0]?.date.slice(5)}
            </span>
            <span className="text-[10px] text-gray-400">
              {dailySessions[dailySessions.length - 1]?.date.slice(5)}
            </span>
          </div>
        </div>

        {/* Security Events */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-800">Security Events</h2>
          </div>
          <div className="space-y-3">
            {securityEvents.map((e) => (
              <div key={e.action} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{e.label}</span>
                <span className={`text-sm font-bold ${e.color}`}>
                  {e.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Top Rooms ─────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">ห้องที่ใช้งานมากที่สุด</h2>
        {topRooms.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีข้อมูล</p>
        ) : (
          <div className="space-y-3">
            {topRooms.map((r, i) => (
              <div key={r.roomCode} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <HorizontalBar
                    label={r.name}
                    sub={r.roomCode}
                    count={r.sessionCount}
                    max={maxRoom}
                    color={i === 0 ? "bg-blue-500" : i < 3 ? "bg-blue-400" : "bg-blue-200"}
                  />
                </div>
                <span className="text-xs text-gray-400 shrink-0 w-20 text-right">
                  {Math.round(r.totalMinutes / 60)} ชม.
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Peak Hours + Weekday + Role ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Peak Hours */}
        <div className="card md:col-span-1">
          <div className="mb-3">
            <h2 className="font-semibold text-gray-800">ช่วงเวลาที่นิยม</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              ช่วงพีค: <span className="font-semibold text-blue-600">{peakHour.hour}:00 น.</span>
            </p>
          </div>
          <HourlyBars data={hourlyDistribution} />
        </div>

        {/* Weekday */}
        <div className="card">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-800">วันที่นิยม</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              พีค: <span className="font-semibold text-blue-600">วัน{peakDay.day}</span>
            </p>
          </div>
          <div className="space-y-2">
            {weekdayDistribution.map((d) => (
              <HorizontalBar
                key={d.day}
                label={`วัน${d.day}`}
                count={d.count}
                max={maxWeekday}
                color={d.count === peakDay.count ? "bg-blue-500" : "bg-blue-200"}
              />
            ))}
          </div>
        </div>

        {/* Role Distribution */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">สัดส่วนผู้ใช้</h2>
          <div className="space-y-3">
            {roleDistribution
              .sort((a, b) => b.count - a.count)
              .map((r) => {
                const pct = totalRoles > 0 ? Math.round((r.count / totalRoles) * 100) : 0;
                return (
                  <div key={r.role}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOR[r.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.role}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">
                        {r.count} <span className="text-xs text-gray-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div
                        className={`h-1.5 rounded-full ${ROLE_BAR[r.role] ?? "bg-gray-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ─── Building Summary ──────────────────────────────── */}
      {buildingSummary.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">สรุปตามอาคาร</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {buildingSummary.map((b) => (
              <div
                key={b.building}
                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center"
              >
                <p className="text-xl font-bold text-gray-800">{b.building}</p>
                <p className="text-xs text-gray-500 mt-1">{b.roomCount} ห้อง</p>
                <p className="text-sm font-semibold text-blue-600 mt-0.5">
                  {b.sessionCount.toLocaleString()} ครั้ง
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "green" | "amber" | "purple";
}) {
  const toneClass: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="card flex items-start gap-3">
      <div className={`rounded-lg p-2 shrink-0 ${toneClass[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-tight truncate">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
