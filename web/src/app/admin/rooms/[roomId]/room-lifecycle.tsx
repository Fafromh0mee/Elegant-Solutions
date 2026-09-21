"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateRoomAction, deleteRoomAction } from "@/actions/rooms";
import { evaluateRoomDeletion, type RoomConfiguration, type RoomDependencyCounts } from "@/lib/room-config";
import { getRoomDependencyLabel } from "@/lib/ui-terms";
import { Notice, Section } from "./section";

export function RoomLifecycle({
  room,
  dependencies,
}: {
  room: RoomConfiguration & { id: string };
  dependencies: RoomDependencyCounts;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deletion = evaluateRoomDeletion(dependencies);

  async function deactivate() {
    if (!confirm(`ปิดใช้งานห้อง ${room.roomCode}? ประวัติการใช้งานทั้งหมดจะยังคงอยู่`)) return;
    setBusy(true);
    setError("");
    const result = await deactivateRoomAction(room.id);
    setBusy(false);
    if ("success" in result) router.refresh();
    else setError(result.error);
  }

  async function remove() {
    if (!confirm(`ลบห้อง ${room.roomCode} อย่างถาวร? การลบไม่สามารถย้อนกลับได้`)) return;
    setBusy(true);
    setError("");
    const result = await deleteRoomAction(room.id);
    setBusy(false);
    if ("success" in result) {
      router.push("/admin/rooms");
    } else {
      setError(result.error);
      router.refresh();
    }
  }

  return (
    <Section title="สถานะของห้อง">
      {error && <Notice kind="error">{error}</Notice>}

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">ปิดใช้งานห้อง</p>
            <p className="text-xs text-gray-500">
              วิธีที่แนะนำเมื่อห้องไม่ได้ใช้งานแล้ว ประวัติการใช้งาน การจอง และตารางเรียนทั้งหมดจะยังคงอยู่
            </p>
          </div>
          {room.isActive ? (
            <button type="button" className="btn-secondary" onClick={deactivate} disabled={busy}>
              ปิดใช้งานห้อง
            </button>
          ) : (
            <span className="badge bg-red-100 text-red-700">ปิดใช้งานอยู่</span>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-900">ลบห้องอย่างถาวร</p>
          {deletion.allowed ? (
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                ห้องนี้ยังไม่มีประวัติการใช้งาน การลบจะลบข้อมูลห้อง ช่วงเวลาที่เปิดให้จอง และการปิดปรับปรุงอย่างถาวร และไม่สามารถย้อนกลับได้
              </p>
              <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
                ลบห้องถาวร
              </button>
            </div>
          ) : (
            <div className="mt-1 text-xs text-gray-600">
              <p>ไม่สามารถลบห้องนี้ได้เนื่องจากมีประวัติการใช้งาน กรุณาปิดใช้งานห้องแทน</p>
              <ul className="mt-1 list-inside list-disc text-gray-500">
                {deletion.blockers.map(({ kind, count }) => (
                  <li key={kind}>
                    {getRoomDependencyLabel(kind)}: {count} รายการ
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
