"use client";

import Link from "next/link";
import { ChevronLeft, DoorOpen } from "lucide-react";
import type { AdminRoomDetail } from "@/lib/room-admin";
import { getRoomConfigIssueLabel } from "@/lib/ui-terms";
import { HealthBadge } from "../health-badge";
import { RoomConfigForm } from "./room-config-form";
import { AvailabilityGrid } from "./availability-grid";
import { RoomClosures } from "./room-closures";
import { RoomLifecycle } from "./room-lifecycle";

export function RoomDetailClient({ detail }: { detail: AdminRoomDetail }) {
  const { room } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/rooms" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-4 w-4" />
          กลับไปที่รายการห้อง
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <DoorOpen className="h-8 w-8 text-gray-700" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{room.roomCode}</h1>
              <p className="text-sm text-gray-500">{room.name}</p>
            </div>
          </div>
          <HealthBadge health={detail.health} />
        </div>

        {detail.health === "INCOMPLETE" && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">ห้องนี้เปิดให้จองแล้ว แต่ตั้งค่าไม่ครบ จึงยังไม่สามารถจองได้</p>
            <ul className="mt-1 list-inside list-disc">
              {detail.issues.map((issue) => (
                <li key={issue}>{getRoomConfigIssueLabel(issue)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RoomConfigForm room={room} windowCount={detail.windows.length} />
      <AvailabilityGrid roomId={room.id} initialWindows={detail.windows} bookingEnabled={room.bookingEnabled} />
      <RoomClosures roomId={room.id} closures={detail.closures} />
      <RoomLifecycle room={room} dependencies={detail.dependencies} />
    </div>
  );
}
