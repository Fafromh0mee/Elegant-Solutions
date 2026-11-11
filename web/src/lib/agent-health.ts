export const AGENT_HEARTBEAT_INTERVAL_MS = 10_000;
export const AGENT_ONLINE_THRESHOLD_MS = AGENT_HEARTBEAT_INTERVAL_MS * 3;

export function getAgentOnlineThreshold(now = new Date()): Date {
  return new Date(now.getTime() - AGENT_ONLINE_THRESHOLD_MS);
}

export function isAgentOnline(
  machine: { isActive: boolean; lastSeen: Date | null },
  now = new Date(),
): boolean {
  return machine.isActive && machine.lastSeen !== null && machine.lastSeen > getAgentOnlineThreshold(now);
}

export function currentAgentActivity<T extends { userId: string | null; createdAt: Date }>(
  isOnline: boolean,
  session: { userId: string; issuedAt: Date } | null,
  latest: T | null,
): T | null {
  return isOnline && session && latest && latest.userId === session.userId && latest.createdAt >= session.issuedAt
    ? latest
    : null;
}
