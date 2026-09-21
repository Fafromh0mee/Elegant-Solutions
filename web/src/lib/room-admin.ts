import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildRoomListWhere,
  deriveRoomConfigurationHealth,
  evaluateRoomDeletion,
  healthWhere,
  type AvailabilityWindowInput,
  type RoomClosureInput,
  type RoomConfiguration,
  type RoomConfigurationHealth,
  type RoomConfigurationIssue,
  type RoomDependencyCounts,
  type RoomListFilters,
} from "@/lib/room-config";
import type { AcademicSlot, RoomApprovalPolicy, RoomCapability } from "@/lib/types";

// Data layer for admin room configuration. Every rule is decided in
// @/lib/room-config; this module only talks to the database.
//
// Server-only, but deliberately NOT a "use server" module: its exports must not
// become callable endpoints. Authorization happens in @/actions/rooms.

export type MutationResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: "ROOM_NOT_FOUND" | "DUPLICATE_ROOM_CODE" | "CLOSURE_NOT_FOUND" | "ROOM_HAS_HISTORY" };

function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

// --- List -------------------------------------------------------------------

export interface AdminRoomListItem {
  id: string;
  roomCode: string;
  name: string;
  building: string | null;
  floor: number | null;
  capacity: number;
  capabilities: RoomCapability[];
  isActive: boolean;
  bookingEnabled: boolean;
  approvalPolicy: RoomApprovalPolicy;
  availabilityWindowCount: number;
  health: RoomConfigurationHealth;
  issues: RoomConfigurationIssue[];
}

export interface AdminRoomListResult {
  rooms: AdminRoomListItem[];
  total: number;
  page: number;
  pageSize: number;
  buildings: Array<string | null>;
  healthCounts: Record<RoomConfigurationHealth, number>;
}

export async function listAdminRooms(filters: RoomListFilters): Promise<AdminRoomListResult> {
  const where = buildRoomListWhere(filters);

  const [total, rows, buildingRows, ready, incomplete, bookingDisabled, inactive] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      orderBy: { roomCode: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        roomCode: true,
        name: true,
        building: true,
        floor: true,
        capacity: true,
        capabilities: true,
        isActive: true,
        bookingEnabled: true,
        approvalPolicy: true,
        _count: { select: { availabilityWindows: true } },
      },
    }),
    prisma.room.findMany({ distinct: ["building"], select: { building: true }, orderBy: { building: "asc" } }),
    prisma.room.count({ where: healthWhere("READY") }),
    prisma.room.count({ where: healthWhere("INCOMPLETE") }),
    prisma.room.count({ where: healthWhere("BOOKING_DISABLED") }),
    prisma.room.count({ where: healthWhere("INACTIVE") }),
  ]);

  return {
    rooms: rows.map(({ _count, ...room }) => {
      const derived = deriveRoomConfigurationHealth({
        ...room,
        availabilityWindowCount: _count.availabilityWindows,
      });
      return { ...room, availabilityWindowCount: _count.availabilityWindows, ...derived };
    }),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    buildings: buildingRows.map((row) => row.building),
    healthCounts: {
      READY: ready,
      INCOMPLETE: incomplete,
      BOOKING_DISABLED: bookingDisabled,
      INACTIVE: inactive,
    },
  };
}

// --- Detail -----------------------------------------------------------------

export interface AdminRoomClosure {
  id: string;
  startDate: string;
  endDate: string;
  slots: AcademicSlot[];
  reason: string | null;
  createdByName: string | null;
}

export interface AdminRoomDetail {
  room: RoomConfiguration & { id: string };
  windows: AvailabilityWindowInput[];
  closures: AdminRoomClosure[];
  dependencies: RoomDependencyCounts;
  health: RoomConfigurationHealth;
  issues: RoomConfigurationIssue[];
}

export async function getRoomDependencyCounts(
  roomId: string,
  db: Prisma.TransactionClient = prisma
): Promise<RoomDependencyCounts> {
  const [bookings, sessions, accessTokens, classSchedules, logs, agentMachines] = await Promise.all([
    db.roomBooking.count({ where: { roomId } }),
    db.session.count({ where: { roomId } }),
    db.accessToken.count({ where: { roomId } }),
    db.classSchedule.count({ where: { roomId } }),
    // Usage/audit events only. The room's own configuration trail (ROOM_CREATED /
    // ROOM_UPDATED, written by this module) is not "history of use" - counting it
    // would make any room undeletable the moment an admin configured it. Those
    // rows survive a delete anyway (Log.roomId is ON DELETE SET NULL).
    db.log.count({ where: { roomId, action: { notIn: ["ROOM_CREATED", "ROOM_UPDATED"] } } }),
    db.agentMachine.count({ where: { roomId } }),
  ]);
  return { bookings, sessions, accessTokens, classSchedules, logs, agentMachines };
}

/** `today` is the Asia/Bangkok calendar date; closures that ended earlier are omitted. */
export async function getAdminRoomDetail(roomId: string, today: string): Promise<AdminRoomDetail | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      roomCode: true,
      description: true,
      building: true,
      floor: true,
      capacity: true,
      capabilities: true,
      isActive: true,
      bookingEnabled: true,
      approvalPolicy: true,
      guestAccess: true,
      staffOnly: true,
    },
  });
  if (!room) return null;

  const [windows, closures, dependencies] = await Promise.all([
    prisma.roomAvailabilityWindow.findMany({
      where: { roomId },
      select: { dayOfWeek: true, slot: true },
      orderBy: [{ dayOfWeek: "asc" }, { slot: "asc" }],
    }),
    prisma.roomClosure.findMany({
      where: { roomId, endDate: { gte: toDateColumn(today) } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        slots: true,
        reason: true,
        createdBy: { select: { name: true } },
      },
    }),
    getRoomDependencyCounts(roomId),
  ]);

  const derived = deriveRoomConfigurationHealth({ ...room, availabilityWindowCount: windows.length });

  return {
    room,
    windows,
    closures: closures.map((closure) => ({
      id: closure.id,
      startDate: fromDateColumn(closure.startDate),
      endDate: fromDateColumn(closure.endDate),
      slots: closure.slots,
      reason: closure.reason,
      createdByName: closure.createdBy?.name ?? null,
    })),
    dependencies,
    ...derived,
  };
}

// --- Mutations --------------------------------------------------------------

async function writeLog(actorId: string, roomId: string | null, details: string, action: "ROOM_CREATED" | "ROOM_UPDATED" = "ROOM_UPDATED") {
  await prisma.log.create({ data: { userId: actorId, roomId, action, details } });
}

export async function createRoom(config: RoomConfiguration, actorId: string): Promise<MutationResult<{ id: string }>> {
  try {
    const room = await prisma.room.create({ data: config, select: { id: true } });
    await writeLog(actorId, null, `Created room: ${config.name} (${config.roomCode})`, "ROOM_CREATED");
    return { ok: true, value: room };
  } catch (error) {
    if (isPrismaError(error, "P2002")) return { ok: false, error: "DUPLICATE_ROOM_CODE" };
    throw error;
  }
}

export async function updateRoomConfiguration(
  roomId: string,
  config: RoomConfiguration,
  actorId: string
): Promise<MutationResult> {
  try {
    await prisma.room.update({ where: { id: roomId }, data: config });
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, error: "ROOM_NOT_FOUND" };
    if (isPrismaError(error, "P2002")) return { ok: false, error: "DUPLICATE_ROOM_CODE" };
    throw error;
  }
  await writeLog(actorId, roomId, `Updated room configuration: ${config.roomCode}`);
  return { ok: true, value: undefined };
}

/**
 * Replaces the room's availability set exactly. Deterministic and transactional:
 * rows not in `windows` are removed, an empty set leaves zero rows. Only this
 * room is touched.
 */
export async function replaceRoomAvailabilityWindows(
  roomId: string,
  windows: AvailabilityWindowInput[],
  actorId: string
): Promise<MutationResult<{ count: number }>> {
  const count = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return null;

    await tx.roomAvailabilityWindow.deleteMany({ where: { roomId } });
    if (windows.length > 0) {
      await tx.roomAvailabilityWindow.createMany({
        data: windows.map((window) => ({ roomId, dayOfWeek: window.dayOfWeek, slot: window.slot })),
      });
    }
    return windows.length;
  });

  if (count === null) return { ok: false, error: "ROOM_NOT_FOUND" };
  await writeLog(actorId, roomId, `Replaced availability windows: ${count} window(s)`);
  return { ok: true, value: { count } };
}

export async function createRoomClosure(
  roomId: string,
  closure: RoomClosureInput,
  actorId: string
): Promise<MutationResult<{ id: string }>> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };

  const created = await prisma.roomClosure.create({
    data: {
      roomId,
      startDate: toDateColumn(closure.startDate),
      endDate: toDateColumn(closure.endDate),
      slots: closure.slots,
      reason: closure.reason,
      createdById: actorId,
    },
    select: { id: true },
  });

  const scope = closure.slots.length === 0 ? "whole range" : closure.slots.join(",");
  await writeLog(actorId, roomId, `Created closure ${closure.startDate}..${closure.endDate} (${scope})`);
  return { ok: true, value: created };
}

/** Deletes a closure only if it belongs to the given room - client IDs are not trusted. */
export async function deleteRoomClosure(roomId: string, closureId: string, actorId: string): Promise<MutationResult> {
  const { count } = await prisma.roomClosure.deleteMany({ where: { id: closureId, roomId } });
  if (count === 0) return { ok: false, error: "CLOSURE_NOT_FOUND" };

  await writeLog(actorId, roomId, `Removed closure ${closureId}`);
  return { ok: true, value: undefined };
}

/** The normal way to retire a room. Preserves every historical row. */
export async function deactivateRoom(roomId: string, actorId: string): Promise<MutationResult> {
  try {
    await prisma.room.update({ where: { id: roomId }, data: { isActive: false } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, error: "ROOM_NOT_FOUND" };
    throw error;
  }
  await writeLog(actorId, roomId, "Deactivated room");
  return { ok: true, value: undefined };
}

/**
 * Hard delete, allowed ONLY for a room with no history or dependents at all.
 * The room row is locked FOR UPDATE first, so no session/booking/token can be
 * inserted for it between the dependency check and the delete.
 */
export async function deleteRoomIfUnused(
  roomId: string,
  actorId: string
): Promise<MutationResult<{ roomCode: string }> | { ok: false; error: "ROOM_HAS_HISTORY"; dependencies: RoomDependencyCounts }> {
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ roomCode: string }>>`
        SELECT "roomCode" FROM "rooms" WHERE "id" = ${roomId} FOR UPDATE`;
      if (locked.length === 0) return { kind: "missing" as const };

      const dependencies = await getRoomDependencyCounts(roomId, tx);
      if (!evaluateRoomDeletion(dependencies).allowed) return { kind: "blocked" as const, dependencies };

      await tx.room.delete({ where: { id: roomId } });
      return { kind: "deleted" as const, roomCode: locked[0].roomCode };
    });

    if (outcome.kind === "missing") return { ok: false, error: "ROOM_NOT_FOUND" };
    if (outcome.kind === "blocked") {
      return { ok: false, error: "ROOM_HAS_HISTORY", dependencies: outcome.dependencies };
    }

    await writeLog(actorId, null, `Deleted unused room: ${outcome.roomCode}`);
    return { ok: true, value: { roomCode: outcome.roomCode } };
  } catch (error) {
    // Belt and braces: a RESTRICT foreign key must never surface as a raw error.
    if (isPrismaError(error, "P2003")) {
      return { ok: false, error: "ROOM_HAS_HISTORY", dependencies: await getRoomDependencyCounts(roomId) };
    }
    throw error;
  }
}
