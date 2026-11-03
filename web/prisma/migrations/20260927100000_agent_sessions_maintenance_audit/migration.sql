-- Expand-only Agent lifecycle tables. Existing machine/API-key data is preserved.

ALTER TABLE "agent_machines" ADD COLUMN "platform" TEXT;

CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_maintenance_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "agent_maintenance_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_audit_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "machineId" TEXT,
    "userId" TEXT,
    "maintenanceCodeId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_sessions_tokenHash_key" ON "agent_sessions"("tokenHash");
CREATE INDEX "agent_sessions_machineId_status_expiresAt_idx" ON "agent_sessions"("machineId", "status", "expiresAt");
CREATE INDEX "agent_sessions_userId_machineId_status_idx" ON "agent_sessions"("userId", "machineId", "status");
CREATE UNIQUE INDEX "agent_maintenance_codes_codeHash_key" ON "agent_maintenance_codes"("codeHash");
CREATE INDEX "agent_maintenance_codes_machineId_action_expiresAt_idx" ON "agent_maintenance_codes"("machineId", "action", "expiresAt");
CREATE INDEX "agent_audit_events_machineId_createdAt_idx" ON "agent_audit_events"("machineId", "createdAt");
CREATE INDEX "agent_audit_events_event_createdAt_idx" ON "agent_audit_events"("event", "createdAt");

ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "agent_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_maintenance_codes" ADD CONSTRAINT "agent_maintenance_codes_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "agent_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_maintenance_codes" ADD CONSTRAINT "agent_maintenance_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "agent_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_maintenanceCodeId_fkey" FOREIGN KEY ("maintenanceCodeId") REFERENCES "agent_maintenance_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
