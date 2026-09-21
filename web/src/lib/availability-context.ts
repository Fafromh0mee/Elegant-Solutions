import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveSemester } from "@/lib/system";
import { academicDateToDayOfWeek, getSlotDefinition } from "@/lib/academic-slots";
import {
  evaluateAvailability,
  summarizeBookingCapacity,
  type AvailabilityRequest,
  type AvailabilityRoom,
  type ClassContext,
  type ClosureContext,
  type RoomAvailabilityContext,
  type RoomAvailabilityResult,
  type RoomSearchFilters,
} from "@/lib/availability";
import type { AcademicSlot, BookingStatus } from "@/lib/types";

// Data layer for the availability engine: loads context from Prisma and hands
// every decision to the pure evaluator in @/lib/availability. Any filtering done
// here is an optimization only - the evaluator re-checks everything.
//
// Server-only, but deliberately NOT a "use server" module: every export of one of
// those becomes a callable endpoint, and these functions are internal.
//
// CONCURRENCY (for Features 7/8): results here are point-in-time snapshots.
// AUTO booking creation and MANUAL approval must, inside one transaction:
//   1. take contention protection for (roomId, date) - preferably
//      pg_advisory_xact_lock(hashtext(roomId || ':' || date))
//   2. reload context with loadRoomAvailabilityContexts
//   3. run the SAME evaluateAvailability
//   4. only then insert / flip PENDING -> APPROVED
// PENDING never reserves capacity, so two pending requests can each be approvable
// alone but not together - approval must be serialized, not just creation.

export const ROOM_SELECT = {
  id: true,
  roomCode: true,
  name: true,
  isActive: true,
  bookingEnabled: true,
  approvalPolicy: true,
  capabilities: true,
  capacity: true,
  building: true,
  floor: true,
} satisfies Prisma.RoomSelect;

// Upper bound on rooms evaluated per search. Candidates are evaluated BEFORE the
// result limit is applied, so onlyAvailable cannot miss rooms past the first page.
const SEARCH_CANDIDATE_CAP = 500;

/** "YYYY-MM-DD" (Bangkok calendar date) -> the DATE value Postgres stores. */
function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row)) ?? [];
    list.push(row);
    map.set(key(row), list);
  }
  return map;
}

/**
 * Loads everything the pure evaluator needs for a set of rooms on one date.
 * Five queries total (plus the semester setting), independent of room count.
 */
export async function loadRoomAvailabilityContexts(
  rooms: AvailabilityRoom[],
  request: AvailabilityRequest
): Promise<RoomAvailabilityContext[]> {
  if (rooms.length === 0) return [];

  const roomIds = rooms.map((room) => room.id);
  const dayOfWeek = academicDateToDayOfWeek(request.date);
  const dateValue = toDateColumn(request.date);
  const activeSemester = await getActiveSemester();

  // Coarse time bounds across all requested slots, for the legacy slot=NULL
  // prefilter. "HH:MM" is zero-padded, so string order is chronological.
  const definitions = request.slots.map(getSlotDefinition);
  const minStart = definitions.map((d) => d.startTime).sort()[0];
  const maxEnd = definitions.map((d) => d.endTime).sort().at(-1)!;

  const scheduleFilters: Prisma.ClassScheduleWhereInput[] = [
    {
      OR: [
        { slot: { in: request.slots } },
        { slot: null, startTime: { lt: maxEnd }, endTime: { gt: minStart } },
      ],
    },
  ];
  if (activeSemester) {
    // NULL semester stays in: unscoped legacy data must fail closed.
    scheduleFilters.push({ OR: [{ semester: activeSemester }, { semester: null }] });
  }

  const [windows, closures, classes, bookings] = await Promise.all([
    prisma.roomAvailabilityWindow.findMany({
      where: { roomId: { in: roomIds }, dayOfWeek, slot: { in: request.slots } },
      select: { roomId: true, slot: true },
    }),
    prisma.roomClosure.findMany({
      where: {
        roomId: { in: roomIds },
        startDate: { lte: dateValue },
        endDate: { gte: dateValue },
      },
      select: { id: true, roomId: true, reason: true, startDate: true, endDate: true, slots: true },
    }),
    prisma.classSchedule.findMany({
      where: { roomId: { in: roomIds }, dayOfWeek, AND: scheduleFilters },
      select: {
        id: true,
        roomId: true,
        slot: true,
        startTime: true,
        endTime: true,
        subjectCode: true,
        subjectName: true,
        section: true,
        semester: true,
      },
    }),
    prisma.roomBooking.findMany({
      where: {
        roomId: { in: roomIds },
        date: dateValue,
        // PENDING is loaded only to report contention; it never reserves capacity.
        status: { in: ["APPROVED", "PENDING"] },
      },
      select: {
        roomId: true,
        partySize: true,
        status: true,
        slots: { select: { slot: true } },
      },
    }),
  ]);

  const windowsByRoom = groupBy(windows, (row) => row.roomId);
  const closuresByRoom = groupBy(closures, (row) => row.roomId);
  const classesByRoom = groupBy(classes, (row) => row.roomId);
  const bookingsByRoom = groupBy(bookings, (row) => row.roomId);

  return rooms.map((room) => {
    const closureContexts: ClosureContext[] = (closuresByRoom.get(room.id) ?? []).map((row) => ({
      id: row.id,
      reason: row.reason,
      startDate: fromDateColumn(row.startDate),
      endDate: fromDateColumn(row.endDate),
      slots: row.slots as AcademicSlot[],
    }));

    const classContexts: ClassContext[] = (classesByRoom.get(room.id) ?? []).map((row) => ({
      id: row.id,
      slot: (row.slot as AcademicSlot | null) ?? null,
      startTime: row.startTime,
      endTime: row.endTime,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      section: row.section,
      semester: row.semester,
    }));

    const capacity = summarizeBookingCapacity(
      (bookingsByRoom.get(room.id) ?? []).map((booking) => ({
        status: booking.status as BookingStatus,
        partySize: booking.partySize,
        slots: booking.slots.map((entry) => entry.slot as AcademicSlot),
      }))
    );

    return {
      room,
      dayOfWeek,
      activeSemester,
      windowSlots: (windowsByRoom.get(room.id) ?? []).map((row) => row.slot as AcademicSlot),
      closures: closureContexts,
      classes: classContexts,
      ...capacity,
      configWarnings: [],
    };
  });
}

/** Evaluate one room. Returns null when the room does not exist. */
export async function evaluateRoomAvailabilityById(
  roomId: string,
  request: AvailabilityRequest
): Promise<RoomAvailabilityResult | null> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: ROOM_SELECT });
  if (!room) return null;

  const [context] = await loadRoomAvailabilityContexts([room], request);
  return evaluateAvailability(context, request);
}

export interface RoomSearchOutcome {
  results: RoomAvailabilityResult[];
  /** True when more rooms matched than were evaluated or returned. */
  truncated: boolean;
}

/** Room Finder search: prefilter in SQL, evaluate every candidate, then limit. */
export async function searchRoomAvailability(
  request: AvailabilityRequest,
  filters: RoomSearchFilters
): Promise<RoomSearchOutcome> {
  const dayOfWeek = academicDateToDayOfWeek(request.date);

  // Necessary conditions only. `some` matches a room with a window for ANY
  // requested slot, not all of them - the evaluator enforces all-slots.
  const candidates = await prisma.room.findMany({
    where: {
      isActive: true,
      bookingEnabled: true,
      capacity: { gte: request.partySize },
      ...(request.requiredCapability
        ? { capabilities: { has: request.requiredCapability } }
        : { capabilities: { isEmpty: false } }),
      ...(filters.building !== undefined ? { building: filters.building } : {}),
      ...(filters.floor !== undefined ? { floor: filters.floor } : {}),
      availabilityWindows: { some: { dayOfWeek, slot: { in: request.slots } } },
    },
    select: ROOM_SELECT,
    orderBy: { roomCode: "asc" },
    take: SEARCH_CANDIDATE_CAP + 1,
  });

  const candidatesTruncated = candidates.length > SEARCH_CANDIDATE_CAP;
  const evaluated = candidates.slice(0, SEARCH_CANDIDATE_CAP);

  const contexts = await loadRoomAvailabilityContexts(evaluated, request);
  const all = contexts.map((context) => evaluateAvailability(context, request));
  const matching = filters.onlyAvailable ? all.filter((result) => result.available) : all;

  return {
    results: matching.slice(0, filters.limit),
    truncated: candidatesTruncated || matching.length > filters.limit,
  };
}
