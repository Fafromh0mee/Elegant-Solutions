"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function getCalendarDataAction(input: {
  startDate: string; // ISO string
  endDate: string;   // ISO string
  roomId?: string;
  roleFilter?: "ALL" | "STAFF" | "GUEST";
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "ไม่มีสิทธิ์เข้าถึง" };
  }

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);

  // Build where clause for access tokens (bookings)
  const tokenWhere: Record<string, unknown> = {
    OR: [
      // Token overlaps with the requested range
      { validFrom: { lte: end }, validTo: { gte: start } },
    ],
  };

  if (input.roomId) {
    tokenWhere.roomId = input.roomId;
  }

  if (input.roleFilter && input.roleFilter !== "ALL") {
    tokenWhere.user = { role: input.roleFilter };
  }

  const tokens = await prisma.accessToken.findMany({
    where: tokenWhere,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, name: true, roomCode: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: { validFrom: "asc" },
  });

  // Also get active sessions for the range
  const sessionWhere: Record<string, unknown> = {
    OR: [
      { checkIn: { lte: end }, checkOut: { gte: start } },
      { checkIn: { lte: end }, checkOut: null, status: "ACTIVE" },
    ],
  };

  if (input.roomId) {
    sessionWhere.roomId = input.roomId;
  }

  if (input.roleFilter && input.roleFilter !== "ALL") {
    sessionWhere.user = { role: input.roleFilter };
  }

  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, name: true, roomCode: true } },
    },
    orderBy: { checkIn: "asc" },
  });

  return {
    bookings: tokens.map((t) => ({
      id: t.id,
      type: "booking" as const,
      userId: t.user.id,
      userName: t.user.name,
      userEmail: t.user.email,
      userRole: t.user.role,
      roomId: t.room.id,
      roomName: t.room.name,
      roomCode: t.room.roomCode,
      groupName: t.group?.name || null,
      start: t.validFrom.toISOString(),
      end: t.validTo.toISOString(),
      isUsed: t.isUsed,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      type: "session" as const,
      userId: s.user.id,
      userName: s.user.name,
      userEmail: s.user.email,
      userRole: s.user.role,
      roomId: s.room.id,
      roomName: s.room.name,
      roomCode: s.room.roomCode,
      start: s.checkIn.toISOString(),
      end: s.checkOut?.toISOString() || null,
      status: s.status,
    })),
  };
}

export async function getAllRoomsForCalendarAction() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { rooms: [] };
  }

  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    select: { id: true, name: true, roomCode: true },
    orderBy: { name: "asc" },
  });

  return { rooms };
}
