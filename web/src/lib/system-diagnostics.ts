import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAgentOnline } from "@/lib/agent-health";

export type DiagnosticStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";

type HealthCheck = {
  status: DiagnosticStatus;
  latencyMs: number | null;
  detail: string;
  apiReachable?: boolean;
  modelReady?: boolean | null;
};

const FACE_AI_TIMEOUT_MS = 2_000;
const FAILURE_LOG_INTERVAL_MS = 60_000;
const lastFailureLog = new Map<string, number>();

function logFailureOnce(component: string) {
  const now = Date.now();
  const lastLogged = lastFailureLog.get(component) ?? 0;
  if (now - lastLogged < FAILURE_LOG_INTERVAL_MS) return;
  lastFailureLog.set(component, now);
  console.warn(`[diagnostics] ${component} health check unavailable`);
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function checkDatabase(): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return { status: "HEALTHY", latencyMs: elapsedMs(startedAt), detail: "PostgreSQL" };
  } catch {
    logFailureOnce("database");
    return { status: "UNAVAILABLE", latencyMs: elapsedMs(startedAt), detail: "Database query unavailable" };
  }
}

async function checkFaceAi(): Promise<HealthCheck> {
  const serviceUrl = process.env.AI_SERVICE_URL?.trim();
  if (!serviceUrl) {
    return {
      status: "UNKNOWN",
      latencyMs: null,
      detail: "Face AI is not configured in this environment",
      apiReachable: false,
      modelReady: null,
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(FACE_AI_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      logFailureOnce("face-ai");
      return {
        status: "UNAVAILABLE",
        latencyMs: elapsedMs(startedAt),
        detail: "Face AI service returned an unavailable response",
        apiReachable: true,
        modelReady: false,
      };
    }

    const body = (await response.json()) as { status?: string; model_loaded?: boolean };
    const modelReady = body.model_loaded === true;
    return {
      status: modelReady && body.status === "healthy" ? "HEALTHY" : "DEGRADED",
      latencyMs: elapsedMs(startedAt),
      detail: modelReady ? "API reachable · model loaded" : "API reachable · model not ready",
      apiReachable: true,
      modelReady,
    };
  } catch {
    logFailureOnce("face-ai");
    return {
      status: "UNAVAILABLE",
      latencyMs: elapsedMs(startedAt),
      detail: "Cannot reach Face AI service",
      apiReachable: false,
      modelReady: false,
    };
  }
}

function safeEnvironmentName(): string {
  const configured = process.env.APP_ENVIRONMENT?.trim().toLowerCase();
  if (configured && ["development", "pilot", "production", "test"].includes(configured)) {
    return configured[0].toUpperCase() + configured.slice(1);
  }
  if (process.env.NODE_ENV === "production") return "Production";
  if (process.env.NODE_ENV === "test") return "Test";
  return "Development";
}

function compareMachines(
  left: { roomCode: string; machineCode: string },
  right: { roomCode: string; machineCode: string },
): number {
  const roomComparison = left.roomCode.localeCompare(right.roomCode);
  if (roomComparison !== 0) return roomComparison;

  const leftNumber = /-PC(\d+)$/.exec(left.machineCode);
  const rightNumber = /-PC(\d+)$/.exec(right.machineCode);
  if (leftNumber && rightNumber) {
    const numberComparison = Number(leftNumber[1]) - Number(rightNumber[1]);
    if (numberComparison !== 0) return numberComparison;
  }
  return left.machineCode.localeCompare(right.machineCode);
}

async function getAgentFleet(now: Date) {
  try {
    const [machines, pendingActivations] = await Promise.all([
      prisma.agentMachine.findMany({
        include: {
          room: { select: { roomCode: true, name: true } },
          agentSessions: {
            where: { status: "ACTIVE", revokedAt: null, expiresAt: { gt: now } },
            orderBy: { expiresAt: "desc" },
            take: 1,
            include: { user: { select: { name: true } } },
          },
        },
        orderBy: { machineCode: "asc" },
      }),
      prisma.agentActivationCode.findMany({
        where: { consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        include: { room: { select: { roomCode: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const machineViews = machines
      .map((machine) => {
        const online = isAgentOnline(machine, now);
        const activeSession = machine.agentSessions[0] ?? null;
        const currentUser = online && activeSession ? activeSession.user : null;
        const sessionExpiresAt = currentUser ? activeSession?.expiresAt.toISOString() ?? null : null;
        const message = !machine.isActive
          ? "Machine is deactivated"
          : !online
            ? machine.lastSeen
              ? "No heartbeat has been received for 30 seconds"
              : "No heartbeat has been received yet"
            : !currentUser
              ? "Machine is online and waiting for a user to log in"
              : "Machine is online with an active Agent session";

        return {
          id: machine.id,
          machineCode: machine.machineCode,
          hostname: machine.hostname,
          room: machine.room,
          platform: machine.platform,
          agentVersion: machine.agentVersion,
          isActive: machine.isActive,
          isOnline: online,
          status: online ? "HEALTHY" as const : "UNAVAILABLE" as const,
          lastSeen: machine.lastSeen?.toISOString() ?? null,
          currentUser,
          sessionExpiresAt,
          sessionState: currentUser ? "ACTIVE" as const : online ? "WAITING_FOR_LOGIN" as const : "NOT_VISIBLE_OFFLINE" as const,
          diagnosticMessage: message,
        };
      })
      .sort((left, right) => compareMachines(
        { roomCode: left.room?.roomCode ?? "~", machineCode: left.machineCode },
        { roomCode: right.room?.roomCode ?? "~", machineCode: right.machineCode },
      ));

    const pending = pendingActivations
      .map((activation) => ({
        id: activation.id,
        roomCode: activation.room.roomCode,
        roomName: activation.room.name,
        reservedMachineCode: activation.reservedMachineCode,
        expiresAt: activation.expiresAt.toISOString(),
      }))
      .sort((left, right) => compareMachines(
        { roomCode: left.roomCode, machineCode: left.reservedMachineCode },
        { roomCode: right.roomCode, machineCode: right.reservedMachineCode },
      ));

    return {
      status: "HEALTHY" as const,
      registered: machineViews.length,
      online: machineViews.filter((machine) => machine.isOnline).length,
      offline: machineViews.filter((machine) => !machine.isOnline).length,
      activeSessions: machines.filter((machine) => machine.agentSessions.length > 0).length,
      machines: machineViews,
      pendingActivations: pending,
    };
  } catch {
    logFailureOnce("agent-fleet");
    return {
      status: "UNAVAILABLE" as const,
      registered: 0,
      online: 0,
      offline: 0,
      activeSessions: 0,
      machines: [],
      pendingActivations: [],
    };
  }
}

export async function getSystemDiagnostics() {
  const checkedAt = new Date();
  const webStartedAt = performance.now();
  const web: HealthCheck = {
    status: "HEALTHY",
    latencyMs: elapsedMs(webStartedAt),
    detail: "Admin diagnostics API responded",
  };
  const [database, faceAi] = await Promise.all([checkDatabase(), checkFaceAi()]);
  const agents = await getAgentFleet(new Date());

  return {
    checkedAt: checkedAt.toISOString(),
    serverTime: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    environment: safeEnvironmentName(),
    system: {
      web,
      database,
      faceAi,
    },
    environmentChecks: {
      faceAiConfigured: Boolean(process.env.AI_SERVICE_URL?.trim()),
      faceAccessReminder: "Face Gate requires HTTPS or localhost for browser camera access",
    },
    agents,
  };
}
