"use server";

import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cancelActivationCode } from "@/lib/agent-activation";
import { createDeploymentBatch, listDeploymentBatches, revokeDeploymentBatch } from "@/lib/agent-deployment-batches";
import { revalidatePath } from "next/cache";

async function superAdmin() {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user.role)) throw new Error("ไม่มีสิทธิ์ดำเนินการ");
  return session;
}

export async function getDeploymentOverviewAction() {
  await superAdmin();
  const [rooms, batches] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, select: { id: true, roomCode: true, name: true }, orderBy: { roomCode: "asc" } }),
    listDeploymentBatches(),
  ]);
  return { rooms, batches };
}

export async function createDeploymentBatchAction(roomId: string, count: number) {
  const session = await superAdmin();
  try {
    const result = await createDeploymentBatch({ roomId, count, createdById: session.user.id });
    revalidatePath("/admin/system");
    revalidatePath("/admin/tracking");
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BATCH_SIZE") return { ok: false as const, error: "จำนวนเครื่องต้องอยู่ระหว่าง 1–100" };
    if (error instanceof Error && error.message === "ROOM_NOT_AVAILABLE") return { ok: false as const, error: "ห้องไม่พร้อมใช้งาน" };
    throw error;
  }
}

export async function revokeDeploymentCodeAction(id: string) {
  const session = await superAdmin();
  const code = await prisma.agentActivationCode.findUnique({ where: { id }, select: { batchId: true } });
  if (!code?.batchId) return { ok: false as const, error: "ไม่พบรหัสใน Batch" };
  const done = await cancelActivationCode({ id, cancelledById: session.user.id });
  revalidatePath("/admin/system");
  return { ok: done };
}

export async function revokeDeploymentBatchAction(id: string) {
  const session = await superAdmin();
  const done = await revokeDeploymentBatch({ id, revokedById: session.user.id });
  revalidatePath("/admin/system");
  return { ok: done };
}
