"use server";

import { prisma } from "@/lib/prisma";

export async function checkInAction(input: {
  userId: string;
  roomId: string;
}) {
  try {
    // Check if already has active session
    const existingSession = await prisma.session.findFirst({
      where: {
        userId: input.userId,
        roomId: input.roomId,
        status: "ACTIVE",
      },
    });

    if (existingSession) {
      return { error: "ผู้ใช้มี session ที่ยังเปิดอยู่ในห้องนี้", sessionId: existingSession.id };
    }

    const session = await prisma.session.create({
      data: {
        userId: input.userId,
        roomId: input.roomId,
        status: "ACTIVE",
      },
    });

    await prisma.log.create({
      data: {
        userId: input.userId,
        roomId: input.roomId,
        action: "CHECK_IN",
        details: `Check-in to room`,
      },
    });

    return { success: true, sessionId: session.id };
  } catch (error) {
    console.error("Check-in error:", error);
    return { error: "เกิดข้อผิดพลาดในการ Check-in" };
  }
}

export async function checkOutAction(input: {
  userId: string;
  roomId: string;
}) {
  try {
    const activeSession = await prisma.session.findFirst({
      where: {
        userId: input.userId,
        roomId: input.roomId,
        status: "ACTIVE",
      },
    });

    if (!activeSession) {
      return { error: "ไม่พบ session ที่เปิดอยู่" };
    }

    await prisma.session.update({
      where: { id: activeSession.id },
      data: {
        status: "COMPLETED",
        checkOut: new Date(),
      },
    });

    await prisma.log.create({
      data: {
        userId: input.userId,
        roomId: input.roomId,
        action: "CHECK_OUT",
        details: `Check-out from room`,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Check-out error:", error);
    return { error: "เกิดข้อผิดพลาดในการ Check-out" };
  }
}

export async function getSessionsAction(filters?: {
  roomId?: string;
  userId?: string;
  status?: "ACTIVE" | "COMPLETED";
}) {
  const where: Record<string, unknown> = {};
  if (filters?.roomId) where.roomId = filters.roomId;
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.status) where.status = filters.status;

  const sessions = await prisma.session.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, name: true, roomCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { sessions };
}
