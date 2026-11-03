-- Additive Agent diagnostics metadata. Existing machines remain valid and
-- continue heartbeating with a NULL version until upgraded.
ALTER TABLE "agent_machines" ADD COLUMN "agentVersion" TEXT;
