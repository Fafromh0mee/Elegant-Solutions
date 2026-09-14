"use server";

import { unlockDoor } from "@/lib/door-control";

export async function unlockDoorAction(roomId: string, roomCode: string) {
  return unlockDoor({ roomId, roomCode });
}
