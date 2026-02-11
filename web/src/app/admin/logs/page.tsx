import { getLogsAction } from "@/actions/logs";

export default async function AdminLogsPage() {
  const { logs } = await getLogsAction({ limit: 200 });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ประวัติการใช้งาน</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">เวลา</th>
              <th className="pb-3 pr-4">ผู้ใช้</th>
              <th className="pb-3 pr-4">อีเมล</th>
              <th className="pb-3 pr-4">การกระทำ</th>
              <th className="pb-3 pr-4">ห้อง</th>
              <th className="pb-3">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: { id: string; createdAt: Date; user: { name: string; email: string } | null; action: string; room: { name: string; roomCode: string } | null; details: string | null }) => (
              <tr key={log.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString("th-TH")}
                </td>
                <td className="py-3 pr-4">{log.user?.name || "-"}</td>
                <td className="py-3 pr-4 text-gray-500">
                  {log.user?.email || "-"}
                </td>
                <td className="py-3 pr-4">
                  <ActionBadge action={log.action} />
                </td>
                <td className="py-3 pr-4">{log.room?.name || "-"}</td>
                <td className="py-3 text-gray-500 max-w-xs truncate">
                  {log.details || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && (
          <p className="text-center text-gray-500 py-8">ยังไม่มีประวัติ</p>
        )}
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
