import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-agent-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Agent-Key" }, { status: 401 });
  }

  const machine = await prisma.agentMachine.findUnique({
    where: { apiKey, isActive: true },
    include: { room: true },
  });
  if (!machine) {
    return NextResponse.json({ error: "Unknown agent key" }, { status: 401 });
  }

  const blacklist = await prisma.agentBlacklist.findMany({
    where: { isActive: true },
    select: { pattern: true },
  });

  let sessionEndsAt: string | null = null;
  if (machine.roomId) {
    const now = new Date();
    const activeSession = await prisma.session.findFirst({
      where: { roomId: machine.roomId, status: "ACTIVE" },
      orderBy: { checkIn: "desc" },
    });

    if (activeSession) {
      const dayOfWeek = now.getDay();
      const hhmm = now.toTimeString().slice(0, 5);

      const schedule = await prisma.classSchedule.findFirst({
        where: {
          roomId: machine.roomId,
          dayOfWeek,
          startTime: { lte: hhmm },
          endTime: { gte: hhmm },
        },
        orderBy: { endTime: "asc" },
      });

      if (schedule) {
        const [h, m] = schedule.endTime.split(":").map(Number);
        const endsAt = new Date(now);
        endsAt.setHours(h, m, 0, 0);
        sessionEndsAt = endsAt.toISOString();
      }
    }
  }

  return NextResponse.json({
    blacklist: blacklist.map((b) => b.pattern),
    sessionEndsAt,
    roomCode: machine.room?.roomCode ?? null,
  });
}
