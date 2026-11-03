import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshAgentSession } from "@/lib/agent-session";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  const token = req.headers.get("x-agent-session");
  if (!apiKey || !token) return NextResponse.json({ error: "Missing Agent credentials" }, { status: 401 });

  const machine = await prisma.agentMachine.findUnique({ where: { apiKey, isActive: true } });
  if (!machine) return NextResponse.json({ error: "Unknown or inactive agent key" }, { status: 401 });

  const result = await refreshAgentSession({ token, machineId: machine.id });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Agent session expired or no continuing room entitlement", code: "SESSION_EXPIRED" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    sessionToken: token,
    expiresAt: result.session.expiresAt.toISOString(),
    user: result.session.user,
    room: result.session.room,
    machine: result.session.machine,
  });
}
