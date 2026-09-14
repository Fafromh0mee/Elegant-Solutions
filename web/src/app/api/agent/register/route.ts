import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-register-secret");
  if (!secret || secret !== process.env.AGENT_REGISTER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { machineCode: string; hostname: string; roomCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { machineCode, hostname, roomCode } = body;
  if (!machineCode || !hostname) {
    return NextResponse.json(
      { error: "machineCode and hostname are required" },
      { status: 400 },
    );
  }

  let roomId: string | undefined;
  if (roomCode) {
    const room = await prisma.room.findUnique({ where: { roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    roomId = room.id;
  }

  const machine = await prisma.agentMachine.upsert({
    where: { machineCode },
    update: { hostname, roomId: roomId ?? null, isActive: true },
    create: { machineCode, hostname, roomId: roomId ?? null },
  });

  return NextResponse.json({
    id: machine.id,
    machineCode: machine.machineCode,
    apiKey: machine.apiKey,
  });
}
