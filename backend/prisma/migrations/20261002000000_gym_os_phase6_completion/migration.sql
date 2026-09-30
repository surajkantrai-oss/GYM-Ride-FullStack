ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_REMINDER_CAMPAIGN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GYMOS_REMINDER_CAMPAIGN_CANCELLED';
CREATE TYPE "GymOsReminderCampaignStatus" AS ENUM ('DRAFT','SCHEDULED','PROCESSING','COMPLETED','CANCELLED','FAILED');
CREATE TYPE "GymOsReminderCampaignSegment" AS ENUM ('EXPIRING_IN_7_DAYS','OVERDUE','NO_VISIT_14_DAYS','NEW_MEMBER_NO_VISIT_7_DAYS');
CREATE TABLE "gym_os_reminder_campaigns"(
  "id" UUID PRIMARY KEY,"gym_id" UUID NOT NULL,"name" VARCHAR(160) NOT NULL,
  "type" "GymOsReminderType" NOT NULL,"channel" "GymOsReminderChannel" NOT NULL,
  "segment" "GymOsReminderCampaignSegment" NOT NULL,"scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "status" "GymOsReminderCampaignStatus" NOT NULL DEFAULT 'SCHEDULED',"created_by_user_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6),"completed_at" TIMESTAMPTZ(6),"cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),"updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "gym_os_reminder_campaigns_gym_id_fkey" FOREIGN KEY("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT
);
CREATE INDEX "gym_os_reminder_campaigns_gym_status_scheduled_idx" ON "gym_os_reminder_campaigns"("gym_id","status","scheduled_for");
ALTER TABLE "gym_os_reminder_deliveries" ADD COLUMN "campaign_id" UUID;
ALTER TABLE "gym_os_reminder_deliveries" ADD CONSTRAINT "gym_os_reminder_deliveries_campaign_id_fkey" FOREIGN KEY("campaign_id") REFERENCES "gym_os_reminder_campaigns"("id") ON DELETE SET NULL;
CREATE INDEX "gym_os_reminder_deliveries_campaign_id_idx" ON "gym_os_reminder_deliveries"("campaign_id");
