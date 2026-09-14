import { RoomRequestsClient } from "./room-requests-client";
import { listPendingRoomRequestsAction } from "@/actions/access-tokens";

export default async function AdminRoomRequestsPage() {
  const result = await listPendingRoomRequestsAction();
  return <RoomRequestsClient initialRequests={result.requests ?? []} />;
}
