"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import type { Role } from "@/lib/types";
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

    const fromMins = validFrom.getHours() * 60 + validFrom.getMinutes();
    const toMins = validTo.getHours() * 60 + validTo.getMinutes();
    if (fromMins < 6 * 60 || fromMins >= 20 * 60) {
      return { error: "เวลาเริ่มต้นต้องอยู่ในช่วง 06:00 – 20:00 น." };
    }
    if (toMins > 20 * 60) {
      return { error: "เวลาสิ้นสุดต้องไม่เกิน 20:00 น." };
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
        status: "PENDING",
      },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        roomId: input.roomId,
        action: "TOKEN_GENERATED",
        details: `Requested access token for room: ${room.roomCode} (pending approval)`,
      },
    });

    revalidatePath("/dashboard");
    return {
      success: true,
      pending: true,
      message: "ส่งคำขอแล้ว กำลังรอแอดมินอนุมัติ",
      tokenId: accessToken.id,
    };
  } catch (error) {
    console.error("Generate token error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function minutesToTimeString(totalMinutes: number): string {
  const clamped = Math.max(0, totalMinutes);
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Route 1: quick, auto-approved access request generated straight from the
// student's own class schedule — only usable in the window from 30 minutes
// before the period starts through to when it ends, on the matching day.
export async function requestQuickAccessAction(classScheduleId: string) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  const schedule = await prisma.classSchedule.findUnique({
    where: { id: classScheduleId },
    include: { room: true },
  });

  if (!schedule) {
    return { error: "ไม่พบตารางเรียนนี้" };
  }

  if (schedule.userId !== session.user.id) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  if (!schedule.room.isActive) {
    return { error: "ห้องไม่พร้อมใช้งาน" };
  }

  const { dayOfWeek, currentTime } = getCurrentDayAndTime();

  if (dayOfWeek !== schedule.dayOfWeek) {
    return { error: "วันนี้ไม่ตรงกับวันที่มีคาบเรียนนี้ตามตาราง" };
  }

  const nowMinutes = timeStringToMinutes(currentTime);
  const startMinutes = timeStringToMinutes(schedule.startTime);
  const endMinutes = timeStringToMinutes(schedule.endTime);
  const windowStart = startMinutes - 30;

  if (nowMinutes < windowStart || nowMinutes > endMinutes) {
    return {
      error: `ขอเข้าห้องได้เฉพาะช่วง ${minutesToTimeString(windowStart)} – ${schedule.endTime} น. เท่านั้น (30 นาทีก่อนคาบเริ่มจนถึงคาบจบ)`,
    };
  }

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  // Token becomes usable at the same moment the request window opens (30 min
  // before class), not at the class start time — otherwise a student who
  // requests early holds an APPROVED token they still can't use at the gate
  // until class actually starts, making the early window pointless.
  const validFrom = new Date(midnight.getTime() + windowStart * 60000);
  const validTo = new Date(now);
  validTo.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

  const token = crypto.randomUUID();

  const accessToken = await prisma.accessToken.create({
    data: {
      token,
      userId: schedule.userId,
      roomId: schedule.roomId,
      validFrom,
      validTo,
      status: "APPROVED",
    },
  });

  await prisma.log.create({
    data: {
      userId: schedule.userId,
      roomId: schedule.roomId,
      action: "TOKEN_GENERATED",
      details: `Quick access token generated from class schedule: ${schedule.subjectCode ?? "-"} (room: ${schedule.room.roomCode})`,
    },
  });

  revalidatePath("/dashboard");
  return { success: true, token: accessToken.token, tokenId: accessToken.id };
}

export async function getMyTokensAction() {
  const session = await auth();
  if (!session) return { tokens: [] };

  const tokens = await prisma.accessToken.findMany({
    where: { userId: session.user.id },
    include: { room: true, group: true },
    orderBy: { createdAt: "desc" },
  });

  // The token string is only meaningful once approved — strip it out of the
  // API response entirely for PENDING/REJECTED requests so it never reaches
  // the client (not just hidden in the UI) via devtools/network inspection.
  return {
    tokens: tokens.map((t) => ({
      ...t,
      token: t.status === "APPROVED" ? t.token : null,
    })),
  };
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
      status: accessToken.status,
      users,
      roomId: accessToken.room.id,
      isGroup: !!accessToken.group,
      scheduledCheckOut: accessToken.validTo,
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

const NON_FACE_VERIFIABLE_REASON =
  "บัญชีนักศึกษาต้องยืนยันด้วยใบหน้าก่อน กรุณากลับไปสแกนหน้า";

// Gate verification by token first, then by studentId class schedule.
//
// expectedUserId (optional, for backward compatibility with other callers):
// when provided, the resolved user(s) must include this id — enforces that the
// QR/token being scanned at step 2 belongs to whoever passed the step 1 face
// scan, not just anyone's valid token.
//
// skipFaceVerification (optional): set only by the gate UI's explicit
// "ไม่มีใบหน้าลงทะเบียน (ผู้เยี่ยมชม)" escape hatch, which lets a visitor skip
// straight to step 2 since GUEST accounts can never enroll a face to begin
// with. This is NOT the same as "expectedUserId happens to be undefined" —
// other callers (e.g. src/app/api/gate/verify/route.ts) also omit
// expectedUserId for unrelated reasons and must NOT get this bypass. When
// true, every resolved user (individual or every member of a group token)
// must be role GUEST, or the whole thing is rejected — fail-closed, so a
// STUDENT/ADMIN token can never slip through this door.
export async function verifyGateAccessAction(
  identifier: string,
  roomCode: string,
  expectedUserId?: string,
  skipFaceVerification?: boolean,
) {
  const normalized = identifier.trim();
  if (!normalized) {
    return { valid: false, reason: "กรุณากรอกรหัสยืนยัน" };
  }

  const tokenResult = await verifyAccessTokenAction(normalized, roomCode);
  if (tokenResult.valid) {
    // Allow-list: only APPROVED may pass. Deny everything else by default
    // (not just PENDING/REJECTED by name) so a future RequestStatus value
    // can't silently slip through here the way CANCELLED almost did.
    if (tokenResult.status !== "APPROVED") {
      if (tokenResult.status === "PENDING") {
        return { valid: false, reason: "คำขอนี้ยังรอแอดมินอนุมัติ" };
      }
      if (tokenResult.status === "REJECTED") {
        return { valid: false, reason: "คำขอนี้ถูกปฏิเสธ" };
      }
      if (tokenResult.status === "CANCELLED") {
        return { valid: false, reason: "คำขอนี้ถูกยกเลิกแล้ว" };
      }
      return { valid: false, reason: "คำขอนี้ไม่สามารถใช้งานได้" };
    }
    if (skipFaceVerification) {
      if (tokenResult.users?.some((u) => u.role !== "GUEST")) {
        return { valid: false, reason: NON_FACE_VERIFIABLE_REASON };
      }
    } else if (
      expectedUserId &&
      !tokenResult.users?.some((u) => u.id === expectedUserId)
    ) {
      return { valid: false, reason: "QR/Token นี้ไม่ใช่ของคุณ" };
    }
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

    if (skipFaceVerification) {
      // This lookup only ever matches role: "STUDENT" (see the query above),
      // so under the guest bypass it can never legitimately succeed —
      // reject the same way as the token path would for a non-GUEST user.
      if (user.role !== "GUEST") {
        return { valid: false, reason: NON_FACE_VERIFIABLE_REASON };
      }
    } else if (expectedUserId && user.id !== expectedUserId) {
      return { valid: false, reason: "QR/Token นี้ไม่ใช่ของคุณ" };
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

    // Convert endTime "HH:MM" → today's Date
    const [endHH, endMM] = schedule.endTime.split(":").map(Number);
    const scheduledCheckOut = new Date();
    scheduledCheckOut.setHours(endHH, endMM, 0, 0);

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
      scheduledCheckOut,
    };
  } catch (error) {
    console.error("Verify schedule access error:", error);
    return { valid: false, reason: "เกิดข้อผิดพลาดในการตรวจสอบตารางเรียน" };
  }
}

function isTimeRangeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return (
    timeStringToMinutes(startA) < timeStringToMinutes(endB) &&
    timeStringToMinutes(startB) < timeStringToMinutes(endA)
  );
}

// ---- Admin: room request approval workflow (route 2) ----

type RoomRequestItem = {
  id: string;
  validFrom: Date;
  validTo: Date;
  createdAt: Date;
  isGroup: boolean;
  groupName: string | null;
  memberCount: number;
  user: { id: string; name: string; email: string; role: Role };
  room: { id: string; roomCode: string; name: string };
  conflictingSchedules: Array<{
    subjectCode: string | null;
    subjectName: string | null;
    semester: string | null;
    startTime: string;
    endTime: string;
    studentName: string;
    studentId: string | null;
  }>;
};

export async function listPendingRoomRequestsAction(): Promise<{
  error?: string;
  requests: RoomRequestItem[];
}> {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ", requests: [] };
  }

  const pending = await prisma.accessToken.findMany({
    // Requests whose requested time window has already passed are pointless
    // to approve — leave them out instead of making the admin sift through
    // stale ones.
    where: { status: "PENDING", validTo: { gte: new Date() } },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, roomCode: true, name: true } },
      group: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const requests = await Promise.all(
    pending.map(async (t) => {
      const dayOfWeek = t.validFrom.getDay();
      const requestStart = `${String(t.validFrom.getHours()).padStart(2, "0")}:${String(t.validFrom.getMinutes()).padStart(2, "0")}`;
      const requestEnd = `${String(t.validTo.getHours()).padStart(2, "0")}:${String(t.validTo.getMinutes()).padStart(2, "0")}`;

      const roomSchedules = await prisma.classSchedule.findMany({
        where: { roomId: t.roomId, dayOfWeek },
        select: {
          startTime: true,
          endTime: true,
          subjectCode: true,
          subjectName: true,
          semester: true,
          user: { select: { name: true, studentId: true } },
        },
      });

      const conflictingSchedules = roomSchedules
        .filter((s) => isTimeRangeOverlap(s.startTime, s.endTime, requestStart, requestEnd))
        .map((s) => ({
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          semester: s.semester,
          startTime: s.startTime,
          endTime: s.endTime,
          studentName: s.user.name,
          studentId: s.user.studentId,
        }));

      return {
        id: t.id,
        validFrom: t.validFrom,
        validTo: t.validTo,
        createdAt: t.createdAt,
        isGroup: !!t.groupId,
        groupName: t.group?.name ?? null,
        memberCount: t.group?._count.members ?? 1,
        user: t.user,
        room: t.room,
        conflictingSchedules,
      };
    }),
  );

  return { requests };
}

export async function approveRoomRequestAction(tokenId: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await prisma.accessToken.update({
      where: { id: tokenId },
      data: { status: "APPROVED" },
    });

    revalidatePath("/admin/room-requests");
    return { success: true };
  } catch (error) {
    console.error("Approve room request error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function rejectRoomRequestAction(tokenId: string, reason?: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await prisma.accessToken.update({
      where: { id: tokenId },
      data: { status: "REJECTED" },
    });

    void reason; // no dedicated field to persist a reason yet — accepted for future use

    revalidatePath("/admin/room-requests");
    return { success: true };
  } catch (error) {
    console.error("Reject room request error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

// A requester can withdraw their own general-booking request while it's
// still awaiting a decision — no longer needed once it's been approved,
// rejected, or already expired on its own.
export async function cancelRoomRequestAction(tokenId: string) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    const accessToken = await prisma.accessToken.findUnique({
      where: { id: tokenId },
      select: { userId: true, status: true },
    });

    if (!accessToken) {
      return { error: "ไม่พบคำขอนี้" };
    }

    if (accessToken.userId !== session.user.id) {
      return { error: "ไม่มีสิทธิ์ดำเนินการ" };
    }

    if (accessToken.status !== "PENDING") {
      return { error: "ยกเลิกได้เฉพาะคำขอที่ยังรออนุมัติเท่านั้น" };
    }

    await prisma.accessToken.update({
      where: { id: tokenId },
      data: { status: "CANCELLED" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Cancel room request error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
