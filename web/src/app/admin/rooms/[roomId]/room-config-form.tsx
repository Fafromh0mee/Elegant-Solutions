"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRoomConfigurationAction } from "@/actions/rooms";
import { deriveRoomConfigurationHealth, type RoomConfiguration } from "@/lib/room-config";
import { ROOM_CAPABILITY_VALUES, type RoomApprovalPolicy, type RoomCapability } from "@/lib/types";
import { getApprovalPolicyLabel, getRoomCapabilityLabel, getRoomConfigIssueLabel } from "@/lib/ui-terms";
import { Notice, Section } from "./section";

const APPROVAL_POLICIES: Array<{ value: RoomApprovalPolicy; hint: string }> = [
  { value: "AUTO", hint: "การจองที่ผ่านเงื่อนไขทั้งหมดจะได้รับการอนุมัติทันที" },
  { value: "MANUAL", hint: "การจองจะรอผู้ดูแลระบบอนุมัติหรือปฏิเสธ" },
];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

export function RoomConfigForm({ room, windowCount }: { room: RoomConfiguration & { id: string }; windowCount: number }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: room.name,
    roomCode: room.roomCode,
    description: room.description ?? "",
    building: room.building ?? "",
    floor: room.floor === null ? "" : String(room.floor),
    capacity: String(room.capacity),
  });
  const [capabilities, setCapabilities] = useState<RoomCapability[]>(room.capabilities);
  const [flags, setFlags] = useState({
    isActive: room.isActive,
    bookingEnabled: room.bookingEnabled,
    guestAccess: room.guestAccess,
    staffOnly: room.staffOnly,
  });
  const [approvalPolicy, setApprovalPolicy] = useState<RoomApprovalPolicy>(room.approvalPolicy);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const capacity = Number(form.capacity);
  const preview = deriveRoomConfigurationHealth({
    isActive: flags.isActive,
    bookingEnabled: flags.bookingEnabled,
    capabilities,
    capacity: Number.isFinite(capacity) ? capacity : 0,
    availabilityWindowCount: windowCount,
  });

  function toggleCapability(capability: RoomCapability) {
    setCapabilities((current) =>
      current.includes(capability) ? current.filter((c) => c !== capability) : [...current, capability]
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const result = await updateRoomConfigurationAction(room.id, {
      name: form.name,
      roomCode: form.roomCode,
      description: form.description,
      building: form.building,
      floor: form.floor === "" ? null : Number(form.floor),
      capacity,
      capabilities,
      approvalPolicy,
      ...flags,
    });
    setSaving(false);
    if ("success" in result) {
      setNotice({ kind: "success", text: "บันทึกการตั้งค่าห้องแล้ว" });
      router.refresh();
    } else {
      setNotice({ kind: "error", text: result.error });
    }
  }

  const text = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <Section title="ข้อมูลห้อง">
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <form onSubmit={save} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">ชื่อห้อง</label>
            <input className="input" required {...text("name")} />
          </div>
          <div>
            <label className="label">รหัสห้อง</label>
            <input
              className="input"
              required
              value={form.roomCode}
              onChange={(e) => setForm({ ...form, roomCode: e.target.value.toUpperCase() })}
            />
            {form.roomCode !== room.roomCode && (
              <p className="mt-1 text-xs text-amber-700">
                การเปลี่ยนรหัสห้องจะเปลี่ยนที่อยู่หน้าประตู (/gate/{form.roomCode || "…"}) และการนำเข้าตารางเรียนที่อ้างอิงรหัสเดิม
              </p>
            )}
          </div>
          <div>
            <label className="label">ความจุ (คน)</label>
            <input className="input" type="number" min={0} step={1} required {...text("capacity")} />
            {capacity <= 0 && <p className="mt-1 text-xs text-amber-700">ยังไม่ได้ตั้งค่าความจุ</p>}
          </div>
          <div>
            <label className="label">อาคาร</label>
            <input className="input" placeholder="ไม่ระบุ" {...text("building")} />
          </div>
          <div>
            <label className="label">ชั้น</label>
            <input className="input" type="number" step={1} placeholder="ไม่ระบุ" {...text("floor")} />
          </div>
          <div>
            <label className="label">รายละเอียด</label>
            <input className="input" {...text("description")} />
          </div>
        </div>

        <fieldset>
          <legend className="label">ประเภทพื้นที่</legend>
          <div className="flex flex-wrap gap-2">
            {ROOM_CAPABILITY_VALUES.map((capability) => {
              const selected = capabilities.includes(capability);
              return (
                <button
                  key={capability}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCapability(capability)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {getRoomCapabilityLabel(capability)}
                </button>
              );
            })}
          </div>
          {capabilities.length === 0 && <p className="mt-2 text-xs text-amber-700">ยังไม่ได้ตั้งค่าประเภทพื้นที่</p>}
        </fieldset>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Toggle
            checked={flags.isActive}
            onChange={(isActive) => setFlags({ ...flags, isActive })}
            label="เปิดใช้งานห้อง"
            hint="ห้องใช้งานได้ในระบบ รวมถึงการเข้าใช้ห้องตามตารางเรียน"
          />
          <Toggle
            checked={flags.bookingEnabled}
            onChange={(bookingEnabled) => setFlags({ ...flags, bookingEnabled })}
            label="เปิดให้จอง"
            hint="อนุญาตให้ผู้ใช้จองห้องนอกตารางเรียน ไม่มีผลต่อการเข้าใช้ห้องตามตารางเรียน"
          />
          <Toggle
            checked={flags.guestAccess}
            onChange={(guestAccess) => setFlags({ ...flags, guestAccess })}
            label="อนุญาตผู้เยี่ยมชม"
            hint="ผู้เยี่ยมชมสามารถเลือกห้องนี้เพื่อขอเข้าใช้ห้องได้"
          />
          <Toggle
            checked={flags.staffOnly}
            onChange={(staffOnly) => setFlags({ ...flags, staffOnly })}
            label="เฉพาะนักศึกษาและบุคลากร"
            hint="ผู้เยี่ยมชมจะถูกปฏิเสธเมื่อยืนยันตัวตนด้วยใบหน้าที่ห้องนี้"
          />
        </div>

        <fieldset>
          <legend className="label">รูปแบบการอนุมัติการจอง</legend>
          {!flags.bookingEnabled && <p className="mb-2 text-xs text-gray-500">มีผลเมื่อเปิดให้จองเท่านั้น</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {APPROVAL_POLICIES.map(({ value, hint }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-gray-50 ${
                  flags.bookingEnabled ? "" : "opacity-60"
                }`}
              >
                <input
                  type="radio"
                  name="approvalPolicy"
                  checked={approvalPolicy === value}
                  onChange={() => setApprovalPolicy(value)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{getApprovalPolicyLabel(value)}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {preview.health === "INCOMPLETE" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">บันทึกได้ แต่ห้องจะอยู่ในสถานะตั้งค่าไม่ครบและยังไม่สามารถจองได้</p>
            <ul className="mt-1 list-inside list-disc">
              {preview.issues.map((issue) => (
                <li key={issue}>{getRoomConfigIssueLabel(issue)}</li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลห้อง"}
        </button>
      </form>
    </Section>
  );
}
