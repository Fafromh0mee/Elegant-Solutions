import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const machineFindUnique = vi.hoisted(() => vi.fn());
const machineUpdate = vi.hoisted(() => vi.fn());
const logCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const findAgentSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMachine: { findUnique: machineFindUnique, update: machineUpdate },
    agentLog: { create: logCreate },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/agent-session", () => ({ findAgentSession }));

import { POST } from "@/app/api/agent/heartbeat/route";

describe("Agent heartbeat identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineFindUnique.mockResolvedValue({ id: "machine-1", isActive: true });
    machineUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});
    transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
    findAgentSession.mockResolvedValue({ userId: "user-from-session", expiresAt: new Date("2030-01-01T01:00:00Z") });
  });

  it("derives the log user from the Agent session, ignoring client email", async () => {
    const request = new NextRequest("http://localhost/api/agent/heartbeat", {
      method: "POST",
      headers: { "x-agent-key": "machine-key", "x-agent-session": "opaque-session" },
      body: JSON.stringify({ userEmail: "attacker@example.test", activeApp: "Editor" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(findAgentSession).toHaveBeenCalledWith({ token: "opaque-session", machineId: "machine-1" });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ machineId: "machine-1", userId: "user-from-session" }),
    });
  });

  it("stores a reported Agent version without requiring it for older Agents", async () => {
    const request = new NextRequest("http://localhost/api/agent/heartbeat", {
      method: "POST",
      headers: { "x-agent-key": "machine-key" },
      body: JSON.stringify({ agentVersion: "0.4.0" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(machineUpdate).toHaveBeenCalledWith({
      where: { id: "machine-1" },
      data: { lastSeen: expect.any(Date), agentVersion: "0.4.0" },
    });
  });

  it("rejects an expired or revoked session while preserving machine last-seen", async () => {
    findAgentSession.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/agent/heartbeat", {
      method: "POST",
      headers: { "x-agent-key": "machine-key", "x-agent-session": "expired-session" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(machineUpdate).toHaveBeenCalledWith({ where: { id: "machine-1" }, data: { lastSeen: expect.any(Date) } });
    expect(logCreate).not.toHaveBeenCalled();
  });
});
