DO $$ BEGIN
  CREATE TYPE "public"."configuration_availability_status" AS ENUM (
    'AVAILABLE',
    'LIMITED',
    'ON_REQUEST',
    'SOLD_OUT',
    'NOT_AVAILABLE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_configurations_project_id_id_unique'
      AND conrelid = 'public.project_configurations'::regclass
  ) THEN
    ALTER TABLE "public"."project_configurations"
      ADD CONSTRAINT "project_configurations_project_id_id_unique" UNIQUE ("project_id", "id");
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_configuration_availabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "configuration_id" uuid NOT NULL,
  "availability_status" "public"."configuration_availability_status" DEFAULT 'NOT_AVAILABLE' NOT NULL,
  "available_from" timestamp,
  "last_verified_at" timestamp DEFAULT now() NOT NULL,
  "updated_by_staff_id" text,
  "source" text,
  "internal_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_configuration_availabilities_configuration_id_unique" UNIQUE ("configuration_id"),
  CONSTRAINT "project_configuration_availabilities_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "project_configuration_availabilities_project_config_fk"
    FOREIGN KEY ("project_id", "configuration_id") REFERENCES "public"."project_configurations"("project_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "project_configuration_availabilities_updated_by_staff_id_staff_users_id_fk"
    FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_pca_project_id" ON "project_configuration_availabilities" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pca_status" ON "project_configuration_availabilities" USING btree ("availability_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pca_project_status" ON "project_configuration_availabilities" USING btree ("project_id", "availability_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pca_updated_by" ON "project_configuration_availabilities" USING btree ("updated_by_staff_id");
--> statement-breakpoint

-- Fail-closed initialization for existing configurations: all start as NOT_AVAILABLE
INSERT INTO "project_configuration_availabilities" (
  "project_id",
  "configuration_id",
  "availability_status",
  "source",
  "internal_notes"
)
SELECT
  pc."project_id",
  pc."id",
  'NOT_AVAILABLE'::"public"."configuration_availability_status",
  'MIGRATION_INITIALIZATION',
  'Initialized fail-closed as NOT_AVAILABLE; awaiting authorized staff review.'
FROM "project_configurations" pc
ON CONFLICT ("configuration_id") DO NOTHING;
