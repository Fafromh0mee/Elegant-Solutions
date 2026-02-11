"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getFaceStatusAction() {
  const session = await auth();
  if (!session) return { enrolled: false };

  const faceProfile = await prisma.faceProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      modelVersion: true,
      qualityScore: true,
      createdAt: true,
    },
  });

  return {
    enrolled: !!faceProfile,
    faceProfile,
  };
}

export async function deleteFaceProfileAction() {
  const session = await auth();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };

  try {
    await prisma.faceProfile.delete({
      where: { userId: session.user.id },
    });

    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "FACE_ENROLLED",
        details: "Face profile deleted (re-enrollment)",
      },
    });

    return { success: true };
  } catch {
    return { error: "ไม่พบข้อมูลใบหน้า" };
  }
}
