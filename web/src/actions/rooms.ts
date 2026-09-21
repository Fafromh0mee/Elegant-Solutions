"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isAdminRole } from "@/lib/permissions";
import { toAcademicDateString } from "@/lib/academic-slots";
import {
  NEW_ROOM_DEFAULTS,
  validateAvailabilityWindows,
  validateRoomClosure,
  validateRoomConfiguration,
  validateRoomListFilters,
} from "@/lib/room-config";
import {
  createRoom,
  createRoomClosure,
  deactivateRoom,
  deleteRoomClosure,
  deleteRoomIfUnused,
  getAdminRoomDetail,
  listAdminRooms,
  replaceRoomAvailabilityWindows,
  updateRoomConfiguration,
  type AdminRoomDetail,
  type AdminRoomListResult,
} from "@/lib/room-admin";
import type { RoomDependencyCounts } from "@/lib/room-config";
import { getRoomAdminErrorMessage } from "@/lib/ui-terms";

// Admin room configuration actions: authorization + validation only.
// Rules live in @/lib/room-config, database access in @/lib/room-admin.

type Failure = { error: string; errorCode: string };

function fail(code: string): Failure {
  return { error: getRoomAdminErrorMessage(code), errorCode: code };
}

/** Every mutation goes through this. Returns the admin's user id, or null. */
async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) return null;
  return session.user.id;
}

function isRoomId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function revalidateRoom(roomId?: string) {
  revalidatePath("/admin/rooms");
  if (roomId) revalidatePath(`/admin/rooms/${roomId}`);
}

// --- Reads ------------------------------------------------------------------

export async function listAdminRoomsAction(
  filters: Record<string, unknown> = {}
): Promise<({ success: true } & AdminRoomListResult) | Failure> {
  if (!(await requireAdmin())) return fail("UNAUTHORIZED");

  const validation = validateRoomListFilters(filters);
  if (!validation.ok) return fail(validation.error);

  return { success: true, ...(await listAdminRooms(validation.value)) };
}

export async function getAdminRoomDetailAction(
  roomId: string
): Promise<({ success: true } & AdminRoomDetail) | Failure> {
  if (!(await requireAdmin())) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const detail = await getAdminRoomDetail(roomId, toAcademicDateString(new Date()));
  if (!detail) return fail("ROOM_NOT_FOUND");
  return { success: true, ...detail };
}

// --- Room configuration -----------------------------------------------------

export async function createRoomAction(
  input: Record<string, unknown>
): Promise<{ success: true; roomId: string } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");

  // New rooms start operational but NOT bookable, with nothing inferred.
  const validation = validateRoomConfiguration({ ...NEW_ROOM_DEFAULTS, ...pickCreateFields(input) });
  if (!validation.ok) return fail(validation.error);

  const result = await createRoom(validation.value, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom();
  return { success: true, roomId: result.value.id };
}

function pickCreateFields(input: Record<string, unknown>) {
  const { name, roomCode, description, building, floor, capacity, guestAccess } = input;
  return {
    name,
    roomCode,
    description,
    building,
    floor,
    capacity,
    ...(guestAccess === undefined ? {} : { guestAccess }),
  };
}

export async function updateRoomConfigurationAction(
  roomId: string,
  input: Record<string, unknown>
): Promise<{ success: true } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const validation = validateRoomConfiguration(input);
  if (!validation.ok) return fail(validation.error);

  const result = await updateRoomConfiguration(roomId, validation.value, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom(roomId);
  return { success: true };
}

// --- Availability windows ---------------------------------------------------

export async function replaceRoomAvailabilityWindowsAction(
  roomId: string,
  windows: unknown
): Promise<{ success: true; count: number } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const validation = validateAvailabilityWindows(windows);
  if (!validation.ok) return fail(validation.error);

  const result = await replaceRoomAvailabilityWindows(roomId, validation.value, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom(roomId);
  return { success: true, count: result.value.count };
}

// --- Closures ---------------------------------------------------------------

export async function createRoomClosureAction(
  roomId: string,
  input: Record<string, unknown>
): Promise<{ success: true; closureId: string } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const validation = validateRoomClosure(input, toAcademicDateString(new Date()));
  if (!validation.ok) return fail(validation.error);

  const result = await createRoomClosure(roomId, validation.value, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom(roomId);
  return { success: true, closureId: result.value.id };
}

export async function deleteRoomClosureAction(
  roomId: string,
  closureId: string
): Promise<{ success: true } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");
  if (!isRoomId(closureId)) return fail("CLOSURE_NOT_FOUND");

  const result = await deleteRoomClosure(roomId, closureId, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom(roomId);
  return { success: true };
}

// --- Lifecycle --------------------------------------------------------------

/** The normal way to retire a room: preserves every historical row. */
export async function deactivateRoomAction(roomId: string): Promise<{ success: true } | Failure> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const result = await deactivateRoom(roomId, actorId);
  if (!result.ok) return fail(result.error);

  revalidateRoom(roomId);
  return { success: true };
}

/**
 * Permanent delete, refused for any room with history or dependents. Never
 * deletes history to make itself succeed; the admin is told to deactivate.
 */
export async function deleteRoomAction(
  roomId: string
): Promise<{ success: true } | (Failure & { dependencies?: RoomDependencyCounts })> {
  const actorId = await requireAdmin();
  if (!actorId) return fail("UNAUTHORIZED");
  if (!isRoomId(roomId)) return fail("ROOM_NOT_FOUND");

  const result = await deleteRoomIfUnused(roomId, actorId);
  if (!result.ok) {
    return "dependencies" in result ? { ...fail(result.error), dependencies: result.dependencies } : fail(result.error);
  }

  revalidateRoom();
  return { success: true };
}

// --- Student-facing (unchanged) ---------------------------------------------

export async function getAvailableRoomsAction() {
  const session = await auth();
  if (!session) return { rooms: [] };

  const where = session.user.role === "GUEST" ? { isActive: true, guestAccess: true } : { isActive: true };

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return { rooms };
}
