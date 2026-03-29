"use server";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

  const onlineThreshold = new Date(Date.now() - 30 * 1000);

  const machines = await prisma.agentMachine.findMany({
    include: {
      room: { select: { roomCode: true, name: true } },
      agentLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { machineCode: "asc" },
  });

  return machines.map((m) => ({
    id: m.id,
    machineCode: m.machineCode,
    hostname: m.hostname,
    isActive: m.isActive,
    isOnline: m.lastSeen ? m.lastSeen > onlineThreshold : false,
    lastSeen: m.lastSeen,
    room: m.room,
    recentLogs: m.agentLogs,
  }));
}

export async function deactivateMachineAction(id: string) {
  await requireAdmin();

  await prisma.agentMachine.update({
    where: { id },
    data: { isActive: false },
  });

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
