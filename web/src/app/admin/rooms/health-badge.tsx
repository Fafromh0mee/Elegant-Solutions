import type { RoomConfigurationHealth } from "@/lib/room-config";
import { getRoomConfigHealthLabel } from "@/lib/ui-terms";

export const HEALTH_STYLE: Record<RoomConfigurationHealth, string> = {
  READY: "bg-green-100 text-green-700",
  INCOMPLETE: "bg-amber-100 text-amber-800",
  BOOKING_DISABLED: "bg-gray-100 text-gray-600",
  INACTIVE: "bg-red-100 text-red-700",
};

export function HealthBadge({ health }: { health: RoomConfigurationHealth }) {
  return <span className={`badge ${HEALTH_STYLE[health]}`}>{getRoomConfigHealthLabel(health)}</span>;
}
