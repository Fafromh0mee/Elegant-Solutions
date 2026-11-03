"use client";

import React, { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Monitor,
  Plus,
  RefreshCw,
  ShieldCheck,
  User,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { getRiskLevelLabel } from "@/lib/ui-terms";
import {
  addBlacklistAction,
  cancelActivationCodeAction,
  createActivationCodeAction,
  createMaintenanceCodeAction,
  removeBlacklistAction,
  updateBlacklistAction,
} from "@/actions/agent";
import { AdminPageHeader } from "@/components/admin-page-header";

type SnapshotMachine = {
  id: string;
  machineCode: string;
  hostname: string;
  room: { roomCode: string; name: string } | null;
  platform: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  currentUser: { name: string; email: string } | null;
  activeApp: string | null;
  activeTitle: string | null;
  riskLevel: string;
  loggedSince: string | null;
  sessionExpiresAt: string | null;
};

type Snapshot = {
  machines: SnapshotMachine[];
  summary: {
    totalMachines: number;
    onlineMachines: number;
    activeRooms: number;
    watchAlerts: number;
  };
  pendingActivations: PendingActivation[];
};

type ActivationRoom = {
  id: string;
  roomCode: string;
  name: string;
};

type PendingActivation = {
  id: string;
  roomCode: string;
  roomName: string;
  reservedMachineCode: string;
  expiresAt: string;
};

type RevealedActivation = PendingActivation & { code: string };

type BlacklistItem = {
  id: string;
  pattern: string;
  isActive: boolean;
  createdAt: Date;
};

async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/tracking/snapshot", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch snapshot");
  return res.json();
}

export function TrackingClient({
  initialBlacklist,
  activationRooms,
}: {
  initialBlacklist: BlacklistItem[];
  activationRooms: ActivationRoom[];
}) {
  const [blacklist, setBlacklist] = useState(initialBlacklist);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState("");
  const [blacklistError, setBlacklistError] = useState("");
  const [maintenanceAction, setMaintenanceAction] = useState<Record<string, string>>({});
  const [maintenanceCodes, setMaintenanceCodes] = useState<Record<string, { code: string; expiresAt: string; action: string }>>({});
  const [activationRoomId, setActivationRoomId] = useState(activationRooms[0]?.id ?? "");
  const [activationError, setActivationError] = useState("");
  const [revealedActivation, setRevealedActivation] = useState<RevealedActivation | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["tracking-snapshot"],
    queryFn: fetchSnapshot,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const summary = data?.summary ?? {
    totalMachines: 0,
    onlineMachines: 0,
    activeRooms: 0,
    watchAlerts: 0,
  };

  const machines = data?.machines ?? [];
  const pendingActivations = data?.pendingActivations ?? [];

  function handleCreateActivationCode() {
    if (!activationRoomId) return;
    setActivationError("");
    startTransition(async () => {
      const result = await createActivationCodeAction(activationRoomId);
      if ("error" in result) {
        setActivationError(result.error ?? "สร้างรหัสเปิดใช้งานไม่สำเร็จ");
        return;
      }
      const room = activationRooms.find((candidate) => candidate.id === activationRoomId);
      setRevealedActivation({
        id: result.id,
        code: result.code,
        roomCode: result.roomCode,
        roomName: room?.name ?? "",
        reservedMachineCode: result.machineCode,
        expiresAt: new Date(result.expiresAt).toISOString(),
      });
      void refetch();
    });
  }

  function handleCancelActivationCode(id: string) {
    setActivationError("");
    startTransition(async () => {
      const result = await cancelActivationCodeAction(id);
      if ("error" in result) {
        setActivationError(result.error ?? "ยกเลิกรหัสเปิดใช้งานไม่สำเร็จ");
        return;
      }
      if (revealedActivation?.id === id) setRevealedActivation(null);
      void refetch();
    });
  }

  function handleAddBlacklist() {
    if (!newPattern.trim()) return;
    setBlacklistError("");
    startTransition(async () => {
      const result = await addBlacklistAction(newPattern.trim());
      if (result.error) {
        setBlacklistError(result.error);
        return;
      }
      const res = await fetch("/api/tracking/snapshot", { cache: "no-store" });
      const updated = await fetch("/api/tracking/snapshot", {
        cache: "no-store",
      });
      void updated;
      void res;
      setBlacklist((prev) => [
        {
          id: Date.now().toString(),
          pattern: newPattern.trim().toLowerCase(),
          isActive: true,
          createdAt: new Date(),
        },
        ...prev,
      ]);
      setNewPattern("");
    });
  }

  function handleRemoveBlacklist(id: string) {
    startTransition(async () => {
      await removeBlacklistAction(id);
      setBlacklist((prev) => prev.filter((b) => b.id !== id));
    });
  }

  function handleToggleBlacklist(id: string, current: boolean) {
    startTransition(async () => {
      await updateBlacklistAction(id, !current);
      setBlacklist((prev) =>
        prev.map((b) => (b.id === id ? { ...b, isActive: !current } : b)),
      );
    });
  }

  function handleGenerateMaintenanceCode(machineId: string) {
    const action = maintenanceAction[machineId] ?? "ENTER_MAINTENANCE";
    startTransition(async () => {
      const result = await createMaintenanceCodeAction(machineId, action);
      if ("error" in result || !result.code || !result.expiresAt) return;
      setMaintenanceCodes((prev) => ({
        ...prev,
        [machineId]: { code: result.code, expiresAt: result.expiresAt.toISOString(), action },
      }));
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => refetch()}
          className="btn-secondary"
          disabled={isRefetching || isLoading}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
          />
          รีเฟรช
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Machines Online"
          value={`${summary.onlineMachines}/${summary.totalMachines}`}
          hint="เครื่องที่ online ตอนนี้"
          icon={<Wifi className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          label="Active Rooms"
          value={summary.activeRooms}
          hint="ห้องที่มีเครื่องออนไลน์อยู่"
          icon={<Monitor className="h-5 w-5" />}
          tone="green"
        />
        <MetricCard
          label="Watch Alerts"
          value={summary.watchAlerts}
          hint="เครื่องที่ตรวจพบพฤติกรรมผิดปกติ"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="amber"
        />
        <MetricCard
          label="Blacklist Rules"
          value={blacklist.filter((b) => b.isActive).length}
          hint="กฎที่เปิดใช้งานอยู่"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="purple"
        />
      </div>

      {/* Computer activation */}
      <div className="card">
        <h2 className="font-semibold mb-2">เพิ่มคอมพิวเตอร์</h2>
        <p className="text-sm text-gray-500 mb-4">
          เลือกห้อง แล้วส่งรหัสเปิดใช้งานแบบใช้ครั้งเดียวให้ผู้ติดตั้งภายใน 10 นาที
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input w-auto min-w-56"
            value={activationRoomId}
            onChange={(event) => setActivationRoomId(event.target.value)}
            disabled={activationRooms.length === 0 || isPending}
          >
            {activationRooms.length === 0 ? (
              <option value="">ไม่มีห้องที่พร้อมใช้งาน</option>
            ) : (
              activationRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomCode} — {room.name}
                </option>
              ))
            )}
          </select>
          <button
            className="btn-primary"
            onClick={handleCreateActivationCode}
            disabled={isPending || !activationRoomId}
          >
            <Plus className="h-4 w-4" />
            สร้างรหัสเปิดใช้งาน
          </button>
        </div>
        {activationError && <p className="mt-3 text-sm text-red-500">{activationError}</p>}
        {revealedActivation && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-medium">ส่งรหัสนี้ให้ผู้ติดตั้งตอนนี้ — จะแสดงเพียงครั้งเดียว</p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-[0.25em]">{revealedActivation.code}</p>
            <p className="mt-2 text-sm text-gray-600">
              {revealedActivation.reservedMachineCode} · {revealedActivation.roomCode} — {revealedActivation.roomName} · หมดอายุ {new Date(revealedActivation.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              className="btn-secondary mt-3"
              onClick={() => handleCancelActivationCode(revealedActivation.id)}
              disabled={isPending}
            >
              ยกเลิกรหัสนี้
            </button>
          </div>
        )}
        <div className="mt-4">
          <h3 className="text-sm font-medium">รอการเปิดใช้งาน</h3>
          {pendingActivations.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">ไม่มีรหัสที่รอการใช้งาน</p>
          ) : (
            <div className="mt-2 space-y-2">
              {pendingActivations.map((activation) => (
                <div key={activation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{activation.reservedMachineCode}</span>
                    <span className="text-gray-500"> · {activation.roomCode} — {activation.roomName} · หมดอายุ {new Date(activation.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <button className="text-sm text-red-600 hover:underline" onClick={() => handleCancelActivationCode(activation.id)} disabled={isPending}>
                    ยกเลิก
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Machine Table */}
      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-1">เครื่องคอมพิวเตอร์ทั้งหมด</h2>
        <p className="mb-4 text-sm text-gray-500">เรียงตามห้องและหมายเลขเครื่อง</p>
        {isLoading ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            กำลังโหลดข้อมูล...
          </p>
        ) : machines.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            ยังไม่มีเครื่องลงทะเบียน
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 pr-4">สถานะ</th>
                <th className="pb-3 pr-4">เครื่อง / ห้อง</th>
                <th className="pb-3 pr-4">ผู้ใช้</th>
                <th className="pb-3 pr-4">แอป / หัวข้อ</th>
                <th className="pb-3 pr-4">เริ่มใช้</th>
                <th className="pb-3 pr-4">สิทธิ์ถึง</th>
                <th className="pb-3 pr-4">Risk</th>
                <th className="pb-3">Log</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <React.Fragment key={m.id}>
                  <tr className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      {m.isOnline ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <Wifi className="h-3 w-3" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          <WifiOff className="h-3 w-3" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">
                        {m.machineCode}{!m.isActive && " (inactive)"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {m.room?.roomCode
                          ? `${m.room.roomCode} — ${m.room.name}`
                          : m.hostname}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      {m.currentUser ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400 shrink-0" />
                          <div>
                            <p className="font-medium">{m.currentUser.name}</p>
                            <p className="text-xs text-gray-400">
                              {m.currentUser.email}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 max-w-[220px]">
                      {m.activeApp ? (
                        <div>
                          <p className="font-medium">{m.activeApp}</p>
                          <p
                            className="text-xs text-gray-400 truncate"
                            title={m.activeTitle ?? ""}
                          >
                            {m.activeTitle ?? "—"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {m.loggedSince
                        ? new Date(m.loggedSince).toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {m.sessionExpiresAt
                        ? new Date(m.sessionExpiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          m.riskLevel === "WATCH"
                            ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                            : "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                        }
                      >
                        {getRiskLevelLabel(m.riskLevel)}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() =>
                          setExpandedMachine((prev) =>
                            prev === m.id ? null : m.id,
                          )
                        }
                        className="p-1 rounded hover:bg-gray-100 text-gray-500"
                        title="ดูประวัติ"
                      >
                        {expandedMachine === m.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedMachine === m.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-4 pb-4">
                        <LogHistoryDropdown machineId={m.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Maintenance codes */}
      <div className="card">
        <h2 className="font-semibold mb-2">Administrator Maintenance</h2>
        <p className="text-sm text-gray-500 mb-4">
          รหัสใช้ได้ 5 นาที ใช้ได้ครั้งเดียว และผูกกับเครื่องกับการดำเนินการที่เลือก
        </p>
        <div className="space-y-3">
          {machines.map((machine) => {
            const code = maintenanceCodes[machine.id];
            return (
              <div key={machine.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3">
                <div className="min-w-48">
                  <p className="font-medium">{machine.machineCode}</p>
                  <p className="text-xs text-gray-400">{machine.hostname} · {machine.platform ?? "ไม่ระบุ OS"}</p>
                </div>
                <select
                  className="input w-auto"
                  value={maintenanceAction[machine.id] ?? "ENTER_MAINTENANCE"}
                  onChange={(event) => setMaintenanceAction((prev) => ({ ...prev, [machine.id]: event.target.value }))}
                  disabled={!machine.isActive}
                >
                  <option value="ENTER_MAINTENANCE">เข้าโหมดบำรุงรักษา</option>
                  <option value="RESTART_AGENT">รีสตาร์ต Agent</option>
                  <option value="UNINSTALL_AGENT">ถอนการติดตั้ง Agent</option>
                </select>
                <button
                  className="btn-secondary"
                  onClick={() => handleGenerateMaintenanceCode(machine.id)}
                  disabled={isPending || !machine.isActive}
                >
                  สร้างรหัส
                </button>
                {code && (
                  <span className="rounded bg-slate-100 px-3 py-2 font-mono text-lg tracking-widest">
                    {code.code} <span className="text-xs font-sans tracking-normal text-gray-500">({code.action})</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Blacklist Manager */}
      <div className="card">
        <h2 className="font-semibold mb-4">Website Blacklist</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            className="input flex-1"
            placeholder="เช่น youtube.com, tiktok.com"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddBlacklist()}
          />
          <button
            className="btn-primary"
            onClick={handleAddBlacklist}
            disabled={isPending || !newPattern.trim()}
          >
            <Plus className="h-4 w-4" />
            เพิ่ม
          </button>
        </div>
        {blacklistError && (
          <p className="text-sm text-red-500 mb-3">{blacklistError}</p>
        )}
        {blacklist.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีรายการ</p>
        ) : (
          <div className="space-y-2">
            {blacklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.isActive}
                    onChange={() =>
                      handleToggleBlacklist(item.id, item.isActive)
                    }
                    className="h-4 w-4 accent-(--color-primary)"
                  />
                  <span
                    className={`text-sm font-mono ${!item.isActive ? "line-through text-gray-400" : ""}`}
                  >
                    {item.pattern}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveBlacklist(item.id)}
                  disabled={isPending}
                  className="p-1 text-gray-400 hover:text-red-500 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogHistoryDropdown({ machineId }: { machineId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-logs", machineId],
    queryFn: async () => {
      const res = await fetch(
        `/api/tracking/machine-logs?machineId=${machineId}`,
      );
      if (!res.ok) return [];
      return res.json() as Promise<
        {
          id: string;
          createdAt: string;
          activeApp: string | null;
          activeTitle: string | null;
          riskLevel: string;
          user: { name: string } | null;
        }[]
      >;
    },
    staleTime: 10000,
  });

  if (isLoading)
    return <p className="text-xs text-gray-400 py-2">กำลังโหลด...</p>;
  if (!data || data.length === 0)
    return <p className="text-xs text-gray-400 py-2">ไม่มีประวัติ</p>;

  return (
    <div className="mt-2 max-h-48 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b">
            <th className="pb-1 pr-3">เวลา</th>
            <th className="pb-1 pr-3">ผู้ใช้</th>
            <th className="pb-1 pr-3">แอป</th>
            <th className="pb-1 pr-3">หัวข้อ</th>
            <th className="pb-1">Risk</th>
          </tr>
        </thead>
        <tbody>
          {data.map((log) => (
            <tr key={log.id} className="border-b last:border-0">
              <td className="py-1 pr-3 text-gray-500">
                {new Date(log.createdAt).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </td>
              <td className="py-1 pr-3">{log.user?.name ?? "—"}</td>
              <td className="py-1 pr-3">{log.activeApp ?? "—"}</td>
              <td
                className="py-1 pr-3 max-w-[200px] truncate"
                title={log.activeTitle ?? ""}
              >
                {log.activeTitle ?? "—"}
              </td>
              <td className="py-1">
                <span
                  className={
                    log.riskLevel === "WATCH"
                      ? "text-amber-600 font-medium"
                      : "text-green-600"
                  }
                >
                  {getRiskLevelLabel(log.riskLevel)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "purple";
}) {
  const toneClass: Record<string, string> = {
    blue: "bg-(--color-primary-light) text-(--color-primary)",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${toneClass[tone]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm text-gray-700">{label}</p>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        </div>
      </div>
    </div>
  );
}
