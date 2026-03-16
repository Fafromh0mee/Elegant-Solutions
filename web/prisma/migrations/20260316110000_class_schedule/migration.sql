-- AlterEnum
ALTER TYPE "LogAction" ADD VALUE 'SCHEDULE_ACCESS';

-- CreateTable
CREATE TABLE "class_schedules" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "roomId"      TEXT NOT NULL,
    "dayOfWeek"   INTEGER NOT NULL,
    "startTime"   TEXT NOT NULL,
    "endTime"     TEXT NOT NULL,
    "subjectName" TEXT,
    "subjectCode" TEXT,
    "semester"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_schedules_userId_roomId_dayOfWeek_startTime_endTime_semester_key"
    ON "class_schedules"("userId", "roomId", "dayOfWeek", "startTime", "endTime", "semester");

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
