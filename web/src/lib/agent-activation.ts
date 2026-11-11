import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashAgentOneTimeCode } from "@/lib/agent-one-time-code";

const ACTIVATION_CODE_TTL_MS = 10 * 60_000;
const MACHINE_CODE_SUFFIX = "-PC";

export function hashActivationCode(code: string): string {
  return hashAgentOneTimeCode("activation", code);
}

export function createActivationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function machineCodeFor(roomCode: string, number: number): string {
  return `${roomCode}${MACHINE_CODE_SUFFIX}${String(number).padStart(2, "0")}`;
}

function nextExistingNumber(roomCode: string, machineCodes: string[]): number {
  const matcher = new RegExp(`^${roomCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${MACHINE_CODE_SUFFIX}(\\d+)$`);
  const largest = machineCodes.reduce((max, code) => {
    const match = code.match(matcher);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return largest + 1;
}

export async function reserveMachineCode(params: {
  db: PrismaTypes.TransactionClient;
  roomId: string;
  roomCode: string;
}): Promise<string> {
  const { db, roomId, roomCode } = params;
  const existing = await db.agentMachine.findMany({
    where: { roomId, machineCode: { startsWith: `${roomCode}${MACHINE_CODE_SUFFIX}` } },
    select: { machineCode: true },
  });
  const initialNumber = nextExistingNumber(roomCode, existing.map((machine) => machine.machineCode));
  const rows = await db.$queryRaw<{ lastIssuedNumber: number }[]>(Prisma.sql`
    INSERT INTO "agent_machine_sequences" ("id", "roomId", "lastIssuedNumber", "updatedAt")
    VALUES (${randomUUID()}, ${roomId}, ${initialNumber}, NOW())
    ON CONFLICT ("roomId")
    DO UPDATE SET
      "lastIssuedNumber" = "agent_machine_sequences"."lastIssuedNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "lastIssuedNumber"
  `);
  return machineCodeFor(roomCode, rows[0].lastIssuedNumber);
}

export async function issueActivationCode(params: {
  roomId: string;
  createdById: string;
  now?: Date;
  ttlMs?: number;
}) {
  const { roomId, createdById, now = new Date(), ttlMs = ACTIVATION_CODE_TTL_MS } = params;
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, roomCode: true, isActive: true } });
    if (!room || !room.isActive) throw new Error("ROOM_NOT_AVAILABLE");
    const reservedMachineCode = await reserveMachineCode({ db: tx, roomId: room.id, roomCode: room.roomCode });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createActivationCode();
      try {
        const record = await tx.agentActivationCode.create({
          data: {
            codeHash: hashActivationCode(code),
            roomId: room.id,
            reservedMachineCode,
            createdById,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
        });
        await tx.agentAuditEvent.create({
          data: {
            event: "ACTIVATION_CODE_GENERATED",
            userId: createdById,
            activationCodeId: record.id,
            details: reservedMachineCode,
          },
        });
        return { id: record.id, code, expiresAt: record.expiresAt, machineCode: reservedMachineCode, roomCode: room.roomCode };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    throw new Error("ACTIVATION_CODE_GENERATION_FAILED");
  });
}

export async function cancelActivationCode(params: { id: string; cancelledById: string; now?: Date }) {
  const { id, cancelledById, now = new Date() } = params;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.agentActivationCode.updateMany({
      where: { id, consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (updated.count !== 1) return false;
    await tx.agentAuditEvent.create({
      data: { event: "ACTIVATION_CODE_CANCELLED", userId: cancelledById, activationCodeId: id },
    });
    return true;
  });
}

type ActivationFailure = "INVALID" | "EXPIRED" | "CONSUMED" | "CANCELLED" | "ROOM_UNAVAILABLE";

export async function activateMachine(params: {
  code: string;
  hostname: string;
  platform?: string;
  now?: Date;
}): Promise<
  | { ok: true; machineCode: string; roomCode: string; roomName: string; apiKey: string }
  | { ok: false; reason: ActivationFailure }
> {
  const { code, hostname, platform, now = new Date() } = params;
  const codeHash = hashActivationCode(code);
  return prisma.$transaction(async (tx) => {
    const record = await tx.agentActivationCode.findUnique({
      where: { codeHash },
      include: { room: { select: { id: true, roomCode: true, name: true, isActive: true } } },
    });
    if (!record) {
      await tx.agentAuditEvent.create({
        data: { event: "ACTIVATION_ATTEMPT_REJECTED", details: "INVALID" },
      });
      return { ok: false as const, reason: "INVALID" as const };
    }
    const rejected = async (reason: ActivationFailure) => {
      await tx.agentAuditEvent.create({
        data: { event: "ACTIVATION_ATTEMPT_REJECTED", activationCodeId: record.id, details: reason },
      });
      return { ok: false as const, reason };
    };
    if (record.revokedAt) return rejected("CANCELLED");
    if (record.consumedAt) return rejected("CONSUMED");
    if (record.expiresAt.getTime() <= now.getTime()) return rejected("EXPIRED");
    if (!record.room.isActive) return rejected("ROOM_UNAVAILABLE");

    const consumed = await tx.agentActivationCode.updateMany({
      where: { id: record.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return rejected("CONSUMED");

    const machine = await tx.agentMachine.create({
      data: {
        machineCode: record.reservedMachineCode,
        hostname,
        platform: platform ?? null,
        roomId: record.roomId,
      },
    });
    await tx.agentAuditEvent.create({
      data: {
        event: "AGENT_MACHINE_ACTIVATED",
        machineId: machine.id,
        activationCodeId: record.id,
        details: record.reservedMachineCode,
      },
    });
    return {
      ok: true as const,
      machineCode: machine.machineCode,
      roomCode: record.room.roomCode,
      roomName: record.room.name,
      apiKey: machine.apiKey,
    };
  });
}
