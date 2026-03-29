"use client";

import React, { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
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
import {
  addBlacklistAction,
  removeBlacklistAction,
  updateBlacklistAction,
} from "@/actions/agent";

type SnapshotMachine = {
  id: string;
  machineCode: string;
  hostname: string;
  room: { roomCode: string; name: string } | null;
  isOnline: boolean;
  lastSeen: string | null;
  currentUser: { name: string; email: string } | null;
  activeApp: string | null;
  activeTitle: string | null;
  riskLevel: string;
  loggedSince: string | null;
};

type Snapshot = {
  machines: SnapshotMachine[];
  summary: {
    totalMachines: number;
    onlineMachines: number;
    activeRooms: number;
    watchAlerts: number;
  };
};

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
}: {
  initialBlacklist: BlacklistItem[];
}) {
  const [blacklist, setBlacklist] = useState(initialBlacklist);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState("");
  const [blacklistError, setBlacklistError] = useState("");
  const [isPending, startTransition] = useTransition();

  const { data, isLoading, dataUpdatedAt, refetch, isRefetching } = useQuery({
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

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-(--color-cta)" />
            Tracking Agent Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastUpdated
              ? `อัปเดตล่าสุด ${lastUpdated.toLocaleTimeString("th-TH")}`
              : "กำลังโหลด..."}
          </p>
        </div>
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

      {/* Machine Table */}
      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-4">เครื่องคอมพิวเตอร์ทั้งหมด</h2>
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
                <th className="pb-3 pr-4">Risk</th>
                <th className="pb-3">Log</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <React.Fragment key={m.id}>
                  <tr
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
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
                        {m.machineCode}
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
                    <td className="py-3 pr-4">
                      <span
                        className={
                          m.riskLevel === "WATCH"
                            ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                            : "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                        }
                      >
                        {m.riskLevel}
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
                      <td colSpan={7} className="px-4 pb-4">
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
                  {log.riskLevel}
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

