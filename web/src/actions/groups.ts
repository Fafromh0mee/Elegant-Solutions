"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { slotTimeToMinutes, SYSTEM_CLOSE_TIME, SYSTEM_OPEN_TIME } from "@/lib/academic-slots";

const OPEN_MINS = slotTimeToMinutes(SYSTEM_OPEN_TIME);
const CLOSE_MINS = slotTimeToMinutes(SYSTEM_CLOSE_TIME);

export async function createGroupAction(input: {
  name: string;
}) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    const group = await prisma.group.create({
      data: {
        name: input.name,
        ownerId: session.user.id,
        members: {
          create: {
            userId: session.user.id,
          },
        },
      },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "GROUP_CREATED",
        details: `Created group: ${input.name}`,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, group };
  } catch (error) {
    console.error("Create group error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function joinGroupAction(code: string) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    const group = await prisma.group.findUnique({
      where: { code },
    });

    if (!group) {
      return { error: "ไม่พบกลุ่ม" };
    }

    // Check if already member
    const existing = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: session.user.id,
        },
      },
    });

    if (existing) {
      return { error: "คุณเป็นสมาชิกของกลุ่มนี้แล้ว" };
    }

    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: session.user.id,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, groupName: group.name };
  } catch (error) {
    console.error("Join group error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function getMyGroupsAction() {
  const session = await auth();
  if (!session) return { groups: [] };

  const memberships = await prisma.groupMember.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        include: {
          owner: { select: { id: true, name: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          _count: { select: { members: true } },
        },
      },
    },
  });

  const groups = memberships.map((m: { group: unknown }) => m.group);
  return { groups };
}

export interface OwnedGroupSummary {
  id: string;
  name: string;
  code: string;
  memberCount: number;
}

/**
 * Groups the current user OWNS - the only groups they may book with (Feature 7.5).
 * Distinct from getMyGroupsAction, which returns groups they merely belong to: a
 * non-owner picking one of those in the booking flow would only be rejected at
 * confirm time, so the "เลือกกลุ่ม" picker is populated from this action instead.
 */
export async function getMyOwnedGroupsAction(): Promise<{ groups: OwnedGroupSummary[] }> {
  const session = await auth();
  if (!session) return { groups: [] };

  const groups = await prisma.group.findMany({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, code: true, _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });

  return { groups: groups.map((g) => ({ id: g.id, name: g.name, code: g.code, memberCount: g._count.members })) };
}

export async function generateGroupTokenAction(input: {
  groupId: string;
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
    if (fromMins < OPEN_MINS || fromMins >= CLOSE_MINS) {
      return { error: `เวลาเริ่มต้นต้องอยู่ในช่วง ${SYSTEM_OPEN_TIME} – ${SYSTEM_CLOSE_TIME} น.` };
    }
    if (toMins > CLOSE_MINS) {
      return { error: `เวลาสิ้นสุดต้องไม่เกิน ${SYSTEM_CLOSE_TIME} น.` };
    }

    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
    });

    if (!group || group.ownerId !== session.user.id) {
      return { error: "คุณไม่ใช่เจ้าของกลุ่มนี้" };
    }

    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
    });

    if (!room || !room.isActive) {
      return { error: "ห้องไม่พร้อมใช้งาน" };
    }

    const crypto = await import("crypto");
    const token = crypto.randomUUID();

    const accessToken = await prisma.accessToken.create({
      data: {
        token,
        userId: session.user.id,
        roomId: input.roomId,
        groupId: input.groupId,
        validFrom,
        validTo,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, token: accessToken.token };
  } catch (error) {
    console.error("Generate group token error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
