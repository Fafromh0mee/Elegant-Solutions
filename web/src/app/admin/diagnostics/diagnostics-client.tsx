"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  CircleX,
  Clock3,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin-page-header";

type Status = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
type HealthCheck = {
  status: Status;
  latencyMs: number | null;
  detail: string;
  apiReachable?: boolean;
  modelReady?: boolean | null;
};
type Machine = {
  id: string;
  machineCode: string;
  hostname: string;
  room: { roomCode: string; name: string } | null;
  platform: string | null;
  agentVersion: string | null;
  isActive: boolean;
  isOnline: boolean;
  status: Status;
  lastSeen: string | null;
  currentUser: { name: string } | null;
  sessionExpiresAt: string | null;
  sessionState: "ACTIVE" | "WAITING_FOR_LOGIN" | "NOT_VISIBLE_OFFLINE";
  diagnosticMessage: string;
};
type Diagnostics = {
  checkedAt: string;
  serverTime: string;
  timezone: string;
  environment: string;
  system: { web: HealthCheck; database: HealthCheck; faceAi: HealthCheck };
  environmentChecks: { faceAiConfigured: boolean; faceAccessReminder: string };
  agents: {
    status: Status;
    registered: number;
    online: number;
    offline: number;
    activeSessions: number;
    machines: Machine[];
    pendingActivations: {
      id: string;
      roomCode: string;
      roomName: string;
      reservedMachineCode: string;
      expiresAt: string;
    }[];
  };
};

type Filter = "ALL" | "ONLINE" | "OFFLINE" | "ACTIVE_USER";

async function fetchDiagnostics(): Promise<Diagnostics> {
  const response = await fetch("/api/admin/diagnostics", { cache: "no-store" });
  if (!response.ok) throw new Error("Diagnostics unavailable");
  return response.json();
}

function statusMeta(status: Status) {
  switch (status) {
    case "HEALTHY":
      return { label: "Healthy", className: "bg-green-100 text-green-700", Icon: CheckCircle2 };
    case "DEGRADED":
      return { label: "Degraded", className: "bg-amber-100 text-amber-700", Icon: AlertTriangle };
    case "UNAVAILABLE":
      return { label: "Unavailable", className: "bg-red-100 text-red-700", Icon: CircleX };
    default:
      return { label: "Unknown", className: "bg-gray-100 text-gray-700", Icon: CircleHelp };
  }
}

function StatusBadge({ status }: { status: Status }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function formatTime(value: string | null, timezone?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

function relativeHeartbeat(value: string | null) {
  if (!value) return "ไม่เคยได้รับ heartbeat";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} นาทีที่แล้ว`;
}

function HealthCard({ label, check }: { label: string; check: HealthCheck }) {
  return (
    <div className="card min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <div className="mt-2"><StatusBadge status={check.status} /></div>
        </div>
        {check.latencyMs !== null && <p className="text-xs text-gray-500">{check.latencyMs} ms</p>}
      </div>
      <p className="mt-3 text-sm text-gray-600">{check.detail}</p>
      {label === "Face AI" && (
        <p className="mt-2 text-xs text-gray-500">
          API {check.apiReachable ? "reachable" : "unreachable"} · Model {check.modelReady ? "ready" : check.modelReady === false ? "not ready" : "not checked"}
        </p>
      )}
    </div>
  );
}

export function DiagnosticsClient() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const query = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: fetchDiagnostics,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const data = query.data;

  const rooms = useMemo(
    () => Array.from(new Set((data?.agents.machines ?? []).map((machine) => machine.room?.roomCode).filter(Boolean))).sort(),
    [data?.agents.machines],
  );
  const machines = useMemo(() => (data?.agents.machines ?? []).filter((machine) => {
    if (roomFilter !== "ALL" && machine.room?.roomCode !== roomFilter) return false;
    if (filter === "ONLINE") return machine.isOnline;
    if (filter === "OFFLINE") return !machine.isOnline;
    if (filter === "ACTIVE_USER") return machine.sessionState === "ACTIVE";
    return true;
  }), [data?.agents.machines, filter, roomFilter]);

  return (
    <div className="space-y-6">
      <AdminPageHeader />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          {data ? `ตรวจสอบล่าสุด ${formatTime(data.checkedAt, data.timezone)}` : "กำลังตรวจสอบระบบ..."}
        </div>
        <button type="button" className="btn-secondary" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          รีเฟรช
        </button>
      </div>

      {query.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          ไม่สามารถโหลดข้อมูลวินิจฉัยได้ในขณะนี้ กรุณาลองรีเฟรชอีกครั้ง
        </div>
      )}

      {data && (
        <>
          <section aria-labelledby="system-health-heading">
            <h2 id="system-health-heading" className="mb-3 text-lg font-semibold">Overall</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <HealthCard label="Web Application" check={data.system.web} />
              <HealthCard label="Database" check={data.system.database} />
              <HealthCard label="Face AI" check={data.system.faceAi} />
            </div>
          </section>

          <section className="card" aria-labelledby="environment-heading">
            <h2 id="environment-heading" className="font-semibold">Pilot Environment</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-gray-500">Server time</p><p className="mt-1 font-medium">{formatTime(data.serverTime, data.timezone)}</p></div>
              <div><p className="text-gray-500">Timezone</p><p className="mt-1 font-medium">{data.timezone}</p></div>
              <div><p className="text-gray-500">Environment</p><p className="mt-1 font-medium">{data.environment}</p></div>
              <div><p className="text-gray-500">Face AI configured</p><p className="mt-1 font-medium">{data.environmentChecks.faceAiConfigured ? "Yes" : "No"}</p></div>
            </div>
            <p className="mt-4 border-t pt-3 text-xs text-gray-500">{data.environmentChecks.faceAccessReminder}</p>
          </section>

          <section aria-labelledby="computers-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="computers-heading" className="text-lg font-semibold">Computers</h2>
                <p className="mt-1 text-sm text-gray-500">{data.agents.registered} Registered · {data.agents.online} Online · {data.agents.offline} Offline · {data.agents.activeSessions} Active Sessions</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Filter by machine status" className="input w-auto" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                  <option value="ALL">All</option>
                  <option value="ONLINE">Online</option>
                  <option value="OFFLINE">Offline</option>
                  <option value="ACTIVE_USER">Active user</option>
                </select>
                <select aria-label="Filter by room" className="input w-auto" value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
                  <option value="ALL">All rooms</option>
                  {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </div>
            </div>

            {data.agents.pendingActivations.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-medium text-amber-900">Waiting for activation</h3>
                <div className="mt-2 space-y-2 text-sm text-amber-900">
                  {data.agents.pendingActivations.map((activation) => (
                    <div key={activation.id} className="flex flex-wrap justify-between gap-2">
                      <span>{activation.reservedMachineCode} · {activation.roomCode} — {activation.roomName}</span>
                      <span>หมดอายุ {formatTime(activation.expiresAt, data.timezone)}</span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/tracking" className="mt-3 inline-block text-sm font-medium text-amber-800 underline">จัดการ Activation ใน Tracking</Link>
              </div>
            )}

            {data.agents.status === "UNAVAILABLE" ? (
              <div className="card border-red-200 bg-red-50 text-sm text-red-700">
                ไม่สามารถอ่านสถานะ Agent fleet ได้ในขณะนี้ ตรวจสอบ Database card ด้านบนและลองรีเฟรชอีกครั้ง
              </div>
            ) : machines.length === 0 ? (
              <div className="card text-center text-sm text-gray-500">
                {data.agents.registered === 0 ? <>ยังไม่มีคอมพิวเตอร์ลงทะเบียน <Link href="/admin/tracking" className="text-(--color-cta) underline">เพิ่มจาก Tracking</Link></> : "ไม่พบเครื่องตามตัวกรองนี้"}
              </div>
            ) : (
              <div className="space-y-3">
                {machines.map((machine) => <MachineDiagnostic key={machine.id} machine={machine} timezone={data.timezone} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MachineDiagnostic({ machine, timezone }: { machine: Machine; timezone: string }) {
  return (
    <details className="card group">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{machine.machineCode}</p>
            <p className="truncate text-sm text-gray-500">{machine.room ? `${machine.room.roomCode} — ${machine.room.name}` : "ไม่ผูกห้อง"} · {machine.platform ?? "ไม่ระบุ OS"}</p>
          </div>
          <div className="flex items-center gap-2">
            {machine.isOnline ? <Wifi className="h-4 w-4 text-green-600" aria-hidden="true" /> : <WifiOff className="h-4 w-4 text-gray-500" aria-hidden="true" />}
            <StatusBadge status={machine.status} />
          </div>
        </div>
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DiagnosticField label="Hostname" value={machine.hostname} />
        <DiagnosticField label="Agent Version" value={machine.agentVersion ? `Agent ${machine.agentVersion}` : "ไม่รายงาน version"} />
        <DiagnosticField label="Last Heartbeat" value={machine.lastSeen ? `${relativeHeartbeat(machine.lastSeen)} (${formatTime(machine.lastSeen, timezone)})` : "ไม่เคยได้รับ heartbeat"} />
        <DiagnosticField label="Current User" value={machine.currentUser?.name ?? (machine.isOnline ? "Waiting for login" : "ไม่แสดงเมื่อ offline")} />
        <DiagnosticField label="Session Expires" value={machine.sessionExpiresAt ? formatTime(machine.sessionExpiresAt, timezone) : "—"} />
        <DiagnosticField label="Room" value={machine.room ? `${machine.room.roomCode} — ${machine.room.name}` : "ไม่ผูกห้อง"} />
        <div className="sm:col-span-2 lg:col-span-4 rounded-lg bg-gray-50 px-3 py-2 text-gray-600">{machine.diagnosticMessage}</div>
      </div>
    </details>
  );
}

function DiagnosticField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-gray-500">{label}</p><p className="mt-1 break-words font-medium text-gray-800">{value}</p></div>;
}
