import { listAdminRoomsAction } from "@/actions/rooms";
import { parseRoomListSearchParams } from "@/lib/room-config";
import { RoomsClient } from "./rooms-client";

export default async function AdminRoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = parseRoomListSearchParams(await searchParams);
  const initial = await listAdminRoomsAction(raw);
  if (!("success" in initial)) {
    return <div className="card text-sm text-red-700">{initial.error}</div>;
  }
  return <RoomsClient initial={initial} initialQuery={raw} />;
}
