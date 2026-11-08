-- Great Homes V2 Phase 02: Project-Level Pin Precision Migration
-- Adds nullable project-level latitude and longitude columns to projects table

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);

-- Down Migration (reversion script reference):
-- ALTER TABLE "projects" DROP COLUMN IF EXISTS "latitude";
-- ALTER TABLE "projects" DROP COLUMN IF EXISTS "longitude";
