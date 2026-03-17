import { prisma } from "@/lib/prisma";
import { Users, DoorOpen, FileText, Activity } from "lucide-react";

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
    take: 10,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

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
          label="Session ที่ใช้งานอยู่"
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
        {recentLogs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรม</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 pr-4">เวลา</th>
                  <th className="pb-3 pr-4">ผู้ใช้</th>
                  <th className="pb-3 pr-4">การกระทำ</th>
                  <th className="pb-3 pr-4">ห้อง</th>
                  <th className="pb-3">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map(
                  (log: {
                    id: string;
                    createdAt: Date;
                    user: { name: string; email: string } | null;
                    action: string;
                    room: { name: string } | null;
                    details: string | null;
                  }) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4">{log.user?.name || "-"}</td>
                      <td className="py-3 pr-4">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="py-3 pr-4">{log.room?.name || "-"}</td>
                      <td className="py-3 text-gray-500">
                        {log.details || "-"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
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

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CHECK_IN: "bg-green-100 text-green-700",
    CHECK_OUT: "bg-sky-100 text-sky-700",
    ACCESS_DENIED: "bg-red-100 text-red-700",
    TOKEN_GENERATED: "bg-yellow-100 text-yellow-700",
    GROUP_CREATED: "bg-purple-100 text-purple-700",
    USER_CREATED: "bg-indigo-100 text-indigo-700",
    ROOM_CREATED: "bg-cyan-100 text-cyan-700",
    ROOM_UPDATED: "bg-blue-100 text-blue-700",
  };

  return (
    <span className={`badge ${colors[action] || "bg-gray-100 text-gray-700"}`}>
      {action}
    </span>
  );
}
