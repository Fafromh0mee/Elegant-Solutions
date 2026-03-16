"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/permissions";
import { getMaintenanceMode, setMaintenanceMode } from "@/lib/system";
import { revalidatePath } from "next/cache";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
};

type AuditLogRow = {
  id: string;
  action: string;
  details: string | null;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
};

export async function getSystemOverviewAction() {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user.role)) {
    return {
      error: "ไม่มีสิทธิ์ดำเนินการ",
      maintenanceMode: false,
      adminUsers: [],
      auditLogs: [],
    };
  }

  const [maintenanceMode, adminUsersRaw, auditLogsRaw] = await Promise.all([
    getMaintenanceMode(),
    prisma.$queryRaw<AdminUserRow[]>`
      SELECT id, name, email, role::text as role, status::text as status, "createdAt"
      FROM users
      WHERE role::text IN ('ADMIN', 'SUPER_ADMIN')
      ORDER BY "createdAt" DESC
    `,
    prisma.$queryRaw<AuditLogRow[]>`
      SELECT
        l.id,
        l.action::text as action,
        l.details,
        l."createdAt",
        u.name as "userName",
        u.email as "userEmail",
        u.role::text as "userRole"
      FROM logs l
      LEFT JOIN users u ON u.id = l."userId"
      WHERE l.action::text IN ('USER_CREATED', 'USER_UPDATED', 'USER_APPROVED', 'USER_REJECTED')
         OR l.details ILIKE '%System maintenance%'
      ORDER BY l."createdAt" DESC
      LIMIT 100
    `,
  ]);

  const adminUsers = adminUsersRaw.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  }));

  const auditLogs = auditLogsRaw.map((row) => ({
    id: row.id,
    action: row.action,
    details: row.details,
    createdAt: row.createdAt,
    user: row.userName || row.userEmail || row.userRole
      ? {
          name: row.userName ?? "-",
          email: row.userEmail ?? "-",
          role: row.userRole ?? "-",
        }
      : null,
  }));

  return { maintenanceMode, adminUsers, auditLogs };
}

export async function setMaintenanceModeAction(nextMode: boolean) {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user.role)) {
    return { error: "ไม่มีสิทธิ์ดำเนินการ" };
  }

  try {
    await setMaintenanceMode(nextMode);
    await prisma.log.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATED",
        details: `System maintenance ${nextMode ? "enabled" : "disabled"}`,
      },
    });

    revalidatePath("/admin/system");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Set maintenance mode error:", error);
    return { error: "เกิดข้อผิดพลาด" };
  }
}
