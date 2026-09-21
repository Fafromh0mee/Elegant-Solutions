"use server";

import { auth } from "@/lib/auth";
import {
  evaluateRoomAvailabilityById,
  searchRoomAvailability,
} from "@/lib/availability-context";
import {
  validateAvailabilityRequest,
  validateRoomSearchFilters,
  type AvailabilityRequestError,
  type RoomAvailabilityResult,
  type RoomSearchError,
} from "@/lib/availability";
import { getAvailabilityErrorMessage } from "@/lib/ui-terms";

// Server entry points for the central availability engine. Auth + validation only:
// rules live in @/lib/availability, data loading in @/lib/availability-context.

type ActionError = {
  error: string; // Thai, for display
  errorCode: AvailabilityRequestError | RoomSearchError | "UNAUTHENTICATED" | "ROOM_NOT_FOUND";
};

export async function evaluateRoomAvailabilityAction(input: {
  roomId: string;
  date: string;
  slots: string[];
  partySize: number;
  requiredCapability?: string;
}): Promise<{ result: RoomAvailabilityResult } | ActionError> {
  const session = await auth();
  if (!session) {
    return { error: getAvailabilityErrorMessage("UNAUTHENTICATED"), errorCode: "UNAUTHENTICATED" };
  }

  const validation = validateAvailabilityRequest(input);
  if (!validation.ok) {
    return { error: getAvailabilityErrorMessage(validation.error), errorCode: validation.error };
  }

  const result = await evaluateRoomAvailabilityById(input.roomId, validation.request);
  if (!result) {
    return { error: getAvailabilityErrorMessage("ROOM_NOT_FOUND"), errorCode: "ROOM_NOT_FOUND" };
  }

  return { result };
}

export async function findAvailableRoomsAction(input: {
  date: string;
  slots: string[];
  partySize: number;
  requiredCapability?: string;
  building?: string;
  floor?: number;
  onlyAvailable?: boolean;
  limit?: number;
}): Promise<{ results: RoomAvailabilityResult[]; truncated: boolean } | ActionError> {
  const session = await auth();
  if (!session) {
    return { error: getAvailabilityErrorMessage("UNAUTHENTICATED"), errorCode: "UNAUTHENTICATED" };
  }

  const validation = validateAvailabilityRequest(input);
  if (!validation.ok) {
    return { error: getAvailabilityErrorMessage(validation.error), errorCode: validation.error };
  }

  const search = validateRoomSearchFilters(input);
  if (!search.ok) {
    return { error: getAvailabilityErrorMessage(search.error), errorCode: search.error };
  }

  return searchRoomAvailability(validation.request, search.filters);
}
