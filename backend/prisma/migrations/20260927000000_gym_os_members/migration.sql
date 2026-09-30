CREATE TYPE "GymMemberStatus" AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_MEMBER_BULK_IMPORTED';
CREATE SEQUENCE "gym_os_member_code_seq";
CREATE TABLE "gym_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL, "primary_branch_id" UUID, "user_id" UUID,
  "member_code" VARCHAR(32) NOT NULL, "first_name" VARCHAR(100) NOT NULL, "last_name" VARCHAR(100), "phone" VARCHAR(32) NOT NULL,
  "email" VARCHAR(320), "date_of_birth" DATE, "joined_at" DATE, "notes" VARCHAR(2000), "emergency_contact_name" VARCHAR(160),
  "emergency_contact_phone" VARCHAR(32), "address_line_1" VARCHAR(255), "city" VARCHAR(120), "state" VARCHAR(120),
  "postal_code" VARCHAR(20), "country" CHAR(2), "status" "GymMemberStatus" NOT NULL DEFAULT 'ACTIVE', "archived_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID NOT NULL, "updated_by_user_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_members_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gym_members_primary_branch_id_fkey" FOREIGN KEY ("primary_branch_id") REFERENCES "gym_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gym_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gym_members_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gym_members_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gym_members_gym_id_member_code_key" ON "gym_members"("gym_id","member_code");
CREATE UNIQUE INDEX "gym_members_gym_id_phone_key" ON "gym_members"("gym_id","phone");
CREATE INDEX "gym_members_gym_id_status_idx" ON "gym_members"("gym_id","status");
CREATE INDEX "gym_members_gym_id_primary_branch_id_idx" ON "gym_members"("gym_id","primary_branch_id");
CREATE INDEX "gym_members_gym_id_first_name_last_name_idx" ON "gym_members"("gym_id","first_name","last_name");
