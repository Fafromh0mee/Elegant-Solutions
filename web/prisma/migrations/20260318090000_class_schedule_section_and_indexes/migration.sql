-- AlterTable
ALTER TABLE "class_schedules"
ADD COLUMN "section" TEXT;

-- CreateIndex
CREATE INDEX "class_schedules_userId_semester_dayOfWeek_startTime_endTime_idx"
ON "class_schedules"("userId", "semester", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "class_schedules_userId_semester_subjectCode_idx"
ON "class_schedules"("userId", "semester", "subjectCode");
