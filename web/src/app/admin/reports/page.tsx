import { prisma } from "@/lib/prisma";
import { ReportsClient } from "./reports-client";

export default async function AdminReportsPage() {
  const sessions = await prisma.session.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      room: { select: { id: true, name: true, roomCode: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return <ReportsClient sessions={sessions} />;
}
