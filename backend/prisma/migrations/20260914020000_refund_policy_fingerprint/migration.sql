ALTER TABLE refunds ADD COLUMN policy_override BOOLEAN NOT NULL DEFAULT false;
-- Preserve policy overrides already recorded by Phase 5 before this field was introduced.
UPDATE refunds r SET policy_override = true
WHERE EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = r.id AND a.action = 'REFUND_REQUESTED' AND a.metadata->>'override' = 'true');
