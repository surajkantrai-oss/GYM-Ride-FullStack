CREATE TABLE "customer_gym_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "preferred_amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferred_plan_type" "PlanType",
  "preferred_workout_hour" SMALLINT,
  "preferred_radius_km" SMALLINT NOT NULL DEFAULT 10,
  "preferred_budget_min_minor" INTEGER,
  "preferred_budget_max_minor" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "customer_gym_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_gym_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_gym_preferences_workout_hour_check" CHECK ("preferred_workout_hour" IS NULL OR "preferred_workout_hour" BETWEEN 0 AND 23),
  CONSTRAINT "customer_gym_preferences_radius_check" CHECK ("preferred_radius_km" BETWEEN 1 AND 50),
  CONSTRAINT "customer_gym_preferences_budget_check" CHECK (
    ("preferred_budget_min_minor" IS NULL OR "preferred_budget_min_minor" >= 0)
    AND ("preferred_budget_max_minor" IS NULL OR "preferred_budget_max_minor" >= 0)
    AND ("preferred_budget_min_minor" IS NULL OR "preferred_budget_max_minor" IS NULL OR "preferred_budget_min_minor" <= "preferred_budget_max_minor")
  )
);

CREATE UNIQUE INDEX "customer_gym_preferences_user_id_key" ON "customer_gym_preferences"("user_id");
CREATE INDEX "reviews_gym_status_created_at_idx" ON "reviews"("gym_id", "status", "created_at");
