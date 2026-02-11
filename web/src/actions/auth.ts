"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export async function registerAction(input: RegisterInput) {
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
        role: "GUEST", // Always GUEST when self-registering
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Register error:", error);
    return { error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" };
  }
}
