import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAINTENANCE_KEY = "MAINTENANCE_MODE";

export async function getMaintenanceMode(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: MAINTENANCE_KEY },
    select: { value: true },
  });

  return setting?.value === "true";
}

export async function setMaintenanceMode(value: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: MAINTENANCE_KEY },
    update: { value: value ? "true" : "false" },
    create: { key: MAINTENANCE_KEY, value: value ? "true" : "false" },
  });
}

const ACTIVE_SEMESTER_KEY = "ACTIVE_SEMESTER";

/**
 * The semester whose class schedules are in force. Used by the availability
 * engine to avoid blocking rooms with stale semesters' classes.
 * Returns null when unset, which the engine treats as fail-closed.
 * `db` lets booking creation read it inside its transaction (Feature 7).
 */
export async function getActiveSemester(db: Prisma.TransactionClient = prisma): Promise<string | null> {
  const setting = await db.systemSetting.findUnique({
    where: { key: ACTIVE_SEMESTER_KEY },
    select: { value: true },
  });

  const value = setting?.value?.trim();
  return value ? value : null;
}

export async function setActiveSemester(value: string): Promise<void> {
  const semester = value.trim();

  await prisma.systemSetting.upsert({
    where: { key: ACTIVE_SEMESTER_KEY },
    update: { value: semester },
    create: { key: ACTIVE_SEMESTER_KEY, value: semester },
  });
}
