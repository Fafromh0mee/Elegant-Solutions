import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeMaintenanceCode, issueMaintenanceCode } from "@/lib/agent-maintenance";
import { resetAgentRateLimitsForTests } from "@/lib/agent-rate-limit";
import { POST as authorizeMaintenance } from "@/app/api/agent/maintenance/authorize/route";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("agent-maintenance.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZM-${Date.now().toString(36).toUpperCase()}`;
let userId = "";
let machineId = "";
let otherMachineId = "";
let machineApiKey = "";
let otherMachineApiKey = "";

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-auth-secret-for-agent-code-hashing";
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: RUN, role: "ADMIN", status: "APPROVED" },
  });
  userId = user.id;
  const machine = await prisma.agentMachine.create({ data: { machineCode: `${RUN}-A`, hostname: "test-a" } });
  const other = await prisma.agentMachine.create({ data: { machineCode: `${RUN}-B`, hostname: "test-b" } });
  machineId = machine.id;
  machineApiKey = machine.apiKey;
  otherMachineId = other.id;
  otherMachineApiKey = other.apiKey;
});

beforeEach(() => {
  resetAgentRateLimitsForTests();
});

afterAll(async () => {
  await prisma.agentAuditEvent.deleteMany({ where: { machineId: { in: [machineId, otherMachineId] } } });
  await prisma.agentMaintenanceCode.deleteMany({ where: { machineId: { in: [machineId, otherMachineId] } } });
  await prisma.agentMachine.deleteMany({ where: { id: { in: [machineId, otherMachineId] } } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("Maintenance Code lifecycle", () => {
  it("is single-use and cannot cross machines or actions", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const issued = await issueMaintenanceCode({ machineId, createdById: userId, action: "ENTER_MAINTENANCE", now });
    expect(await consumeMaintenanceCode({ machineId: otherMachineId, code: issued.code, action: "ENTER_MAINTENANCE", now })).toBeNull();
    expect(await consumeMaintenanceCode({ machineId, code: issued.code, action: "UNINSTALL_AGENT", now })).toBeNull();
    expect(await consumeMaintenanceCode({ machineId, code: issued.code, action: "ENTER_MAINTENANCE", now })).not.toBeNull();
    expect(await consumeMaintenanceCode({ machineId, code: issued.code, action: "ENTER_MAINTENANCE", now })).toBeNull();
  });

  it("expires after its short lifetime", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const issued = await issueMaintenanceCode({ machineId, createdById: userId, action: "RESTART_AGENT", now, ttlMs: 60_000 });
    expect(await consumeMaintenanceCode({ machineId, code: issued.code, action: "RESTART_AGENT", now: new Date(now.getTime() + 60_001) })).toBeNull();
  });

  it("authorizes only the bound machine/action, consumes the code, and audits no plaintext", async () => {
    const issued = await issueMaintenanceCode({ machineId, createdById: userId, action: "ENTER_MAINTENANCE" });
    const request = new NextRequest("http://localhost/api/agent/maintenance/authorize", {
      method: "POST",
      headers: { "x-agent-key": machineApiKey },
      body: JSON.stringify({ code: issued.code, action: "ENTER_MAINTENANCE" }),
    });
    expect((await authorizeMaintenance(request)).status).toBe(200);

    const code = await prisma.agentMaintenanceCode.findFirst({ where: { machineId, action: "ENTER_MAINTENANCE" }, orderBy: { createdAt: "desc" } });
    expect(code?.usedAt).not.toBeNull();
    expect(code?.codeHash).not.toBe(issued.code);
    const audit = await prisma.agentAuditEvent.findMany({ where: { maintenanceCodeId: code?.id } });
    expect(audit.map((event) => event.event).sort()).toEqual(["MAINTENANCE_AUTHORIZED", "MAINTENANCE_CODE_GENERATED"]);
    expect(audit.map((event) => `${event.details ?? ""}`).join(" ")).not.toContain(issued.code);

    const replay = new NextRequest("http://localhost/api/agent/maintenance/authorize", {
      method: "POST",
      headers: { "x-agent-key": machineApiKey },
      body: JSON.stringify({ code: issued.code, action: "ENTER_MAINTENANCE" }),
    });
    expect((await authorizeMaintenance(replay)).status).toBe(403);
  });

  it("rate limits repeated invalid maintenance attempts", async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await authorizeMaintenance(new NextRequest("http://localhost/api/agent/maintenance/authorize", {
        method: "POST",
        headers: { "x-agent-key": machineApiKey },
        body: JSON.stringify({ code: "999999", action: "RESTART_AGENT" }),
      }));
      expect(response.status).toBe(403);
    }
    const limited = await authorizeMaintenance(new NextRequest("http://localhost/api/agent/maintenance/authorize", {
      method: "POST",
      headers: { "x-agent-key": machineApiKey },
      body: JSON.stringify({ code: "999999", action: "RESTART_AGENT" }),
    }));
    expect(limited.status).toBe(429);
  });

  it("records uninstall authorization and deactivates the authorized machine", async () => {
    const issued = await issueMaintenanceCode({ machineId: otherMachineId, createdById: userId, action: "UNINSTALL_AGENT" });
    const response = await authorizeMaintenance(new NextRequest("http://localhost/api/agent/maintenance/authorize", {
      method: "POST",
      headers: { "x-agent-key": otherMachineApiKey },
      body: JSON.stringify({ code: issued.code, action: "UNINSTALL_AGENT" }),
    }));
    expect(response.status).toBe(200);
    expect((await prisma.agentMachine.findUnique({ where: { id: otherMachineId } }))?.isActive).toBe(false);
    expect(await prisma.agentAuditEvent.findFirst({
      where: { machineId: otherMachineId, event: "AGENT_MACHINE_DEACTIVATED" },
    })).not.toBeNull();
  });
});
