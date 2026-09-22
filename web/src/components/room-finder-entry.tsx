"use client";

import { Search } from "lucide-react";
import { RoomFinderPanel } from "@/components/room-finder/room-finder-panel";
import type { DashboardRoomFinder } from "@/lib/room-finder-search";

/**
 * The student dashboard's single room search, open from the start. The server seeds it
 * with party size 1, today, and - inside an AcademicSlot - the current slot already
 * searched (see loadDashboardRoomFinder). The student refines and presses "ค้นหาห้อง".
 */
export function RoomFinderEntry({ initial }: { initial: DashboardRoomFinder }) {
  return (
    <section className="mb-8" aria-labelledby="room-finder-heading">
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-5 w-5 text-(--color-secondary)" />
        <h2 id="room-finder-heading" className="text-lg font-semibold">
          ค้นหาห้องว่าง
        </h2>
      </div>
      <RoomFinderPanel
        mode="inline"
        setup={initial.setup}
        initialForm={initial.form}
        initialSearch={initial.search}
        now={initial.now}
      />
    </section>
  );
}
