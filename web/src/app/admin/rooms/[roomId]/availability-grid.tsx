"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { replaceRoomAvailabilityWindowsAction } from "@/actions/rooms";
import { ACADEMIC_SLOTS, getSlotLabel } from "@/lib/academic-slots";
import { ADMIN_WEEKDAY_ORDER, type AvailabilityWindowInput } from "@/lib/room-config";
import type { AcademicSlot } from "@/lib/types";
import { getWeekdayLabel } from "@/lib/ui-terms";
import { Notice, Section } from "./section";

const key = (dayOfWeek: number, slot: AcademicSlot) => `${dayOfWeek}:${slot}`;

function toSet(windows: AvailabilityWindowInput[]) {
  return new Set(windows.map((window) => key(window.dayOfWeek, window.slot)));
}

export function AvailabilityGrid({
  roomId,
  initialWindows,
  bookingEnabled,
}: {
  roomId: string;
  initialWindows: AvailabilityWindowInput[];
  bookingEnabled: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => toSet(initialWindows));
  const [selected, setSelected] = useState(() => toSet(initialWindows));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const dirty = selected.size !== saved.size || [...selected].some((entry) => !saved.has(entry));

  function toggle(dayOfWeek: number, slot: AcademicSlot) {
    setSelected((current) => {
      const next = new Set(current);
      const id = key(dayOfWeek, slot);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDay(dayOfWeek: number) {
    setSelected((current) => {
      const next = new Set(current);
      const all = ACADEMIC_SLOTS.every(({ slot }) => next.has(key(dayOfWeek, slot)));
      for (const { slot } of ACADEMIC_SLOTS) {
        if (all) next.delete(key(dayOfWeek, slot));
        else next.add(key(dayOfWeek, slot));
      }
      return next;
    });
  }

  function fill(days: readonly number[]) {
    setSelected(new Set(days.flatMap((day) => ACADEMIC_SLOTS.map(({ slot }) => key(day, slot)))));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    const windows = [...selected].map((entry) => {
      const [day, slot] = entry.split(":");
      return { dayOfWeek: Number(day), slot };
    });
    const result = await replaceRoomAvailabilityWindowsAction(roomId, windows);
    setSaving(false);
    if ("success" in result) {
      setSaved(new Set(selected));
      setNotice({
        kind: "success",
        text: result.count === 0 ? "บันทึกแล้ว: ไม่มีช่วงเวลาที่เปิดให้จอง" : `บันทึกช่วงเวลาที่เปิดให้จองแล้ว (${result.count} ช่วง)`,
      });
      router.refresh();
    } else {
      setNotice({ kind: "error", text: result.error });
    }
  }

  return (
    <Section
      title="ช่วงเวลาที่เปิดให้จอง"
      description="เลือกวันและคาบที่อนุญาตให้จองห้องนี้ ช่องที่ไม่ได้เลือกจะไม่สามารถจองได้"
    >
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => fill([1, 2, 3, 4, 5])}>
          จันทร์–ศุกร์ ทุกคาบ
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => fill(ADMIN_WEEKDAY_ORDER)}>
          ทุกวัน ทุกคาบ
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => fill([])}>
          ล้างทั้งหมด
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="p-2 text-left font-medium">วัน</th>
              {ACADEMIC_SLOTS.map(({ slot }) => (
                <th key={slot} className="p-2 text-center font-medium">
                  {getSlotLabel(slot)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ADMIN_WEEKDAY_ORDER.map((day) => (
              <tr key={day}>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className="text-left font-medium text-gray-700 hover:underline"
                    title="เลือก/ยกเลิกทุกคาบของวันนี้"
                  >
                    {getWeekdayLabel(day)}
                  </button>
                </td>
                {ACADEMIC_SLOTS.map(({ slot }) => {
                  const checked = selected.has(key(day, slot));
                  return (
                    <td key={slot} className="p-2 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 cursor-pointer"
                        checked={checked}
                        onChange={() => toggle(day, slot)}
                        aria-label={`${getWeekdayLabel(day)} ${getSlotLabel(slot)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bookingEnabled && selected.size === 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ห้องนี้เปิดให้จองอยู่ แต่ถ้าไม่มีช่วงเวลาที่เปิดให้จอง จะไม่สามารถจองได้เลย
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? "กำลังบันทึก..." : "บันทึกช่วงเวลา"}
        </button>
        {dirty && <span className="text-xs text-amber-700">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>}
      </div>
    </Section>
  );
}
