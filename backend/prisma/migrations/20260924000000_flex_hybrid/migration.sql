ALTER TYPE "AuditAction" ADD VALUE 'FLEX_PLAN_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'FLEX_PARTICIPATION_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'FLEX_SUBSCRIPTION_ADJUSTED';
ALTER TYPE "AuditAction" ADD VALUE 'FLEX_REIMBURSEMENT_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'FLEX_SUBSCRIPTION_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'FLEX_USAGE_RECORDED';
ALTER TYPE "NotificationType" ADD VALUE 'FLEX_USAGE_LIMIT_REACHED';
ALTER TYPE "NotificationType" ADD VALUE 'FLEX_SUBSCRIPTION_EXPIRED';
ALTER TYPE "NotificationCategory" ADD VALUE 'FLEX';
ALTER TYPE "LedgerCategory" ADD VALUE 'FLEX_REIMBURSEMENT';

CREATE TYPE "FlexPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "FlexSubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "FlexUsagePeriodStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "FlexUsageStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED', 'FORFEITED');
CREATE TYPE "FlexPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "BookingSource" AS ENUM ('STANDARD_PLAN', 'FLEX');
CREATE TYPE "EarningSource" AS ENUM ('STANDARD_PAYMENT', 'FLEX_USAGE');

CREATE TABLE "service_cities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "state" VARCHAR(120) NOT NULL,
  "country" CHAR(2) NOT NULL DEFAULT 'IN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_cities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_cities_code_key" UNIQUE ("code"),
  CONSTRAINT "service_cities_name_state_country_key" UNIQUE ("name", "state", "country")
);
CREATE INDEX "service_cities_active_name_idx" ON "service_cities"("active", "name");

ALTER TABLE "users" ADD COLUMN "primary_flex_city_id" UUID;
ALTER TABLE "users" ADD COLUMN "secondary_flex_city_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_primary_flex_city_id_fkey" FOREIGN KEY ("primary_flex_city_id") REFERENCES "service_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_secondary_flex_city_id_fkey" FOREIGN KEY ("secondary_flex_city_id") REFERENCES "service_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_flex_cities_different" CHECK ("secondary_flex_city_id" IS NULL OR "primary_flex_city_id" IS DISTINCT FROM "secondary_flex_city_id");

CREATE TABLE "flex_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL, "code" VARCHAR(80) NOT NULL,
  "description" TEXT, "status" "FlexPlanStatus" NOT NULL DEFAULT 'DRAFT', "price_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'INR', "duration_days" INTEGER NOT NULL, "total_usage_limit" INTEGER NOT NULL,
  "primary_city_limit" INTEGER NOT NULL, "secondary_city_limit" INTEGER NOT NULL, "daily_usage_limit" INTEGER NOT NULL DEFAULT 1,
  "booking_advance_days" INTEGER NOT NULL DEFAULT 14, "eligible_plan_types" "PlanType"[] NOT NULL DEFAULT ARRAY['DAY_PASS']::"PlanType"[],
  "policy_version" VARCHAR(40) NOT NULL DEFAULT 'flex-v1', "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "flex_plans_pkey" PRIMARY KEY ("id"), CONSTRAINT "flex_plans_code_key" UNIQUE ("code"),
  CONSTRAINT "flex_plans_positive_values" CHECK ("price_minor" > 0 AND "duration_days" > 0 AND "total_usage_limit" > 0 AND "primary_city_limit" >= 0 AND "secondary_city_limit" >= 0 AND "daily_usage_limit" > 0 AND "booking_advance_days" >= 0),
  CONSTRAINT "flex_plans_city_limits" CHECK ("primary_city_limit" + "secondary_city_limit" >= "total_usage_limit")
);
CREATE INDEX "flex_plans_status_created_at_idx" ON "flex_plans"("status", "created_at");

CREATE TABLE "flex_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "customer_id" UUID NOT NULL, "flex_plan_id" UUID NOT NULL,
  "status" "FlexSubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT', "primary_city_id" UUID NOT NULL, "secondary_city_id" UUID,
  "idempotency_key" VARCHAR(120) NOT NULL, "plan_name" VARCHAR(160) NOT NULL, "plan_code" VARCHAR(80) NOT NULL,
  "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL, "duration_days" INTEGER NOT NULL, "total_usage_limit" INTEGER NOT NULL,
  "primary_city_limit" INTEGER NOT NULL, "secondary_city_limit" INTEGER NOT NULL, "daily_usage_limit" INTEGER NOT NULL,
  "booking_advance_days" INTEGER NOT NULL, "eligible_plan_types" "PlanType"[] NOT NULL, "policy_version" VARCHAR(40) NOT NULL,
  "started_at" TIMESTAMPTZ(6), "current_period_start" TIMESTAMPTZ(6), "current_period_end" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6), "cancelled_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "flex_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flex_subscriptions_customer_id_idempotency_key_key" UNIQUE ("customer_id", "idempotency_key"),
  CONSTRAINT "flex_subscriptions_cities_different" CHECK ("secondary_city_id" IS NULL OR "primary_city_id" <> "secondary_city_id"),
  CONSTRAINT "flex_subscriptions_positive_snapshot" CHECK ("price_minor" > 0 AND "duration_days" > 0 AND "total_usage_limit" > 0)
);
CREATE UNIQUE INDEX "flex_one_open_subscription_per_customer" ON "flex_subscriptions"("customer_id") WHERE "status" IN ('PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED');
CREATE INDEX "flex_subscriptions_customer_id_status_expires_at_idx" ON "flex_subscriptions"("customer_id", "status", "expires_at");
CREATE INDEX "flex_subscriptions_flex_plan_id_status_idx" ON "flex_subscriptions"("flex_plan_id", "status");
ALTER TABLE "flex_subscriptions" ADD CONSTRAINT "flex_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_subscriptions" ADD CONSTRAINT "flex_subscriptions_flex_plan_id_fkey" FOREIGN KEY ("flex_plan_id") REFERENCES "flex_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_subscriptions" ADD CONSTRAINT "flex_subscriptions_primary_city_id_fkey" FOREIGN KEY ("primary_city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_subscriptions" ADD CONSTRAINT "flex_subscriptions_secondary_city_id_fkey" FOREIGN KEY ("secondary_city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flex_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "subscription_id" UUID NOT NULL, "provider" VARCHAR(30) NOT NULL,
  "provider_order_id" TEXT, "provider_payment_id" TEXT, "amount" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL,
  "status" "FlexPaymentStatus" NOT NULL DEFAULT 'CREATED', "captured_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "flex_payments_pkey" PRIMARY KEY ("id"), CONSTRAINT "flex_payments_subscription_id_key" UNIQUE ("subscription_id"),
  CONSTRAINT "flex_payments_provider_order_id_key" UNIQUE ("provider_order_id"), CONSTRAINT "flex_payments_provider_payment_id_key" UNIQUE ("provider_payment_id"),
  CONSTRAINT "flex_payments_positive_amount" CHECK ("amount" > 0)
);
CREATE INDEX "flex_payments_status_created_at_idx" ON "flex_payments"("status", "created_at");
ALTER TABLE "flex_payments" ADD CONSTRAINT "flex_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "flex_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flex_usage_periods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "subscription_id" UUID NOT NULL, "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL, "total_limit" INTEGER NOT NULL, "primary_city_limit" INTEGER NOT NULL,
  "secondary_city_limit" INTEGER NOT NULL, "status" "FlexUsagePeriodStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "flex_usage_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flex_usage_periods_subscription_id_starts_at_key" UNIQUE ("subscription_id", "starts_at"),
  CONSTRAINT "flex_usage_periods_valid" CHECK ("ends_at" > "starts_at" AND "total_limit" > 0 AND "primary_city_limit" >= 0 AND "secondary_city_limit" >= 0)
);
CREATE INDEX "flex_usage_periods_status_ends_at_idx" ON "flex_usage_periods"("status", "ends_at");
ALTER TABLE "flex_usage_periods" ADD CONSTRAINT "flex_usage_periods_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "flex_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "gym_flex_participations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL, "branch_id" UUID NOT NULL, "service_city_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "allowed_plan_types" "PlanType"[] NOT NULL DEFAULT ARRAY['DAY_PASS']::"PlanType"[],
  "effective_from" TIMESTAMPTZ(6), "effective_to" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_flex_participations_pkey" PRIMARY KEY ("id"), CONSTRAINT "gym_flex_participations_branch_id_key" UNIQUE ("branch_id"),
  CONSTRAINT "gym_flex_participations_dates" CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" > "effective_from")
);
CREATE INDEX "gym_flex_participations_gym_id_enabled_idx" ON "gym_flex_participations"("gym_id", "enabled");
CREATE INDEX "gym_flex_participations_service_city_id_enabled_idx" ON "gym_flex_participations"("service_city_id", "enabled");
ALTER TABLE "gym_flex_participations" ADD CONSTRAINT "gym_flex_participations_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_flex_participations" ADD CONSTRAINT "gym_flex_participations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_flex_participations" ADD CONSTRAINT "gym_flex_participations_service_city_id_fkey" FOREIGN KEY ("service_city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flex_reimbursement_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "participation_id" UUID NOT NULL, "amount_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'INR', "version" VARCHAR(40) NOT NULL, "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6), "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "flex_reimbursement_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flex_reimbursement_rules_participation_id_version_key" UNIQUE ("participation_id", "version"),
  CONSTRAINT "flex_reimbursement_rules_positive" CHECK ("amount_minor" > 0),
  CONSTRAINT "flex_reimbursement_rules_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);
CREATE INDEX "flex_reimbursement_rules_participation_id_active_effective_from_idx" ON "flex_reimbursement_rules"("participation_id", "active", "effective_from");
ALTER TABLE "flex_reimbursement_rules" ADD CONSTRAINT "flex_reimbursement_rules_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "gym_flex_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD COLUMN "source" "BookingSource" NOT NULL DEFAULT 'STANDARD_PLAN';
ALTER TABLE "bookings" ADD COLUMN "flex_subscription_id" UUID;
ALTER TABLE "bookings" ADD COLUMN "flex_usage_period_id" UUID;
ALTER TABLE "bookings" ADD COLUMN "flex_city_id" UUID;
ALTER TABLE "bookings" ADD COLUMN "customer_charge_minor" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "reimbursement_minor" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "reimbursement_currency" CHAR(3);
CREATE INDEX "bookings_flex_subscription_id_status_idx" ON "bookings"("flex_subscription_id", "status");
CREATE INDEX "bookings_flex_usage_period_id_status_idx" ON "bookings"("flex_usage_period_id", "status");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flex_subscription_id_fkey" FOREIGN KEY ("flex_subscription_id") REFERENCES "flex_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flex_usage_period_id_fkey" FOREIGN KEY ("flex_usage_period_id") REFERENCES "flex_usage_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flex_city_id_fkey" FOREIGN KEY ("flex_city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flex_shape" CHECK (("source" = 'STANDARD_PLAN' AND "flex_subscription_id" IS NULL AND "flex_usage_period_id" IS NULL AND "flex_city_id" IS NULL) OR ("source" = 'FLEX' AND "flex_subscription_id" IS NOT NULL AND "flex_usage_period_id" IS NOT NULL AND "flex_city_id" IS NOT NULL AND "customer_charge_minor" = 0 AND "reimbursement_minor" > 0 AND "reimbursement_currency" IS NOT NULL));

CREATE TABLE "flex_usages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "subscription_id" UUID NOT NULL, "period_id" UUID NOT NULL, "booking_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL, "gym_id" UUID NOT NULL, "branch_id" UUID NOT NULL, "service_city_id" UUID NOT NULL,
  "usage_date" DATE NOT NULL, "usage_units" INTEGER NOT NULL DEFAULT 1, "status" "FlexUsageStatus" NOT NULL DEFAULT 'RESERVED',
  "reimbursement_minor" INTEGER NOT NULL, "reimbursement_currency" CHAR(3) NOT NULL, "reimbursement_version" VARCHAR(40) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6), "released_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "flex_usages_pkey" PRIMARY KEY ("id"), CONSTRAINT "flex_usages_booking_id_key" UNIQUE ("booking_id"),
  CONSTRAINT "flex_usages_positive" CHECK ("usage_units" > 0 AND "reimbursement_minor" > 0)
);
CREATE INDEX "flex_usages_subscription_id_period_id_status_idx" ON "flex_usages"("subscription_id", "period_id", "status");
CREATE INDEX "flex_usages_customer_id_usage_date_idx" ON "flex_usages"("customer_id", "usage_date");
CREATE INDEX "flex_usages_gym_id_created_at_idx" ON "flex_usages"("gym_id", "created_at");
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "flex_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "flex_usage_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flex_usages" ADD CONSTRAINT "flex_usages_service_city_id_fkey" FOREIGN KEY ("service_city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gym_earnings" ADD COLUMN "flex_usage_id" UUID;
ALTER TABLE "gym_earnings" ADD COLUMN "source" "EarningSource" NOT NULL DEFAULT 'STANDARD_PAYMENT';
ALTER TABLE "gym_earnings" ADD COLUMN "gym_id" UUID;
ALTER TABLE "gym_earnings" ADD COLUMN "branch_id" UUID;
UPDATE "gym_earnings" e SET "gym_id" = b."gym_id", "branch_id" = b."branch_id" FROM "payments" p JOIN "bookings" b ON b."id" = p."booking_id" WHERE e."payment_id" = p."id";
ALTER TABLE "gym_earnings" ALTER COLUMN "gym_id" SET NOT NULL;
ALTER TABLE "gym_earnings" ALTER COLUMN "payment_id" DROP NOT NULL;
ALTER TABLE "gym_earnings" ADD CONSTRAINT "gym_earnings_flex_usage_id_key" UNIQUE ("flex_usage_id");
ALTER TABLE "gym_earnings" ADD CONSTRAINT "gym_earnings_flex_usage_id_fkey" FOREIGN KEY ("flex_usage_id") REFERENCES "flex_usages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_earnings" ADD CONSTRAINT "gym_earnings_one_source" CHECK (("source" = 'STANDARD_PAYMENT' AND "payment_id" IS NOT NULL AND "flex_usage_id" IS NULL) OR ("source" = 'FLEX_USAGE' AND "payment_id" IS NULL AND "flex_usage_id" IS NOT NULL));
CREATE INDEX "gym_earnings_gym_id_settled_created_at_idx" ON "gym_earnings"("gym_id", "settled", "created_at");
