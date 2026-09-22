CREATE EXTENSION IF NOT EXISTS "postgis";

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'PENDING');
CREATE TYPE "RoleName" AS ENUM ('CUSTOMER', 'GYM_OWNER', 'GYM_MANAGER', 'GYM_STAFF', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "GymStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "BranchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "first_name" VARCHAR(100) NOT NULL,
  "last_name" VARCHAR(100) NOT NULL, "email" VARCHAR(320), "phone" VARCHAR(32),
  "password_hash" VARCHAR(255), "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_identity_check" CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" "RoleName" NOT NULL,
  "description" VARCHAR(255), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

CREATE TABLE "user_roles" (
  "user_id" UUID NOT NULL, "role_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

CREATE TABLE "gyms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL,
  "description" TEXT, "owner_id" UUID NOT NULL,
  "status" "GymStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gyms_owner_id_idx" ON "gyms"("owner_id");
CREATE INDEX "gyms_status_idx" ON "gyms"("status");

CREATE TABLE "gym_branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "gym_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL, "address" VARCHAR(255) NOT NULL,
  "city" VARCHAR(120) NOT NULL, "state" VARCHAR(120) NOT NULL,
  "postal_code" VARCHAR(20) NOT NULL, "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
  "latitude" DECIMAL(9,6) NOT NULL, "longitude" DECIMAL(9,6) NOT NULL,
  "location" geography(Point, 4326), "phone" VARCHAR(32), "email" VARCHAR(320),
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  "status" "BranchStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "gym_branches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_branches_latitude_check" CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT "gym_branches_longitude_check" CHECK (longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "gym_branches_gym_id_name_key" ON "gym_branches"("gym_id", "name");
CREATE INDEX "gym_branches_gym_id_idx" ON "gym_branches"("gym_id");
CREATE INDEX "gym_branches_city_status_idx" ON "gym_branches"("city", "status");
CREATE INDEX "gym_branches_location_gist_idx" ON "gym_branches" USING GIST ("location");

CREATE OR REPLACE FUNCTION gym_branch_set_location() RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER gym_branches_location_sync BEFORE INSERT OR UPDATE OF latitude, longitude ON "gym_branches"
FOR EACH ROW EXECUTE FUNCTION gym_branch_set_location();

CREATE TABLE "amenities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL, "description" VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "amenities_slug_key" ON "amenities"("slug");
CREATE UNIQUE INDEX "amenities_name_key" ON "amenities"("name");

CREATE TABLE "branch_amenities" (
  "branch_id" UUID NOT NULL, "amenity_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branch_amenities_pkey" PRIMARY KEY ("branch_id", "amenity_id")
);
CREATE INDEX "branch_amenities_amenity_id_idx" ON "branch_amenities"("amenity_id");

CREATE TABLE "operating_hours" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL,
  "weekday" "Weekday" NOT NULL, "period" SMALLINT NOT NULL DEFAULT 1,
  "opens_at" TIME(0), "closes_at" TIME(0), "is_closed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "operating_hours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operating_hours_period_check" CHECK (period > 0),
  CONSTRAINT "operating_hours_time_check" CHECK (
    (is_closed AND opens_at IS NULL AND closes_at IS NULL) OR
    (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
  )
);
CREATE UNIQUE INDEX "operating_hours_branch_id_weekday_period_key" ON "operating_hours"("branch_id", "weekday", "period");
CREATE INDEX "operating_hours_branch_id_weekday_idx" ON "operating_hours"("branch_id", "weekday");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "gym_branches" ADD CONSTRAINT "gym_branches_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE;
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE;
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE;
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "gym_branches"("id") ON DELETE CASCADE;
