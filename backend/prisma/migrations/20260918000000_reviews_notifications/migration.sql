ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_MODERATED';
CREATE INDEX "booking_events_created_at_id_idx" ON "booking_events"("created_at", "id");

CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'BOOKING_CONFIRMED', 'CHECK_IN_AVAILABLE', 'CHECKED_IN', 'BOOKING_COMPLETED', 'BOOKING_NO_SHOW', 'BOOKING_CANCELLED', 'REFUND_COMPLETED', 'REVIEW_AVAILABLE', 'REVIEW_RECEIVED', 'SETTLEMENT_PAID');
CREATE TYPE "NotificationCategory" AS ENUM ('BOOKING', 'PAYMENT', 'CHECK_IN', 'REFUND', 'REVIEW', 'SETTLEMENT', 'MARKETING');
CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "gym_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "rating" SMALLINT NOT NULL,
  "title" VARCHAR(120),
  "comment" VARCHAR(2000),
  "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  "edited_at" TIMESTAMPTZ(6),
  "moderated_at" TIMESTAMPTZ(6),
  "moderated_by_id" UUID,
  "moderation_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");
CREATE INDEX "reviews_gym_id_status_created_at_idx" ON "reviews"("gym_id", "status", "created_at");
CREATE INDEX "reviews_branch_id_status_created_at_idx" ON "reviews"("branch_id", "status", "created_at");
CREATE INDEX "reviews_customer_id_created_at_idx" ON "reviews"("customer_id", "created_at");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "data" JSONB,
  "dedupe_key" VARCHAR(220) NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "push_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "token" VARCHAR(500) NOT NULL,
  "app_version" VARCHAR(50),
  "device_name" VARCHAR(120),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_devices_provider_token_key" ON "push_devices"("provider", "token");
CREATE INDEX "push_devices_user_id_enabled_idx" ON "push_devices"("user_id", "enabled");
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "push_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id", "category")
);
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "push_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_message_id" VARCHAR(160),
  "failure_code" VARCHAR(100),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_deliveries_notification_id_device_id_key" ON "push_deliveries"("notification_id", "device_id");
CREATE INDEX "push_deliveries_status_next_attempt_at_idx" ON "push_deliveries"("status", "next_attempt_at");
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_projection_cursors" (
  "source" VARCHAR(50) NOT NULL,
  "last_created_at" TIMESTAMPTZ(6) NOT NULL,
  "last_id" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notification_projection_cursors_pkey" PRIMARY KEY ("source")
);
-- Existing Phase 1-7 events remain history; Phase 8 notifications begin at migration time.
INSERT INTO "notification_projection_cursors" ("source", "last_created_at", "last_id", "updated_at")
VALUES ('booking-events', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP);
INSERT INTO "notification_projection_cursors" ("source", "last_created_at", "last_id", "updated_at")
VALUES ('payment-status', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP),
       ('refund-status', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP),
       ('settlement-paid', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP);

CREATE TABLE "notification_projections" (
  "source" VARCHAR(50) NOT NULL,
  "source_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_projections_pkey" PRIMARY KEY ("source", "source_id")
);
