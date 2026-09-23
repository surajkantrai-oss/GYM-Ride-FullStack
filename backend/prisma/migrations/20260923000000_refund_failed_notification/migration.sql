ALTER TYPE "NotificationType" ADD VALUE 'REFUND_FAILED';

-- Phase 8 was introduced into an existing application. Failed refunds that predate
-- this notification type are baselined so a deployment does not send stale alerts.
INSERT INTO "notification_projections" ("source", "source_id")
SELECT 'refund-failed', "id"
FROM "refunds"
WHERE "status" = 'FAILED'
ON CONFLICT ("source", "source_id") DO NOTHING;
