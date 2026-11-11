import { prisma } from "@/lib/prisma";
import { hashActivationCode } from "@/lib/agent-activation";

type ThrottleResult = { allowed: boolean; retryAfterSeconds: number; newlyBlocked: boolean };

async function consumeBucket(key: string, limit: number, windowMs: number, now: Date): Promise<ThrottleResult> {
  return prisma.$transaction(async (tx) => {
    // Serialize attempts for this bucket across all Web processes and containers.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(18767, hashtext(${key}))) AS lock`;
    const current = await tx.agentActivationThrottle.findUnique({ where: { key } });
    if (current?.blockedUntil && current.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1000), newlyBlocked: false };
    }
    const fresh = !current || current.windowStartedAt.getTime() + windowMs <= now.getTime();
    const attempts = fresh ? 1 : current.attempts + 1;
    const blockedUntil = attempts > limit ? new Date(now.getTime() + windowMs) : null;
    await tx.agentActivationThrottle.upsert({
      where: { key },
      create: { key, windowStartedAt: now, attempts, blockedUntil },
      update: { windowStartedAt: fresh ? now : current!.windowStartedAt, attempts, blockedUntil },
    });
    return {
      allowed: !blockedUntil,
      retryAfterSeconds: blockedUntil ? Math.ceil(windowMs / 1000) : 0,
      newlyBlocked: Boolean(blockedUntil && attempts === limit + 1),
    };
  });
}

export async function checkDurableActivationThrottle(address: string, now = new Date()) {
  const ipKey = hashActivationCode(`ip:${address}`);
  const perIp = await consumeBucket(`ip:${ipKey}`, 12, 60_000, now);
  if (!perIp.allowed) return { ...perIp, reason: "IP_LIMIT" };
  const global = await consumeBucket("global", 100, 24 * 60 * 60_000, now);
  return { ...global, reason: global.allowed ? null : "GLOBAL_LIMIT" };
}
