"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  ACADEMIC_SLOTS,
  hasSlotEnded,
  slotForInstant,
  toAcademicDateString,
} from "@/lib/academic-slots";
import { ROOM_CAPACITY_MAX } from "@/lib/room-config";
import {
  getSlotRangeLabel,
  selectSlotRange,
  validateRoomFinderQuery,
  type RoomFinderFormValues,
  type RoomFinderQuery,
  type RoomFinderSetup,
} from "@/lib/room-finder";
import { ROOM_CAPABILITY_VALUES } from "@/lib/types";
import type { AcademicSlot } from "@/lib/types";
import { formatAcademicDate, getRoomCapabilityLabel, getRoomFinderErrorMessage } from "@/lib/ui-terms";

interface Props {
  initial: RoomFinderFormValues;
  setup: RoomFinderSetup;
  /** Values of the search currently shown, if any - to flag results as stale after edits. */
  searched: RoomFinderFormValues | null;
  pending: boolean;
  /** Called with a validated query. The caller decides how to search (URL or inline). */
  onSearch: (query: RoomFinderQuery, values: RoomFinderFormValues) => void;
}

export function RoomFinderForm({ initial, setup, searched, pending, onSearch }: Props) {
  const { today, maxDate, now, locations } = setup;
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");

  const renderedAt = useMemo(() => new Date(now), [now]);
  const isToday = values.date === today;
  const currentSlot = isToday ? slotForInstant(renderedAt) : null;
  const slotEnded = (slot: AcademicSlot) => isToday && hasSlotEnded(values.date, slot, renderedAt);

  const buildings = useMemo(() => [...new Set(locations.map((location) => location.building))], [locations]);
  const floors = useMemo(
    () =>
      locations
        .filter((location) => location.building === values.building && location.floor !== null)
        .map((location) => location.floor as number),
    [locations, values.building]
  );

  const stale = searched !== null && JSON.stringify(values) !== JSON.stringify(searched);

  function patch(next: Partial<RoomFinderFormValues>) {
    setValues((current) => ({ ...current, ...next }));
    setError("");
  }

  function changeDate(date: string) {
    // Slots that have already finished on the new date cannot stay selected. Ended
    // slots are always the earliest ones, so what remains is still contiguous.
    const stillOpen =
      date === today ? values.slots.filter((slot) => !hasSlotEnded(date, slot, renderedAt)) : values.slots;
    patch({ date, slots: stillOpen });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const clockNow = new Date();
    const outcome = validateRoomFinderQuery(values, { today: toAcademicDateString(clockNow), now: clockNow });
    if (!outcome.ok) {
      setError(getRoomFinderErrorMessage(outcome.error));
      return;
    }
    onSearch(outcome.query, values);
  }

  return (
    <form onSubmit={submit} className="mb-6" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="finder-party-size" className="label">
            จำนวนผู้ใช้งาน
          </label>
          <div className="flex items-center gap-2">
            <input
              id="finder-party-size"
              type="number"
              inputMode="numeric"
              min={1}
              max={ROOM_CAPACITY_MAX}
              className="input"
              value={values.partySize}
              onChange={(event) => patch({ partySize: event.target.value })}
            />
            <span className="text-sm text-gray-600">คน</span>
          </div>
        </div>

        <div>
          <label htmlFor="finder-date" className="label">
            วันที่
          </label>
          <input
            id="finder-date"
            type="date"
            className="input"
            min={today}
            max={maxDate}
            value={values.date}
            onChange={(event) => changeDate(event.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            ค้นหาได้ถึง {formatAcademicDate(maxDate)} (ล่วงหน้า 30 วัน)
          </p>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="label">
          คาบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {ACADEMIC_SLOTS.map((definition) => {
            const selected = values.slots.includes(definition.slot);
            const ended = slotEnded(definition.slot);
            return (
              <button
                key={definition.slot}
                type="button"
                aria-pressed={selected}
                disabled={ended}
                onClick={() => patch({ slots: selectSlotRange(values.slots, definition.slot) })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center justify-between gap-1 text-sm font-medium">
                  {definition.label}
                  {currentSlot === definition.slot && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-semibold ${
                        selected ? "bg-white/20 text-white" : "bg-green-100 text-green-800"
                      }`}
                    >
                      ตอนนี้
                    </span>
                  )}
                </span>
                <span className={`block text-xs ${selected ? "text-blue-100" : "text-gray-500"}`}>
                  {ended ? "สิ้นสุดแล้ว" : `${definition.startTime}–${definition.endTime}`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {values.slots.length > 0
            ? `เลือกแล้ว: ${getSlotRangeLabel(values.slots)}`
            : "ไม่บังคับ: ถ้าไม่เลือกคาบ จะแสดงห้องที่มีคาบว่างในวันนั้นพร้อมคาบที่ว่าง · หลายคาบให้แตะคาบแรกและคาบสุดท้าย"}
        </p>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="finder-capability" className="label">
            ประเภทพื้นที่
          </label>
          <select
            id="finder-capability"
            className="input"
            value={values.capability}
            onChange={(event) => patch({ capability: event.target.value })}
          >
            <option value="">ทุกประเภท</option>
            {ROOM_CAPABILITY_VALUES.map((capability) => (
              <option key={capability} value={capability}>
                {getRoomCapabilityLabel(capability)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="finder-building" className="label">
            อาคาร
          </label>
          <select
            id="finder-building"
            className="input"
            value={values.building}
            disabled={buildings.length === 0}
            onChange={(event) => patch({ building: event.target.value, floor: "" })}
          >
            <option value="">ทั้งหมด</option>
            {buildings.map((building) => (
              <option key={building} value={building}>
                อาคาร {building}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="finder-floor" className="label">
            ชั้น
          </label>
          <select
            id="finder-floor"
            className="input"
            value={values.floor}
            disabled={!values.building || floors.length === 0}
            onChange={(event) => patch({ floor: event.target.value })}
          >
            <option value="">ทั้งหมด</option>
            {floors.map((floor) => (
              <option key={floor} value={String(floor)}>
                ชั้น {floor}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-amber-700" aria-live="polite">
          {stale ? "เงื่อนไขเปลี่ยนแล้ว กด “ค้นหาห้อง” เพื่ออัปเดตผลลัพธ์" : ""}
        </p>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {pending ? "กำลังค้นหา…" : "ค้นหาห้อง"}
        </button>
      </div>
    </form>
  );
}
