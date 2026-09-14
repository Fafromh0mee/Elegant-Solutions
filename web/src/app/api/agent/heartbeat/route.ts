import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getMachineFromKey(apiKey: string) {
  return prisma.agentMachine.findUnique({ where: { apiKey, isActive: true } });
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });
  }

  const machine = await getMachineFromKey(apiKey);
  if (!machine) {
    return NextResponse.json({ error: "Unknown agent key" }, { status: 401 });
  }

  let body: {
    userEmail?: string;
    activeApp?: string;
    activeTitle?: string;
    riskLevel?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userEmail, activeApp, activeTitle, riskLevel } = body;

  let userId: string | undefined;
  if (userEmail) {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });
    userId = user?.id;
  }

  await prisma.$transaction([
    prisma.agentMachine.update({
      where: { id: machine.id },
      data: { lastSeen: new Date() },
    }),
    prisma.agentLog.create({
      data: {
        machineId: machine.id,
        userId: userId ?? null,
        activeApp: activeApp ?? null,
        activeTitle: activeTitle ?? null,
        riskLevel: riskLevel ?? "NORMAL",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
