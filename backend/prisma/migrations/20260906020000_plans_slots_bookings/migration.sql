CREATE TYPE "PlanType" AS ENUM ('DAY_PASS', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'BLOCKED', 'CLOSED');
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('HOLIDAY', 'MAINTENANCE', 'PRIVATE_EVENT', 'TEMPORARY_CLOSURE');
CREATE TYPE "BookingStatus" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECK_IN_AVAILABLE', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'PAYMENT_FAILED', 'REFUNDED');
CREATE TYPE "BookingEventType" AS ENUM ('BOOKING_CREATED', 'BOOKING_EXPIRED', 'BOOKING_CANCELLED', 'STATUS_CHANGED');

CREATE TABLE "gym_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL, "description" TEXT, "type" "PlanType" NOT NULL,
  "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "duration_days" INTEGER NOT NULL, "visit_limit" INTEGER,
  "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "gym_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_plans_positive_price" CHECK ("price_minor" > 0),
  CONSTRAINT "gym_plans_positive_duration" CHECK ("duration_days" > 0),
  CONSTRAINT "gym_plans_supported_currency" CHECK ("currency" = 'INR')
);
CREATE INDEX "gym_plans_gym_id_status_idx" ON "gym_plans"("gym_id", "status");

CREATE TABLE "plan_branches" (
  "plan_id" UUID NOT NULL, "branch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_branches_pkey" PRIMARY KEY ("plan_id", "branch_id")
);
CREATE INDEX "plan_branches_branch_id_idx" ON "plan_branches"("branch_id");

CREATE TABLE "branch_slot_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL,
  "slot_duration_minutes" SMALLINT NOT NULL, "default_capacity" INTEGER NOT NULL,
  "booking_window_days" SMALLINT NOT NULL DEFAULT 30,
  "minimum_advance_minutes" INTEGER NOT NULL DEFAULT 60, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "branch_slot_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "branch_slot_configs_branch_id_key" UNIQUE ("branch_id"),
  CONSTRAINT "branch_slot_configs_duration_range" CHECK ("slot_duration_minutes" BETWEEN 15 AND 180),
  CONSTRAINT "branch_slot_configs_capacity_range" CHECK ("default_capacity" BETWEEN 1 AND 1000),
  CONSTRAINT "branch_slot_configs_window_range" CHECK ("booking_window_days" BETWEEN 1 AND 90),
  CONSTRAINT "branch_slot_configs_advance_range" CHECK ("minimum_advance_minutes" BETWEEN 0 AND 43200)
);

CREATE TABLE "slot_instances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL,
  "start_at" TIMESTAMPTZ(6) NOT NULL, "end_at" TIMESTAMPTZ(6) NOT NULL,
  "capacity" INTEGER NOT NULL, "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "slot_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slot_instances_positive_capacity" CHECK ("capacity" > 0),
  CONSTRAINT "slot_instances_valid_range" CHECK ("end_at" > "start_at")
);
CREATE UNIQUE INDEX "slot_instances_branch_id_start_at_end_at_key" ON "slot_instances"("branch_id", "start_at", "end_at");
CREATE INDEX "slot_instances_branch_id_start_at_status_idx" ON "slot_instances"("branch_id", "start_at", "status");

CREATE TABLE "branch_availability_exceptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL, "date" DATE NOT NULL,
  "type" "AvailabilityExceptionType" NOT NULL, "reason" VARCHAR(500), "is_closed" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "branch_availability_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_availability_exceptions_branch_id_date_key" ON "branch_availability_exceptions"("branch_id", "date");
CREATE INDEX "branch_availability_exceptions_date_idx" ON "branch_availability_exceptions"("date");

CREATE TABLE "bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "gym_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL, "plan_id" UUID NOT NULL, "slot_id" UUID,
  "status" "BookingStatus" NOT NULL DEFAULT 'CREATED', "plan_name" VARCHAR(160) NOT NULL,
  "plan_type" "PlanType" NOT NULL, "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL, "request_fingerprint" CHAR(64) NOT NULL,
  "reservation_expires_at" TIMESTAMPTZ(6), "cancelled_at" TIMESTAMPTZ(6), "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"), CONSTRAINT "bookings_positive_price" CHECK ("price_minor" > 0)
);
CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key" ON "bookings"("user_id", "idempotency_key");
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");
CREATE INDEX "bookings_branch_id_status_created_at_idx" ON "bookings"("branch_id", "status", "created_at");
CREATE INDEX "bookings_gym_id_status_created_at_idx" ON "bookings"("gym_id", "status", "created_at");
CREATE INDEX "bookings_slot_id_status_idx" ON "bookings"("slot_id", "status");
CREATE INDEX "bookings_reservation_expires_at_status_idx" ON "bookings"("reservation_expires_at", "status");

CREATE TABLE "booking_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "booking_id" UUID NOT NULL,
  "type" "BookingEventType" NOT NULL, "from_status" "BookingStatus", "to_status" "BookingStatus" NOT NULL,
  "actor_user_id" UUID, "metadata" JSONB, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");
CREATE INDEX "booking_events_actor_user_id_created_at_idx" ON "booking_events"("actor_user_id", "created_at");

ALTER TABLE "gym_plans" ADD CONSTRAINT "gym_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
ALTER TABLE "plan_branches" ADD CONSTRAINT "plan_branches_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_plans"("id") ON DELETE CASCADE;
ALTER TABLE "plan_branches" ADD CONSTRAINT "plan_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT;
ALTER TABLE "branch_slot_configs" ADD CONSTRAINT "branch_slot_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE;
ALTER TABLE "slot_instances" ADD CONSTRAINT "slot_instances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT;
ALTER TABLE "branch_availability_exceptions" ADD CONSTRAINT "branch_availability_exceptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "gym_plans"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slot_instances"("id") ON DELETE RESTRICT;
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
