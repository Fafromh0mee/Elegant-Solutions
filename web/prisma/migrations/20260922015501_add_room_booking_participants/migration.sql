-- CreateEnum
CREATE TYPE "BookingParticipantSource" AS ENUM ('SELF', 'GROUP');

-- CreateTable
CREATE TABLE "room_booking_participants" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BookingParticipantSource" NOT NULL,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_booking_participants_userId_idx" ON "room_booking_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "room_booking_participants_bookingId_userId_key" ON "room_booking_participants"("bookingId", "userId");

-- AddForeignKey
ALTER TABLE "room_booking_participants" ADD CONSTRAINT "room_booking_participants_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_participants" ADD CONSTRAINT "room_booking_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_participants" ADD CONSTRAINT "room_booking_participants_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
