import { prisma } from "@/lib/prisma";
import { Users, DoorOpen, FileText, Activity } from "lucide-react";
import { AdminPageHeader } from "@/components/admin-page-header";
import { RecentLogsTable } from "./recent-logs-table";

export default async function AdminDashboardPage() {
  const [userCount, roomCount, activeSessionCount, logCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.room.count(),
      prisma.session.count({ where: { status: "ACTIVE" } }),
      prisma.log.count(),
    ]);

  const recentLogs = await prisma.log.findMany({
    include: {
      user: { select: { name: true, email: true } },
      room: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <AdminPageHeader />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Users className="h-6 w-6" />}
          label="ผู้ใช้ทั้งหมด"
          value={userCount}
          color="blue"
        />
        <StatCard
          icon={<DoorOpen className="h-6 w-6" />}
          label="ห้องทั้งหมด"
          value={roomCount}
          color="green"
        />
        <StatCard
          icon={<Activity className="h-6 w-6" />}
          label="รายการที่กำลังใช้งาน"
          value={activeSessionCount}
          color="amber"
        />
        <StatCard
          icon={<FileText className="h-6 w-6" />}
          label="Log ทั้งหมด"
          value={logCount}
          color="purple"
        />
      </div>

      {/* Recent Logs */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">กิจกรรมล่าสุด</h2>
        <RecentLogsTable logs={recentLogs} />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-(--color-primary-light) text-(--color-primary)",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-(--color-primary-light) text-(--color-cta)",
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
