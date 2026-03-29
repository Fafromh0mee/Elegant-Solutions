import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const machineId = req.nextUrl.searchParams.get("machineId");
  if (!machineId) {
    return NextResponse.json({ error: "machineId required" }, { status: 400 });
  }

  const logs = await prisma.agentLog.findMany({
    where: { machineId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  return NextResponse.json(logs);
}
