import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resolveRoomEntitlement } from "@/lib/room-entitlement";
import { issueAgentSession } from "@/lib/agent-session";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const machine = await prisma.agentMachine.findUnique({ where: { apiKey }, include: { room: true } });
  if (!machine || !machine.isActive) {
    return NextResponse.json({ error: "Unknown or inactive agent machine" }, { status: 401 });
  }
  if (!machine.room || !machine.room.isActive) {
    return NextResponse.json({ error: "เครื่องนี้ยังไม่ได้ผูกกับห้อง" }, { status: 403 });
  }

  const rate = checkAgentRateLimit(`login:${machine.id}:${email}`, { limit: 8, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, hashedPassword: true, status: true, role: true },
  });
  if (!user || !user.hashedPassword || user.status !== "APPROVED" || !(await compare(password, user.hashedPassword))) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const now = new Date();
  const entitlement = await resolveRoomEntitlement({ userId: user.id, roomId: machine.room.id, now });
  if (!entitlement.allowed) {
    await prisma.agentAuditEvent.create({
      data: {
        event: "AGENT_LOGIN_DENIED_NO_ENTITLEMENT",
        machineId: machine.id,
        userId: user.id,
        details: "No current CLASS, BOOKING, or LEGACY_TOKEN entitlement",
      },
    });
    return NextResponse.json({ error: "ไม่พบสิทธิ์ใช้งานห้องนี้ในเวลานี้" }, { status: 403 });
  }

  const issued = await prisma.$transaction(async (tx) => {
    await tx.agentSession.updateMany({
      where: { machineId: machine.id, status: "ACTIVE", revokedAt: null },
      data: { status: "REVOKED", revokedAt: now },
    });
    const created = await issueAgentSession({
      userId: user.id,
      machineId: machine.id,
      roomId: machine.room!.id,
      entitlement,
      now,
      db: tx,
    });
    await tx.agentAuditEvent.create({ data: { event: "AGENT_LOGIN", machineId: machine.id, userId: user.id } });
    return created;
  });

  return NextResponse.json({
    sessionToken: issued.token,
    expiresAt: issued.session.expiresAt.toISOString(),
    user: issued.session.user,
    room: issued.session.room,
    machine: issued.session.machine,
  });
}
