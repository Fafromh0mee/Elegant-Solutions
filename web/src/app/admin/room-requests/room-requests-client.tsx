"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  DoorOpen,
  Clock,
} from "lucide-react";
import {
  approveRoomRequestAction,
  rejectRoomRequestAction,
} from "@/actions/access-tokens";
import { AdminPageHeader } from "@/components/admin-page-header";

type ConflictingSchedule = {
  subjectCode: string | null;
  subjectName: string | null;
  semester: string | null;
  startTime: string;
  endTime: string;
  studentName: string;
  studentId: string | null;
};

type RoomRequest = {
  id: string;
  validFrom: Date;
  validTo: Date;
  createdAt: Date;
  isGroup: boolean;
  groupName: string | null;
  memberCount: number;
  user: { id: string; name: string; email: string; role: string };
  room: { id: string; roomCode: string; name: string };
  conflictingSchedules: ConflictingSchedule[];
};

export function RoomRequestsClient({
  initialRequests,
}: {
  initialRequests: RoomRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function handleApprove(id: string) {
    setProcessingId(id);
    setError("");
    startTransition(async () => {
      const result = await approveRoomRequestAction(id);
      if (result.error) {
        setError(result.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
      setProcessingId(null);
    });
  }

  function handleReject(id: string) {
    if (!confirm("ยืนยันการปฏิเสธคำขอนี้?")) return;
    setProcessingId(id);
    setError("");
    startTransition(async () => {
      const result = await rejectRoomRequestAction(id);
      if (result.error) {
        setError(result.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
      setProcessingId(null);
    });
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <p className="text-sm text-gray-500 -mt-4">
        คำขอจองห้องแบบทั่วไป (ไม่ตรงกับตารางเรียนของผู้ขอ) รอการอนุมัติจากแอดมิน —
        ถ้ามีตารางเรียนของคนอื่นชนอยู่ ระบบจะเตือนไว้ให้ แต่ไม่บล็อกอัตโนมัติ
        แอดมินเป็นคนตัดสินใจเอง
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p>ไม่มีคำขอที่รออนุมัติ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const busy = isPending && processingId === req.id;
            return (
              <div key={req.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {req.user.name}{" "}
                      <span className="text-sm font-normal text-gray-500">
                        ({req.user.email})
                      </span>
                    </p>
                    {req.isGroup && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        <Users className="h-3 w-3" />
                        กลุ่ม: {req.groupName ?? "-"} ({req.memberCount} คน)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    ขอเมื่อ {new Date(req.createdAt).toLocaleString("th-TH")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <DoorOpen className="h-4 w-4 text-gray-400" />
                    {req.room.roomCode} — {req.room.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-gray-400" />
                    {new Date(req.validFrom).toLocaleString("th-TH")} –{" "}
                    {new Date(req.validTo).toLocaleString("th-TH")}
                  </span>
                </div>

                {req.conflictingSchedules.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                      <AlertTriangle className="h-4 w-4" />
                      ช่วงเวลานี้มีตารางเรียนของคนอื่นอยู่แล้ว
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm text-amber-700">
                      {req.conflictingSchedules.map((c, idx) => (
                        <li key={idx}>
                          ⚠ {c.startTime}-{c.endTime}: วิชา {c.subjectCode ?? "-"}
                          {c.subjectName ? ` (${c.subjectName})` : ""} ของ{" "}
                          {c.studentName}
                          {c.studentId ? ` (${c.studentId})` : ""}
                          {c.semester ? ` — ภาคการศึกษา ${c.semester}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={busy}
                    className="btn-success"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    disabled={busy}
                    className="btn-secondary"
                  >
                    <XCircle className="h-4 w-4" />
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
