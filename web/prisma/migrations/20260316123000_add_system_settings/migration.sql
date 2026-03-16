-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default maintenance mode
INSERT INTO "system_settings" ("key", "value", "updatedAt")
VALUES ('MAINTENANCE_MODE', 'false', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
