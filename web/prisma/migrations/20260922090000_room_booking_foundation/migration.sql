-- Feature 1: Room + Booking domain foundation.
--
-- Additive only. No DROP, DELETE, TRUNCATE or destructive type change.
-- room_bookings uses ON DELETE RESTRICT for roomId/userId so booking history
-- cannot be erased by deleting a Room or User.
--
-- Existing rooms keep their current behaviour: bookingEnabled defaults to false
-- and capabilities defaults to an empty array, so no room becomes self-service
-- bookable and no capability is inferred as a side effect of this migration.

-- CreateEnum
CREATE TYPE "RoomCapability" AS ENUM ('CLASSROOM', 'LAB', 'MEETING', 'WORKSHOP', 'EVENT');

-- CreateEnum
CREATE TYPE "RoomApprovalPolicy" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
-- Slot identity only. Slot TIMES live in web/src/lib/academic-slots.ts.
CREATE TYPE "AcademicSlot" AS ENUM ('SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- Values are only added, never used in this migration, which is what makes
-- adding several of them in one transaction safe on PostgreSQL 12+.
ALTER TYPE "LogAction" ADD VALUE 'ROOM_BOOKING_CREATED';
ALTER TYPE "LogAction" ADD VALUE 'ROOM_BOOKING_APPROVED';
ALTER TYPE "LogAction" ADD VALUE 'ROOM_BOOKING_REJECTED';
ALTER TYPE "LogAction" ADD VALUE 'ROOM_BOOKING_CANCELLED';

-- AlterTable
-- capabilities: empty means "not configured", NOT "suitable for anything".
-- bookingEnabled: opt-in to ad-hoc booking, distinct from isActive (operational).
-- approvalPolicy: only consulted when bookingEnabled is true.
ALTER TABLE "rooms" ADD COLUMN     "approvalPolicy" "RoomApprovalPolicy" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "building" TEXT,
ADD COLUMN     "capabilities" "RoomCapability"[] DEFAULT ARRAY[]::"RoomCapability"[],
ADD COLUMN     "floor" INTEGER;

-- AlterTable
-- Nullable: rows whose times do not align to the academic grid keep only
-- startTime/endTime. Nothing is backfilled here.
ALTER TABLE "class_schedules" ADD COLUMN     "slot" "AcademicSlot";

-- CreateTable
CREATE TABLE "room_bookings" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "partySize" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- roomId/date are deliberately NOT duplicated from room_bookings; they are
-- reached through the parent booking so they cannot drift out of sync.
CREATE TABLE "room_booking_slots" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "slot" "AcademicSlot" NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_booking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- FAIL-CLOSED by convention: a room with bookingEnabled = true but no rows here
-- is "not configured" and is therefore NOT bookable. All days / all slots must
-- be represented explicitly. This migration creates no rows.
CREATE TABLE "room_availability_windows" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "slot" "AcademicSlot" NOT NULL,

    CONSTRAINT "room_availability_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- slots: empty array means the whole date range is closed; otherwise only the
-- listed slots are closed on those dates.
CREATE TABLE "room_closures" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "slots" "AcademicSlot"[] DEFAULT ARRAY[]::"AcademicSlot"[],
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_bookings_roomId_date_status_idx" ON "room_bookings"("roomId", "date", "status");

-- CreateIndex
CREATE INDEX "room_bookings_userId_date_idx" ON "room_bookings"("userId", "date");

-- CreateIndex
CREATE INDEX "room_bookings_status_createdAt_idx" ON "room_bookings"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "room_booking_slots_bookingId_slot_key" ON "room_booking_slots"("bookingId", "slot");

-- CreateIndex
CREATE INDEX "room_availability_windows_roomId_idx" ON "room_availability_windows"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "room_availability_windows_roomId_dayOfWeek_slot_key" ON "room_availability_windows"("roomId", "dayOfWeek", "slot");

-- CreateIndex
CREATE INDEX "room_closures_roomId_startDate_endDate_idx" ON "room_closures"("roomId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "class_schedules_roomId_semester_dayOfWeek_slot_idx" ON "class_schedules"("roomId", "semester", "dayOfWeek", "slot");

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_slots" ADD CONSTRAINT "room_booking_slots_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_availability_windows" ADD CONSTRAINT "room_availability_windows_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_closures" ADD CONSTRAINT "room_closures_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_closures" ADD CONSTRAINT "room_closures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill building/floor from roomCode, ONLY for the canonical "<Letter><Digit>-<Floor><NN>"
-- format (e.g. A4-404 -> building A4, floor 4). Non-standard codes such as MEETING-A,
-- LAB-01 and SERVER-01 do not match and are deliberately left NULL.
-- Capabilities are NOT inferred from roomCode; they stay empty until set explicitly.
UPDATE "rooms"
SET "building" = substring("roomCode" from '^([A-Z][0-9])-[1-9][0-9]{2}$'),
    "floor"    = substring("roomCode" from '^[A-Z][0-9]-([1-9])[0-9]{2}$')::INTEGER
WHERE "roomCode" ~ '^[A-Z][0-9]-[1-9][0-9]{2}$'
  AND "building" IS NULL
  AND "floor" IS NULL;
