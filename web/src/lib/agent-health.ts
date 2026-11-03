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
