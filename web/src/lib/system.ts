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
