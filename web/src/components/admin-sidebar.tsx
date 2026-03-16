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
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-(--color-cta)" />
            <span className="font-semibold text-gray-900">Admin Panel</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 hover:bg-gray-100"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-(--color-primary-light) text-(--color-cta)"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
                title={collapsed ? link.label : undefined}
              >
                <link.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{link.label}</span>}
              </Link>
            );
          })}
      </nav>

      {/* User Info */}
      <div className="border-t p-3">
        {!collapsed && session?.user && (
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
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
  );
}
