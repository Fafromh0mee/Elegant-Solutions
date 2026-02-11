"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createRoomAction(input: {
  name: string;
  roomCode: string;
  description?: string;
  capacity?: number;
  guestAccess?: boolean;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    const existing = await prisma.room.findUnique({
      where: { roomCode: input.roomCode },
    });

    if (existing) {
      return { error: "รหัสห้องนี้ถูกใช้งานแล้ว" };
    }

    await prisma.room.create({
      data: {
        name: input.name,
        roomCode: input.roomCode,
        description: input.description || null,
        capacity: input.capacity || 0,
        guestAccess: input.guestAccess ?? false,
      },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "ROOM_CREATED",
        details: `Created room: ${input.name} (${input.roomCode})`,
      },
    });

    revalidatePath("/admin/rooms");
    return { success: true };
  } catch (error) {
    console.error("Create room error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function updateRoomAction(
  roomId: string,
  input: {
    name?: string;
    description?: string;
    capacity?: number;
    guestAccess?: boolean;
    isActive?: boolean;
  }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await prisma.room.update({
      where: { id: roomId },
      data: input,
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "ROOM_UPDATED",
        details: `Updated room: ${roomId}`,
      },
    });

    revalidatePath("/admin/rooms");
    return { success: true };
  } catch (error) {
    console.error("Update room error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function getRoomsAction() {
  const rooms = await prisma.room.findMany({
    orderBy: { createdAt: "desc" },
  });
  return { rooms };
}

export async function getAvailableRoomsAction() {
  const session = await auth();
  if (!session) return { rooms: [] };

  const where = session.user.role === "GUEST" ? { isActive: true, guestAccess: true } : { isActive: true };

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return { rooms };
}

export async function deleteRoomAction(roomId: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await prisma.room.delete({ where: { id: roomId } });
    revalidatePath("/admin/rooms");
    return { success: true };
  } catch (error) {
    console.error("Delete room error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
