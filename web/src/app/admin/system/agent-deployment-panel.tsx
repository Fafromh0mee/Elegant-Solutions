"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Installer endpoints return binary downloads and need browser navigation. */

import { useState, useTransition } from "react";
import {
  createDeploymentBatchAction,
  getDeploymentOverviewAction,
  revokeDeploymentBatchAction,
  revokeDeploymentCodeAction,
} from "@/actions/agent-deployments";

type Overview = Awaited<ReturnType<typeof getDeploymentOverviewAction>>;

function downloadOneTimeCsv(batchId: string, roomCode: string, codes: Array<{ machineCode: string; code: string; expiresAt: string }>) {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = ["batch_id,room_code,machine_code,activation_code,expires_at"];
  for (const item of codes) {
    lines.push([batchId, roomCode, item.machineCode, item.code, item.expiresAt].map(cell).join(","));
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n"), "\r\n"], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `elegant-agent-${roomCode}-${batchId}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AgentDeploymentPanel({ initial }: { initial: Overview }) {
  const [overview, setOverview] = useState(initial);
  const [roomId, setRoomId] = useState(initial.rooms[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => setOverview(await getDeploymentOverviewAction()));
  }

  function create() {
    setMessage("");
    startTransition(async () => {
      const result = await createDeploymentBatchAction(roomId, count);
      if (!result.ok) return setMessage(result.error);
      downloadOneTimeCsv(result.batchId, result.roomCode, result.codes);
      setMessage(`สร้าง Batch ${result.batchId} แล้ว ดาวน์โหลด CSV ครั้งเดียว กรุณาเก็บไฟล์ในที่ปลอดภัย`);
      setOverview(await getDeploymentOverviewAction());
    });
  }

  function revokeBatch(id: string) {
    if (!window.confirm("ยกเลิกรหัสที่ยังไม่ถูกใช้ทั้งหมดใน Batch นี้?")) return;
    startTransition(async () => {
      await revokeDeploymentBatchAction(id);
      setOverview(await getDeploymentOverviewAction());
    });
  }

  function revokeCode(id: string) {
    startTransition(async () => {
      await revokeDeploymentCodeAction(id);
      setOverview(await getDeploymentOverviewAction());
    });
  }

  return (
    <section className="card mt-6 space-y-5" aria-labelledby="agent-deployment-title">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="agent-deployment-title" className="text-lg font-semibold">Tracking Agent Deployment</h2>
          <p className="text-sm text-gray-500">รหัสตัวเลข 6 หลัก ใช้ได้ครั้งเดียวภายใน 7 วัน · CSV ดาวน์โหลดได้ครั้งเดียวเมื่อสร้าง Batch</p>
        </div>
        <button type="button" className="btn-secondary" onClick={refresh} disabled={pending}>รีเฟรช</button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">ห้อง
          <select className="input mt-1 min-w-52" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {overview.rooms.map((room) => <option key={room.id} value={room.id}>{room.roomCode} — {room.name}</option>)}
          </select>
        </label>
        <label className="text-sm">จำนวนเครื่อง
          <input className="input mt-1 w-28" type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} />
        </label>
        <button type="button" className="btn-primary" onClick={create} disabled={pending || !roomId || !Number.isInteger(count) || count < 1 || count > 100}>สร้าง Batch และดาวน์โหลด CSV</button>
      </div>
      {message && <p role="status" className="text-sm text-blue-700">{message}</p>}
      <div>
        <h3 className="font-medium">ดาวน์โหลด installer</h3>
        <p className="text-xs text-gray-500">ไฟล์จะพร้อมเมื่อผู้ดูแลระบบนำ package ที่ build แล้วไปวางใน AGENT_INSTALLER_DIR บน server</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <a className="btn-secondary" href="/api/admin/agent/installers/windows-x64">Windows x64</a>
          <a className="btn-secondary" href="/api/admin/agent/installers/macos-arm64">macOS arm64</a>
          <a className="btn-secondary" href="/api/admin/agent/installers/macos-x86_64">macOS x86_64</a>
          <a className="btn-secondary" href="/api/admin/agent/installers/linux-amd64">Ubuntu x86-64</a>
        </div>
      </div>
      <div className="space-y-3">
        {overview.batches.map((batch) => {
          const activated = batch.codes.filter((code) => code.status === "ACTIVATED").length;
          return (
            <details key={batch.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">{batch.roomCode} · {activated}/{batch.requestedCount} เครื่องเปิดใช้งาน · หมดอายุ {new Date(batch.expiresAt).toLocaleString("th-TH")}{batch.revokedAt ? " · ยกเลิกแล้ว" : ""}</summary>
              <div className="mt-3 flex justify-end">
                {!batch.revokedAt && <button type="button" className="text-sm text-red-600" onClick={() => revokeBatch(batch.id)} disabled={pending}>ยกเลิก Batch</button>}
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="text-left"><th>เครื่อง</th><th>สถานะ</th><th>Hostname</th><th>OS</th><th>ดำเนินการ</th></tr></thead><tbody>
                  {batch.codes.map((code) => <tr key={code.id} className="border-t">
                    <td className="py-2 font-mono">{code.machineCode}</td><td>{code.status}</td><td>{code.machine?.hostname ?? "—"}</td><td>{code.machine?.platform ?? "—"}</td>
                    <td>{code.status === "PENDING" && <button type="button" className="text-red-600" onClick={() => revokeCode(code.id)} disabled={pending}>ยกเลิกรหัส</button>}</td>
                  </tr>)}
                </tbody></table>
              </div>
            </details>
          );
        })}
        {overview.batches.length === 0 && <p className="text-sm text-gray-500">ยังไม่มี Deployment Batch</p>}
      </div>
    </section>
  );
}
