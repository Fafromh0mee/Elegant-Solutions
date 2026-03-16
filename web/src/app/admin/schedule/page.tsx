import { getClassScheduleSummaryAction } from "@/actions/class-schedules";
import { ScheduleClient } from "./schedule-client";

export default async function AdminSchedulePage() {
  const summary = await getClassScheduleSummaryAction();

  return <ScheduleClient initialSummary={summary} />;
}
