-- Phase 1 Migration 0012: Post Property Full Parity & Runtime DDL Elimination
-- Reconciles Classification A (new Phase 1 tables/columns/constraints) and
-- Classification B (runtime ensureSchemaUpdates parity objects absent from 0000-0011).
-- Preserves all ON DELETE RESTRICT evidentiary FKs, immutability triggers,
-- exact 0011 site_visits unique index, numeric(12,2) plot_area, and fails closed on duplicates.

-- ============================================================================
-- 0. FAIL-CLOSED PREFLIGHT CHECKS
-- ============================================================================
DO $$
DECLARE
  dup_phone_count integer;
  dup_resale_slug_count integer;
  dup_rental_slug_count integer;
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    SELECT count(*) INTO dup_phone_count
    FROM (
      SELECT '+91' || right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) AS canonical_phone
      FROM customers
      WHERE phone IS NOT NULL AND trim(phone) <> ''
      GROUP BY canonical_phone
      HAVING count(*) > 1
    ) t;

    IF dup_phone_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION 0012 ABORTED: Found % duplicate canonical phone group(s) in customers.', dup_phone_count;
    END IF;
  END IF;

  IF to_regclass('public.resale_listings') IS NOT NULL THEN
    SELECT count(*) INTO dup_resale_slug_count
    FROM (
      SELECT LOWER(BTRIM(slug)) AS norm_slug
      FROM resale_listings
      WHERE slug IS NOT NULL AND BTRIM(slug) <> ''
      GROUP BY norm_slug
      HAVING count(*) > 1
    ) r;

    IF dup_resale_slug_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION 0012 ABORTED: Found % duplicate normalized slug(s) in resale_listings.', dup_resale_slug_count;
    END IF;
  END IF;

  IF to_regclass('public.rental_listings') IS NOT NULL THEN
    SELECT count(*) INTO dup_rental_slug_count
    FROM (
      SELECT LOWER(BTRIM(slug)) AS norm_slug
      FROM rental_listings
      WHERE slug IS NOT NULL AND BTRIM(slug) <> ''
      GROUP BY norm_slug
      HAVING count(*) > 1
    ) l;

    IF dup_rental_slug_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION 0012 ABORTED: Found % duplicate normalized slug(s) in rental_listings.', dup_rental_slug_count;
    END IF;
  END IF;
END $$;

--> statement-breakpoint

-- Ensure PostGIS extension is available for listing spatial indexes
CREATE EXTENSION IF NOT EXISTS postgis;

--> statement-breakpoint

-- ============================================================================
-- 1. CLASSIFICATION B PARITY: CORE TABLES & COLUMNS MISSING FROM 0000-0011
-- ============================================================================

-- staff_users parity
ALTER TABLE IF EXISTS "staff_users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE IF EXISTS "staff_users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE IF EXISTS "staff_users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
CREATE INDEX IF NOT EXISTS "idx_staff_users_email" ON "staff_users" ("email");
CREATE INDEX IF NOT EXISTS "idx_staff_users_role" ON "staff_users" ("role");
CREATE INDEX IF NOT EXISTS "idx_staff_users_enabled" ON "staff_users" ("enabled");

-- projects & project_media parity
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "project_area" text;
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "tower_count" integer;
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "total_units" integer;
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "floors" text;
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "possession" text;
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
ALTER TABLE IF EXISTS "projects" ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);
ALTER TABLE IF EXISTS "project_media" ADD COLUMN IF NOT EXISTS "media_id" text;

-- project_considerations
CREATE TABLE IF NOT EXISTS "project_considerations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "source_type" text DEFAULT 'EDITORIAL' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_project_considerations_project_id" ON "project_considerations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_considerations_section" ON "project_considerations" ("section");
CREATE INDEX IF NOT EXISTS "idx_project_considerations_is_visible" ON "project_considerations" ("is_visible");

-- location_market_snapshots
CREATE TABLE IF NOT EXISTS "location_market_snapshots" (
  "id" text PRIMARY KEY,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "snapshot_date" text NOT NULL,
  "project_count" integer DEFAULT 0 NOT NULL,
  "published_project_count" integer DEFAULT 0 NOT NULL,
  "new_launch_count" integer DEFAULT 0 NOT NULL,
  "under_construction_count" integer DEFAULT 0 NOT NULL,
  "ready_to_move_count" integer DEFAULT 0 NOT NULL,
  "completed_project_count" integer DEFAULT 0 NOT NULL,
  "sold_out_project_count" integer DEFAULT 0 NOT NULL,
  "resale_listing_count" integer DEFAULT 0 NOT NULL,
  "rental_listing_count" integer DEFAULT 0 NOT NULL,
  "configuration_counts" jsonb,
  "price_metrics" jsonb,
  "rera_metrics" jsonb,
  "data_freshness" jsonb,
  "source" text DEFAULT 'GREAT_HOMES_DB' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_snapshots_location" ON "location_market_snapshots" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_snapshots_date" ON "location_market_snapshots" ("snapshot_date");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_snapshots_location_date_unique" ON "location_market_snapshots" ("location_id", "snapshot_date");

-- market_events
CREATE TABLE IF NOT EXISTS "market_events" (
  "id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "previous_value" text,
  "new_value" text,
  "change_fingerprint" text NOT NULL,
  "metadata" jsonb,
  "event_date" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_market_events_location" ON "market_events" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_market_events_type" ON "market_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_market_events_resource" ON "market_events" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "idx_market_events_date" ON "market_events" ("event_date");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_market_events_unique_fingerprint" ON "market_events" ("location_id", "event_type", "resource_id", "change_fingerprint");

-- data_quality_issues
CREATE TABLE IF NOT EXISTS "data_quality_issues" (
  "id" text PRIMARY KEY,
  "severity" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "field" text,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "detected_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_data_quality_severity" ON "data_quality_issues" ("severity");
CREATE INDEX IF NOT EXISTS "idx_data_quality_code" ON "data_quality_issues" ("code");
CREATE INDEX IF NOT EXISTS "idx_data_quality_entity" ON "data_quality_issues" ("entity_type", "entity_id");

-- editorial_articles
CREATE TABLE IF NOT EXISTS "editorial_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "excerpt" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "author_name" text DEFAULT 'Great Homes Editorial Team' NOT NULL,
  "author_role" text DEFAULT 'Editorial Team',
  "published_at" timestamp,
  "featured_image" text,
  "seo_title" text,
  "seo_description" text,
  "canonical_url" text,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "developer_id" uuid REFERENCES "developers"("id") ON DELETE SET NULL,
  "location_id" uuid REFERENCES "locations"("id") ON DELETE SET NULL,
  "reading_time_minutes" integer DEFAULT 5 NOT NULL,
  "content_version" integer DEFAULT 1 NOT NULL,
  "fact_check_status" text DEFAULT 'NOT_REVIEWED' NOT NULL,
  "structured_sections" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_type" ON "editorial_articles" ("type");
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_slug" ON "editorial_articles" ("slug");
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_status" ON "editorial_articles" ("status");
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_project" ON "editorial_articles" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_developer" ON "editorial_articles" ("developer_id");
CREATE INDEX IF NOT EXISTS "idx_editorial_articles_location" ON "editorial_articles" ("location_id");

-- customer_preferences alert columns
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "email_alerts_enabled" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "in_app_alerts_enabled" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "new_launch_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "price_drop_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "project_status_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "rera_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "price_change_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "configuration_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "location_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "resale_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "rental_alerts" boolean DEFAULT true;
ALTER TABLE IF EXISTS "customer_preferences" ADD COLUMN IF NOT EXISTS "marketing_emails_enabled" boolean DEFAULT false;

-- enquiries parity
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "configuration_id" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'NORMAL' NOT NULL;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "assigned_to" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "assigned_to_name" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "source_page" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "internal_notes" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "next_follow_up_at" timestamp;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "site_visit_id" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "metadata" text;
ALTER TABLE IF EXISTS "enquiries" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key" ON "enquiries" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- site_visits parity (preserving exact migration 0011 definition)
CREATE TABLE IF NOT EXISTS "site_visits" (
  "id" text PRIMARY KEY,
  "enquiry_id" text NOT NULL REFERENCES "enquiries"("id") ON DELETE CASCADE,
  "customer_id" text REFERENCES "customers"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "configuration_id" text,
  "listing_id" text,
  "visit_type" text DEFAULT 'IN_PERSON' NOT NULL,
  "preferred_date" text NOT NULL,
  "preferred_time_window" text NOT NULL,
  "status" text DEFAULT 'REQUESTED' NOT NULL,
  "buyer_note" text,
  "staff_note" text,
  "assigned_to" text,
  "assigned_to_name" text,
  "reschedule_reason" text,
  "cancel_reason" text,
  "confirmed_at" timestamp,
  "completed_at" timestamp,
  "cancelled_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_site_visits_enquiry" ON "site_visits" ("enquiry_id");
CREATE INDEX IF NOT EXISTS "idx_site_visits_customer" ON "site_visits" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_site_visits_project" ON "site_visits" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_site_visits_listing" ON "site_visits" ("listing_id");
CREATE INDEX IF NOT EXISTS "idx_site_visits_status" ON "site_visits" ("status");
CREATE INDEX IF NOT EXISTS "idx_site_visits_date" ON "site_visits" ("preferred_date");
CREATE INDEX IF NOT EXISTS "idx_site_visits_created" ON "site_visits" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_site_visits_active_enquiry_slot"
  ON "site_visits" ("enquiry_id", "preferred_date", "preferred_time_window", "visit_type")
  WHERE "status" <> 'CANCELLED';

-- notifications dedup parity for idempotent customer notifications
ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "dedup_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_notifications_customer_dedup_key"
  ON "notifications" ("customer_id", "dedup_key")
  WHERE "dedup_key" IS NOT NULL;

-- media_assets parity
ALTER TABLE IF EXISTS "media_assets" ADD COLUMN IF NOT EXISTS "customer_id" text REFERENCES "customers"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_media_assets_customer" ON "media_assets" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_media_assets_entity_sort" ON "media_assets" ("entity_type", "entity_id", "sort_order", "created_at");

--> statement-breakpoint

-- ============================================================================
-- 2. CUSTOMERS & LISTING PARTNER TABLES (WP1 + STAGE 3)
-- ============================================================================

ALTER TABLE IF EXISTS "customers" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "account_type" text;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_email_unique_non_null"
  ON "customers" (LOWER("email"))
  WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_customers_email_lookup"
  ON "customers" (LOWER("email"));
CREATE INDEX IF NOT EXISTS "idx_customers_account_type"
  ON "customers" ("account_type");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_canonical_phone_unique"
  ON "customers" ((('+91'::text || "right"(regexp_replace(COALESCE("phone", ''::text), '\D'::text, ''::text, 'g'::text), 10))))
  WHERE (("phone" IS NOT NULL) AND (TRIM(BOTH FROM "phone") <> ''::text));

CREATE TABLE IF NOT EXISTS "customer_partner_profiles" (
  "id" text PRIMARY KEY,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT UNIQUE,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "agency_name" text,
  "business_address" text,
  "locality" text,
  "city" text,
  "agency_contact_phone" text,
  "declaration_accepted" boolean DEFAULT false NOT NULL,
  "declaration_text" text,
  "declaration_accepted_at" timestamptz,
  "approved_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "rejection_reason" text,
  "suspension_reason" text,
  "revocation_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "agency_name" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "business_address" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "locality" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "agency_contact_phone" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "declaration_accepted" boolean DEFAULT false NOT NULL;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "declaration_text" text;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "declaration_accepted_at" timestamptz;
ALTER TABLE IF EXISTS "customer_partner_profiles" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
CREATE INDEX IF NOT EXISTS "idx_customer_partner_profiles_status" ON "customer_partner_profiles" ("status");
CREATE INDEX IF NOT EXISTS "idx_customer_partner_profiles_customer" ON "customer_partner_profiles" ("customer_id");

CREATE TABLE IF NOT EXISTS "customer_partner_audit_history" (
  "id" text PRIMARY KEY,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "previous_status" text,
  "new_status" text NOT NULL,
  "acting_staff_user_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_customer_partner_audit_customer" ON "customer_partner_audit_history" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_customer_partner_audit_created" ON "customer_partner_audit_history" ("created_at" DESC);

--> statement-breakpoint

-- ============================================================================
-- 3. RESALE & RENTAL LISTINGS PARITY (PLOT PRECISION, NULLABILITY, SLUGS, GEO)
-- ============================================================================

ALTER TABLE IF EXISTS "resale_listings" ALTER COLUMN "configuration" DROP NOT NULL;
ALTER TABLE IF EXISTS "resale_listings" ALTER COLUMN "bedroom_count" DROP NOT NULL;
ALTER TABLE IF EXISTS "resale_listings" ALTER COLUMN "furnishing" DROP NOT NULL;
ALTER TABLE IF EXISTS "resale_listings" ALTER COLUMN "floor_category" DROP NOT NULL;
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "plot_area" numeric(12, 2);
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "custom_locality_display" text;
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "custom_project_display" text;
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "location_id" uuid REFERENCES "locations"("id");
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);
ALTER TABLE IF EXISTS "resale_listings" ADD COLUMN IF NOT EXISTS "geometry" text;

CREATE INDEX IF NOT EXISTS "idx_resale_listings_location_id" ON "resale_listings" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_resale_listings_lifecycle_verif" ON "resale_listings" ("lifecycle_status", "verification_status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resale_listings_slug_not_null"
  ON "resale_listings" (LOWER(BTRIM("slug")))
  WHERE "slug" IS NOT NULL AND BTRIM("slug") <> '';
CREATE INDEX IF NOT EXISTS "idx_resale_listings_spatial"
  ON "resale_listings" USING gist (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326))
  WHERE ("latitude" IS NOT NULL AND "longitude" IS NOT NULL);

ALTER TABLE IF EXISTS "rental_listings" ALTER COLUMN "configuration" DROP NOT NULL;
ALTER TABLE IF EXISTS "rental_listings" ALTER COLUMN "bedroom_count" DROP NOT NULL;
ALTER TABLE IF EXISTS "rental_listings" ALTER COLUMN "furnishing" DROP NOT NULL;
ALTER TABLE IF EXISTS "rental_listings" ALTER COLUMN "floor_category" DROP NOT NULL;
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "plot_area" numeric(12, 2);
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "custom_locality_display" text;
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "custom_project_display" text;
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "location_id" uuid REFERENCES "locations"("id");
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);
ALTER TABLE IF EXISTS "rental_listings" ADD COLUMN IF NOT EXISTS "geometry" text;

CREATE INDEX IF NOT EXISTS "idx_rental_listings_location_id" ON "rental_listings" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_rental_listings_lifecycle_verif" ON "rental_listings" ("lifecycle_status", "verification_status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rental_listings_slug_not_null"
  ON "rental_listings" (LOWER(BTRIM("slug")))
  WHERE "slug" IS NOT NULL AND BTRIM("slug") <> '';
CREATE INDEX IF NOT EXISTS "idx_rental_listings_spatial"
  ON "rental_listings" USING gist (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326))
  WHERE ("latitude" IS NOT NULL AND "longitude" IS NOT NULL);

--> statement-breakpoint

-- ============================================================================
-- 4. PROPERTY SUBMISSIONS, REVIEWS, ATTESTATIONS, DUPLICATES & CHANGE REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "property_submissions" (
  "id" text PRIMARY KEY,
  "submitter_customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "listing_type" text NOT NULL,
  "listing_source" text NOT NULL,
  "submission_status" text DEFAULT 'DRAFT' NOT NULL,
  "resale_listing_id" text REFERENCES "resale_listings"("id") ON DELETE RESTRICT,
  "rental_listing_id" text REFERENCES "rental_listings"("id") ON DELETE RESTRICT,
  "assigned_reviewer_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "payload" jsonb NOT NULL,
  "original_payload" jsonb,
  "curated_payload" jsonb,
  "review_checklist" jsonb,
  "contact_confirmed" boolean DEFAULT false NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "approved_at" timestamptz,
  "published_at" timestamptz,
  "published_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "deactivated_at" timestamptz,
  "deactivated_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "override_reason" text,
  "override_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "override_at" timestamptz,
  "withdrawn_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_submission_id_customer" UNIQUE ("id", "submitter_customer_id")
);
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "assigned_reviewer_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "original_payload" jsonb;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "curated_payload" jsonb;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "review_checklist" jsonb;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "contact_confirmed" boolean DEFAULT false NOT NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "published_at" timestamptz;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "published_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamptz;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "deactivated_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "override_reason" text;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "override_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE IF EXISTS "property_submissions" ADD COLUMN IF NOT EXISTS "override_at" timestamptz;

CREATE INDEX IF NOT EXISTS "idx_property_submissions_customer" ON "property_submissions" ("submitter_customer_id");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_status" ON "property_submissions" ("submission_status");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_source" ON "property_submissions" ("listing_source");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_resale" ON "property_submissions" ("resale_listing_id");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_rental" ON "property_submissions" ("rental_listing_id");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_assigned_reviewer" ON "property_submissions" ("assigned_reviewer_id");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_submitted_at" ON "property_submissions" ("submitted_at");
CREATE INDEX IF NOT EXISTS "idx_property_submissions_published_at" ON "property_submissions" ("published_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resale_listing_submission" ON "property_submissions" ("resale_listing_id") WHERE "resale_listing_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rental_listing_submission" ON "property_submissions" ("rental_listing_id") WHERE "rental_listing_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "property_submission_reviews" (
  "id" text PRIMARY KEY,
  "submission_id" text NOT NULL REFERENCES "property_submissions"("id") ON DELETE RESTRICT,
  "staff_user_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "previous_status" text,
  "new_status" text NOT NULL,
  "internal_note" text,
  "submitter_feedback" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE IF EXISTS "property_submission_reviews" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
CREATE INDEX IF NOT EXISTS "idx_property_submission_reviews_submission" ON "property_submission_reviews" ("submission_id");
CREATE INDEX IF NOT EXISTS "idx_property_submission_reviews_staff" ON "property_submission_reviews" ("staff_user_id");

CREATE TABLE IF NOT EXISTS "partner_attestations" (
  "id" text PRIMARY KEY,
  "submission_id" text NOT NULL,
  "partner_customer_id" text NOT NULL,
  "attestation_version" text DEFAULT 'v1.0' NOT NULL,
  "declaration_text" text NOT NULL,
  "accepted_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "fk_partner_attestation_ownership"
    FOREIGN KEY ("submission_id", "partner_customer_id")
    REFERENCES "property_submissions" ("id", "submitter_customer_id")
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "idx_partner_attestations_submission" ON "partner_attestations" ("submission_id");
CREATE INDEX IF NOT EXISTS "idx_partner_attestations_partner" ON "partner_attestations" ("partner_customer_id");

CREATE TABLE IF NOT EXISTS "property_submission_duplicate_flags" (
  "id" text PRIMARY KEY,
  "submission_id" text NOT NULL REFERENCES "property_submissions"("id") ON DELETE RESTRICT,
  "matched_entity_type" text NOT NULL,
  "matched_entity_id" text NOT NULL,
  "match_reason" text NOT NULL,
  "confidence_score" integer DEFAULT 0 NOT NULL,
  "signals" jsonb,
  "resolution_status" text DEFAULT 'OPEN' NOT NULL,
  "resolution_note" text,
  "resolved_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_sub_dup_flags_submission" ON "property_submission_duplicate_flags" ("submission_id");
CREATE INDEX IF NOT EXISTS "idx_sub_dup_flags_status" ON "property_submission_duplicate_flags" ("resolution_status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_submission_dup_flag_pair"
  ON "property_submission_duplicate_flags" ("submission_id", "matched_entity_type", "matched_entity_id");

CREATE TABLE IF NOT EXISTS "property_submission_change_requests" (
  "id" text PRIMARY KEY,
  "submission_id" text NOT NULL REFERENCES "property_submissions"("id") ON DELETE RESTRICT,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "request_type" text NOT NULL,
  "reason" text NOT NULL,
  "requested_changes" jsonb,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "staff_response" text,
  "resolved_by_staff_id" text REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_sub_change_req_submission" ON "property_submission_change_requests" ("submission_id");
CREATE INDEX IF NOT EXISTS "idx_sub_change_req_customer" ON "property_submission_change_requests" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_sub_change_req_status" ON "property_submission_change_requests" ("status");

--> statement-breakpoint

-- ============================================================================
-- 5. IMMUTABILITY TRIGGERS ON APPEND-ONLY EVIDENTIARY TABLES
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Updates and deletions are strictly prohibited on append-only table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_attestations_immutable ON "partner_attestations";
CREATE TRIGGER trg_partner_attestations_immutable
BEFORE UPDATE OR DELETE ON "partner_attestations"
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_property_submission_reviews_immutable ON "property_submission_reviews";
CREATE TRIGGER trg_property_submission_reviews_immutable
BEFORE UPDATE OR DELETE ON "property_submission_reviews"
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_customer_partner_audit_immutable ON "customer_partner_audit_history";
CREATE TRIGGER trg_customer_partner_audit_immutable
BEFORE UPDATE OR DELETE ON "customer_partner_audit_history"
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE OR REPLACE FUNCTION prevent_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is strictly prohibited on table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_truncate_attestations ON "partner_attestations";
CREATE TRIGGER trg_prevent_truncate_attestations
BEFORE TRUNCATE ON "partner_attestations"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

DROP TRIGGER IF EXISTS trg_prevent_truncate_reviews ON "property_submission_reviews";
CREATE TRIGGER trg_prevent_truncate_reviews
BEFORE TRUNCATE ON "property_submission_reviews"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

DROP TRIGGER IF EXISTS trg_prevent_truncate_audit ON "customer_partner_audit_history";
CREATE TRIGGER trg_prevent_truncate_audit
BEFORE TRUNCATE ON "customer_partner_audit_history"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
