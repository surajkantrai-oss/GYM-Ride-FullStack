ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_CHARGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_PAYMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_PAYMENT_REVERSED';
CREATE TYPE "GymOsMemberChargeType" AS ENUM ('MEMBERSHIP','RENEWAL','ADJUSTMENT');
CREATE TYPE "GymOsMemberChargeStatus" AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','VOID');
CREATE TYPE "GymOsMemberPaymentMethod" AS ENUM ('CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','OTHER');
CREATE TYPE "GymOsMemberPaymentStatus" AS ENUM ('RECORDED','REVERSED');

CREATE TABLE "gym_os_member_charges" (
 "id" UUID PRIMARY KEY, "gym_id" UUID NOT NULL, "member_id" UUID NOT NULL,
 "membership_id" UUID NOT NULL UNIQUE, "type" "GymOsMemberChargeType" NOT NULL,
 "description" VARCHAR(255) NOT NULL, "amount_minor" INTEGER NOT NULL,
 "currency" CHAR(3) NOT NULL, "due_date" DATE NOT NULL,
 "status" "GymOsMemberChargeStatus" NOT NULL DEFAULT 'UNPAID',
 "created_by_user_id" UUID NOT NULL, "voided_at" TIMESTAMPTZ(6), "void_reason" VARCHAR(500),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "gym_os_member_charge_amount_check" CHECK ("amount_minor" >= 0)
);
CREATE TABLE "gym_os_member_payments" (
 "id" UUID PRIMARY KEY, "gym_id" UUID NOT NULL, "member_id" UUID NOT NULL,
 "amount_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL,
 "method" "GymOsMemberPaymentMethod" NOT NULL,
 "status" "GymOsMemberPaymentStatus" NOT NULL DEFAULT 'RECORDED',
 "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL', "paid_at" TIMESTAMPTZ(6) NOT NULL,
 "reference" VARCHAR(160), "notes" VARCHAR(1000), "recorded_by_user_id" UUID NOT NULL,
 "idempotency_key" VARCHAR(160) NOT NULL, "reversed_at" TIMESTAMPTZ(6),
 "reversed_by_user_id" UUID, "reversal_reason" VARCHAR(500),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "gym_os_member_payment_amount_check" CHECK ("amount_minor" > 0),
 CONSTRAINT "gym_os_member_payment_reversal_check" CHECK (("status"='RECORDED' AND "reversed_at" IS NULL) OR ("status"='REVERSED' AND "reversed_at" IS NOT NULL))
);
CREATE TABLE "gym_os_payment_allocations" (
 "id" UUID PRIMARY KEY, "payment_id" UUID NOT NULL, "charge_id" UUID NOT NULL,
 "amount_minor" INTEGER NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "gym_os_payment_allocation_amount_check" CHECK ("amount_minor" > 0),
 UNIQUE("payment_id","charge_id")
);
CREATE TABLE "gym_os_member_receipts" (
 "id" UUID PRIMARY KEY, "gym_id" UUID NOT NULL, "payment_id" UUID NOT NULL UNIQUE,
 "receipt_number" VARCHAR(40) NOT NULL, "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("gym_id","receipt_number")
);
CREATE TABLE "gym_os_receipt_counters" (
 "id" UUID PRIMARY KEY, "gym_id" UUID NOT NULL, "year" INTEGER NOT NULL, "value" INTEGER NOT NULL DEFAULT 0,
 UNIQUE("gym_id","year"), CONSTRAINT "gym_os_receipt_counter_check" CHECK ("value" >= 0)
);
CREATE INDEX "gym_os_member_charges_gym_due_idx" ON "gym_os_member_charges"("gym_id","due_date");
CREATE INDEX "gym_os_member_charges_gym_member_idx" ON "gym_os_member_charges"("gym_id","member_id");
CREATE INDEX "gym_os_member_charges_gym_status_idx" ON "gym_os_member_charges"("gym_id","status");
CREATE INDEX "gym_os_member_payments_gym_paid_idx" ON "gym_os_member_payments"("gym_id","paid_at");
CREATE INDEX "gym_os_member_payments_gym_member_idx" ON "gym_os_member_payments"("gym_id","member_id");
CREATE INDEX "gym_os_member_payments_gym_method_idx" ON "gym_os_member_payments"("gym_id","method");
CREATE INDEX "gym_os_member_payments_gym_status_idx" ON "gym_os_member_payments"("gym_id","status");
CREATE UNIQUE INDEX "gym_os_member_payments_idempotency_key" ON "gym_os_member_payments"("gym_id","idempotency_key");
CREATE INDEX "gym_os_payment_allocations_charge_idx" ON "gym_os_payment_allocations"("charge_id");
CREATE INDEX "gym_os_member_receipts_gym_generated_idx" ON "gym_os_member_receipts"("gym_id","generated_at");
ALTER TABLE "gym_os_member_charges" ADD CONSTRAINT "gym_os_member_charges_gym_fkey" FOREIGN KEY("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_charges" ADD CONSTRAINT "gym_os_member_charges_member_fkey" FOREIGN KEY("member_id") REFERENCES "gym_members"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_charges" ADD CONSTRAINT "gym_os_member_charges_membership_fkey" FOREIGN KEY("membership_id") REFERENCES "gym_os_memberships"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_payments" ADD CONSTRAINT "gym_os_member_payments_gym_fkey" FOREIGN KEY("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_payments" ADD CONSTRAINT "gym_os_member_payments_member_fkey" FOREIGN KEY("member_id") REFERENCES "gym_members"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_payment_allocations" ADD CONSTRAINT "gym_os_payment_allocations_payment_fkey" FOREIGN KEY("payment_id") REFERENCES "gym_os_member_payments"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_payment_allocations" ADD CONSTRAINT "gym_os_payment_allocations_charge_fkey" FOREIGN KEY("charge_id") REFERENCES "gym_os_member_charges"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_receipts" ADD CONSTRAINT "gym_os_member_receipts_gym_fkey" FOREIGN KEY("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_member_receipts" ADD CONSTRAINT "gym_os_member_receipts_payment_fkey" FOREIGN KEY("payment_id") REFERENCES "gym_os_member_payments"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_os_receipt_counters" ADD CONSTRAINT "gym_os_receipt_counters_gym_fkey" FOREIGN KEY("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
