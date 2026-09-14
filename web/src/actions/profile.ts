"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash, compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

export async function getProfileAction() {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      studentId: true,
      phone: true,
      createdAt: true,
    },
  });

  return { user };
}

export async function updateProfileAction(input: {
  name?: string;
  phone?: string;
}) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: input.name,
        phone: input.phone,
      },
    });

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("Update profile error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function setStudentIdFirstLoginAction(input: { studentId: string }) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (session.user.role !== "STUDENT") {
    return { error: "เฉพาะนักศึกษาเท่านั้นที่กรอกรหัสนักศึกษาได้" };
  }

  const studentId = input.studentId.trim();
  if (!/^\d{10}$/.test(studentId)) {
    return { error: "รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก" };
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { studentId: true },
    });

    if (!current) {
      return { error: "ไม่พบข้อมูลผู้ใช้" };
    }

    if (current.studentId) {
      return { error: "คุณตั้งค่ารหัสนักศึกษาไปแล้ว หากต้องการแก้ไขกรุณาติดต่อแอดมิน" };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { studentId },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATED",
        details: `Student ID bound by self-service: ${studentId}`,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/profile");

    return { success: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "รหัสนักศึกษานี้ถูกใช้งานแล้ว หากเป็นรหัสของคุณกรุณาติดต่อแอดมิน" };
    }

    console.error("Set studentId error:", error);
    return { error: "ไม่สามารถบันทึกรหัสนักศึกษาได้" };
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) return { error: "ไม่พบผู้ใช้" };
    if (!user.hashedPassword) return { error: "บัญชีนี้ไม่ได้ตั้งรหัสผ่านไว้" };

    const isValid = await compare(input.currentPassword, user.hashedPassword);
    if (!isValid) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };

    const hashedPassword = await hash(input.newPassword, 12);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { hashedPassword },
    });

    return { success: true };
  } catch (error) {
    console.error("Change password error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
