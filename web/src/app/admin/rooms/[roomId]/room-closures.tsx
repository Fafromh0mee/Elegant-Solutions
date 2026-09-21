"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createRoomClosureAction, deleteRoomClosureAction } from "@/actions/rooms";
import { ACADEMIC_SLOTS, getSlotLabel } from "@/lib/academic-slots";
import type { AdminRoomClosure } from "@/lib/room-admin";
import type { AcademicSlot } from "@/lib/types";
import { formatAcademicDate } from "@/lib/ui-terms";
import { Notice, Section } from "./section";

function describeScope(slots: AcademicSlot[]) {
  return slots.length === 0 ? "ปิดปรับปรุงทั้งวัน" : `ปิดเฉพาะ ${slots.map(getSlotLabel).join(", ")}`;
}

function describeRange(startDate: string, endDate: string) {
  return startDate === endDate
    ? formatAcademicDate(startDate)
    : `${formatAcademicDate(startDate)} – ${formatAcademicDate(endDate)}`;
}

export function RoomClosures({ roomId, closures }: { roomId: string; closures: AdminRoomClosure[] }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [wholeDay, setWholeDay] = useState(true);
  const [slots, setSlots] = useState<AcademicSlot[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function toggleSlot(slot: AcademicSlot) {
    setSlots((current) => (current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot]));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!wholeDay && slots.length === 0) {
      setNotice({ kind: "error", text: "กรุณาเลือกคาบที่ต้องการปิด หรือเลือกปิดปรับปรุงทั้งวัน" });
      return;
    }
    setSaving(true);
    setNotice(null);
    const result = await createRoomClosureAction(roomId, {
      startDate,
      endDate,
      slots: wholeDay ? [] : slots,
      reason,
    });
    setSaving(false);
    if ("success" in result) {
      setNotice({ kind: "success", text: "เพิ่มการปิดปรับปรุงแล้ว" });
      setStartDate("");
      setEndDate("");
      setSlots([]);
      setReason("");
      setWholeDay(true);
      router.refresh();
    } else {
      setNotice({ kind: "error", text: result.error });
    }
  }

  async function remove(closure: AdminRoomClosure) {
    if (!confirm(`ยกเลิกการปิดปรับปรุง ${describeRange(closure.startDate, closure.endDate)}?`)) return;
    const result = await deleteRoomClosureAction(roomId, closure.id);
    if ("success" in result) {
      setNotice({ kind: "success", text: "ยกเลิกการปิดปรับปรุงแล้ว" });
      router.refresh();
    } else {
      setNotice({ kind: "error", text: result.error });
    }
  }

  return (
    <Section
      title="ปิดปรับปรุงชั่วคราว"
      description="ห้องจะไม่สามารถจองได้ในช่วงวันที่กำหนด (นับรวมวันเริ่มต้นและวันสิ้นสุด)"
    >
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {closures.length === 0 ? (
        <p className="mb-6 text-sm text-gray-500">ไม่มีการปิดปรับปรุงที่กำลังดำเนินอยู่หรือกำลังจะมาถึง</p>
      ) : (
        <ul className="mb-6 divide-y rounded-lg border">
          {closures.map((closure) => (
            <li key={closure.id} className="flex items-start justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{describeRange(closure.startDate, closure.endDate)}</p>
                <p className="text-sm text-gray-600">{describeScope(closure.slots)}</p>
                {closure.reason && <p className="text-xs text-gray-500">เหตุผล: {closure.reason}</p>}
                {closure.createdByName && <p className="text-xs text-gray-400">โดย {closure.createdByName}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(closure)}
                className="p-1.5 text-gray-400 hover:text-red-600"
                aria-label="ยกเลิกการปิดปรับปรุง"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">เพิ่มการปิดปรับปรุง</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">วันที่เริ่มต้น</label>
            <input
              type="date"
              className="input"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="label">วันที่สิ้นสุด</label>
            <input type="date" className="input" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">ช่วงเวลาที่ปิด</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" checked={wholeDay} onChange={() => setWholeDay(true)} className="h-4 w-4" />
            ปิดปรับปรุงทั้งวัน
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" checked={!wholeDay} onChange={() => setWholeDay(false)} className="h-4 w-4" />
            ปิดเฉพาะบางคาบ
          </label>
          {!wholeDay && (
            <div className="ml-6 flex flex-wrap gap-2">
              {ACADEMIC_SLOTS.map(({ slot }) => (
                <label key={slot} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={slots.includes(slot)} onChange={() => toggleSlot(slot)} className="h-4 w-4" />
                  {getSlotLabel(slot)}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <label className="label">เหตุผล</label>
          <input className="input" maxLength={200} placeholder="เช่น ซ่อมเครื่องปรับอากาศ" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "กำลังบันทึก..." : "เพิ่มการปิดปรับปรุง"}
        </button>
      </form>
    </Section>
  );
}
