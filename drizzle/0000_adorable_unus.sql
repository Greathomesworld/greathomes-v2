CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'DISABLED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."developer_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('STATE', 'DISTRICT', 'CITY', 'DISCOVERY_REGION', 'AREA', 'NEIGHBOURHOOD');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA');--> statement-breakpoint
CREATE TYPE "public"."project_lifecycle_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('UPCOMING', 'NEW_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE', 'COMPLETED', 'SOLD_OUT');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('APARTMENT', 'FLAT', 'VILLA', 'INDEPENDENT_HOUSE', 'PLOT', 'DUPLEX', 'PENTHOUSE');--> statement-breakpoint
CREATE TYPE "public"."rera_status" AS ENUM('NOT_PROVIDED', 'PROVIDED', 'VERIFIED');--> statement-breakpoint
CREATE TABLE "alert_delivery_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"icon" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "amenities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_staff_id" text,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"resource_label" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"preferred_mode" text DEFAULT 'ALL',
	"preferred_locations" jsonb,
	"preferred_bhk" jsonb,
	"preferred_property_types" jsonb,
	"budget_min" integer,
	"budget_max" integer,
	"email_alerts_enabled" boolean DEFAULT true,
	"in_app_alerts_enabled" boolean DEFAULT true,
	"new_launch_alerts" boolean DEFAULT true,
	"price_drop_alerts" boolean DEFAULT true,
	"project_status_alerts" boolean DEFAULT true,
	"rera_alerts" boolean DEFAULT true,
	"price_change_alerts" boolean DEFAULT true,
	"configuration_alerts" boolean DEFAULT true,
	"location_alerts" boolean DEFAULT true,
	"resale_alerts" boolean DEFAULT true,
	"rental_alerts" boolean DEFAULT true,
	"marketing_emails_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_preferences_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"status" "customer_status" DEFAULT 'ACTIVE' NOT NULL,
	"email_verified_at" timestamp,
	"phone_verified_at" timestamp,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "developer_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_seo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"canonical_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text,
	"description" text,
	"website_url" text,
	"status" "developer_status" DEFAULT 'DRAFT' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "developers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"context_type" text NOT NULL,
	"project_id" uuid,
	"project_slug" text,
	"project_name" text,
	"configuration_id" text,
	"listing_id" text,
	"listing_slug" text,
	"listing_title" text,
	"configuration" text,
	"property_type" text,
	"price_display" text,
	"location_name" text,
	"buyer_name" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"buyer_email" text,
	"preferred_contact" text NOT NULL,
	"request_site_visit" boolean DEFAULT false NOT NULL,
	"message" text,
	"status" text NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"assigned_to" text,
	"assigned_to_name" text,
	"source" text,
	"source_page" text,
	"internal_notes" text,
	"last_contacted_at" timestamp,
	"next_follow_up_at" timestamp,
	"site_visit_id" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_evaluated_at" timestamp,
	"last_alerted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "location_type" NOT NULL,
	"parent_id" uuid,
	"description" text,
	"short_description" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"geometry" text,
	"status" "location_status" DEFAULT 'DRAFT' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"category" text NOT NULL,
	"media_type" text DEFAULT 'IMAGE' NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"file_size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_provider" text DEFAULT 'local' NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"original_url" text NOT NULL,
	"thumbnail_url" text,
	"webp_url" text,
	"avif_url" text,
	"watermarked_url" text,
	"watermark_applied" boolean DEFAULT false NOT NULL,
	"alt_text" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"processing_status" text DEFAULT 'READY' NOT NULL,
	"variants" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"project_id" uuid,
	"location_id" uuid,
	"saved_item_id" text,
	"watch_id" text,
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"category_display" text,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"address" text,
	"locality" text,
	"city" text NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bedroom_count" integer,
	"carpet_area" numeric(12, 2),
	"built_up_area" numeric(12, 2),
	"super_built_up_area" numeric(12, 2),
	"price" numeric(19, 4) NOT NULL,
	"price_basis" "price_basis" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"configuration_id" uuid,
	"media_type" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"alt_text" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_rera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "rera_status" DEFAULT 'NOT_PROVIDED' NOT NULL,
	"authority" text,
	"registration_number" text,
	"verified_at" timestamp,
	"verified_by" text,
	"internal_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_seo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"canonical_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_evaluated_at" timestamp,
	"last_alerted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text,
	"description" text,
	"status" "project_status" NOT NULL,
	"lifecycle_status" "project_lifecycle_status" DEFAULT 'DRAFT' NOT NULL,
	"property_type" "property_type" NOT NULL,
	"starting_price" numeric(19, 4),
	"featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recently_viewed" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"first_viewed_at" timestamp DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_listing_amenities" (
	"id" text PRIMARY KEY NOT NULL,
	"rental_listing_id" text NOT NULL,
	"amenity_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_listing_media" (
	"id" text PRIMARY KEY NOT NULL,
	"rental_listing_id" text NOT NULL,
	"media_type" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"alt_text" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text,
	"project_id" uuid,
	"property_type" text NOT NULL,
	"configuration" text NOT NULL,
	"bedroom_count" integer NOT NULL,
	"carpet_area" numeric(12, 2),
	"built_up_area" numeric(12, 2),
	"super_built_up_area" numeric(12, 2),
	"monthly_rent" numeric(19, 4) NOT NULL,
	"maintenance" numeric(19, 4),
	"security_deposit" numeric(19, 4),
	"furnishing" text NOT NULL,
	"facing" text NOT NULL,
	"floor_category" text NOT NULL,
	"possession" text NOT NULL,
	"availability_date" timestamp,
	"lease_duration" text,
	"notice_period" text,
	"description" text,
	"listing_party_type" text NOT NULL,
	"listing_party_display_name" text,
	"owner_name" text,
	"owner_phone" text,
	"owner_email" text,
	"broker_name" text,
	"broker_phone" text,
	"broker_email" text,
	"private_phone" text,
	"private_email" text,
	"internal_notes" text,
	"source" text,
	"crm_id" text,
	"lifecycle_status" text NOT NULL,
	"verification_status" text NOT NULL,
	"verified_at" timestamp,
	"verified_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resale_listing_amenities" (
	"id" text PRIMARY KEY NOT NULL,
	"resale_listing_id" text NOT NULL,
	"amenity_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resale_listing_media" (
	"id" text PRIMARY KEY NOT NULL,
	"resale_listing_id" text NOT NULL,
	"media_type" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"alt_text" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resale_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text,
	"project_id" uuid,
	"property_type" text NOT NULL,
	"configuration" text NOT NULL,
	"bedroom_count" integer NOT NULL,
	"carpet_area" numeric(12, 2),
	"built_up_area" numeric(12, 2),
	"super_built_up_area" numeric(12, 2),
	"asking_price" numeric(19, 4) NOT NULL,
	"furnishing" text NOT NULL,
	"facing" text NOT NULL,
	"floor_category" text NOT NULL,
	"possession" text NOT NULL,
	"possession_date" timestamp,
	"description" text,
	"listing_party_type" text NOT NULL,
	"listing_party_display_name" text,
	"owner_name" text,
	"owner_phone" text,
	"owner_email" text,
	"broker_name" text,
	"broker_phone" text,
	"broker_email" text,
	"private_phone" text,
	"private_email" text,
	"internal_notes" text,
	"source" text,
	"crm_id" text,
	"lifecycle_status" text NOT NULL,
	"verification_status" text NOT NULL,
	"verified_at" timestamp,
	"verified_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alert_delivery_attempts" ADD CONSTRAINT "alert_delivery_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_staff_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_media" ADD CONSTRAINT "developer_media_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_seo" ADD CONSTRAINT "developer_seo_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_watchlists" ADD CONSTRAINT "location_watchlists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_watchlists" ADD CONSTRAINT "location_watchlists_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_configurations" ADD CONSTRAINT "project_configurations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_faqs" ADD CONSTRAINT "project_faqs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_configuration_id_project_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."project_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rera" ADD CONSTRAINT "project_rera_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_seo" ADD CONSTRAINT "project_seo_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_watchlists" ADD CONSTRAINT "project_watchlists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_watchlists" ADD CONSTRAINT "project_watchlists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_listing_amenities" ADD CONSTRAINT "rental_listing_amenities_rental_listing_id_rental_listings_id_fk" FOREIGN KEY ("rental_listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_listing_amenities" ADD CONSTRAINT "rental_listing_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_listing_media" ADD CONSTRAINT "rental_listing_media_rental_listing_id_rental_listings_id_fk" FOREIGN KEY ("rental_listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_listings" ADD CONSTRAINT "rental_listings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listing_amenities" ADD CONSTRAINT "resale_listing_amenities_resale_listing_id_resale_listings_id_fk" FOREIGN KEY ("resale_listing_id") REFERENCES "public"."resale_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listing_amenities" ADD CONSTRAINT "resale_listing_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listing_media" ADD CONSTRAINT "resale_listing_media_resale_listing_id_resale_listings_id_fk" FOREIGN KEY ("resale_listing_id") REFERENCES "public"."resale_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_delivery_notification" ON "alert_delivery_attempts" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "idx_alert_delivery_status" ON "alert_delivery_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_staff_id" ON "audit_logs" USING btree ("actor_staff_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource_type" ON "audit_logs" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource_id" ON "audit_logs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_success" ON "audit_logs" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_request_id" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_customer_preferences_customer" ON "customer_preferences" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_customers_email" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customers_phone" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_customers_status" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_enquiries_status" ON "enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_enquiries_priority" ON "enquiries" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_enquiries_context_type" ON "enquiries" USING btree ("context_type");--> statement-breakpoint
CREATE INDEX "idx_enquiries_created_at" ON "enquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_enquiries_updated_at" ON "enquiries" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_enquiries_assigned_to" ON "enquiries" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_enquiries_project_id" ON "enquiries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_enquiries_listing_id" ON "enquiries" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_enquiries_next_follow_up_at" ON "enquiries" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "idx_location_watchlists_customer" ON "location_watchlists" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_location_watchlists_location" ON "location_watchlists" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_location_watchlists_customer_location_unique" ON "location_watchlists" USING btree ("customer_id","location_id");--> statement-breakpoint
CREATE INDEX "idx_media_assets_entity" ON "media_assets" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_media_assets_category" ON "media_assets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_media_assets_created" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_customer" ON "notifications" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_customer_created" ON "notifications" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_customer_read_created" ON "notifications" USING btree ("customer_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_customer_type_created" ON "notifications" USING btree ("customer_id","type","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_watchlists_customer" ON "project_watchlists" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_project_watchlists_project" ON "project_watchlists" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_watchlists_customer_project_unique" ON "project_watchlists" USING btree ("customer_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_recently_viewed_customer" ON "recently_viewed" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_recently_viewed_last_viewed" ON "recently_viewed" USING btree ("last_viewed_at");--> statement-breakpoint
CREATE INDEX "idx_saved_items_customer" ON "saved_items" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_saved_items_resource" ON "saved_items" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_saved_items_created" ON "saved_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_staff_users_email" ON "staff_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_staff_users_role" ON "staff_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_staff_users_enabled" ON "staff_users" USING btree ("enabled");