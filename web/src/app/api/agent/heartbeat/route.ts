import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findAgentSession } from "@/lib/agent-session";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });

  const machine = await prisma.agentMachine.findUnique({ where: { apiKey } });
  if (!machine || !machine.isActive) {
    return NextResponse.json({ error: "Unknown or inactive agent key" }, { status: 401 });
  }

  let body: { activeApp?: string; activeTitle?: string; riskLevel?: string; agentVersion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionToken = req.headers.get("x-agent-session");
  const session = sessionToken
    ? await findAgentSession({ token: sessionToken, machineId: machine.id })
    : null;
  if (sessionToken && !session) {
    await prisma.agentMachine.update({ where: { id: machine.id }, data: { lastSeen: new Date() } });
    return NextResponse.json({ error: "Agent session expired or revoked", code: "SESSION_EXPIRED" }, { status: 401 });
  }

  const agentVersion = typeof body.agentVersion === "string"
    ? body.agentVersion.trim().slice(0, 64) || undefined
    : undefined;
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.agentMachine.update({ where: { id: machine.id }, data: { lastSeen: new Date(), ...(agentVersion ? { agentVersion } : {}) } }),
  ];
  if (session) {
    operations.push(prisma.agentLog.create({
      data: {
        machineId: machine.id,
        userId: session.userId,
        activeApp: body.activeApp ?? null,
        activeTitle: body.activeTitle ?? null,
        riskLevel: body.riskLevel ?? "NORMAL",
      },
    }));
  }
  await prisma.$transaction(operations);

  return NextResponse.json({ ok: true, sessionExpiresAt: session?.expiresAt.toISOString() ?? null });
}
