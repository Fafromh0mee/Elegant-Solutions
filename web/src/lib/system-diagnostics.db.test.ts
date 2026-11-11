import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { issueActivationCode } from "@/lib/agent-activation";
import { getSystemDiagnostics } from "@/lib/system-diagnostics";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("system-diagnostics.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZD-${Date.now().toString(36).toUpperCase()}`;
let userId = "";
let roomId = "";
let machineId = "";
let pendingActivationId = "";
let consumedActivationId = "";
let previousAiUrl: string | undefined;
let baselineAgents: Awaited<ReturnType<typeof getSystemDiagnostics>>["agents"];

beforeAll(async () => {
  previousAiUrl = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = "";
  baselineAgents = (await getSystemDiagnostics()).agents;
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: `${RUN} User`, role: "ADMIN", status: "APPROVED" },
  });
  userId = user.id;
  const room = await prisma.room.create({ data: { roomCode: `${RUN}-ROOM`, name: `${RUN} Room` } });
  roomId = room.id;
  const machine = await prisma.agentMachine.create({
    data: { machineCode: `${RUN}-PC01`, hostname: `${RUN}-host`, roomId, platform: "Linux", agentVersion: "0.4.0", lastSeen: new Date() },
  });
  machineId = machine.id;
  await prisma.agentSession.create({
    data: {
      tokenHash: `${RUN}-session-hash`,
      userId,
      machineId,
      roomId,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const pending = await issueActivationCode({ roomId, createdById: userId });
  pendingActivationId = pending.id;
  const consumed = await issueActivationCode({ roomId, createdById: userId });
  consumedActivationId = consumed.id;
  await prisma.agentActivationCode.update({ where: { id: consumed.id }, data: { consumedAt: new Date() } });
});

afterAll(async () => {
  await prisma.agentAuditEvent.deleteMany({ where: { OR: [{ userId }, { machineId }, { activationCodeId: { in: [pendingActivationId, consumedActivationId] } }] } });
  await prisma.agentSession.deleteMany({ where: { machineId } });
  await prisma.agentActivationCode.deleteMany({ where: { id: { in: [pendingActivationId, consumedActivationId] } } });
  await prisma.agentMachine.delete({ where: { id: machineId } });
  await prisma.agentMachineSequence.delete({ where: { roomId } });
  await prisma.room.delete({ where: { id: roomId } });
  await prisma.user.delete({ where: { id: userId } });
  if (previousAiUrl === undefined) delete process.env.AI_SERVICE_URL;
  else process.env.AI_SERVICE_URL = previousAiUrl;
  await prisma.$disconnect();
});

describe("database-backed system diagnostics", () => {
  it("returns real machine/session data and only unconsumed activation reservations", async () => {
    const result = await getSystemDiagnostics();
    expect(result.system.database.status).toBe("HEALTHY");
    expect(result.system.faceAi.status).toBe("UNKNOWN");
    expect(result.agents).toMatchObject({
      registered: baselineAgents.registered + 1,
      online: baselineAgents.online + 1,
      activeSessions: baselineAgents.activeSessions + 1,
    });
    expect(result.agents.machines).toEqual(expect.arrayContaining([expect.objectContaining({
      machineCode: `${RUN}-PC01`,
      hostname: `${RUN}-host`,
      platform: "Linux",
      agentVersion: "0.4.0",
      currentUser: { name: `${RUN} User` },
    })]));
    expect(result.agents.pendingActivations).toHaveLength(baselineAgents.pendingActivations.length + 1);
    expect(result.agents.pendingActivations.map((activation) => activation.id)).toContain(pendingActivationId);
    expect(JSON.stringify(result)).not.toContain("codeHash");
  });
});
