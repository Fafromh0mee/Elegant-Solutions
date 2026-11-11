import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSlotRange } from "@/lib/academic-slots";
import { resolveRoomEntitlement } from "@/lib/room-entitlement";
import { hashAgentSessionToken, issueAgentSession } from "@/lib/agent-session";
import { POST as authenticate } from "@/app/api/agent/auth/route";
import { POST as heartbeat } from "@/app/api/agent/heartbeat/route";
import { POST as refresh } from "@/app/api/agent/session/refresh/route";
import { POST as logout } from "@/app/api/agent/session/logout/route";
import type { AcademicSlot } from "@/lib/types";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  throw new Error("agent-lifecycle.db.test.ts refuses to run against a non-local database");
}

const RUN = `ZZAS-${Date.now().toString(36).toUpperCase()}`;
const MONDAY = "2030-01-07";
const NOW = new Date("2030-01-07T05:30:00.000Z"); // 12:30 Bangkok
const bkk = (time: string) => new Date(`${MONDAY}T${time}:00+07:00`);
const ACTIVE_SEMESTER_KEY = "ACTIVE_SEMESTER";
const SEMESTER = `${RUN}-S1`;
const PASSWORD = "correct-horse-battery-staple";

let savedSemester: string | null = null;
let roomId = "";
let machineId = "";
let apiKey = "";
let bookingUserId = "";
let classUserId = "";
let deniedUserId = "";
let continuousUserId = "";
let gapUserId = "";

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${RUN.toLowerCase()}-${label}@example.test`,
      name: `${RUN}-${label}`,
      role: "STUDENT",
      status: "APPROVED",
      hashedPassword: await hash(PASSWORD, 4),
    },
  });
  return user.id;
}

async function createBooking(params: {
  userId: string;
  slot: AcademicSlot;
  startAt: Date;
  endAt: Date;
}) {
  return prisma.roomBooking.create({
    data: {
      roomId,
      userId: params.userId,
      date: new Date(`${MONDAY}T00:00:00.000Z`),
      partySize: 1,
      status: "APPROVED",
      slots: { create: { slot: params.slot, startAt: params.startAt, endAt: params.endAt } },
      participants: { create: { userId: params.userId, source: "SELF" } },
    },
  });
}

function agentRequest(path: string, body: unknown, sessionToken?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "x-agent-key": apiKey,
      ...(sessionToken ? { "x-agent-session": sessionToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const existingSetting = await prisma.systemSetting.findUnique({ where: { key: ACTIVE_SEMESTER_KEY } });
  savedSemester = existingSetting?.value ?? null;
  await prisma.systemSetting.upsert({
    where: { key: ACTIVE_SEMESTER_KEY },
    update: { value: SEMESTER },
    create: { key: ACTIVE_SEMESTER_KEY, value: SEMESTER },
  });
  const room = await prisma.room.create({
    data: { roomCode: `${RUN}-ROOM`, name: RUN, building: RUN, capacity: 10, capabilities: ["WORKSHOP"] },
  });
  roomId = room.id;
  const machine = await prisma.agentMachine.create({
    data: { machineCode: `${RUN}-PC01`, hostname: `${RUN}-host`, roomId, platform: "Linux" },
  });
  machineId = machine.id;
  apiKey = machine.apiKey;
  [bookingUserId, classUserId, deniedUserId, continuousUserId, gapUserId] = await Promise.all([
    makeUser("booking"),
    makeUser("class"),
    makeUser("denied"),
    makeUser("continuous"),
    makeUser("gap"),
  ]);

  const slot2 = resolveSlotRange(MONDAY, "SLOT_2");
  await createBooking({ userId: bookingUserId, slot: "SLOT_2", ...slot2 });
  await prisma.classSchedule.create({
    data: {
      userId: classUserId,
      roomId,
      dayOfWeek: 1,
      slot: "SLOT_2",
      startTime: "12:00",
      endTime: "14:20",
      semester: SEMESTER,
    },
  });

  await createBooking({ userId: continuousUserId, slot: "SLOT_1", startAt: bkk("08:40"), endAt: bkk("11:00") });
  await createBooking({ userId: continuousUserId, slot: "SLOT_2", startAt: bkk("11:00"), endAt: bkk("14:20") });
  await createBooking({ userId: gapUserId, slot: "SLOT_1", startAt: bkk("08:40"), endAt: bkk("10:00") });
  await createBooking({ userId: gapUserId, slot: "SLOT_2", startAt: bkk("10:30"), endAt: bkk("14:20") });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.agentAuditEvent.deleteMany({ where: { machineId } });
  await prisma.agentLog.deleteMany({ where: { machineId } });
  await prisma.agentSession.deleteMany({ where: { machineId } });
  await prisma.roomBooking.deleteMany({ where: { roomId } });
  await prisma.classSchedule.deleteMany({ where: { roomId } });
  await prisma.agentMachine.delete({ where: { id: machineId } });
  await prisma.room.delete({ where: { id: roomId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: RUN.toLowerCase() } } });
  if (savedSemester === null) await prisma.systemSetting.deleteMany({ where: { key: ACTIVE_SEMESTER_KEY } });
  else await prisma.systemSetting.update({ where: { key: ACTIVE_SEMESTER_KEY }, data: { value: savedSemester } });
  await prisma.$disconnect();
});

describe("persisted Agent lifecycle", () => {
  it("authenticates a booking-entitled user, stores only the token hash, and derives heartbeat identity", async () => {
    vi.setSystemTime(NOW);
    const response = await authenticate(agentRequest("/api/agent/auth", {
      email: `${RUN.toLowerCase()}-booking@example.test`, password: PASSWORD,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expiresAt).toBe(bkk("14:20").toISOString());
    const session = await prisma.agentSession.findUnique({ where: { tokenHash: hashAgentSessionToken(body.sessionToken) } });
    expect(session).toMatchObject({ userId: bookingUserId, machineId, roomId, expiresAt: bkk("14:20") });
    expect(session?.tokenHash).not.toBe(body.sessionToken);
    expect(await prisma.agentAuditEvent.findFirst({ where: { machineId, userId: bookingUserId, event: "AGENT_LOGIN" } })).not.toBeNull();

    const heartbeatResponse = await heartbeat(agentRequest("/api/agent/heartbeat", {
      userEmail: "forged@example.test", activeApp: "Editor", activeTitle: "Work", riskLevel: "NORMAL",
    }, body.sessionToken));
    expect(heartbeatResponse.status).toBe(200);
    const log = await prisma.agentLog.findFirst({ where: { machineId, activeApp: "Editor" }, orderBy: { createdAt: "desc" } });
    expect(log?.userId).toBe(bookingUserId);

    expect((await logout(agentRequest("/api/agent/session/logout", {}, body.sessionToken))).status).toBe(200);
    expect(await prisma.agentAuditEvent.findFirst({ where: { machineId, userId: bookingUserId, event: "AGENT_MANUAL_LOGOUT" } })).not.toBeNull();
  });

  it("authenticates a class-entitled user and rejects a user without room entitlement", async () => {
    vi.setSystemTime(NOW);
    const classResponse = await authenticate(agentRequest("/api/agent/auth", {
      email: `${RUN.toLowerCase()}-class@example.test`, password: PASSWORD,
    }));
    const classBody = await classResponse.json();
    expect(classResponse.status).toBe(200);
    expect(classBody.expiresAt).toBe(bkk("14:20").toISOString());

    const deniedResponse = await authenticate(agentRequest("/api/agent/auth", {
      email: `${RUN.toLowerCase()}-denied@example.test`, password: PASSWORD,
    }));
    expect(deniedResponse.status).toBe(403);
    expect(await prisma.agentAuditEvent.findFirst({
      where: { machineId, userId: deniedUserId, event: "AGENT_LOGIN_DENIED_NO_ENTITLEMENT" },
    })).not.toBeNull();
  });

  it("revokes at entitlement expiry, rejects the old session, and allows machine-only heartbeat", async () => {
    vi.setSystemTime(NOW);
    const loginResponse = await authenticate(agentRequest("/api/agent/auth", {
      email: `${RUN.toLowerCase()}-class@example.test`, password: PASSWORD,
    }));
    const loginBody = await loginResponse.json();
    vi.setSystemTime(bkk("14:20"));

    const refreshResponse = await refresh(agentRequest("/api/agent/session/refresh", {}, loginBody.sessionToken));
    expect(refreshResponse.status).toBe(401);
    const session = await prisma.agentSession.findUnique({ where: { tokenHash: hashAgentSessionToken(loginBody.sessionToken) } });
    expect(session).toMatchObject({ status: "REVOKED", revokedAt: bkk("14:20") });
    expect(await prisma.agentAuditEvent.findFirst({ where: { machineId, userId: classUserId, event: "AGENT_AUTO_LOGOUT" } })).not.toBeNull();

    expect((await heartbeat(agentRequest("/api/agent/heartbeat", {}, loginBody.sessionToken))).status).toBe(401);
    expect((await heartbeat(agentRequest("/api/agent/heartbeat", { activeApp: "Desktop" }))).status).toBe(200);
    const log = await prisma.agentLog.findFirst({ where: { machineId, activeApp: "Desktop" }, orderBy: { createdAt: "desc" } });
    expect(log).toBeNull();
    expect((await prisma.agentMachine.findUnique({ where: { id: machineId } }))?.lastSeen).toEqual(bkk("14:20"));
  });

  it("extends exactly at a continuous booking boundary and revokes when a gap has no entitlement", async () => {
    vi.setSystemTime(bkk("09:00"));
    const initial = await resolveRoomEntitlement({ userId: continuousUserId, roomId, now: bkk("09:00") });
    expect(initial).toMatchObject({ allowed: true, validUntil: bkk("11:00") });
    if (!initial.allowed) throw new Error("continuous test fixture has no initial entitlement");
    const continuous = await issueAgentSession({ userId: continuousUserId, machineId, roomId, entitlement: initial, now: bkk("09:00") });
    vi.setSystemTime(bkk("11:00"));
    const extendedResponse = await refresh(agentRequest("/api/agent/session/refresh", {}, continuous.token));
    const extended = await extendedResponse.json();
    expect(extendedResponse.status).toBe(200);
    expect(extended.expiresAt).toBe(bkk("14:20").toISOString());
    expect(await prisma.agentAuditEvent.findFirst({ where: { machineId, userId: continuousUserId, event: "AGENT_SESSION_EXTENDED" } })).not.toBeNull();

    vi.setSystemTime(bkk("09:00"));
    const gapInitial = await resolveRoomEntitlement({ userId: gapUserId, roomId, now: bkk("09:00") });
    if (!gapInitial.allowed) throw new Error("gap test fixture has no initial entitlement");
    const gap = await issueAgentSession({ userId: gapUserId, machineId, roomId, entitlement: gapInitial, now: bkk("09:00") });
    vi.setSystemTime(bkk("10:00"));
    expect((await refresh(agentRequest("/api/agent/session/refresh", {}, gap.token))).status).toBe(401);
    expect(await prisma.agentAuditEvent.findFirst({ where: { machineId, userId: gapUserId, event: "AGENT_AUTO_LOGOUT" } })).not.toBeNull();
  });
});
