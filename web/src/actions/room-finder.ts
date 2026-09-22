"use server";

import { auth } from "@/lib/auth";
import { getRoomAudience } from "@/lib/permissions";
import { searchRoomFinder } from "@/lib/room-finder-search";
import {
  parseResultLimit,
  type RoomFinderInput,
  type RoomFinderSearchState,
} from "@/lib/room-finder";

// Client entry point for the Room Finder panel on the student dashboard.
// Auth + role only; validation and search live in @/lib/room-finder-search,
// availability in the Feature 3 engine. Input is untrusted and re-validated.
// The room set (all bookable rooms, or guest-eligible only) comes from the session,
// never from the client.

export async function searchRoomFinderAction(input: RoomFinderInput, limit?: unknown): Promise<RoomFinderSearchState> {
  const session = await auth();
  const audience = session ? getRoomAudience(session.user.role, session.user.status) : null;
  if (audience === null) return { kind: "NOT_ALLOWED" };
  // Only the known fields are forwarded; anything else in the payload is ignored.
  const { date, slots, partySize, capability, building, floor } = input ?? {};
  return searchRoomFinder(
    { date, slots, partySize, capability, building, floor },
    new Date(),
    parseResultLimit(limit),
    audience
  );
}
