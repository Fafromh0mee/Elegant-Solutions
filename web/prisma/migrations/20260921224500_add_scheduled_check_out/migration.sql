-- Add the optional scheduled checkout time used by access and auto-checkout flows.
ALTER TABLE "sessions"
ADD COLUMN "scheduledCheckOut" TIMESTAMP(3);
