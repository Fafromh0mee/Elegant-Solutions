"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

export async function generateAccessTokenAction(input: {
  roomId: string;
  validFrom: string;
  validTo: string;
}) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    // Check room access
    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
    });

    if (!room || !room.isActive) {
      return { error: "ห้องไม่พร้อมใช้งาน" };
    }

    if (session.user.role === "GUEST" && !room.guestAccess) {
      return { error: "คุณไม่มีสิทธิ์เข้าห้องนี้" };
    }

    const token = crypto.randomUUID();

    const accessToken = await prisma.accessToken.create({
      data: {
        token,
        userId: session.user.id,
        roomId: input.roomId,
        validFrom: new Date(input.validFrom),
        validTo: new Date(input.validTo),
      },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        roomId: input.roomId,
        action: "TOKEN_GENERATED",
        details: `Generated access token for room: ${room.roomCode}`,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, token: accessToken.token, tokenId: accessToken.id };
  } catch (error) {
    console.error("Generate token error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function getMyTokensAction() {
  const session = await auth();
  if (!session) return { tokens: [] };

  const tokens = await prisma.accessToken.findMany({
    where: { userId: session.user.id },
    include: { room: true, group: true },
    orderBy: { createdAt: "desc" },
  });

  return { tokens };
}

// Gate verification
export async function verifyAccessTokenAction(token: string, roomCode: string) {
  try {
    const accessToken = await prisma.accessToken.findUnique({
      where: { token },
      include: {
        user: { select: { id: true, name: true, role: true } },
        room: true,
        group: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, role: true } },
              },
            },
          },
        },
      },
    });

    if (!accessToken) {
      return { valid: false, reason: "Token ไม่ถูกต้อง" };
    }

    if (accessToken.room.roomCode !== roomCode) {
      return { valid: false, reason: "Token ไม่ตรงกับห้องนี้" };
    }

    const now = new Date();
    if (now < accessToken.validFrom || now > accessToken.validTo) {
      return { valid: false, reason: "Token หมดอายุหรือยังไม่ถึงเวลา" };
    }

    // Check for group or individual
    const users = accessToken.group
      ? accessToken.group.members.map((m: { user: { id: string; name: string; role: string } }) => m.user)
      : [accessToken.user];

    return {
      valid: true,
      tokenId: accessToken.id,
      users,
      roomId: accessToken.room.id,
      isGroup: !!accessToken.group,
    };
  } catch (error) {
    console.error("Verify token error:", error);
    return { valid: false, reason: "เกิดข้อผิดพลาดในการตรวจสอบ" };
  }
}
