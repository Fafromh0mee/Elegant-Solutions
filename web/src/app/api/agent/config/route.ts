import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });

  const machine = await prisma.agentMachine.findUnique({
    where: { apiKey, isActive: true },
    include: { room: true },
  });
  if (!machine) return NextResponse.json({ error: "Unknown or inactive agent key" }, { status: 401 });

  const blacklist = await prisma.agentBlacklist.findMany({ where: { isActive: true }, select: { pattern: true } });
  return NextResponse.json({
    blacklist: blacklist.map((b) => b.pattern),
    roomCode: machine.room?.roomCode ?? null,
    platform: machine.platform,
  });
}
