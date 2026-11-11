-- Great Homes Phase 4H.2 migration
-- Updates project_media.configuration_id foreign-key constraint to ON DELETE SET NULL
-- Preserves all project_media records when a parent project_configurations row is deleted.

ALTER TABLE IF EXISTS "project_media"
  DROP CONSTRAINT IF EXISTS "project_media_configuration_id_project_configurations_id_fk";--> statement-breakpoint

ALTER TABLE "project_media"
  ADD CONSTRAINT "project_media_configuration_id_project_configurations_id_fk"
  FOREIGN KEY ("configuration_id")
  REFERENCES "public"."project_configurations"("id")
  ON DELETE set null
  ON UPDATE no action;
