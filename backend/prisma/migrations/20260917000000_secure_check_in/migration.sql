CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'OTP');
CREATE TYPE "CheckInStatus" AS ENUM ('AVAILABLE', 'VERIFIED', 'COMPLETED', 'EXPIRED');

ALTER TYPE "BookingEventType" ADD VALUE 'CHECK_IN_AVAILABLE';
ALTER TYPE "BookingEventType" ADD VALUE 'QR_TOKEN_ISSUED';
ALTER TYPE "BookingEventType" ADD VALUE 'QR_CHECK_IN_VERIFIED';
ALTER TYPE "BookingEventType" ADD VALUE 'CHECK_IN_OTP_ISSUED';
ALTER TYPE "BookingEventType" ADD VALUE 'OTP_CHECK_IN_VERIFIED';
ALTER TYPE "BookingEventType" ADD VALUE 'BOOKING_COMPLETED';
ALTER TYPE "BookingEventType" ADD VALUE 'BOOKING_NO_SHOW';

CREATE TABLE "check_ins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "gym_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "method" "CheckInMethod",
  "status" "CheckInStatus" NOT NULL DEFAULT 'AVAILABLE',
  "verified_by_user_id" UUID,
  "verified_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "check_in_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "check_in_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "check_in_otp_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "check_in_id" UUID NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "attempts" SMALLINT NOT NULL DEFAULT 0,
  "max_attempts" SMALLINT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "check_ins_booking_id_key" ON "check_ins"("booking_id");
CREATE INDEX "check_ins_branch_id_status_created_at_idx" ON "check_ins"("branch_id", "status", "created_at");
CREATE INDEX "check_ins_customer_id_created_at_idx" ON "check_ins"("customer_id", "created_at");
CREATE UNIQUE INDEX "check_in_tokens_token_hash_key" ON "check_in_tokens"("token_hash");
CREATE INDEX "check_in_tokens_check_in_id_expires_at_idx" ON "check_in_tokens"("check_in_id", "expires_at");
CREATE INDEX "check_in_otp_challenges_check_in_id_created_at_idx" ON "check_in_otp_challenges"("check_in_id", "created_at");
CREATE INDEX "check_in_otp_challenges_expires_at_idx" ON "check_in_otp_challenges"("expires_at");

ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "check_in_tokens" ADD CONSTRAINT "check_in_tokens_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_otp_challenges" ADD CONSTRAINT "check_in_otp_challenges_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
