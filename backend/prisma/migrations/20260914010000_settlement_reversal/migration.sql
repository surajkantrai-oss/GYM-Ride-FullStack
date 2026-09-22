CREATE TABLE settlement_reversals (
  id UUID PRIMARY KEY,
  settlement_id UUID NOT NULL UNIQUE REFERENCES settlements(id) ON DELETE RESTRICT,
  original_ledger_id UUID NOT NULL UNIQUE REFERENCES financial_ledger_entries(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reason VARCHAR(500) NOT NULL CHECK (length(reason) >= 5),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER reversal_no_mutation BEFORE UPDATE OR DELETE ON settlement_reversals FOR EACH ROW EXECUTE FUNCTION finance_immutable_ledger();
CREATE TRIGGER reversal_no_truncate BEFORE TRUNCATE ON settlement_reversals FOR EACH STATEMENT EXECUTE FUNCTION finance_immutable_ledger();
ALTER TABLE financial_ledger_entries ADD CONSTRAINT ledger_currency_check CHECK (currency = 'INR');
ALTER TABLE gym_earnings ADD CONSTRAINT earning_currency_check CHECK (currency = 'INR' AND net_amount >= 0);

CREATE FUNCTION payment_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.booking_id, NEW.provider, NEW.amount, NEW.currency) IS DISTINCT FROM ROW(OLD.booking_id, OLD.provider, OLD.amount, OLD.currency)
     OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id)
     OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id)
     OR (OLD.captured_at IS NOT NULL AND NEW.captured_at IS DISTINCT FROM OLD.captured_at) THEN
    RAISE EXCEPTION 'Payment snapshot and established provider references are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_snapshot_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payment_snapshot_guard();
