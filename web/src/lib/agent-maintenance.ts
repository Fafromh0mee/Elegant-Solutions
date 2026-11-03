import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashAgentOneTimeCode } from "@/lib/agent-one-time-code";

export const MAINTENANCE_ACTIONS = [
  "ENTER_MAINTENANCE",
  "RESTART_AGENT",
  "UNINSTALL_AGENT",
] as const;
export type MaintenanceAction = (typeof MAINTENANCE_ACTIONS)[number];

export function isMaintenanceAction(value: string): value is MaintenanceAction {
  return (MAINTENANCE_ACTIONS as readonly string[]).includes(value);
}

export function hashMaintenanceCode(code: string): string {
  return hashAgentOneTimeCode("maintenance", code);
}

export function createMaintenanceCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueMaintenanceCode(params: {
  machineId: string;
  createdById: string;
  action: MaintenanceAction;
  now?: Date;
  ttlMs?: number;
  db?: Prisma.TransactionClient;
}) {
  const { machineId, createdById, action, now = new Date(), ttlMs = 5 * 60_000, db = prisma } = params;
  const code = createMaintenanceCode();
  const record = await db.agentMaintenanceCode.create({
    data: {
      codeHash: hashMaintenanceCode(code),
      machineId,
      action,
      createdById,
      expiresAt: new Date(now.getTime() + ttlMs),
    },
  });
  await db.agentAuditEvent.create({
    data: {
      event: "MAINTENANCE_CODE_GENERATED",
      machineId,
      userId: createdById,
      maintenanceCodeId: record.id,
      details: action,
    },
  });
  return { code, expiresAt: record.expiresAt };
}

export async function consumeMaintenanceCode(params: {
  machineId: string;
  code: string;
  action: MaintenanceAction;
  now?: Date;
}) {
  const { machineId, code, action, now = new Date() } = params;
  return prisma.$transaction(async (tx) => {
    const record = await tx.agentMaintenanceCode.findFirst({
      where: {
        machineId,
        action,
        codeHash: hashMaintenanceCode(code),
        usedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!record) return null;
    const used = await tx.agentMaintenanceCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count !== 1) return null;
    await tx.agentAuditEvent.create({
      data: {
        event: "MAINTENANCE_AUTHORIZED",
        machineId,
        maintenanceCodeId: record.id,
        details: action,
      },
    });
    return record;
  });
}
