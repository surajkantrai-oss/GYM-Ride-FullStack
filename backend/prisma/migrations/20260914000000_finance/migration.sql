CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');

CREATE TYPE "RefundStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');

CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'READY', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');

CREATE TYPE "LedgerCategory" AS ENUM ('CUSTOMER_PAYMENT', 'PLATFORM_COMMISSION', 'GYM_EARNING', 'REFUND', 'REFUND_REVERSAL', 'SETTLEMENT', 'SETTLEMENT_REVERSAL', 'MANUAL_ADJUSTMENT');

ALTER TYPE "AuditAction" ADD VALUE 'REFUND_REQUESTED';

ALTER TYPE "AuditAction" ADD VALUE 'SETTLEMENT_GENERATED';

ALTER TYPE "AuditAction" ADD VALUE 'SETTLEMENT_PROCESSING';

ALTER TYPE "AuditAction" ADD VALUE 'SETTLEMENT_PAID';

ALTER TYPE "AuditAction" ADD VALUE 'RECONCILIATION_RUN';

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "operation_key" TEXT NOT NULL,
    "operation" VARCHAR(40) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "provider_event_id" VARCHAR(160) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "reference" TEXT,
    "processing_status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "requested_by" UUID NOT NULL,
    "provider_refund_id" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gym_earnings" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "commission_amount" INTEGER NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "commission_version" TEXT NOT NULL,
    "refund_amount" INTEGER NOT NULL DEFAULT 0,
    "commission_reversed" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_earnings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_ledger_entries" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_type" VARCHAR(40) NOT NULL,
    "gym_id" UUID NOT NULL,
    "branch_id" UUID,
    "category" "LedgerCategory" NOT NULL,
    "account" VARCHAR(40) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "commission_amount" INTEGER NOT NULL,
    "refund_amount" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "provider_reference" TEXT,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlement_items" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "earning_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_booking_id_key" ON "payments"("booking_id");

CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");

CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

CREATE UNIQUE INDEX "payment_attempts_operation_key_key" ON "payment_attempts"("operation_key");

CREATE INDEX "payment_webhook_events_processing_status_received_at_idx" ON "payment_webhook_events"("processing_status", "received_at");

CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

CREATE UNIQUE INDEX "gym_earnings_payment_id_key" ON "gym_earnings"("payment_id");

CREATE INDEX "financial_ledger_entries_gym_id_created_at_idx" ON "financial_ledger_entries"("gym_id", "created_at");

CREATE UNIQUE INDEX "financial_ledger_entries_source_id_category_account_key" ON "financial_ledger_entries"("source_id", "category", "account");

CREATE UNIQUE INDEX "settlements_idempotency_key_key" ON "settlements"("idempotency_key");

CREATE UNIQUE INDEX "settlements_provider_reference_key" ON "settlements"("provider_reference");

CREATE INDEX "settlements_gym_id_status_generated_at_idx" ON "settlements"("gym_id", "status", "generated_at");

CREATE UNIQUE INDEX "settlement_items_earning_id_key" ON "settlement_items"("earning_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gym_earnings" ADD CONSTRAINT "gym_earnings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "gym_earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE payments ADD CONSTRAINT payment_money_check CHECK (amount > 0 AND refunded_amount BETWEEN 0 AND amount AND currency = 'INR');
ALTER TABLE refunds ADD CONSTRAINT refund_money_check CHECK (amount > 0);
ALTER TABLE gym_earnings ADD CONSTRAINT earning_money_check CHECK (gross_amount > 0 AND commission_amount BETWEEN 0 AND gross_amount AND commission_bps BETWEEN 0 AND 10000 AND refund_amount BETWEEN 0 AND gross_amount AND commission_reversed BETWEEN 0 AND commission_amount AND net_amount = gross_amount - commission_amount - refund_amount + commission_reversed);
ALTER TABLE settlements ADD CONSTRAINT settlement_money_check CHECK (net_amount > 0 AND net_amount = gross_amount - commission_amount - refund_amount AND period_end > period_start AND currency = 'INR');
ALTER TABLE settlement_items ADD CONSTRAINT settlement_item_money_check CHECK (amount > 0);
ALTER TABLE settlements ADD CONSTRAINT settlement_gym_fk FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE RESTRICT;
ALTER TABLE financial_ledger_entries ADD CONSTRAINT ledger_gym_fk FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE RESTRICT;
ALTER TABLE financial_ledger_entries ADD CONSTRAINT ledger_branch_fk FOREIGN KEY (branch_id) REFERENCES gym_branches(id) ON DELETE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refund_actor_fk FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT;

CREATE FUNCTION finance_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial ledger is append-only; append a compensating entry';
END;
$$;
CREATE TRIGGER ledger_no_mutation BEFORE UPDATE OR DELETE ON financial_ledger_entries FOR EACH ROW EXECUTE FUNCTION finance_immutable_ledger();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON financial_ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION finance_immutable_ledger();
CREATE TRIGGER settlement_items_no_mutation BEFORE UPDATE OR DELETE ON settlement_items FOR EACH ROW EXECUTE FUNCTION finance_immutable_ledger();

CREATE FUNCTION finance_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.payment_id, NEW.gross_amount, NEW.tax_amount, NEW.discount_amount, NEW.commission_amount, NEW.commission_bps, NEW.commission_version, NEW.currency)
     IS DISTINCT FROM ROW(OLD.payment_id, OLD.gross_amount, OLD.tax_amount, OLD.discount_amount, OLD.commission_amount, OLD.commission_bps, OLD.commission_version, OLD.currency) THEN
    RAISE EXCEPTION 'Financial capture snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER earning_snapshot_immutable BEFORE UPDATE ON gym_earnings FOR EACH ROW EXECUTE FUNCTION finance_snapshot_guard();

