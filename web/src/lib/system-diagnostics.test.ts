import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  agentMachine: { findMany: vi.fn() },
  agentActivationCode: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth }));

import { GET } from "@/app/api/admin/diagnostics/route";
import { getSystemDiagnostics } from "@/lib/system-diagnostics";

const MACHINE = {
  id: "machine-1",
  machineCode: "LAB-401-PC01",
  hostname: "DESKTOP-A12F3",
  room: { roomCode: "LAB-401", name: "Lab 401" },
  platform: "Windows",
  agentVersion: "0.4.0",
  isActive: true,
  lastSeen: new Date("2030-01-01T00:00:20.000Z"),
  agentSessions: [{ expiresAt: new Date("2030-01-01T01:00:00.000Z"), user: { name: "Fafa" } }],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:25.000Z"));
  vi.stubEnv("AI_SERVICE_URL", "http://private-face-service:8000");
  auth.mockResolvedValue({ user: { role: "ADMIN" } });
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  db.agentMachine.findMany.mockResolvedValue([MACHINE]);
  db.agentActivationCode.findMany.mockResolvedValue([
    {
      id: "pending-1",
      reservedMachineCode: "LAB-401-PC02",
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      room: { roomCode: "LAB-401", name: "Lab 401" },
    },
  ]);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "healthy", model_loaded: true }))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("system diagnostics", () => {
  it("returns sanitized healthy infrastructure and authoritative session data", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.system.web.status).toBe("HEALTHY");
    expect(body.system.database.status).toBe("HEALTHY");
    expect(body.system.faceAi).toMatchObject({ status: "HEALTHY", apiReachable: true, modelReady: true });
    expect(body.agents).toMatchObject({ registered: 1, online: 1, offline: 0, activeSessions: 1 });
    expect(body.agents.machines[0]).toMatchObject({
      machineCode: "LAB-401-PC01",
      hostname: "DESKTOP-A12F3",
      platform: "Windows",
      agentVersion: "0.4.0",
      currentUser: { name: "Fafa" },
      sessionExpiresAt: "2030-01-01T01:00:00.000Z",
    });
    expect(body.agents.pendingActivations).toEqual([
      expect.objectContaining({ reservedMachineCode: "LAB-401-PC02" }),
    ]);
    expect(JSON.stringify(body)).not.toContain("private-face-service");
    expect(JSON.stringify(body)).not.toContain("apiKey");
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("isolates a database failure and still returns the diagnostics envelope", async () => {
    db.$queryRaw.mockRejectedValue(new Error("connection string must never escape"));
    db.agentMachine.findMany.mockRejectedValue(new Error("database unavailable"));
    db.agentActivationCode.findMany.mockRejectedValue(new Error("database unavailable"));

    const result = await getSystemDiagnostics();
    expect(result.system.database.status).toBe("UNAVAILABLE");
    expect(result.agents.status).toBe("UNAVAILABLE");
    expect(result.system.web.status).toBe("HEALTHY");
    expect(JSON.stringify(result)).not.toContain("connection string");
  });

  it("maps Face AI timeouts to unavailable without leaking its private URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const result = await getSystemDiagnostics();
    expect(result.system.faceAi).toMatchObject({ status: "UNAVAILABLE", apiReachable: false });
    expect(JSON.stringify(result)).not.toContain("private-face-service");
  });

  it("reports intentionally unconfigured Face AI as unknown", async () => {
    vi.stubEnv("AI_SERVICE_URL", "");
    const result = await getSystemDiagnostics();
    expect(result.system.faceAi).toMatchObject({ status: "UNKNOWN", modelReady: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not show an expired session as the current user on an offline machine", async () => {
    db.agentMachine.findMany.mockResolvedValue([{
      ...MACHINE,
      lastSeen: new Date("2029-12-31T23:50:00.000Z"),
      agentSessions: [],
    }]);
    const result = await getSystemDiagnostics();
    expect(result.agents.machines[0]).toMatchObject({
      isOnline: false,
      currentUser: null,
      sessionExpiresAt: null,
      sessionState: "NOT_VISIBLE_OFFLINE",
    });
  });

  it("authorizes Admin and Super Admin while rejecting unauthenticated and student users", async () => {
    auth.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    auth.mockResolvedValueOnce({ user: { role: "STUDENT" } });
    expect((await GET()).status).toBe(403);
    auth.mockResolvedValueOnce({ user: { role: "SUPER_ADMIN" } });
    expect((await GET()).status).toBe(200);
  });
});
