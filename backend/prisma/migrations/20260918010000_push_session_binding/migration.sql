ALTER TABLE "push_devices" ADD COLUMN "session_id" UUID;
CREATE INDEX "push_devices_session_id_enabled_idx" ON "push_devices"("session_id", "enabled");
-- Devices registered before session binding must opt in again before receiving push.
UPDATE "push_devices" SET "enabled" = false WHERE "session_id" IS NULL;
