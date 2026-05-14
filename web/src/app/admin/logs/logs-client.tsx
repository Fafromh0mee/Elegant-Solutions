"use client";

import { useState, useMemo } from "react";
import { TablePagination } from "@/components/table-pagination";

interface LogItem {
  id: string;
  createdAt: Date;
  user: { name: string; email: string } | null;
  action: string;
  room: { name: string; roomCode: string } | null;
  details: string | null;
}

interface LogsClientProps {
  initialLogs: LogItem[];
}

export function LogsClient({ initialLogs }: LogsClientProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const displayedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return initialLogs.slice(start, start + pageSize);
  }, [initialLogs, page, pageSize]);

  return (
    <div className="space-y-4">
      <TablePagination
        total={initialLogs.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

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
            {displayedLogs.map((log) => (
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
        {displayedLogs.length === 0 && (
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
    ROOM_UPDATED: "bg-cyan-100 text-cyan-700",
    USER_UPDATED: "bg-indigo-100 text-indigo-700",
    MAINTENANCE_ENABLED: "bg-orange-100 text-orange-700",
    MAINTENANCE_DISABLED: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${colors[action] || "bg-gray-100 text-gray-700"}`}
    >
      {action}
    </span>
  );
}
