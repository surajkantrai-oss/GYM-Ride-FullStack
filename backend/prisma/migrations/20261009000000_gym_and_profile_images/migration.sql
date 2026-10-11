CREATE TYPE "GymImageKind" AS ENUM ('COVER', 'GALLERY');

ALTER TABLE "users"
  ADD COLUMN "profile_photo_data" BYTEA,
  ADD COLUMN "profile_photo_mime_type" VARCHAR(80),
  ADD COLUMN "profile_photo_updated_at" TIMESTAMPTZ(6);

CREATE TABLE "gym_images" (
  "id" UUID NOT NULL,
  "gym_id" UUID NOT NULL,
  "kind" "GymImageKind" NOT NULL DEFAULT 'GALLERY',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "mime_type" VARCHAR(80) NOT NULL,
  "data" BYTEA NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "gym_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gym_images_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "gym_images_gym_id_kind_sort_order_idx"
  ON "gym_images"("gym_id", "kind", "sort_order");
