import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revokeAgentSession } from "@/lib/agent-session";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  const token = req.headers.get("x-agent-session");
  if (!apiKey || !token) return NextResponse.json({ error: "Missing Agent credentials" }, { status: 401 });

  const machine = await prisma.agentMachine.findUnique({ where: { apiKey, isActive: true } });
  if (!machine) return NextResponse.json({ error: "Unknown or inactive agent key" }, { status: 401 });
  await revokeAgentSession({ token, machineId: machine.id, event: "AGENT_MANUAL_LOGOUT" });
  return NextResponse.json({ ok: true });
}
