"use server";

import { auth } from "@/lib/auth";
import { canUseRoomFinder } from "@/lib/permissions";
import { getRoomFinderSetup, searchRoomFinder } from "@/lib/room-finder-search";
import type { RoomFinderInput, RoomFinderSearchState, RoomFinderSetup } from "@/lib/room-finder";

// Client entry points for the Room Finder panel on the student dashboard.
// Auth + role only; validation and search live in @/lib/room-finder-search,
// availability in the Feature 3 engine. Input is untrusted and re-validated.

async function allowed(): Promise<boolean> {
  const session = await auth();
  return !!session && canUseRoomFinder(session.user.role);
}

export async function getRoomFinderSetupAction(): Promise<
  ({ kind: "READY" } & RoomFinderSetup) | { kind: "NOT_ALLOWED" }
> {
  if (!(await allowed())) return { kind: "NOT_ALLOWED" };
  return { kind: "READY", ...(await getRoomFinderSetup(new Date())) };
}

export async function searchRoomFinderAction(input: RoomFinderInput): Promise<RoomFinderSearchState> {
  if (!(await allowed())) return { kind: "NOT_ALLOWED" };
  // Only the known fields are forwarded; anything else in the payload is ignored.
  const { date, slots, partySize, capability, building, floor } = input ?? {};
  return searchRoomFinder({ date, slots, partySize, capability, building, floor }, new Date());
}
