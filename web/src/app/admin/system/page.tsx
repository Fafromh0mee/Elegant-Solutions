import { getSystemOverviewAction } from "@/actions/system";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SystemClient } from "./system-client";

export default async function AdminSystemPage() {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user.role)) {
    redirect("/admin/dashboard");
  }

  const data = await getSystemOverviewAction();
  if ("error" in data && data.error) {
    redirect("/admin/dashboard");
  }

  return (
    <SystemClient
      initialMaintenanceMode={data.maintenanceMode}
      adminUsers={data.adminUsers}
      auditLogs={data.auditLogs}
    />
  );
}
