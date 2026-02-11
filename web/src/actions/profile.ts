"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash, compare } from "bcryptjs";
import { revalidatePath } from "next/cache";

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
