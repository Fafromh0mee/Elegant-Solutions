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

  if (session.user.role === "GUEST" && session.user.status !== "APPROVED") {
    return { error: "บัญชี Guest ยังไม่ได้รับการอนุมัติ" };
  }

  try {
    const validFrom = new Date(input.validFrom);
    const validTo = new Date(input.validTo);
    const now = new Date();

    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
      return { error: "รูปแบบวันเวลาไม่ถูกต้อง" };
    }

    if (validFrom <= now) {
      return { error: "เวลาลงทะเบียนต้องเป็นเวลาล่วงหน้าอย่างน้อย 1 นาที" };
    }

    if (validTo <= validFrom) {
      return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น" };
    }

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
        validFrom,
        validTo,
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

function getCurrentDayAndTime() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return { dayOfWeek, currentTime: `${hh}:${mm}` };
}

// Gate verification by token first, then by studentId class schedule.
export async function verifyGateAccessAction(identifier: string, roomCode: string) {
  const normalized = identifier.trim();
  if (!normalized) {
    return { valid: false, reason: "กรุณากรอกรหัสยืนยัน" };
  }

  const tokenResult = await verifyAccessTokenAction(normalized, roomCode);
  if (tokenResult.valid) {
    return tokenResult;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, isActive: true },
    });

    if (!room || !room.isActive) {
      return { valid: false, reason: "ไม่พบห้องนี้" };
    }

    const user = await prisma.user.findFirst({
      where: {
        studentId: normalized,
        role: "STUDENT",
        status: "APPROVED",
      },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      return tokenResult;
    }

    const { dayOfWeek, currentTime } = getCurrentDayAndTime();
    const schedule = await prisma.classSchedule.findFirst({
      where: {
        userId: user.id,
        roomId: room.id,
        dayOfWeek,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
    });

    if (!schedule) {
      return { valid: false, reason: "ไม่พบตารางเรียนที่ตรงกับเวลาปัจจุบัน" };
    }

    await prisma.log.create({
      data: {
        userId: user.id,
        roomId: room.id,
        action: "SCHEDULE_ACCESS",
        details: `Schedule access granted by studentId: ${normalized}`,
      },
    });

    return {
      valid: true,
      users: [user],
      roomId: room.id,
      isGroup: false,
    };
  } catch (error) {
    console.error("Verify schedule access error:", error);
    return { valid: false, reason: "เกิดข้อผิดพลาดในการตรวจสอบตารางเรียน" };
  }
}
