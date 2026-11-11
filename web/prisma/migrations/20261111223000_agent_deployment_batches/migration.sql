-- Expand only: old activation codes and registered machines remain valid.
CREATE TABLE "agent_deployment_batches" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "agent_deployment_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_activation_codes" ADD COLUMN "batchId" TEXT;

CREATE TABLE "agent_activation_throttles" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    CONSTRAINT "agent_activation_throttles_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "agent_deployment_batches_createdAt_idx" ON "agent_deployment_batches"("createdAt");
CREATE INDEX "agent_activation_codes_batchId_idx" ON "agent_activation_codes"("batchId");
ALTER TABLE "agent_deployment_batches" ADD CONSTRAINT "agent_deployment_batches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_deployment_batches" ADD CONSTRAINT "agent_deployment_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_activation_codes" ADD CONSTRAINT "agent_activation_codes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "agent_deployment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
