CREATE TYPE "GymOsMembershipPlanStatus" AS ENUM ('DRAFT','ACTIVE','INACTIVE','ARCHIVED');
CREATE TYPE "GymOsMembershipDurationType" AS ENUM ('DAYS','WEEKS','MONTHS');
CREATE TYPE "GymOsMembershipStatus" AS ENUM ('SCHEDULED','ACTIVE','FROZEN','EXPIRED','CANCELLED');
CREATE TYPE "GymOsMembershipEventType" AS ENUM ('CREATED','ACTIVATED','FROZEN','RESUMED','RENEWED','CANCELLED','EXPIRED','UPDATED');
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_PLAN_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_FROZEN';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_RESUMED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_RENEWED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBERSHIP_EXPIRED';

CREATE TABLE "gym_os_membership_plans" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL, "name" VARCHAR(120) NOT NULL, "code" VARCHAR(50) NOT NULL,
 "description" VARCHAR(1000), "status" "GymOsMembershipPlanStatus" NOT NULL DEFAULT 'DRAFT', "duration_type" "GymOsMembershipDurationType" NOT NULL,
 "duration_value" INTEGER NOT NULL, "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL DEFAULT 'INR', "archived_at" TIMESTAMPTZ(6),
 "created_by_user_id" UUID NOT NULL, "updated_by_user_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "gym_os_membership_plans_pkey" PRIMARY KEY ("id"), CONSTRAINT "gym_os_membership_plan_values" CHECK (duration_value > 0 AND price_minor >= 0),
 CONSTRAINT "gym_os_membership_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gym_os_membership_plans_gym_id_code_key" ON "gym_os_membership_plans"("gym_id","code");
CREATE INDEX "gym_os_membership_plans_gym_id_status_idx" ON "gym_os_membership_plans"("gym_id","status");

CREATE TABLE "gym_os_membership_plan_branches" (
 "plan_id" UUID NOT NULL, "branch_id" UUID NOT NULL, CONSTRAINT "gym_os_membership_plan_branches_pkey" PRIMARY KEY ("plan_id","branch_id"),
 CONSTRAINT "gym_os_membership_plan_branches_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_os_membership_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_plan_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "gym_os_membership_plan_branches_branch_id_idx" ON "gym_os_membership_plan_branches"("branch_id");

CREATE TABLE "gym_os_memberships" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL, "member_id" UUID NOT NULL, "membership_plan_id" UUID NOT NULL,
 "status" "GymOsMembershipStatus" NOT NULL, "start_date" DATE NOT NULL, "end_date" DATE NOT NULL,
 "plan_name_snapshot" VARCHAR(120) NOT NULL, "plan_code_snapshot" VARCHAR(50) NOT NULL,
 "duration_type_snapshot" "GymOsMembershipDurationType" NOT NULL, "duration_value_snapshot" INTEGER NOT NULL,
 "price_minor_snapshot" INTEGER NOT NULL, "currency_snapshot" CHAR(3) NOT NULL, "branch_ids_snapshot" UUID[] NOT NULL,
 "freeze_started_at" TIMESTAMPTZ(6), "total_frozen_days" INTEGER NOT NULL DEFAULT 0, "cancelled_at" TIMESTAMPTZ(6),
 "cancellation_reason" VARCHAR(500), "expired_at" TIMESTAMPTZ(6), "renewed_from_membership_id" UUID,
 "created_by_user_id" UUID NOT NULL, "updated_by_user_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "gym_os_memberships_pkey" PRIMARY KEY ("id"), CONSTRAINT "gym_os_membership_dates" CHECK (end_date >= start_date),
 CONSTRAINT "gym_os_membership_snapshot_values" CHECK (duration_value_snapshot > 0 AND price_minor_snapshot >= 0 AND total_frozen_days >= 0),
 CONSTRAINT "gym_os_memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "gym_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_memberships_membership_plan_id_fkey" FOREIGN KEY ("membership_plan_id") REFERENCES "gym_os_membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_memberships_renewed_from_membership_id_fkey" FOREIGN KEY ("renewed_from_membership_id") REFERENCES "gym_os_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_memberships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_memberships_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gym_os_memberships_renewed_from_membership_id_key" ON "gym_os_memberships"("renewed_from_membership_id");
CREATE UNIQUE INDEX "gym_os_one_live_membership_per_member" ON "gym_os_memberships"("member_id") WHERE status IN ('ACTIVE','FROZEN');
CREATE UNIQUE INDEX "gym_os_one_scheduled_membership_per_member" ON "gym_os_memberships"("member_id") WHERE status = 'SCHEDULED';
CREATE INDEX "gym_os_memberships_gym_id_status_idx" ON "gym_os_memberships"("gym_id","status");
CREATE INDEX "gym_os_memberships_member_id_idx" ON "gym_os_memberships"("member_id");
CREATE INDEX "gym_os_memberships_end_date_idx" ON "gym_os_memberships"("end_date");
CREATE INDEX "gym_os_memberships_start_date_idx" ON "gym_os_memberships"("start_date");
CREATE INDEX "gym_os_memberships_membership_plan_id_idx" ON "gym_os_memberships"("membership_plan_id");

CREATE TABLE "gym_os_membership_events" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "membership_id" UUID NOT NULL, "gym_id" UUID NOT NULL, "member_id" UUID NOT NULL,
 "type" "GymOsMembershipEventType" NOT NULL, "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "performed_by_user_id" UUID, "reason" VARCHAR(500), "metadata" JSONB, CONSTRAINT "gym_os_membership_events_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "gym_os_membership_events_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "gym_os_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_events_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "gym_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "gym_os_membership_events_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "gym_os_membership_events_membership_id_occurred_at_idx" ON "gym_os_membership_events"("membership_id","occurred_at");
CREATE INDEX "gym_os_membership_events_gym_id_occurred_at_idx" ON "gym_os_membership_events"("gym_id","occurred_at");
