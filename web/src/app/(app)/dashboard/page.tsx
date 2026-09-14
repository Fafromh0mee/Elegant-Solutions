import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { isAdminRole } from "@/lib/permissions";
import { autoCheckoutExpiredSessionsAction } from "@/actions/sessions";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) redirect("/login");
  if (isAdminRole(session.user.role)) redirect("/admin/dashboard");

  // Lazy cleanup: auto-checkout sessions whose booking time has expired
  autoCheckoutExpiredSessionsAction().catch(() => {});

  return <DashboardClient user={session.user} />;
}
