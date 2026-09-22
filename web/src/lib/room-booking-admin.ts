import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateColumn } from "@/lib/room-booking";
import { ADMIN_BOOKINGS_PAGE_SIZE, type AdminBookingListQuery } from "@/lib/room-booking-rules";
import type {
  AcademicSlot,
  AccountStatus,
  BookingParticipantSource,
  BookingStatus,
  Role,
  RoomApprovalPolicy,
  RoomCapability,
} from "@/lib/types";

// Feature 8 admin reads: the booking queue and one booking's full detail. Server-only
// and read-only; callers must already have checked ADMIN/SUPER_ADMIN. Decisions live
// in lib/room-booking-decision.ts. RoomBookingParticipant is the only source of who a
// booking covers - never partySize, never current Group membership.

export interface AdminBookingListItem {
  id: string;
  status: BookingStatus;
  date: string;
  slots: AcademicSlot[];
  roomId: string;
  roomCode: string;
  roomName: string;
  approvalPolicy: RoomApprovalPolicy;
  creatorName: string;
  participantCount: number;
  partySize: number;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminBookingList {
  items: AdminBookingListItem[];
  total: number;
  page: number;
  pageSize: number;
  rooms: Array<{ id: string; roomCode: string; name: string }>;
}

export async function listAdminBookings(query: AdminBookingListQuery): Promise<AdminBookingList> {
  const where: Prisma.RoomBookingWhereInput = {
    ...(query.status !== "ALL" ? { status: query.status } : {}),
    ...(query.date ? { date: toDateColumn(query.date) } : {}),
    ...(query.roomId ? { roomId: query.roomId } : {}),
  };
  // PENDING is the work queue: oldest date first, then first come first served. The
  // BookingStatus enum sorts in declaration order, so ALL also puts PENDING first.
  const orderBy: Prisma.RoomBookingOrderByWithRelationInput[] =
    query.status === "PENDING" || query.status === "ALL"
      ? [{ status: "asc" }, { date: "asc" }, { createdAt: "asc" }]
      : [{ date: "desc" }, { createdAt: "desc" }];

  const [total, rows, rooms] = await Promise.all([
    prisma.roomBooking.count({ where }),
    prisma.roomBooking.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * ADMIN_BOOKINGS_PAGE_SIZE,
      take: ADMIN_BOOKINGS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        date: true,
        partySize: true,
        createdAt: true,
        decidedAt: true,
        room: { select: { id: true, roomCode: true, name: true, approvalPolicy: true } },
        user: { select: { name: true } },
        slots: { select: { slot: true }, orderBy: { startAt: "asc" } },
        _count: { select: { participants: true } },
      },
    }),
    prisma.room.findMany({
      where: { bookings: { some: {} } },
      select: { id: true, roomCode: true, name: true },
      orderBy: { roomCode: "asc" },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status as BookingStatus,
      date: row.date.toISOString().slice(0, 10),
      slots: row.slots.map((entry) => entry.slot as AcademicSlot),
      roomId: row.room.id,
      roomCode: row.room.roomCode,
      roomName: row.room.name,
      approvalPolicy: row.room.approvalPolicy as RoomApprovalPolicy,
      creatorName: row.user.name,
      participantCount: row._count.participants,
      partySize: row.partySize,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    })),
    total,
    page: query.page,
    pageSize: ADMIN_BOOKINGS_PAGE_SIZE,
    rooms,
  };
}

export interface AdminBookingParticipant {
  userId: string;
  name: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
  studentId: string | null;
  source: BookingParticipantSource;
  groupName: string | null;
  isCreator: boolean;
}

export interface AdminBookingDetail {
  id: string;
  status: BookingStatus;
  date: string;
  partySize: number;
  purpose: string | null;
  createdAt: string;
  slots: Array<{ slot: AcademicSlot; startAt: string; endAt: string }>;
  room: {
    id: string;
    roomCode: string;
    name: string;
    building: string | null;
    floor: number | null;
    capacity: number;
    capabilities: RoomCapability[];
    approvalPolicy: RoomApprovalPolicy;
    isActive: boolean;
    bookingEnabled: boolean;
  };
  creator: { id: string; name: string };
  participants: AdminBookingParticipant[];
  decision: {
    decidedAt: string | null;
    decidedByName: string | null;
    reason: string | null;
    /** APPROVED with no decider = auto-approved under an AUTO room policy. */
    autoApproved: boolean;
    cancelledAt: string | null;
  };
}

export async function getAdminBookingDetail(bookingId: string): Promise<AdminBookingDetail | null> {
  if (typeof bookingId !== "string" || bookingId.length === 0 || bookingId.length > 64) return null;
  const row = await prisma.roomBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      date: true,
      partySize: true,
      purpose: true,
      createdAt: true,
      decidedAt: true,
      decisionReason: true,
      cancelledAt: true,
      userId: true,
      user: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
      slots: { select: { slot: true, startAt: true, endAt: true }, orderBy: { startAt: "asc" } },
      room: {
        select: {
          id: true,
          roomCode: true,
          name: true,
          building: true,
          floor: true,
          capacity: true,
          capabilities: true,
          approvalPolicy: true,
          isActive: true,
          bookingEnabled: true,
        },
      },
      participants: {
        select: {
          userId: true,
          source: true,
          group: { select: { name: true } },
          user: { select: { name: true, email: true, role: true, status: true, studentId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    status: row.status as BookingStatus,
    date: row.date.toISOString().slice(0, 10),
    partySize: row.partySize,
    purpose: row.purpose,
    createdAt: row.createdAt.toISOString(),
    slots: row.slots.map((entry) => ({
      slot: entry.slot as AcademicSlot,
      startAt: entry.startAt.toISOString(),
      endAt: entry.endAt.toISOString(),
    })),
    room: {
      ...row.room,
      capabilities: row.room.capabilities as RoomCapability[],
      approvalPolicy: row.room.approvalPolicy as RoomApprovalPolicy,
    },
    creator: row.user,
    participants: row.participants
      .map((p) => ({
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        role: p.user.role as Role,
        accountStatus: p.user.status as AccountStatus,
        studentId: p.user.studentId,
        source: p.source as BookingParticipantSource,
        groupName: p.group?.name ?? null,
        isCreator: p.userId === row.userId,
      }))
      .sort((a, b) => Number(b.isCreator) - Number(a.isCreator)),
    decision: {
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedByName: row.decidedBy?.name ?? null,
      reason: row.decisionReason,
      autoApproved: row.status === "APPROVED" && row.decidedBy === null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    },
  };
}
