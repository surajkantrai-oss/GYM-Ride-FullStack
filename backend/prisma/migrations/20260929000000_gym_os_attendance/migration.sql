ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_ATTENDANCE_CHECKED_IN';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_ATTENDANCE_CHECKED_OUT';
CREATE TYPE "GymOsAttendanceStatus" AS ENUM ('CHECKED_IN', 'CHECKED_OUT');
CREATE TYPE "GymOsAttendanceMethod" AS ENUM ('MANUAL', 'QR');
CREATE TYPE "GymOsAttendanceQrStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "gym_os_attendance_qr_tokens" (
  "id" UUID NOT NULL,
  "gym_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "status" "GymOsAttendanceQrStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gym_os_attendance_qr_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_os_attendance_qr_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "gym_os_attendance_qr_tokens_token_hash_key" ON "gym_os_attendance_qr_tokens"("token_hash");
CREATE INDEX "gym_os_attendance_qr_tokens_branch_id_expires_at_idx" ON "gym_os_attendance_qr_tokens"("branch_id", "expires_at");
CREATE INDEX "gym_os_attendance_qr_tokens_expires_at_idx" ON "gym_os_attendance_qr_tokens"("expires_at");

CREATE TABLE "gym_os_attendances" (
  "id" UUID NOT NULL,
  "gym_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "member_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "status" "GymOsAttendanceStatus" NOT NULL DEFAULT 'CHECKED_IN',
  "check_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "check_out_at" TIMESTAMPTZ(6),
  "check_in_method" "GymOsAttendanceMethod" NOT NULL,
  "check_out_method" "GymOsAttendanceMethod",
  "recorded_by_user_id" UUID,
  "qr_token_id" UUID,
  "manual_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "gym_os_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_os_attendance_time_check" CHECK ("check_out_at" IS NULL OR "check_out_at" >= "check_in_at")
);
CREATE UNIQUE INDEX "gym_os_attendances_one_open_member" ON "gym_os_attendances"("member_id") WHERE "check_out_at" IS NULL;
CREATE INDEX "gym_os_attendances_gym_id_check_in_at_idx" ON "gym_os_attendances"("gym_id", "check_in_at");
CREATE INDEX "gym_os_attendances_branch_id_check_in_at_idx" ON "gym_os_attendances"("branch_id", "check_in_at");
CREATE INDEX "gym_os_attendances_member_id_check_in_at_idx" ON "gym_os_attendances"("member_id", "check_in_at");
CREATE INDEX "gym_os_attendances_membership_id_idx" ON "gym_os_attendances"("membership_id");
CREATE INDEX "gym_os_attendances_check_out_at_idx" ON "gym_os_attendances"("check_out_at");

ALTER TABLE "gym_os_attendance_qr_tokens" ADD CONSTRAINT "gym_os_attendance_qr_tokens_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendance_qr_tokens" ADD CONSTRAINT "gym_os_attendance_qr_tokens_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "gym_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "gym_os_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gym_os_attendances" ADD CONSTRAINT "gym_os_attendances_qr_token_id_fkey" FOREIGN KEY ("qr_token_id") REFERENCES "gym_os_attendance_qr_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
