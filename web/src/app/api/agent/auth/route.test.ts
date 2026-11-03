import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const machineFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const auditCreate = vi.hoisted(() => vi.fn());
const sessionUpdateMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const resolveRoomEntitlement = vi.hoisted(() => vi.fn());
const issueAgentSession = vi.hoisted(() => vi.fn());
const compare = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMachine: { findUnique: machineFindUnique },
    user: { findUnique: userFindUnique },
    agentAuditEvent: { create: auditCreate },
    agentSession: { updateMany: sessionUpdateMany },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/room-entitlement", () => ({ resolveRoomEntitlement }));
vi.mock("@/lib/agent-session", () => ({ issueAgentSession }));
vi.mock("bcryptjs", () => ({ compare }));

import { POST } from "@/app/api/agent/auth/route";

describe("Agent login authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineFindUnique.mockResolvedValue({
      id: "machine-1",
      isActive: true,
      room: { id: "room-1", roomCode: "LAB-401", name: "Lab 401", isActive: true },
    });
    userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Pilot User",
      email: "pilot@example.test",
      hashedPassword: "hash",
      status: "APPROVED",
      role: "STUDENT",
    });
    compare.mockResolvedValue(true);
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    auditCreate.mockResolvedValue({});
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ agentSession: { updateMany: sessionUpdateMany }, agentAuditEvent: { create: auditCreate } }),
    );
    issueAgentSession.mockResolvedValue({
      token: "opaque-token",
      session: {
        expiresAt: new Date("2030-01-01T04:20:00.000Z"),
        user: { id: "user-1", name: "Pilot User", email: "pilot@example.test", role: "STUDENT" },
        room: { id: "room-1", roomCode: "LAB-401", name: "Lab 401" },
        machine: { id: "machine-1", machineCode: "LAB401-PC03", hostname: "pc03", platform: "Linux" },
      },
    });
  });

  it("denies login without a current room entitlement", async () => {
    resolveRoomEntitlement.mockResolvedValue({ allowed: false });
    const response = await POST(new NextRequest("http://localhost/api/agent/auth", {
      method: "POST",
      headers: { "x-agent-key": "machine-key" },
      body: JSON.stringify({ email: "pilot@example.test", password: "correct" }),
    }));

    expect(response.status).toBe(403);
    expect(issueAgentSession).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: "AGENT_LOGIN_DENIED_NO_ENTITLEMENT" }),
    });
  });

  it.each(["BOOKING", "CLASS"] as const)("issues a session for a valid %s entitlement with the resolver expiry", async (source) => {
    const expiresAt = new Date("2030-01-01T04:20:00.000Z");
    resolveRoomEntitlement.mockResolvedValue({
      allowed: true,
      grants: [{ source, id: `${source.toLowerCase()}-1`, validUntil: expiresAt }],
      validUntil: expiresAt,
    });

    const response = await POST(new NextRequest("http://localhost/api/agent/auth", {
      method: "POST",
      headers: { "x-agent-key": "machine-key" },
      body: JSON.stringify({ email: `pilot-${source}@example.test`, password: "correct" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessionToken).toBe("opaque-token");
    expect(body.expiresAt).toBe(expiresAt.toISOString());
    expect(issueAgentSession).toHaveBeenCalledWith(expect.objectContaining({ roomId: "room-1", entitlement: expect.objectContaining({ validUntil: expiresAt }) }));
  });
});
