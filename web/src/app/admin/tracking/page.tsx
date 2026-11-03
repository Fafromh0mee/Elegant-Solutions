import { TrackingClient } from "./tracking-client";
import { getActivationRoomsAction, getBlacklistAction } from "@/actions/agent";

export default async function AdminTrackingPage() {
  const [blacklist, activationRooms] = await Promise.all([
    getBlacklistAction(),
    getActivationRoomsAction(),
  ]);
  return <TrackingClient initialBlacklist={blacklist} activationRooms={activationRooms} />;
}
