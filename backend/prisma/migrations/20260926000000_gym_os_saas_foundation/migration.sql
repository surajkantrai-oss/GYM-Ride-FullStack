CREATE TYPE "GymOsPlanStatus" AS ENUM ('DRAFT','ACTIVE','INACTIVE','ARCHIVED');
CREATE TYPE "GymOsBillingInterval" AS ENUM ('MONTHLY','YEARLY');
CREATE TYPE "GymOsFeature" AS ENUM ('MEMBERS','MEMBERSHIP_MANAGEMENT','ATTENDANCE','RENEWALS','DUES','REPORTS','STAFF','REMINDERS','CRM','MULTI_BRANCH');
CREATE TYPE "GymOsSubscriptionStatus" AS ENUM ('TRIALING','PENDING_PAYMENT','ACTIVE','PAST_DUE','CANCELLED','EXPIRED','SUSPENDED');
CREATE TYPE "GymOsPaymentStatus" AS ENUM ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED');

ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_PLAN_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_SUBSCRIPTION_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_SUBSCRIPTION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_SUBSCRIPTION_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_SUBSCRIPTION_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_TRIAL_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_TRIAL_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_SUBSCRIPTION_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_SUBSCRIPTION_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_SUBSCRIPTION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'GYMOS_SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationCategory" ADD VALUE 'GYMOS';

CREATE TABLE "gym_os_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" VARCHAR(50) NOT NULL, "name" VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL, "status" "GymOsPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "billing_interval" "GymOsBillingInterval" NOT NULL, "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "trial_days" INTEGER NOT NULL DEFAULT 0, "member_limit" INTEGER NOT NULL, "branch_limit" INTEGER NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0, "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_os_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_os_plan_values_check" CHECK (price_minor > 0 AND trial_days >= 0 AND member_limit > 0 AND branch_limit > 0)
);
CREATE UNIQUE INDEX "gym_os_plans_code_key" ON "gym_os_plans"("code");
CREATE INDEX "gym_os_plans_status_display_order_idx" ON "gym_os_plans"("status","display_order");

CREATE TABLE "gym_os_plan_features" (
  "plan_id" UUID NOT NULL, "feature" "GymOsFeature" NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gym_os_plan_features_pkey" PRIMARY KEY ("plan_id","feature"),
  CONSTRAINT "gym_os_plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_os_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "gym_os_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL, "plan_id" UUID NOT NULL,
  "status" "GymOsSubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT', "billing_interval" "GymOsBillingInterval" NOT NULL,
  "current_period_start" TIMESTAMPTZ(6), "current_period_end" TIMESTAMPTZ(6), "trial_start" TIMESTAMPTZ(6), "trial_end" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false, "cancelled_at" TIMESTAMPTZ(6), "activated_at" TIMESTAMPTZ(6), "expired_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6), "suspension_reason" VARCHAR(1000), "provider" VARCHAR(30) NOT NULL,
  "provider_subscription_id" TEXT, "idempotency_key" VARCHAR(120) NOT NULL,
  "plan_code_snapshot" VARCHAR(50) NOT NULL, "plan_name_snapshot" VARCHAR(100) NOT NULL, "price_minor_snapshot" INTEGER NOT NULL,
  "currency_snapshot" CHAR(3) NOT NULL, "member_limit_snapshot" INTEGER NOT NULL, "branch_limit_snapshot" INTEGER NOT NULL,
  "trial_days_snapshot" INTEGER NOT NULL, "features_snapshot" "GymOsFeature"[] NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "gym_os_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_os_subscriptions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gym_os_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_os_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gym_os_snapshot_values_check" CHECK (price_minor_snapshot > 0 AND member_limit_snapshot > 0 AND branch_limit_snapshot > 0 AND trial_days_snapshot >= 0)
);
CREATE UNIQUE INDEX "gym_os_subscriptions_provider_subscription_id_key" ON "gym_os_subscriptions"("provider_subscription_id");
CREATE UNIQUE INDEX "gym_os_subscriptions_idempotency_key_key" ON "gym_os_subscriptions"("idempotency_key");
CREATE INDEX "gym_os_subscriptions_gym_id_status_idx" ON "gym_os_subscriptions"("gym_id","status");
CREATE INDEX "gym_os_subscriptions_status_current_period_end_idx" ON "gym_os_subscriptions"("status","current_period_end");
CREATE UNIQUE INDEX "gym_os_one_open_subscription_per_gym" ON "gym_os_subscriptions"("gym_id") WHERE "status" IN ('TRIALING','PENDING_PAYMENT','ACTIVE','PAST_DUE');

CREATE TABLE "gym_os_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "subscription_id" UUID NOT NULL, "provider" VARCHAR(30) NOT NULL,
  "provider_order_id" TEXT, "provider_payment_id" TEXT, "amount" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL,
  "status" "GymOsPaymentStatus" NOT NULL DEFAULT 'CREATED', "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_os_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_os_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "gym_os_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gym_os_payment_amount_check" CHECK (amount > 0)
);
CREATE UNIQUE INDEX "gym_os_payments_subscription_id_key" ON "gym_os_payments"("subscription_id");
CREATE UNIQUE INDEX "gym_os_payments_provider_order_id_key" ON "gym_os_payments"("provider_order_id");
CREATE UNIQUE INDEX "gym_os_payments_provider_payment_id_key" ON "gym_os_payments"("provider_payment_id");
CREATE INDEX "gym_os_payments_status_created_at_idx" ON "gym_os_payments"("status","created_at");
