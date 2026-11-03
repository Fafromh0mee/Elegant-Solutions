type Bucket = { startedAt: number; count: number };

const buckets = new Map<string, Bucket>();

export function checkAgentRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= options.windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((options.windowMs - (now - current.startedAt)) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
}

export function resetAgentRateLimitsForTests() {
  buckets.clear();
}
