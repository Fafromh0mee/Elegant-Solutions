import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { isAdminRole } from "@/lib/permissions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-auto bg-gray-50 p-4 pt-16 sm:p-6 md:p-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
