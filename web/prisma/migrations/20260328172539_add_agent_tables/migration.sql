-- CreateTable
CREATE TABLE "agent_machines" (
    "id" TEXT NOT NULL,
    "machineCode" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "roomId" TEXT,
    "apiKey" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "userId" TEXT,
    "activeApp" TEXT,
    "activeTitle" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_blacklist" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_machines_machineCode_key" ON "agent_machines"("machineCode");

-- CreateIndex
CREATE UNIQUE INDEX "agent_machines_apiKey_key" ON "agent_machines"("apiKey");

-- CreateIndex
CREATE INDEX "agent_logs_machineId_createdAt_idx" ON "agent_logs"("machineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_blacklist_pattern_key" ON "agent_blacklist"("pattern");

-- AddForeignKey
ALTER TABLE "agent_machines" ADD CONSTRAINT "agent_machines_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "agent_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
