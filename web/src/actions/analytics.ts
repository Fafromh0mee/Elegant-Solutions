"use server";

import { prisma } from "@/lib/prisma";

export type AnalyticsSummary = {
  totalSessions: number;
  activeSessions: number;
  uniqueUsersLast30: number;
  avgSessionMinutes: number;
  faceEnrolled: number;
  totalUsers: number;
};

export type RoomStat = {
  roomCode: string;
  name: string;
  sessionCount: number;
  totalMinutes: number;
};

export type BuildingStat = {
  building: string;
  roomCount: number;
  sessionCount: number;
};

export type DailyStat = { date: string; count: number };
export type HourlyStat = { hour: number; count: number };
export type WeekdayStat = { day: string; count: number };
export type RoleStat = { role: string; count: number };
export type SecurityStat = { action: string; label: string; count: number; color: string };

export type AnalyticsData = {
  summary: AnalyticsSummary;
  topRooms: RoomStat[];
  buildingSummary: BuildingStat[];
  dailySessions: DailyStat[];
  hourlyDistribution: HourlyStat[];
  weekdayDistribution: WeekdayStat[];
  roleDistribution: RoleStat[];
  securityEvents: SecurityStat[];
};

function extractBuilding(roomCode: string): string {
  const match = roomCode.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : roomCode.slice(0, 2).toUpperCase();
}

export async function getAnalyticsAction(): Promise<AnalyticsData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [allSessions, recentSessions, roleGroups, allLogs, faceCount, userCount] =
    await Promise.all([
      prisma.session.findMany({
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          status: true,
          userId: true,
          room: { select: { name: true, roomCode: true } },
        },
      }),
      prisma.session.findMany({
        where: { checkIn: { gte: thirtyDaysAgo } },
        select: { checkIn: true, userId: true },
      }),
      prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
      prisma.log.groupBy({ by: ["action"], _count: { id: true } }),
      prisma.faceProfile.count(),
      prisma.user.count(),
    ]);

  // ─── Summary ─────────────────────────────────────────────
  const activeSessions = allSessions.filter((s) => s.status === "ACTIVE").length;
  const completedWithTimes = allSessions.filter((s) => s.checkOut !== null);
  const totalMinutes = completedWithTimes.reduce((sum, s) => {
    return sum + (new Date(s.checkOut!).getTime() - new Date(s.checkIn).getTime()) / 60000;
  }, 0);
  const avgSessionMinutes = completedWithTimes.length
    ? Math.round(totalMinutes / completedWithTimes.length)
    : 0;
  const uniqueUsersLast30 = new Set(recentSessions.map((s) => s.userId)).size;

  // ─── Room stats ───────────────────────────────────────────
  const roomMap = new Map<
    string,
    { name: string; roomCode: string; sessionCount: number; totalMinutes: number }
  >();
  for (const s of allSessions) {
    const key = s.room.roomCode;
    const r = roomMap.get(key) ?? { name: s.room.name, roomCode: key, sessionCount: 0, totalMinutes: 0 };
    r.sessionCount++;
    if (s.checkOut) {
      r.totalMinutes +=
        (new Date(s.checkOut).getTime() - new Date(s.checkIn).getTime()) / 60000;
    }
    roomMap.set(key, r);
  }
  const topRooms = Array.from(roomMap.values())
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 10)
    .map((r) => ({ ...r, totalMinutes: Math.round(r.totalMinutes) }));

  // ─── Building summary ─────────────────────────────────────
  const buildingMap = new Map<string, { roomCodes: Set<string>; sessionCount: number }>();
  for (const s of allSessions) {
    const building = extractBuilding(s.room.roomCode);
    const b = buildingMap.get(building) ?? { roomCodes: new Set(), sessionCount: 0 };
    b.roomCodes.add(s.room.roomCode);
    b.sessionCount++;
    buildingMap.set(building, b);
  }
  const buildingSummary = Array.from(buildingMap.entries())
    .map(([building, data]) => ({
      building,
      roomCount: data.roomCodes.size,
      sessionCount: data.sessionCount,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);

  // ─── Daily sessions (last 30 days) ───────────────────────
  const dailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dailyMap.set(d.toISOString().split("T")[0], 0);
  }
  for (const s of recentSessions) {
    const day = new Date(s.checkIn).toISOString().split("T")[0];
    if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const dailySessions = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

  // ─── Hourly distribution ──────────────────────────────────
  const hourlyArr = new Array(24).fill(0);
  for (const s of allSessions) hourlyArr[new Date(s.checkIn).getHours()]++;
  const hourlyDistribution = hourlyArr.map((count, hour) => ({ hour, count }));

  // ─── Weekday distribution ─────────────────────────────────
  const dayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const weekdayArr = new Array(7).fill(0);
  for (const s of allSessions) weekdayArr[new Date(s.checkIn).getDay()]++;
  const weekdayDistribution = weekdayArr.map((count, i) => ({ day: dayLabels[i], count }));

  // ─── Role distribution ────────────────────────────────────
  const roleDistribution = roleGroups.map((r) => ({ role: r.role, count: r._count.id }));

  // ─── Security events ──────────────────────────────────────
  const securityDef: { action: string; label: string; color: string }[] = [
    { action: "CHECK_IN", label: "เข้าใช้งาน", color: "text-green-600" },
    { action: "CHECK_OUT", label: "ออกจากห้อง", color: "text-sky-600" },
    { action: "ACCESS_DENIED", label: "ปฏิเสธการเข้าถึง", color: "text-red-600" },
    { action: "FACE_DENIED", label: "Face ไม่ผ่าน", color: "text-orange-600" },
    { action: "FACE_VERIFIED", label: "Face ผ่าน", color: "text-emerald-600" },
    { action: "TOKEN_GENERATED", label: "สร้าง Token", color: "text-purple-600" },
  ];
  const logMap = new Map(allLogs.map((l) => [l.action as string, l._count.id]));
  const securityEvents = securityDef.map((d) => ({
    ...d,
    count: logMap.get(d.action) ?? 0,
  }));

  return {
    summary: { totalSessions: allSessions.length, activeSessions, uniqueUsersLast30, avgSessionMinutes, faceEnrolled: faceCount, totalUsers: userCount },
    topRooms,
    buildingSummary,
    dailySessions,
    hourlyDistribution,
    weekdayDistribution,
    roleDistribution,
    securityEvents,
  };
}
