ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "price_on_request" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "project_configurations"
ADD COLUMN IF NOT EXISTS "price_on_request" boolean DEFAULT false NOT NULL;
