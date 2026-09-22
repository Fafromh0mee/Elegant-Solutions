"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveRoomBookingAction, rejectRoomBookingAction } from "@/actions/room-booking-admin";
import { DECISION_NOTE_MAX_LENGTH } from "@/lib/room-booking-rules";
import { getBookingDecisionErrorMessage } from "@/lib/ui-terms";

export function DecisionPanel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function run(kind: "APPROVE" | "REJECT") {
    const prompt =
      kind === "APPROVE"
        ? "อนุมัติการจองนี้? ระบบจะตรวจสอบความพร้อมของห้องและผู้เข้าร่วม ณ ปัจจุบันอีกครั้ง"
        : "ปฏิเสธการจองนี้? การดำเนินการนี้ย้อนกลับไม่ได้";
    if (!confirm(prompt)) return;
    setBusy(true);
    setError("");
    const result = kind === "APPROVE" ? await approveRoomBookingAction(bookingId) : await rejectRoomBookingAction(bookingId, note);
    setBusy(false);
    if (!result.ok) setError(getBookingDecisionErrorMessage(result.error, result));
    router.refresh();
  }

  return (
    <div className="card">
      <p className="mb-1 font-semibold text-gray-900">พิจารณาคำขอ</p>
      <p className="mb-4 text-xs text-gray-500">
        การอนุมัติจะตรวจสอบความจุ ตารางเรียน การปิดปรับปรุง และการจองซ้อนของผู้เข้าร่วม ณ เวลาที่กดอนุมัติ
        ไม่ได้ใช้ผลการตรวจสอบตอนส่งคำขอ
      </p>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <label className="mb-4 block text-sm">
        <span className="text-gray-600">หมายเหตุถึงผู้จอง (ไม่บังคับ ใช้เมื่อปฏิเสธ)</span>
        <textarea
          className="input mt-1 min-h-20"
          maxLength={DECISION_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary" onClick={() => run("APPROVE")} disabled={busy}>
          อนุมัติ
        </button>
        <button type="button" className="btn-danger" onClick={() => run("REJECT")} disabled={busy}>
          ปฏิเสธ
        </button>
      </div>
    </div>
  );
}
