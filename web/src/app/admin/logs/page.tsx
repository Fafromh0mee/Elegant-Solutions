import { getLogsAction } from "@/actions/logs";
import { AdminPageHeaderServer } from "@/components/admin-page-header-server";
import { LogsClient } from "./logs-client";

export default async function AdminLogsPage() {
  const { logs } = await getLogsAction({ limit: 500 });

  return (
    <div>
      <AdminPageHeaderServer pathname="/admin/logs" />
      <LogsClient initialLogs={logs} />
    </div>
  );
}
