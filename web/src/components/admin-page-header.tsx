"use client";

import { usePathname } from "next/navigation";
import { adminLinks } from "@/lib/admin-nav";

export function AdminPageHeader() {
  const pathname = usePathname();
  const link = adminLinks.find((l) => l.href === pathname);

  if (!link) return null;

  const Icon = link.icon;

  return (
    <div className="flex items-center gap-3 mb-6">
      <Icon className="h-8 w-8 text-gray-700" />
      <h1 className="text-3xl font-bold text-gray-900">{link.label}</h1>
    </div>
  );
}
