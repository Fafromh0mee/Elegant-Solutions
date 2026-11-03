import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveRoomEntitlement, type RoomEntitlement } from "@/lib/room-entitlement";

export const AGENT_SESSION_STATUS = "ACTIVE";

export function hashAgentSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAgentSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueAgentSession(params: {
  userId: string;
  machineId: string;
  roomId: string;
  entitlement: Extract<RoomEntitlement, { allowed: true }>;
  now?: Date;
  db?: Prisma.TransactionClient;
}) {
  const { userId, machineId, roomId, entitlement, now = new Date(), db = prisma } = params;
  const token = createAgentSessionToken();
  const session = await db.agentSession.create({
    data: {
      tokenHash: hashAgentSessionToken(token),
      userId,
      machineId,
      roomId,
      issuedAt: now,
      expiresAt: entitlement.validUntil,
      status: AGENT_SESSION_STATUS,
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, roomCode: true, name: true, isActive: true } },
      machine: { select: { id: true, machineCode: true, hostname: true, platform: true } },
    },
  });

  return { token, session };
}

export async function findAgentSession(params: {
  token: string;
  machineId: string;
  includeExpired?: boolean;
  now?: Date;
}) {
  const { token, machineId, includeExpired = false, now = new Date() } = params;
  const session = await prisma.agentSession.findUnique({
    where: { tokenHash: hashAgentSessionToken(token) },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, roomCode: true, name: true, isActive: true } },
      machine: { select: { id: true, machineCode: true, hostname: true, platform: true, isActive: true } },
    },
  });
  if (!session || session.machineId !== machineId || session.status !== AGENT_SESSION_STATUS || session.revokedAt) {
    return null;
  }
  if (!session.machine.isActive) return null;
  if (!session.room.isActive) return null;
  if (!includeExpired && session.expiresAt.getTime() <= now.getTime()) return null;
  return session;
}

export async function revokeAgentSession(params: {
  token: string;
  machineId: string;
  event: "AGENT_MANUAL_LOGOUT" | "AGENT_AUTO_LOGOUT";
  now?: Date;
}) {
  const { token, machineId, event, now = new Date() } = params;
  const tokenHash = hashAgentSessionToken(token);
  return prisma.$transaction(async (tx) => {
    const session = await tx.agentSession.findUnique({ where: { tokenHash } });
    if (!session || session.machineId !== machineId || session.status !== AGENT_SESSION_STATUS || session.revokedAt) {
      return false;
    }
    await tx.agentSession.update({
      where: { id: session.id },
      data: { status: "REVOKED", revokedAt: now },
    });
    await tx.agentAuditEvent.create({
      data: { event, machineId: session.machineId, userId: session.userId },
    });
    return true;
  });
}

export async function refreshAgentSession(params: {
  token: string;
  machineId: string;
  now?: Date;
}) {
  const { token, machineId, now = new Date() } = params;
  const session = await findAgentSession({ token, machineId, includeExpired: true, now });
  if (!session) return { ok: false as const, reason: "INVALID_SESSION" as const };

  const entitlement = await resolveRoomEntitlement({ userId: session.userId, roomId: session.roomId, now });
  if (!entitlement.allowed || entitlement.validUntil.getTime() <= now.getTime()) {
    await revokeAgentSession({ token, machineId, event: "AGENT_AUTO_LOGOUT", now });
    return { ok: false as const, reason: "NO_ENTITLEMENT" as const };
  }

  const updated = await prisma.agentSession.update({
    where: { id: session.id },
    data: { expiresAt: entitlement.validUntil, status: AGENT_SESSION_STATUS, revokedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, roomCode: true, name: true } },
      machine: { select: { id: true, machineCode: true, hostname: true, platform: true } },
    },
  });
  await prisma.agentAuditEvent.create({
    data: { event: "AGENT_SESSION_EXTENDED", machineId: session.machineId, userId: session.userId },
  });
  return { ok: true as const, session: updated };
}
