"use client";

import { useState } from "react";
import { ChevronUp, Loader2, Search } from "lucide-react";
import { getRoomFinderSetupAction } from "@/actions/room-finder";
import { RoomFinderPanel } from "@/components/room-finder/room-finder-panel";
import { ROOM_CAPACITY_MAX } from "@/lib/room-config";
import { emptyRoomFinderForm, type RoomFinderSetup } from "@/lib/room-finder";

/**
 * Room Finder on the student dashboard, by progressive disclosure: a compact
 * "หาห้องสำหรับ [N] คน" prompt that expands in place into the full finder,
 * carrying the party size over. Nothing is searched until the full form is submitted.
 */
export function RoomFinderEntry() {
  const [partySize, setPartySize] = useState("1");
  const [expanded, setExpanded] = useState<{ setup: RoomFinderSetup; partySize: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function expand(event: React.FormEvent) {
    event.preventDefault();
    setOpening(true);
    setError("");
    try {
      // Server clock and bookable locations; this is not a search.
      const setup = await getRoomFinderSetupAction();
      if (setup.kind !== "READY") {
        setError("บัญชีนี้ไม่สามารถใช้การค้นหาห้องได้");
        return;
      }
      const { today, maxDate, now, locations } = setup;
      setExpanded({ setup: { today, maxDate, now, locations }, partySize });
    } catch {
      setError("เปิดการค้นหาห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setOpening(false);
    }
  }

  if (expanded) {
    return (
      <section className="mb-8" aria-labelledby="room-finder-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-(--color-secondary)" />
            <h2 id="room-finder-heading" className="text-lg font-semibold">
              ค้นหาห้องว่าง
            </h2>
          </div>
          <button type="button" onClick={() => setExpanded(null)} className="btn-secondary">
            <ChevronUp className="h-4 w-4" />
            ย่อ
          </button>
        </div>
        <RoomFinderPanel
          mode="inline"
          setup={expanded.setup}
          initialForm={emptyRoomFinderForm(expanded.setup.today, expanded.partySize)}
        />
      </section>
    );
  }

  return (
    <div className="card mb-8">
      <div className="mb-1 flex items-center gap-2">
        <Search className="h-5 w-5 text-(--color-secondary)" />
        <h2 className="font-semibold">ค้นหาห้องว่าง</h2>
      </div>
      <p className="mb-3 text-sm text-gray-500">
        เลือกวันที่ คาบ และประเภทพื้นที่ในขั้นถัดไป ระบบจะแสดงเฉพาะห้องที่ตรงกับความต้องการ
      </p>
      <form onSubmit={expand} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="room-finder-entry-party" className="whitespace-nowrap text-sm text-gray-700">
            หาห้องสำหรับ
          </label>
          <input
            id="room-finder-entry-party"
            type="number"
            inputMode="numeric"
            min={1}
            max={ROOM_CAPACITY_MAX}
            required
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
            className="input w-24"
          />
          <span className="text-sm text-gray-700">คน</span>
        </div>
        <button type="submit" className="btn-primary w-full sm:ml-auto sm:w-auto" disabled={opening}>
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          ค้นหาห้อง
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
