import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { activateMachine, hashActivationCode } from "@/lib/agent-activation";
import { checkDurableActivationThrottle } from "@/lib/agent-activation-throttle";
import { createDeploymentBatch, listDeploymentBatches, revokeDeploymentBatch } from "@/lib/agent-deployment-batches";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("agent-deployment-batches.db.test.ts requires an isolated local database");
}

const label = `ZB-${Date.now().toString(36).toUpperCase()}`;
const now = new Date("2030-01-01T00:00:00.000Z");
let userId = "";
let roomId = "";

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-auth-secret-for-agent-code-hashing";
  await prisma.agentActivationThrottle.deleteMany({ where: { key: "global" } });
  const user = await prisma.user.create({ data: { email: `${label.toLowerCase()}@example.test`, name: label, role: "ADMIN", status: "APPROVED" } });
  userId = user.id;
  const room = await prisma.room.create({ data: { name: label, roomCode: label } });
  roomId = room.id;
});

afterAll(async () => {
  const codes = await prisma.agentActivationCode.findMany({ where: { roomId }, select: { id: true, reservedMachineCode: true } });
  const codeIds = codes.map((code) => code.id);
  await prisma.agentAuditEvent.deleteMany({ where: { OR: [{ activationCodeId: { in: codeIds } }, { userId }] } });
  await prisma.agentMachine.deleteMany({ where: { machineCode: { in: codes.map((code) => code.reservedMachineCode) } } });
  await prisma.agentActivationCode.deleteMany({ where: { id: { in: codeIds } } });
  await prisma.agentDeploymentBatch.deleteMany({ where: { roomId } });
  await prisma.agentMachineSequence.deleteMany({ where: { roomId } });
  await prisma.agentActivationThrottle.deleteMany({ where: { key: `ip:${hashActivationCode(`ip:test-${label}`)}` } });
  await prisma.agentActivationThrottle.deleteMany({ where: { key: "global" } });
  await prisma.room.delete({ where: { id: roomId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("deployment batches", () => {
  it("creates unique one-time codes for 30 computers, stores only hashes, and expires after seven days", async () => {
    const batch = await createDeploymentBatch({ roomId, count: 30, createdById: userId, now });
    expect(batch.codes).toHaveLength(30);
    expect(new Set(batch.codes.map((code) => code.code)).size).toBe(30);
    expect(new Set(batch.codes.map((code) => code.machineCode)).size).toBe(30);
    expect(batch.expiresAt).toBe(new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString());
    const stored = await prisma.agentActivationCode.findMany({ where: { batchId: batch.batchId } });
    expect(stored).toHaveLength(30);
    expect(stored[0].codeHash).toBe(hashActivationCode(batch.codes.find((code) => code.machineCode === stored[0].reservedMachineCode)!.code));
    expect(stored.every((code) => !batch.codes.some((item) => item.code === code.codeHash))).toBe(true);
    const expired = await activateMachine({ code: batch.codes[0].code, hostname: "expired-host", now: new Date(now.getTime() + 7 * 24 * 60 * 60_000) });
    expect(expired).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("consumes a code once, shows machine platform, and revokes only pending codes", async () => {
    const batch = await createDeploymentBatch({ roomId, count: 2, createdById: userId, now });
    const activation = await activateMachine({ code: batch.codes[0].code, hostname: "lab-pc", platform: "Linux", now });
    expect(activation).toMatchObject({ ok: true, machineCode: batch.codes[0].machineCode });
    expect(await activateMachine({ code: batch.codes[0].code, hostname: "replay", now })).toEqual({ ok: false, reason: "CONSUMED" });
    const overview = await listDeploymentBatches(now);
    const row = overview.find((item) => item.id === batch.batchId)!;
    expect(row.codes.map((item) => item.status)).toEqual(["ACTIVATED", "PENDING"]);
    expect(row.codes[0].machine).toMatchObject({ hostname: "lab-pc", platform: "Linux" });
    expect(await revokeDeploymentBatch({ id: batch.batchId, revokedById: userId, now })).toBe(true);
    expect(await activateMachine({ code: batch.codes[1].code, hostname: "revoked", now })).toEqual({ ok: false, reason: "CANCELLED" });
    const after = (await listDeploymentBatches(now)).find((item) => item.id === batch.batchId)!;
    expect(after.codes.map((item) => item.status)).toEqual(["ACTIVATED", "REVOKED"]);
  });

  it("persists per-address attempt limits across calls", async () => {
    const address = `test-${label}`;
    const throttleNow = new Date();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await checkDurableActivationThrottle(address, throttleNow)).allowed).toBe(true);
    }
    const blocked = await checkDurableActivationThrottle(address, throttleNow);
    expect(blocked).toMatchObject({ allowed: false, reason: "IP_LIMIT", newlyBlocked: true });
    expect((await checkDurableActivationThrottle(address, new Date(throttleNow.getTime() + 61_000))).allowed).toBe(true);
  });

  it("allows only one concurrent activation for a code", async () => {
    const batch = await createDeploymentBatch({ roomId, count: 1, createdById: userId, now });
    const outcomes = await Promise.all([
      activateMachine({ code: batch.codes[0].code, hostname: "first", now }),
      activateMachine({ code: batch.codes[0].code, hostname: "second", now }),
    ]);
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
    expect(outcomes.filter((result) => !result.ok)).toHaveLength(1);
    expect(await prisma.agentMachine.count({ where: { machineCode: batch.codes[0].machineCode } })).toBe(1);
  });
});
