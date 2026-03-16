import { Navbar } from "@/components/navbar";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { getMaintenanceMode } from "@/lib/system";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isMaintenanceMode = await getMaintenanceMode();

  if (isMaintenanceMode && session && !isAdminRole(session.user.role)) {
    redirect("/maintenance");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
