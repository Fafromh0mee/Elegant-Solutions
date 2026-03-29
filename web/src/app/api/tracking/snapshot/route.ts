import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const machines = await prisma.agentMachine.findMany({
    where: { isActive: true },
    include: {
      room: { select: { roomCode: true, name: true } },
      agentLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { machineCode: "asc" },
  });

  const onlineThreshold = new Date(Date.now() - 30 * 1000);

  const result = machines.map((m) => {
    const latest = m.agentLogs[0] ?? null;
    const isOnline = m.lastSeen ? m.lastSeen > onlineThreshold : false;

    return {
      id: m.id,
      machineCode: m.machineCode,
      hostname: m.hostname,
      room: m.room,
      isOnline,
      lastSeen: m.lastSeen?.toISOString() ?? null,
      currentUser: latest?.user ?? null,
      activeApp: latest?.activeApp ?? null,
      activeTitle: latest?.activeTitle ?? null,
      riskLevel: latest?.riskLevel ?? "NORMAL",
      loggedSince: latest?.createdAt?.toISOString() ?? null,
    };
  });

  const activeRooms = new Set(
    result.filter((m) => m.isOnline && m.room).map((m) => m.room!.roomCode),
  ).size;

  const watchCount = result.filter(
    (m) => m.isOnline && m.riskLevel === "WATCH",
  ).length;

  const onlineCount = result.filter((m) => m.isOnline).length;

  return NextResponse.json({
    machines: result,
    summary: {
      totalMachines: machines.length,
      onlineMachines: onlineCount,
      activeRooms,
      watchAlerts: watchCount,
    },
  });
}
