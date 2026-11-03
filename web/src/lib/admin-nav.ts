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
  HeartPulse,
  ClipboardCheck,
  LucideIcon,
} from "lucide-react";

export interface AdminNavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: "SUPER_ADMIN";
}

export const adminLinks: AdminNavLink[] = [
  { href: "/admin/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Users },
  { href: "/admin/rooms", label: "จัดการห้อง", icon: DoorOpen },
  { href: "/admin/bookings", label: "คำขอจองห้อง", icon: ClipboardCheck },
  { href: "/admin/calendar", label: "ตารางจองห้อง", icon: CalendarDays },
  { href: "/admin/schedule", label: "นำเข้าตารางเรียน", icon: Upload },
  { href: "/admin/tracking", label: "ติดตามการใช้งาน", icon: Activity },
  { href: "/admin/diagnostics", label: "System Health", icon: HeartPulse },
  {
    href: "/admin/system",
    label: "ควบคุมระบบ",
    icon: SlidersHorizontal,
    requiredRole: "SUPER_ADMIN",
  },
  { href: "/admin/logs", label: "ประวัติการใช้งาน", icon: FileText },
  { href: "/admin/reports", label: "รายงาน", icon: BarChart3 },
  { href: "/admin/analytics", label: "วิเคราะห์ข้อมูล", icon: LineChart },
];

export function getAdminPageInfo(pathname: string) {
  const link = adminLinks.find((l) => l.href === pathname);
  if (!link) return null;
  return {
    label: link.label,
    icon: link.icon,
  };
}
