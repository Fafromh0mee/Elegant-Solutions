"use client";

import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Download,
} from "lucide-react";
import { importClassSchedulesAction } from "@/actions/class-schedules";

type Summary = {
  totalSchedules: number;
  totalStudents: number;
  totalRooms: number;
};

export function ScheduleClient({
  initialSummary,
}: {
  initialSummary: Summary;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [semester, setSemester] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState(initialSummary);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("กรุณาเลือกไฟล์");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setRowErrors([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("semester", semester);
    formData.append("replaceExisting", String(replaceExisting));

    const result = await importClassSchedulesAction(formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setRowErrors(result.rowErrors ?? []);
      return;
    }

    setSuccess(`นำเข้าสำเร็จ ${result.importedRows} แถว`);
    setRowErrors(result.rowErrors ?? []);
    setSummary((prev) => ({
      ...prev,
      totalSchedules: prev.totalSchedules + (result.importedRows ?? 0),
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">นำเข้าตารางเรียน</h1>
        <p className="text-sm text-gray-500 mt-1">
          รองรับไฟล์ CSV/XLSX โดยต้องมีคอลัมน์: studentId, roomCode, dayOfWeek,
          startTime, endTime
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/templates/class-schedule-template.csv"
            download
            className="btn-secondary"
          >
            <Download className="h-4 w-4" />
            ดาวน์โหลดไฟล์ตัวอย่าง (CSV)
          </a>
          <p className="text-xs text-gray-500">
            dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat และเวลาใช้รูปแบบ HH:MM
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500">ตารางเรียนทั้งหมด</p>
          <p className="text-2xl font-semibold mt-1">
            {summary.totalSchedules}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">นักศึกษาที่มีตาราง</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalStudents}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">ห้องที่มีการใช้งาน</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalRooms}</p>
        </div>
      </div>

      <form onSubmit={handleImport} className="card space-y-4">
        <div>
          <label className="label">ไฟล์ตารางเรียน (CSV/XLSX)</label>
          <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-600 hover:bg-gray-100">
            <FileSpreadsheet className="h-5 w-5" />
            <span>{file ? file.name : "คลิกเพื่อเลือกไฟล์"}</span>
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">ภาคการศึกษา (ไม่บังคับ)</label>
            <input
              className="input"
              placeholder="เช่น 2/2026"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 mt-7 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            ลบข้อมูลเดิมก่อนนำเข้า
          </label>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !file}
        >
          <Upload className="h-4 w-4" />
          {loading ? "กำลังนำเข้า..." : "นำเข้าตารางเรียน"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {rowErrors.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">
            ข้อผิดพลาดจากการนำเข้า (สูงสุด 30 รายการ)
          </h2>
          <ul className="list-disc pl-6 text-sm text-red-700 space-y-1">
            {rowErrors.map((rowError, idx) => (
              <li key={`${rowError}-${idx}`}>{rowError}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
