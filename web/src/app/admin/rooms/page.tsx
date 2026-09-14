import { getRoomsAction } from "@/actions/rooms";
import { RoomsClient } from "./rooms-client";

export default async function AdminRoomsPage() {
  const { rooms } = await getRoomsAction();
  return <RoomsClient initialRooms={rooms} />;
}
