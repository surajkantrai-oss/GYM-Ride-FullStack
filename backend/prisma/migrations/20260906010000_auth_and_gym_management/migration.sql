ALTER TABLE "users" ALTER COLUMN "first_name" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" DROP NOT NULL;
ALTER TABLE "gyms" ADD COLUMN "status_reason" VARCHAR(1000),
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6), ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);

CREATE TYPE "GymMembershipRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AuditAction" AS ENUM ('GYM_SUBMITTED', 'GYM_APPROVED', 'GYM_REJECTED', 'GYM_SUSPENDED', 'GYM_REACTIVATED', 'ROLE_CHANGED');

CREATE TABLE "refresh_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6), "device_name" VARCHAR(120), "user_agent" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "refresh_sessions_user_id_revoked_at_idx" ON "refresh_sessions"("user_id", "revoked_at");
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

CREATE TABLE "gym_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "gym_id" UUID NOT NULL,
  "branch_id" UUID, "role" "GymMembershipRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gym_memberships_user_id_gym_id_branch_id_role_key" ON "gym_memberships"("user_id", "gym_id", "branch_id", "role");
CREATE UNIQUE INDEX "gym_memberships_gym_scope_key" ON "gym_memberships"("user_id", "gym_id", "role") WHERE "branch_id" IS NULL;
CREATE INDEX "gym_memberships_gym_id_status_idx" ON "gym_memberships"("gym_id", "status");
CREATE INDEX "gym_memberships_branch_id_status_idx" ON "gym_memberships"("branch_id", "status");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_user_id" UUID NOT NULL,
  "action" "AuditAction" NOT NULL, "entity_type" VARCHAR(80) NOT NULL, "entity_id" UUID NOT NULL,
  "metadata" JSONB, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
