"use server";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { issueMaintenanceCode, isMaintenanceAction, type MaintenanceAction } from "@/lib/agent-maintenance";
import { cancelActivationCode, issueActivationCode } from "@/lib/agent-activation";
import { isAgentOnline } from "@/lib/agent-health";

async function requireAdmin() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    throw new Error("ไม่มีสิทธิ์ดำเนินการ");
  }
  return session;
}

// ---- Machines ----

export async function getMachinesAction() {
  await requireAdmin();

  const machines = await prisma.agentMachine.findMany({
    include: {
      room: { select: { roomCode: true, name: true } },
      agentSessions: {
        where: { status: "ACTIVE", revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "desc" },
        take: 1,
        include: { user: { select: { name: true, email: true } } },
      },
      agentLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: [{ room: { roomCode: "asc" } }, { machineCode: "asc" }],
  });

  return machines.map((m) => ({
    id: m.id,
    machineCode: m.machineCode,
    hostname: m.hostname,
    platform: m.platform,
    isActive: m.isActive,
    isOnline: isAgentOnline(m),
    lastSeen: m.lastSeen,
    room: m.room,
    recentLogs: m.agentLogs,
    currentSession: m.agentSessions[0] ?? null,
  }));
}

export async function deactivateMachineAction(id: string) {
  await requireAdmin();

  await prisma.$transaction([
    prisma.agentSession.updateMany({
      where: { machineId: id, status: "ACTIVE", revokedAt: null },
      data: { status: "REVOKED", revokedAt: new Date() },
    }),
    prisma.agentMachine.update({ where: { id }, data: { isActive: false } }),
    prisma.agentAuditEvent.create({ data: { event: "AGENT_MACHINE_DEACTIVATED", machineId: id } }),
  ]);

  revalidatePath("/admin/tracking");
  return { success: true };
}

export async function createMaintenanceCodeAction(id: string, action: string) {
  const session = await requireAdmin();
  if (!isMaintenanceAction(action)) return { error: "ไม่รองรับการดำเนินการนี้" };

  const machine = await prisma.agentMachine.findUnique({ where: { id, isActive: true }, select: { id: true } });
  if (!machine) return { error: "ไม่พบเครื่องที่เปิดใช้งานอยู่" };

  const code = await issueMaintenanceCode({
    machineId: machine.id,
    createdById: session.user.id,
    action: action as MaintenanceAction,
  });
  revalidatePath("/admin/tracking");
  return { success: true, ...code };
}

export async function getActivationRoomsAction() {
  await requireAdmin();
  return prisma.room.findMany({
    where: { isActive: true },
    select: { id: true, roomCode: true, name: true },
    orderBy: { roomCode: "asc" },
  });
}

export async function createActivationCodeAction(roomId: string) {
  const session = await requireAdmin();
  try {
    const activation = await issueActivationCode({ roomId, createdById: session.user.id });
    revalidatePath("/admin/tracking");
    return { success: true as const, ...activation };
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_NOT_AVAILABLE") {
      return { error: "ไม่พบห้องที่พร้อมสำหรับการเพิ่มเครื่อง" };
    }
    throw error;
  }
}

export async function cancelActivationCodeAction(id: string) {
  const session = await requireAdmin();
  const cancelled = await cancelActivationCode({ id, cancelledById: session.user.id });
  if (!cancelled) return { error: "รหัสนี้ไม่สามารถยกเลิกได้" };
  revalidatePath("/admin/tracking");
  return { success: true };
}

export async function reactivateMachineAction(id: string) {
  await requireAdmin();

  await prisma.agentMachine.update({
    where: { id },
    data: { isActive: true },
  });

  revalidatePath("/admin/tracking");
  return { success: true };
}

export async function getAgentLogsAction(machineId: string, limit = 50) {
  await requireAdmin();

  return prisma.agentLog.findMany({
    where: { machineId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}

// ---- Blacklist ----

export async function getBlacklistAction() {
  await requireAdmin();
  return prisma.agentBlacklist.findMany({ orderBy: { createdAt: "desc" } });
}

export async function addBlacklistAction(pattern: string) {
  await requireAdmin();

  if (!pattern || pattern.trim().length === 0) {
    return { error: "กรุณาระบุ pattern" };
  }

  const cleaned = pattern.trim().toLowerCase();

  try {
    await prisma.agentBlacklist.create({ data: { pattern: cleaned } });
  } catch {
    return { error: "Pattern นี้มีอยู่แล้ว" };
  }

  revalidatePath("/admin/tracking");
  return { success: true };
}

export async function updateBlacklistAction(id: string, isActive: boolean) {
  await requireAdmin();

  await prisma.agentBlacklist.update({ where: { id }, data: { isActive } });

  revalidatePath("/admin/tracking");
  return { success: true };
}

export async function removeBlacklistAction(id: string) {
  await requireAdmin();

  await prisma.agentBlacklist.delete({ where: { id } });

  revalidatePath("/admin/tracking");
  return { success: true };
}
