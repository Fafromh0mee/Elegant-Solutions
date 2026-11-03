import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeMaintenanceCode, isMaintenanceAction } from "@/lib/agent-maintenance";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });
  const machine = await prisma.agentMachine.findUnique({ where: { apiKey, isActive: true } });
  if (!machine) return NextResponse.json({ error: "Unknown or inactive agent key" }, { status: 401 });

  let body: { code?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action ?? "";
  const code = body.code?.trim() ?? "";
  if (!isMaintenanceAction(action) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid maintenance request" }, { status: 400 });
  }

  const rate = checkAgentRateLimit(`maintenance:${machine.id}:${action}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "ลองใช้รหัสบ่อยเกินไป กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const consumed = await consumeMaintenanceCode({ machineId: machine.id, code, action });
  if (!consumed) return NextResponse.json({ error: "รหัสไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว" }, { status: 403 });

  if (action === "UNINSTALL_AGENT") {
    const now = new Date();
    await prisma.$transaction([
      prisma.agentSession.updateMany({
        where: { machineId: machine.id, status: "ACTIVE", revokedAt: null },
        data: { status: "REVOKED", revokedAt: now },
      }),
      prisma.agentMachine.update({ where: { id: machine.id }, data: { isActive: false } }),
      prisma.agentAuditEvent.create({
        data: { event: "AGENT_MACHINE_DEACTIVATED", machineId: machine.id, maintenanceCodeId: consumed.id, details: action },
      }),
    ]);
  }

  return NextResponse.json({ authorized: true, action });
}
