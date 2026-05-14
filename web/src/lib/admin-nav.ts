import {
  LayoutDashboard,
  Users,
  DoorOpen,
  FileText,
  BarChart3,
  CalendarDays,
  Upload,
  Activity,
  SlidersHorizontal,
  LineChart,
  LucideIcon,
} from "lucide-react";

export interface AdminNavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: "SUPER_ADMIN";
}

export const adminLinks: AdminNavLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Users },
  { href: "/admin/rooms", label: "จัดการห้อง", icon: DoorOpen },
  { href: "/admin/calendar", label: "ตารางจองห้อง", icon: CalendarDays },
  { href: "/admin/schedule", label: "นำเข้าตารางเรียน", icon: Upload },
  { href: "/admin/tracking", label: "Tracking Agent", icon: Activity },
  {
    href: "/admin/system",
    label: "System Control",
    icon: SlidersHorizontal,
    requiredRole: "SUPER_ADMIN",
  },
  { href: "/admin/logs", label: "ประวัติการใช้งาน", icon: FileText },
  { href: "/admin/reports", label: "รายงาน", icon: BarChart3 },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart },
];

export function getAdminPageInfo(pathname: string) {
  const link = adminLinks.find((l) => l.href === pathname);
  if (!link) return null;
  return {
    label: link.label,
    icon: link.icon,
  };
}
