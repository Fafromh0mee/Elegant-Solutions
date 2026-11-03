-- Expand-only provisioning support. Existing AgentMachine records and codes are unchanged.

CREATE TABLE "agent_machine_sequences" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "lastIssuedNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_machine_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_activation_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reservedMachineCode" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "agent_activation_codes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_audit_events" ADD COLUMN "activationCodeId" TEXT;

CREATE UNIQUE INDEX "agent_machine_sequences_roomId_key" ON "agent_machine_sequences"("roomId");
CREATE UNIQUE INDEX "agent_activation_codes_codeHash_key" ON "agent_activation_codes"("codeHash");
CREATE UNIQUE INDEX "agent_activation_codes_reservedMachineCode_key" ON "agent_activation_codes"("reservedMachineCode");
CREATE INDEX "agent_activation_codes_roomId_expiresAt_idx" ON "agent_activation_codes"("roomId", "expiresAt");

ALTER TABLE "agent_machine_sequences" ADD CONSTRAINT "agent_machine_sequences_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_activation_codes" ADD CONSTRAINT "agent_activation_codes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_activation_codes" ADD CONSTRAINT "agent_activation_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_activationCodeId_fkey" FOREIGN KEY ("activationCodeId") REFERENCES "agent_activation_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
