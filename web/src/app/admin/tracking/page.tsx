import { TrackingClient } from "./tracking-client";
import { getBlacklistAction } from "@/actions/agent";

export default async function AdminTrackingPage() {
  const blacklist = await getBlacklistAction();
  return <TrackingClient initialBlacklist={blacklist} />;
}
