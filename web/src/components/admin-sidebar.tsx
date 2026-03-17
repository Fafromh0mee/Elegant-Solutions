"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  FileText,
  BarChart3,
  CalendarDays,
  Upload,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Users },
  { href: "/admin/rooms", label: "จัดการห้อง", icon: DoorOpen },
  { href: "/admin/calendar", label: "ตารางจองห้อง", icon: CalendarDays },
  { href: "/admin/schedule", label: "นำเข้าตารางเรียน", icon: Upload },
  { href: "/admin/tracking", label: "Tracking Agent", icon: Activity },
  { href: "/admin/system", label: "System Control", icon: SlidersHorizontal },
  { href: "/admin/logs", label: "ประวัติการใช้งาน", icon: FileText },
  { href: "/admin/reports", label: "รายงาน", icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-white/95 px-3 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg border bg-white p-2 text-gray-700 shadow-sm"
          aria-label="Open admin menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-gray-900">Admin Panel</p>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close admin menu overlay"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[88vw] max-w-[320px] flex-col border-r bg-white shadow-xl transition-transform duration-300 ease-out md:static md:z-auto md:h-full md:max-w-none md:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          desktopCollapsed ? "md:w-16" : "md:w-64",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 md:h-16">
          {(!desktopCollapsed || mobileOpen) && (
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-(--color-cta)" />
              <span className="font-semibold text-gray-900">Admin Panel</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDesktopCollapsed(!desktopCollapsed)}
              className="hidden rounded-lg p-1.5 hover:bg-gray-100 md:block"
              aria-label="Toggle desktop sidebar"
            >
              {desktopCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 hover:bg-gray-100 md:hidden"
              aria-label="Close admin menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {adminLinks
            .filter((link) => {
              if (link.href !== "/admin/system") return true;
              return session?.user?.role === "SUPER_ADMIN";
            })
            .map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-(--color-primary-light) text-(--color-cta)"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                  title={desktopCollapsed ? link.label : undefined}
                >
                  <link.icon className="h-5 w-5 shrink-0" />
                  <span className={cn(desktopCollapsed ? "md:hidden" : "")}>
                    {link.label}
                  </span>
                </Link>
              );
            })}
        </nav>

        <div className="border-t p-3">
          {(!desktopCollapsed || mobileOpen) && session?.user && (
            <div className="mb-2 px-3">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session.user.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session.user.email}
              </p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50",
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={cn(desktopCollapsed ? "md:hidden" : "")}>
              ออกจากระบบ
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
