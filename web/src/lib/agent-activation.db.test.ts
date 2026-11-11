import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateMachine, cancelActivationCode, hashActivationCode, issueActivationCode } from "@/lib/agent-activation";
import { resetAgentRateLimitsForTests } from "@/lib/agent-rate-limit";
import { POST as activateRoute } from "@/app/api/agent/activate/route";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("agent-activation.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZA-${Date.now().toString(36).toUpperCase()}`;
const now = new Date("2030-01-01T00:00:00.000Z");
let userId = "";
let firstRoomId = "";
let secondRoomId = "";

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-auth-secret-for-agent-code-hashing";
  await prisma.agentActivationThrottle.deleteMany({ where: { key: "global" } });
  await prisma.agentActivationThrottle.deleteMany({ where: { key: { in: [
    `ip:${hashActivationCode("ip:127.0.0.1")}`,
    `ip:${hashActivationCode("ip:10.0.0.1")}`,
  ] } } });
  const user = await prisma.user.create({
    data: { email: `${RUN.toLowerCase()}@example.test`, name: RUN, role: "ADMIN", status: "APPROVED" },
  });
  userId = user.id;
  const [firstRoom, secondRoom] = await Promise.all([
    prisma.room.create({ data: { name: `${RUN} First`, roomCode: `${RUN}-A` } }),
    prisma.room.create({ data: { name: `${RUN} Second`, roomCode: `${RUN}-B` } }),
  ]);
  firstRoomId = firstRoom.id;
  secondRoomId = secondRoom.id;
});

beforeEach(() => resetAgentRateLimitsForTests());

afterAll(async () => {
  const activationCodes = await prisma.agentActivationCode.findMany({
    where: { createdById: userId },
    select: { id: true, reservedMachineCode: true },
  });
  const codeIds = activationCodes.map((code) => code.id);
  const machineCodes = activationCodes.map((code) => code.reservedMachineCode);
  const machines = await prisma.agentMachine.findMany({
    where: { machineCode: { in: machineCodes } },
    select: { id: true },
  });
  await prisma.agentAuditEvent.deleteMany({
    where: { OR: [{ activationCodeId: { in: codeIds } }, { userId }] },
  });
  await prisma.agentMachine.deleteMany({ where: { id: { in: machines.map((machine) => machine.id) } } });
  await prisma.agentActivationCode.deleteMany({ where: { id: { in: codeIds } } });
  await prisma.agentMachineSequence.deleteMany({ where: { roomId: { in: [firstRoomId, secondRoomId] } } });
  await prisma.agentActivationThrottle.deleteMany({ where: { key: "global" } });
  await prisma.agentActivationThrottle.deleteMany({ where: { key: { in: [
    `ip:${hashActivationCode("ip:127.0.0.1")}`,
    `ip:${hashActivationCode("ip:10.0.0.1")}`,
  ] } } });
  await prisma.room.deleteMany({ where: { id: { in: [firstRoomId, secondRoomId] } } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("Agent activation lifecycle", () => {
  it("reserves sequential room-local machine codes and never reuses a cancelled reservation", async () => {
    const first = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now });
    const otherRoom = await issueActivationCode({ roomId: secondRoomId, createdById: userId, now });
    expect(first.machineCode).toBe(`${RUN}-A-PC01`);
    expect(otherRoom.machineCode).toBe(`${RUN}-B-PC01`);

    expect(await cancelActivationCode({ id: first.id, cancelledById: userId, now })).toBe(true);
    const replacement = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now });
    expect(replacement.machineCode).toBe(`${RUN}-A-PC02`);
  });

  it("allocates distinct codes under concurrent administrator requests", async () => {
    const issued = await Promise.all(
      Array.from({ length: 4 }, () => issueActivationCode({ roomId: secondRoomId, createdById: userId, now })),
    );
    const codes = issued.map((code) => code.machineCode);
    expect(new Set(codes).size).toBe(4);
    expect(codes.every((code) => new RegExp(`^${RUN}-B-PC\\d+$`).test(code))).toBe(true);
  });

  it("hashes codes, binds activation to the reserved room, and consumes it once", async () => {
    const issued = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now });
    const stored = await prisma.agentActivationCode.findUnique({ where: { id: issued.id } });
    expect(stored?.codeHash).toBe(hashActivationCode(issued.code));
    expect(stored?.codeHash).not.toBe(issued.code);

    const activated = await activateMachine({ code: issued.code, hostname: "pilot-host", platform: "Linux", now });
    expect(activated).toMatchObject({ ok: true, machineCode: issued.machineCode, roomCode: `${RUN}-A` });
    if (!activated.ok) throw new Error("activation unexpectedly failed");
    expect(activated.apiKey).toBeTruthy();

    const replay = await activateMachine({ code: issued.code, hostname: "pilot-host", now });
    expect(replay).toEqual({ ok: false, reason: "CONSUMED" });
    const machine = await prisma.agentMachine.findUnique({ where: { machineCode: issued.machineCode } });
    expect(machine).toMatchObject({ roomId: firstRoomId, hostname: "pilot-host", platform: "Linux" });
  });

  it("rejects expired and cancelled codes while recording failure without plaintext", async () => {
    const expired = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now, ttlMs: 1 });
    expect(await activateMachine({ code: expired.code, hostname: "expired", now: new Date(now.getTime() + 2) })).toEqual({ ok: false, reason: "EXPIRED" });

    const cancelled = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now });
    await cancelActivationCode({ id: cancelled.id, cancelledById: userId, now });
    expect(await activateMachine({ code: cancelled.code, hostname: "cancelled", now })).toEqual({ ok: false, reason: "CANCELLED" });
    const audit = await prisma.agentAuditEvent.findMany({
      where: { event: "ACTIVATION_ATTEMPT_REJECTED" },
      select: { details: true },
    });
    expect(audit.map((event) => event.details).join(" ")).not.toContain(expired.code);
    expect(audit.map((event) => event.details).join(" ")).not.toContain(cancelled.code);
  });

  it("exposes only runtime activation fields and rate-limits repeated invalid requests", async () => {
    const issued = await issueActivationCode({ roomId: firstRoomId, createdById: userId, now: new Date() });
    const success = await activateRoute(new NextRequest("http://localhost/api/agent/activate", {
      method: "POST",
      headers: { "x-real-ip": "127.0.0.1", "x-forwarded-for": "spoofed-address" },
      body: JSON.stringify({ activationCode: issued.code, hostname: "route-host", platform: "Windows" }),
    }));
    expect(success.status).toBe(200);
    const payload = await success.json();
    expect(payload).toMatchObject({ machineCode: issued.machineCode, roomCode: `${RUN}-A`, roomName: `${RUN} First` });
    expect(payload.apiKey).toBeTruthy();
    expect(payload).not.toHaveProperty("registerSecret");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await activateRoute(new NextRequest("http://localhost/api/agent/activate", {
        method: "POST",
        headers: { "x-real-ip": "10.0.0.1", "x-forwarded-for": "spoofed-address" },
        body: JSON.stringify({ activationCode: issued.code, hostname: "rate-host" }),
      }));
      expect(response.status).toBe(403);
    }
    const limited = await activateRoute(new NextRequest("http://localhost/api/agent/activate", {
      method: "POST",
      headers: { "x-real-ip": "10.0.0.1", "x-forwarded-for": "another-spoof" },
      body: JSON.stringify({ activationCode: issued.code, hostname: "rate-host" }),
    }));
    expect(limited.status).toBe(429);
  });
});
