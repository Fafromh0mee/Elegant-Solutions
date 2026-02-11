"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getLogsAction(filters?: {
  userId?: string;
  roomId?: string;
  action?: string;
  limit?: number;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "ไม่มีสิทธิ์ดำเนินการ", logs: [] };
  }

  const where: Record<string, unknown> = {};
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.roomId) where.roomId = filters.roomId;
  if (filters?.action) where.action = filters.action;

  const logs = await prisma.log.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      room: { select: { id: true, name: true, roomCode: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters?.limit || 100,
  });

  return { logs };
}
