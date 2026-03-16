"use client";

import { useMemo, useState, useTransition } from "react";
import { setMaintenanceModeAction } from "@/actions/system";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Activity,
  AlertTriangle,
  X,
} from "lucide-react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
};

type AuditLog = {
  id: string;
  action: string;
  details: string | null;
  createdAt: Date;
  user: { name: string; email: string; role: string } | null;
};

export function SystemClient({
  initialMaintenanceMode,
  adminUsers,
  auditLogs,
}: {
  initialMaintenanceMode: boolean;
  adminUsers: AdminUser[];
  auditLogs: AuditLog[];
}) {
  const [maintenanceMode, setMaintenanceMode] = useState(
    initialMaintenanceMode,
  );
  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeAdmins = useMemo(
    () => adminUsers.filter((user) => user.status === "APPROVED").length,
    [adminUsers],
  );

  function onConfirmToggle(nextValue: boolean) {
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await setMaintenanceModeAction(nextValue);
      if (result.error) {
        setError(result.error);
        setConfirmTarget(null);
        return;
      }

      setMaintenanceMode(nextValue);
      setSuccess(
        nextValue ? "เปิดโหมด Maintenance แล้ว" : "ปิดโหมด Maintenance แล้ว",
      );
      setConfirmTarget(null);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Control</h1>
        <p className="text-sm text-gray-500 mt-1">
          หน้านี้สำหรับ SUPER_ADMIN เพื่อควบคุมสถานะระบบและตรวจสอบ audit log
        </p>
      </div>

      {maintenanceMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>
            Maintenance mode กำลังทำงานอยู่ ผู้ใช้ทั่วไปจะถูก redirect ไปหน้า
            maintenance
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            className="text-red-600 hover:text-red-800"
            onClick={() => setError("")}
            aria-label="close error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-start justify-between gap-3">
          <span>{success}</span>
          <button
            type="button"
            className="text-green-600 hover:text-green-800"
            onClick={() => setSuccess("")}
            aria-label="close success"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500">System Mode</p>
          <p className="text-2xl font-semibold mt-1">
            {maintenanceMode ? "Maintenance" : "Normal"}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Admin Accounts</p>
          <p className="text-2xl font-semibold mt-1">{adminUsers.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Approved Admins</p>
          <p className="text-2xl font-semibold mt-1">{activeAdmins}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Maintenance Mode Toggle</h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {maintenanceMode ? (
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-green-600" />
            )}
            <div>
              <p className="font-medium">
                {maintenanceMode
                  ? "ระบบกำลังอยู่ในโหมดบำรุงรักษา"
                  : "ระบบเปิดให้ใช้งานตามปกติ"}
              </p>
              <p className="text-sm text-gray-500">
                เมื่อเปิดใช้งาน ผู้ใช้ทั่วไปจะถูก redirect ไปหน้า maintenance
                (Admin/SUPER_ADMIN ยังเข้าได้)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmTarget(!maintenanceMode)}
            disabled={isPending}
            className={maintenanceMode ? "btn-secondary" : "btn-primary"}
          >
            {isPending
              ? "กำลังบันทึก..."
              : maintenanceMode
                ? "ปิด Maintenance"
                : "เปิด Maintenance"}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          Admin / Super Admin Accounts
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">ชื่อ</th>
              <th className="pb-3 pr-4">อีเมล</th>
              <th className="pb-3 pr-4">บทบาท</th>
              <th className="pb-3 pr-4">สถานะ</th>
              <th className="pb-3">สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {adminUsers.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{user.name}</td>
                <td className="py-3 pr-4 text-gray-600">{user.email}</td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      user.role === "SUPER_ADMIN"
                        ? "badge-super-admin"
                        : "badge-admin"
                    }
                  >
                    {user.role}
                  </span>
                </td>
                <td className="py-3 pr-4">{user.status}</td>
                <td className="py-3 text-gray-600">
                  {new Date(user.createdAt).toLocaleString("th-TH")}
                </td>
              </tr>
            ))}
            {adminUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  ยังไม่มีบัญชี Admin/Super Admin
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Audit / System Logs
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-4">เวลา</th>
              <th className="pb-3 pr-4">ผู้ดำเนินการ</th>
              <th className="pb-3 pr-4">Action</th>
              <th className="pb-3">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString("th-TH")}
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium">{log.user?.name || "ระบบ"}</div>
                  <div className="text-xs text-gray-500">
                    {log.user?.email || "-"}
                  </div>
                </td>
                <td className="py-3 pr-4">{log.action}</td>
                <td className="py-3 text-gray-600">{log.details || "-"}</td>
              </tr>
            ))}
            {auditLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  ยังไม่มี Audit Log
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              ยืนยันการเปลี่ยนสถานะระบบ
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {confirmTarget
                ? "คุณกำลังจะเปิด Maintenance mode ผู้ใช้ทั่วไปจะเข้าใช้งานหน้าหลักไม่ได้ชั่วคราว"
                : "คุณกำลังจะปิด Maintenance mode และเปิดระบบให้ผู้ใช้ทั่วไปกลับมาใช้งานได้"}
            </p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 mb-5">
              การเปลี่ยนค่านี้จะมีผลทันที และถูกบันทึกลง Audit Log
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={isPending}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={confirmTarget ? "btn-primary" : "btn-secondary"}
                onClick={() => onConfirmToggle(confirmTarget)}
                disabled={isPending}
              >
                {isPending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
