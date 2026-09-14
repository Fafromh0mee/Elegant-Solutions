"use client";

import { useState, useMemo } from "react";
import { Download } from "lucide-react";
import { AdminPageHeader } from "@/components/admin-page-header";
import { TablePagination } from "@/components/table-pagination";

interface SessionItem {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  status: string;
  user: { id: string; name: string; email: string; role: string };
  room: { id: string; name: string; roomCode: string };
}

export function ReportsClient({ sessions }: { sessions: SessionItem[] }) {
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const displayedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sessions.slice(start, start + pageSize);
  }, [sessions, page, pageSize]);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/export/sessions");
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sessions-report-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("เกิดข้อผิดพลาดในการ export");
    }
    setLoading(false);
  }

  const activeSessions = sessions.filter((s) => s.status === "ACTIVE");
  const completedSessions = sessions.filter((s) => s.status === "COMPLETED");

  return (
    <div>
      <AdminPageHeader />
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={handleExport}
          className="btn-primary"
          disabled={loading}
        >
          <Download className="h-4 w-4" />
          {loading ? "กำลัง Export..." : "Export Excel"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-3xl font-bold text-(--color-secondary)">
            {sessions.length}
          </p>
          <p className="text-sm text-gray-500">Sessions ทั้งหมด</p>
        </div>
        <div className="card">
          <p className="text-3xl font-bold text-amber-600">
            {activeSessions.length}
          </p>
          <p className="text-sm text-gray-500">กำลังใช้งาน</p>
        </div>
        <div className="card">
          <p className="text-3xl font-bold text-green-600">
            {completedSessions.length}
          </p>
          <p className="text-sm text-gray-500">เสร็จสิ้น</p>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="space-y-3">
        <TablePagination
          total={sessions.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">ผู้ใช้</th>
              <th className="pb-3 pr-4">บทบาท</th>
              <th className="pb-3 pr-4">ห้อง</th>
              <th className="pb-3 pr-4">Check-in</th>
              <th className="pb-3 pr-4">Check-out</th>
              <th className="pb-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {displayedSessions.map((session) => (
              <tr key={session.id} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <p className="font-medium">{session.user.name}</p>
                  <p className="text-xs text-gray-500">{session.user.email}</p>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      session.user.role === "SUPER_ADMIN"
                        ? "badge-super-admin"
                        : session.user.role === "ADMIN"
                          ? "badge-admin"
                          : session.user.role === "STUDENT"
                            ? "badge-student"
                            : "badge-guest"
                    }
                  >
                    {session.user.role}
                  </span>
                </td>
                <td className="py-3 pr-4">{session.room.name}</td>
                <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                  {new Date(session.checkIn).toLocaleString("th-TH")}
                </td>
                <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                  {session.checkOut
                    ? new Date(session.checkOut).toLocaleString("th-TH")
                    : "-"}
                </td>
                <td className="py-3">
                  <span
                    className={`badge ${
                      session.status === "ACTIVE"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {session.status === "ACTIVE" ? "ใช้งานอยู่" : "เสร็จสิ้น"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.length === 0 && (
          <p className="text-center text-gray-500 py-8">ยังไม่มีข้อมูล</p>
        )}
        </div>
      </div>
    </div>
  );
}
