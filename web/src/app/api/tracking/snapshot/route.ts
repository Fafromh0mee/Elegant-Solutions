import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentAgentActivity, isAgentOnline } from "@/lib/agent-health";

export async function GET() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const [machines, pendingActivations] = await Promise.all([
    prisma.agentMachine.findMany({
      include: {
        room: { select: { roomCode: true, name: true } },
        agentSessions: {
          where: { status: "ACTIVE", revokedAt: null, expiresAt: { gt: now } },
          orderBy: { expiresAt: "desc" },
          take: 1,
          include: { user: { select: { name: true, email: true } } },
        },
        agentLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: [{ room: { roomCode: "asc" } }, { machineCode: "asc" }],
    }),
    prisma.agentActivationCode.findMany({
      where: {
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { room: { select: { roomCode: true, name: true } } },
      orderBy: [{ room: { roomCode: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  const result = machines.map((m) => {
    const latest = m.agentLogs[0] ?? null;
    const currentSession = m.agentSessions[0] ?? null;
    const isOnline = isAgentOnline(m, now);
    const currentActivity = currentAgentActivity(isOnline, currentSession, latest);

    return {
      id: m.id,
      machineCode: m.machineCode,
      hostname: m.hostname,
      platform: m.platform,
      isActive: m.isActive,
      room: m.room,
      isOnline,
      lastSeen: m.lastSeen?.toISOString() ?? null,
      currentUser: currentSession?.user ?? null,
      sessionExpiresAt: currentSession?.expiresAt.toISOString() ?? null,
      activeApp: currentActivity?.activeApp ?? null,
      activeTitle: currentActivity?.activeTitle ?? null,
      riskLevel: currentActivity?.riskLevel ?? "NORMAL",
      loggedSince: currentActivity?.createdAt.toISOString() ?? null,
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
    pendingActivations: pendingActivations.map((activation) => ({
      id: activation.id,
      roomCode: activation.room.roomCode,
      roomName: activation.room.name,
      reservedMachineCode: activation.reservedMachineCode,
      expiresAt: activation.expiresAt.toISOString(),
    })),
  });
}
