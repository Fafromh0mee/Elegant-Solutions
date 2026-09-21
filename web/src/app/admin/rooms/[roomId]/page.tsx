import { notFound } from "next/navigation";
import { getAdminRoomDetailAction } from "@/actions/rooms";
import { RoomDetailClient } from "./room-detail-client";

export default async function AdminRoomDetailPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const detail = await getAdminRoomDetailAction(roomId);

  if (!("success" in detail)) {
    if (detail.errorCode === "ROOM_NOT_FOUND") notFound();
    return <div className="card text-sm text-red-700">{detail.error}</div>;
  }

  return <RoomDetailClient detail={detail} />;
}
