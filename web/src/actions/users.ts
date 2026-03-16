"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import type { Role } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { isAdminRole, isSuperAdmin } from "@/lib/permissions";

// ADMIN and SUPER_ADMIN can create users.
export async function createUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  if (
    (input.role === "ADMIN" || input.role === "SUPER_ADMIN") &&
    !isSuperAdmin(session.user.role)
  ) {
    return { error: "เฉพาะ SUPER_ADMIN ที่กำหนดสิทธิ์ ADMIN/SUPER_ADMIN ได้" };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      return { error: "อีเมลนี้ถูกใช้งานแล้ว" };
    }

    const hashedPassword = await hash(input.password, 12);

    await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        hashedPassword,
        phone: input.phone || null,
        role: input.role,
        status: "APPROVED",
      },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_CREATED",
        details: `Created ${input.role} user: ${input.email}`,
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Create user error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function getUsersAction() {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ", users: [] };
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      studentId: true,
      phone: true,
      createdAt: true,
      faceProfile: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    users: users.map((u) => ({
      ...u,
      faceEnrolled: !!u.faceProfile,
      faceProfile: undefined,
    })),
  };
}

export async function deleteUserAction(userId: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  if (userId === session.user.id) {
    return { error: "ไม่สามารถลบบัญชีตัวเองได้" };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (!target) {
      return { error: "ไม่พบผู้ใช้" };
    }

    if (
      (target.role === "ADMIN" || target.role === "SUPER_ADMIN") &&
      !isSuperAdmin(session.user.role)
    ) {
      return { error: "เฉพาะ SUPER_ADMIN ที่จัดการบัญชี ADMIN/SUPER_ADMIN ได้" };
    }

    await prisma.user.delete({ where: { id: userId } });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATED",
        details: `Deleted user: ${target.email}`,
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Delete user error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function approveUserAction(userId: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await prisma.user.update({ where: { id: userId }, data: { status: "APPROVED" } });
    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_APPROVED",
        details: `Approved guest account: ${user?.email ?? userId}`,
      },
    });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Approve user error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function rejectUserAction(userId: string) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await prisma.user.update({ where: { id: userId }, data: { status: "REJECTED" } });
    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_REJECTED",
        details: `Rejected guest account: ${user?.email ?? userId}`,
      },
    });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Reject user error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}

export async function updateUserAction(userId: string, data: {
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  phone?: string;
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  if (userId === session.user.id && data.role && data.role !== session.user.role) {
    return { error: "ไม่สามารถเปลี่ยนบทบาทของตัวเองได้" };
  }

  if (
    data.role &&
    (data.role === "ADMIN" || data.role === "SUPER_ADMIN") &&
    !isSuperAdmin(session.user.role)
  ) {
    return { error: "เฉพาะ SUPER_ADMIN ที่กำหนดสิทธิ์ ADMIN/SUPER_ADMIN ได้" };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, name: true },
    });

    if (!target) {
      return { error: "ไม่พบผู้ใช้" };
    }

    if (
      (target.role === "ADMIN" || target.role === "SUPER_ADMIN") &&
      !isSuperAdmin(session.user.role)
    ) {
      return { error: "เฉพาะ SUPER_ADMIN ที่แก้ไขบัญชี ADMIN/SUPER_ADMIN ได้" };
    }

    // Check email uniqueness if email is being changed
    if (data.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        return { error: "อีเมลนี้มีอยู่ในระบบแล้ว" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    
    if (data.password) {
      updateData.hashedPassword = await hash(data.password, 12);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATED",
        details: `Updated user: ${data.name || data.email || target.name || target.email}`,
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Update user error:", error);
    return { error: "ไม่สามารถแก้ไขข้อมูลได้" };
  }
}
