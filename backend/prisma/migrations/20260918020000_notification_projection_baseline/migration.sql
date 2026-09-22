-- Existing financial records predate Phase 8; do not send stale notices at cutover.
-- New status changes after this migration are discovered by the projection worker.
INSERT INTO "notification_projections" ("source", "source_id")
SELECT 'payment-status', "id" FROM "payments" WHERE "status" IN ('SUCCESS', 'FAILED')
ON CONFLICT DO NOTHING;

INSERT INTO "notification_projections" ("source", "source_id")
SELECT 'refund-status', "id" FROM "refunds" WHERE "status" = 'SUCCESS'
ON CONFLICT DO NOTHING;

INSERT INTO "notification_projections" ("source", "source_id")
SELECT 'settlement-paid', "id" FROM "settlements" WHERE "status" = 'PAID' AND "paid_at" IS NOT NULL
ON CONFLICT DO NOTHING;
