import {
  getClassScheduleSummaryAction,
  getScheduleFormOptionsAction,
  listClassSchedulesAction,
} from "@/actions/class-schedules";
import { ScheduleClient } from "./schedule-client";

export default async function AdminSchedulePage() {
  const [summary, formOptions, scheduleList] = await Promise.all([
    getClassScheduleSummaryAction(),
    getScheduleFormOptionsAction(),
    listClassSchedulesAction({ page: 1, pageSize: 10 }),
  ]);

  return (
    <ScheduleClient
      initialSummary={summary}
      students={formOptions.students}
      rooms={formOptions.rooms}
      semesters={formOptions.semesters}
      initialSchedules={scheduleList.schedules}
      initialTotal={scheduleList.total}
    />
  );
}
