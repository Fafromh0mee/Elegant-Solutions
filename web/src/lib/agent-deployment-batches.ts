import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivationCode, hashActivationCode, reserveMachineCode } from "@/lib/agent-activation";

const BATCH_TTL_MS = 7 * 24 * 60 * 60_000;
export const MAX_BATCH_SIZE = 100;

export async function createDeploymentBatch(params: {
  roomId: string;
  count: number;
  createdById: string;
  now?: Date;
}) {
  const { roomId, count, createdById, now = new Date() } = params;
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
    throw new Error("INVALID_BATCH_SIZE");
  }

  // A uniqueness race aborts a PostgreSQL transaction; retry the whole transaction.
  for (let transactionAttempt = 0; transactionAttempt < 3; transactionAttempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, roomCode: true, isActive: true } });
        if (!room?.isActive) throw new Error("ROOM_NOT_AVAILABLE");
        const expiresAt = new Date(now.getTime() + BATCH_TTL_MS);
        const batch = await tx.agentDeploymentBatch.create({
          data: { roomId, requestedCount: count, createdById, expiresAt },
        });
        const issuedHashes = new Set<string>();
        const codes: Array<{ machineCode: string; code: string; roomCode: string; expiresAt: string }> = [];
        for (let index = 0; index < count; index += 1) {
          const machineCode = await reserveMachineCode({ db: tx, roomId, roomCode: room.roomCode });
          let code = "";
          let codeHash = "";
          for (let codeAttempt = 0; codeAttempt < 30; codeAttempt += 1) {
            code = createActivationCode();
            codeHash = hashActivationCode(code);
            if (!issuedHashes.has(codeHash) && !await tx.agentActivationCode.findUnique({ where: { codeHash }, select: { id: true } })) break;
            code = "";
          }
          if (!code) throw new Error("ACTIVATION_CODE_SPACE_EXHAUSTED");
          issuedHashes.add(codeHash);
          await tx.agentActivationCode.create({
            data: { codeHash, roomId, reservedMachineCode: machineCode, createdById, batchId: batch.id, expiresAt },
          });
          codes.push({ machineCode, code, roomCode: room.roomCode, expiresAt: expiresAt.toISOString() });
        }
        await tx.agentAuditEvent.create({
          data: { event: "DEPLOYMENT_BATCH_CREATED", userId: createdById, details: `${batch.id}:${count}` },
        });
        return { batchId: batch.id, roomCode: room.roomCode, expiresAt: expiresAt.toISOString(), codes };
      }, { timeout: 60_000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || transactionAttempt === 2) throw error;
    }
  }
  throw new Error("ACTIVATION_CODE_GENERATION_FAILED");
}

export async function listDeploymentBatches(now = new Date()) {
  const batches = await prisma.agentDeploymentBatch.findMany({
    include: { room: { select: { roomCode: true, name: true } }, codes: { orderBy: { reservedMachineCode: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const machineCodes = batches.flatMap((batch) => batch.codes.map((code) => code.reservedMachineCode));
  const machines = await prisma.agentMachine.findMany({
    where: { machineCode: { in: machineCodes } },
    select: { machineCode: true, hostname: true, platform: true, isActive: true, lastSeen: true },
  });
  const machinesByCode = new Map(machines.map((machine) => [machine.machineCode, machine]));
  return batches.map((batch) => ({
    id: batch.id,
    roomCode: batch.room.roomCode,
    roomName: batch.room.name,
    requestedCount: batch.requestedCount,
    createdAt: batch.createdAt.toISOString(),
    expiresAt: batch.expiresAt.toISOString(),
    revokedAt: batch.revokedAt?.toISOString() ?? null,
    codes: batch.codes.map((code) => ({
      id: code.id,
      machineCode: code.reservedMachineCode,
      status: code.consumedAt ? "ACTIVATED" : code.revokedAt || batch.revokedAt ? "REVOKED" : code.expiresAt <= now ? "EXPIRED" : "PENDING",
      machine: machinesByCode.get(code.reservedMachineCode) ?? null,
    })),
  }));
}

export async function revokeDeploymentBatch(params: { id: string; revokedById: string; now?: Date }) {
  const { id, revokedById, now = new Date() } = params;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.agentDeploymentBatch.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
    if (updated.count !== 1) return false;
    await tx.agentActivationCode.updateMany({
      where: { batchId: id, consumedAt: null, revokedAt: null }, data: { revokedAt: now },
    });
    await tx.agentAuditEvent.create({ data: { event: "DEPLOYMENT_BATCH_REVOKED", userId: revokedById, details: id } });
    return true;
  });
}
