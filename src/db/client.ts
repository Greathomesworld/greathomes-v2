import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema.ts';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __ghPgPool?: Pool | null;
  __ghDbInstance?: DrizzleDb | null;
  __ghSchemaUpdatesPromise?: Promise<void> | null;
  __ghSchemaUpdated?: boolean;
};

let pool: Pool | null = globalForDb.__ghPgPool ?? null;
let dbInstance: DrizzleDb | null = globalForDb.__ghDbInstance ?? null;
let schemaUpdatesPromise: Promise<void> | null = globalForDb.__ghSchemaUpdatesPromise ?? null;
let schemaUpdated = globalForDb.__ghSchemaUpdated ?? false;

export async function isMigrationAuthorizedForDatabase(
  db: DrizzleDb | null,
  options?: { force?: boolean }
): Promise<{ allowed: boolean; reason?: string }> {
  if (!db) {
    return { allowed: false, reason: 'No database client instance provided' };
  }

  // Rule 1 & 2: Migration execution must be explicitly authorized
  const baseMigrationEnabled = process.env.ALLOW_DB_MIGRATIONS === 'true' || options?.force === true;
  if (!baseMigrationEnabled) {
    return { allowed: false, reason: 'Migration authorization absent (ALLOW_DB_MIGRATIONS must be "true")' };
  }

  // Rule 5: Database identity check must fail closed
  let activeDbName = '';
  try {
    const dbCheck = await db.execute(sql`SELECT current_database() AS db_name`);
    activeDbName = String((dbCheck.rows?.[0] as any)?.db_name || '').trim().toLowerCase();
    if (!activeDbName) {
      return { allowed: false, reason: 'Failed closed: current_database() returned an empty database name' };
    }
  } catch (err: any) {
    return { allowed: false, reason: `Failed closed: Database identity query failed: ${err?.message || err}` };
  }

  // Check if connected database is production
  const isProductionDatabase = activeDbName.includes('production');

  // Rule 3 & 4: Production database protection.
  // options.force can NEVER bypass the production database authorization.
  if (isProductionDatabase) {
    if (process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true') {
      return {
        allowed: false,
        reason: `Production database "${activeDbName}" detected. Explicit ALLOW_PRODUCTION_MIGRATIONS="true" is strictly required. options.force cannot bypass this requirement.`,
      };
    }
  }

  return { allowed: true };
}

export async function ensureSchemaUpdates(db: DrizzleDb | null, options?: { force?: boolean }) {
  const auth = await isMigrationAuthorizedForDatabase(db, options);
  if (!auth.allowed) {
    if (process.env.DEBUG_MIGRATIONS === 'true') {
      console.warn(`[SAFETY GATE] ensureSchemaUpdates blocked: ${auth.reason}`);
    }
    return;
  }
  if (!db || schemaUpdated || globalForDb.__ghSchemaUpdated) {
    schemaUpdated = true;
    return;
  }
  if (schemaUpdatesPromise) return schemaUpdatesPromise;
  if (globalForDb.__ghSchemaUpdatesPromise) {
    schemaUpdatesPromise = globalForDb.__ghSchemaUpdatesPromise;
    return schemaUpdatesPromise;
  }

  schemaUpdatesPromise = (async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff_users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        role text NOT NULL,
        password_hash text,
        session_version integer DEFAULT 0 NOT NULL,
        enabled boolean DEFAULT true NOT NULL,
        avatar_url text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      ALTER TABLE IF EXISTS staff_users ADD COLUMN IF NOT EXISTS password_hash text;
      ALTER TABLE IF EXISTS staff_users ADD COLUMN IF NOT EXISTS session_version integer DEFAULT 0 NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users(email);
      CREATE INDEX IF NOT EXISTS idx_staff_users_role ON staff_users(role);
      CREATE INDEX IF NOT EXISTS idx_staff_users_enabled ON staff_users(enabled);

      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS project_area text;
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS tower_count integer;
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS total_units integer;
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS floors text;
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS possession text;
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS latitude numeric(9, 6);
      ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);

      ALTER TABLE IF EXISTS project_media ADD COLUMN IF NOT EXISTS media_id text;

      ALTER TABLE IF EXISTS resale_listings ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
      ALTER TABLE IF EXISTS resale_listings ADD COLUMN IF NOT EXISTS latitude numeric(9, 6);
      ALTER TABLE IF EXISTS resale_listings ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);
      ALTER TABLE IF EXISTS resale_listings ADD COLUMN IF NOT EXISTS geometry text;

      ALTER TABLE IF EXISTS rental_listings ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
      ALTER TABLE IF EXISTS rental_listings ADD COLUMN IF NOT EXISTS latitude numeric(9, 6);
      ALTER TABLE IF EXISTS rental_listings ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);
      ALTER TABLE IF EXISTS rental_listings ADD COLUMN IF NOT EXISTS geometry text;

      CREATE INDEX IF NOT EXISTS idx_resale_listings_location_id ON resale_listings(location_id);
      CREATE INDEX IF NOT EXISTS idx_rental_listings_location_id ON rental_listings(location_id);
      CREATE INDEX IF NOT EXISTS idx_resale_listings_spatial ON resale_listings USING gist (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_rental_listings_spatial ON rental_listings USING gist (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);

      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS configuration_id text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS priority text DEFAULT 'NORMAL';
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS assigned_to text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS assigned_to_name text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS source text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS source_page text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS internal_notes text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS last_contacted_at timestamp;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS next_follow_up_at timestamp;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS site_visit_id text;
      ALTER TABLE IF EXISTS enquiries ADD COLUMN IF NOT EXISTS metadata text;

      CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
      CREATE INDEX IF NOT EXISTS idx_enquiries_priority ON enquiries(priority);
      CREATE INDEX IF NOT EXISTS idx_enquiries_context_type ON enquiries(context_type);
      CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);
      CREATE INDEX IF NOT EXISTS idx_enquiries_updated_at ON enquiries(updated_at);
      CREATE INDEX IF NOT EXISTS idx_enquiries_assigned_to ON enquiries(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_enquiries_project_id ON enquiries(project_id);
      CREATE INDEX IF NOT EXISTS idx_enquiries_listing_id ON enquiries(listing_id);
      CREATE INDEX IF NOT EXISTS idx_enquiries_next_follow_up_at ON enquiries(next_follow_up_at);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id text PRIMARY KEY,
        actor_staff_id text REFERENCES staff_users(id) ON DELETE SET NULL,
        actor_role text NOT NULL,
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id text,
        resource_label text,
        timestamp timestamp DEFAULT now() NOT NULL,
        request_id text,
        ip_address text,
        user_agent text,
        before jsonb,
        after jsonb,
        metadata jsonb,
        success boolean DEFAULT true NOT NULL,
        failure_reason text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_staff_id ON audit_logs(actor_staff_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

      CREATE TABLE IF NOT EXISTS media_assets (
        id text PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        category text NOT NULL,
        media_type text DEFAULT 'IMAGE' NOT NULL,
        width integer DEFAULT 0 NOT NULL,
        height integer DEFAULT 0 NOT NULL,
        file_size_bytes integer DEFAULT 0 NOT NULL,
        storage_provider text DEFAULT 'local' NOT NULL,
        storage_key text NOT NULL,
        url text NOT NULL,
        original_url text NOT NULL,
        thumbnail_url text,
        webp_url text,
        avif_url text,
        watermarked_url text,
        watermark_applied boolean DEFAULT false NOT NULL,
        alt_text text,
        caption text,
        sort_order integer DEFAULT 0 NOT NULL,
        is_featured boolean DEFAULT false NOT NULL,
        processing_status text DEFAULT 'READY' NOT NULL,
        variants jsonb,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_media_assets_entity ON media_assets(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_media_assets_category ON media_assets(category);
      CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at);

      CREATE TABLE IF NOT EXISTS customers (
        id text PRIMARY KEY,
        email text,
        phone text,
        name text NOT NULL,
        password_hash text,
        avatar_url text,
        status text DEFAULT 'ACTIVE' NOT NULL,
        email_verified_at timestamp,
        phone_verified_at timestamp,
        last_login_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      ALTER TABLE IF EXISTS customers ALTER COLUMN email DROP NOT NULL;
      DROP INDEX IF EXISTS idx_customers_email;
      ALTER TABLE IF EXISTS customers DROP CONSTRAINT IF EXISTS customers_email_key;
      ALTER TABLE IF EXISTS customers DROP CONSTRAINT IF EXISTS customers_email_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique_non_null ON customers (LOWER(email)) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_customers_email_lookup ON customers (LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

      -- Provider session identifiers and OTP state are server-side only. The OTP itself is never stored.
      CREATE TABLE IF NOT EXISTS customer_otp_challenges (
        id text PRIMARY KEY,
        phone text NOT NULL,
        phone_hash text NOT NULL,
        ip_hash text NOT NULL,
        provider_session_id text,
        customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'SENDING',
        attempt_count integer NOT NULL DEFAULT 0,
        expires_at timestamp NOT NULL,
        verified_at timestamp,
        profile_expires_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_otp_phone_created
        ON customer_otp_challenges(phone_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_customer_otp_status_expiry
        ON customer_otp_challenges(status, expires_at);

      -- Fixed-window counters are persistent across Vercel serverless instances.
      CREATE TABLE IF NOT EXISTS customer_auth_rate_limits (
        id text PRIMARY KEY,
        window_start timestamp NOT NULL DEFAULT now(),
        request_count integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customer_auth_sessions (
        token_hash text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        expires_at timestamp NOT NULL,
        revoked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        last_seen_at timestamp
      );
      CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_customer
        ON customer_auth_sessions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_expiry
        ON customer_auth_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS saved_items (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT uq_saved_items_customer_resource UNIQUE (customer_id, resource_type, resource_id)
      );

      CREATE INDEX IF NOT EXISTS idx_saved_items_customer ON saved_items(customer_id);
      CREATE INDEX IF NOT EXISTS idx_saved_items_resource ON saved_items(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_saved_items_created ON saved_items(created_at);

      CREATE TABLE IF NOT EXISTS recently_viewed (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        first_viewed_at timestamp DEFAULT now() NOT NULL,
        last_viewed_at timestamp DEFAULT now() NOT NULL,
        view_count integer DEFAULT 1 NOT NULL,
        CONSTRAINT uq_recently_viewed_customer_resource UNIQUE (customer_id, resource_type, resource_id)
      );

      CREATE INDEX IF NOT EXISTS idx_recently_viewed_customer ON recently_viewed(customer_id);
      CREATE INDEX IF NOT EXISTS idx_recently_viewed_last_viewed ON recently_viewed(last_viewed_at);

      CREATE TABLE IF NOT EXISTS customer_preferences (
        id text PRIMARY KEY,
        customer_id text NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        preferred_mode text DEFAULT 'ALL',
        preferred_locations jsonb,
        preferred_bhk jsonb,
        preferred_property_types jsonb,
        budget_min integer,
        budget_max integer,
        email_alerts_enabled boolean DEFAULT true,
        new_launch_alerts boolean DEFAULT true,
        price_drop_alerts boolean DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS email_alerts_enabled boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS new_launch_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS price_drop_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS in_app_alerts_enabled boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS project_status_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS rera_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS price_change_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS configuration_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS location_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS resale_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS rental_alerts boolean DEFAULT true;
      ALTER TABLE IF EXISTS customer_preferences ADD COLUMN IF NOT EXISTS marketing_emails_enabled boolean DEFAULT false;

      CREATE TABLE IF NOT EXISTS project_watchlists (
        id text PRIMARY KEY,
        customer_id text REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
        project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
        enabled boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        last_evaluated_at timestamp,
        last_alerted_at timestamp,
        CONSTRAINT uq_project_watchlists_customer_project UNIQUE (customer_id, project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_watchlists_customer ON project_watchlists(customer_id);
      CREATE INDEX IF NOT EXISTS idx_project_watchlists_project ON project_watchlists(project_id);

      CREATE TABLE IF NOT EXISTS location_watchlists (
        id text PRIMARY KEY,
        customer_id text REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
        enabled boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        last_evaluated_at timestamp,
        last_alerted_at timestamp,
        CONSTRAINT uq_location_watchlists_customer_location UNIQUE (customer_id, location_id)
      );

      CREATE INDEX IF NOT EXISTS idx_location_watchlists_customer ON location_watchlists(customer_id);
      CREATE INDEX IF NOT EXISTS idx_location_watchlists_location ON location_watchlists(location_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id text PRIMARY KEY,
        customer_id text REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
        type text NOT NULL,
        title text NOT NULL,
        message text NOT NULL,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        saved_item_id text,
        watch_id text,
        metadata jsonb,
        is_read boolean DEFAULT false NOT NULL,
        read_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        expires_at timestamp
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_customer_created ON notifications(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_customer_read_created ON notifications(customer_id, is_read, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_customer_type_created ON notifications(customer_id, type, created_at);

      CREATE TABLE IF NOT EXISTS alert_delivery_attempts (
        id text PRIMARY KEY,
        notification_id text REFERENCES notifications(id) ON DELETE CASCADE NOT NULL,
        channel text NOT NULL,
        status text NOT NULL,
        attempts integer DEFAULT 0 NOT NULL,
        last_attempt_at timestamp,
        failure_reason text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alert_delivery_notification ON alert_delivery_attempts(notification_id);
      CREATE INDEX IF NOT EXISTS idx_alert_delivery_status ON alert_delivery_attempts(status);

      CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer ON customer_preferences(customer_id);

      CREATE TABLE IF NOT EXISTS location_market_snapshots (
        id text PRIMARY KEY,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
        snapshot_date text NOT NULL,
        project_count integer DEFAULT 0 NOT NULL,
        published_project_count integer DEFAULT 0 NOT NULL,
        new_launch_count integer DEFAULT 0 NOT NULL,
        under_construction_count integer DEFAULT 0 NOT NULL,
        ready_to_move_count integer DEFAULT 0 NOT NULL,
        completed_project_count integer DEFAULT 0 NOT NULL,
        sold_out_project_count integer DEFAULT 0 NOT NULL,
        resale_listing_count integer DEFAULT 0 NOT NULL,
        rental_listing_count integer DEFAULT 0 NOT NULL,
        configuration_counts jsonb,
        price_metrics jsonb,
        rera_metrics jsonb,
        data_freshness jsonb,
        source text DEFAULT 'GREAT_HOMES_DB' NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT uq_snapshots_location_date UNIQUE (location_id, snapshot_date)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_location ON location_market_snapshots(location_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_date ON location_market_snapshots(snapshot_date);

      CREATE TABLE IF NOT EXISTS market_events (
        id text PRIMARY KEY,
        event_type text NOT NULL,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        previous_value text,
        new_value text,
        change_fingerprint text NOT NULL,
        metadata jsonb,
        event_date timestamp DEFAULT now() NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT uq_market_events_fingerprint UNIQUE (location_id, event_type, resource_id, change_fingerprint)
      );

      CREATE INDEX IF NOT EXISTS idx_market_events_location ON market_events(location_id);
      CREATE INDEX IF NOT EXISTS idx_market_events_type ON market_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_market_events_resource ON market_events(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_market_events_date ON market_events(event_date);

      CREATE TABLE IF NOT EXISTS data_quality_issues (
        id text PRIMARY KEY,
        severity text NOT NULL,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        field text,
        code text NOT NULL,
        message text NOT NULL,
        detected_at timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_data_quality_severity ON data_quality_issues(severity);
      CREATE INDEX IF NOT EXISTS idx_data_quality_code ON data_quality_issues(code);
      CREATE INDEX IF NOT EXISTS idx_data_quality_entity ON data_quality_issues(entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS project_considerations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        section text NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        source_type text DEFAULT 'EDITORIAL' NOT NULL,
        sort_order integer DEFAULT 0 NOT NULL,
        is_visible boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_considerations_project_id ON project_considerations(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_considerations_section ON project_considerations(section);
      CREATE INDEX IF NOT EXISTS idx_project_considerations_is_visible ON project_considerations(is_visible);
    `);
  } catch (err) {
    console.warn('Postgres schema extension notice:', err);
  }

  // Install the OTP tables independently so an unrelated legacy schema extension
  // cannot prevent passwordless authentication tables from being created.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_otp_challenges (
        id text PRIMARY KEY,
        phone text NOT NULL,
        phone_hash text NOT NULL,
        ip_hash text NOT NULL,
        provider_session_id text,
        customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'SENDING',
        attempt_count integer NOT NULL DEFAULT 0,
        expires_at timestamp NOT NULL,
        verified_at timestamp,
        profile_expires_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_otp_phone_created
        ON customer_otp_challenges(phone_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_customer_otp_status_expiry
        ON customer_otp_challenges(status, expires_at);
      CREATE TABLE IF NOT EXISTS customer_auth_rate_limits (
        id text PRIMARY KEY,
        window_start timestamp NOT NULL DEFAULT now(),
        request_count integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customer_auth_sessions (
        token_hash text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        expires_at timestamp NOT NULL,
        revoked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        last_seen_at timestamp
      );
      CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_customer
        ON customer_auth_sessions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_auth_sessions_expiry
        ON customer_auth_sessions(expires_at);
    `);
  } catch (otpSchemaError) {
    schemaUpdatesPromise = null;
    schemaUpdated = false;
    console.error('CRITICAL: Customer OTP schema initialization failed:', otpSchemaError);
    throw otpSchemaError;
  }

  // Install Visitor & Customer 360 tables and enquiry columns idempotently
  try {
    await db.execute(sql`
      ALTER TABLE enquiries
        ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS visitor_id text,
        ADD COLUMN IF NOT EXISTS session_id text;

      CREATE INDEX IF NOT EXISTS idx_enquiries_customer_id ON enquiries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_enquiries_visitor_id ON enquiries(visitor_id);
      CREATE INDEX IF NOT EXISTS idx_enquiries_buyer_phone ON enquiries(buyer_phone);

      CREATE TABLE IF NOT EXISTS visitors (
        id text PRIMARY KEY,
        customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        first_seen_at timestamp NOT NULL DEFAULT now(),
        last_seen_at timestamp NOT NULL DEFAULT now(),
        linked_at timestamp,
        session_count integer NOT NULL DEFAULT 1,
        first_utm_source text,
        first_utm_medium text,
        first_utm_campaign text,
        first_utm_term text,
        first_utm_content text,
        first_referrer_url text,
        first_landing_path text,
        last_landing_path text,
        device_class text NOT NULL DEFAULT 'UNKNOWN',
        browser_family text,
        ip_hash text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_visitors_customer_id ON visitors(customer_id);
      CREATE INDEX IF NOT EXISTS idx_visitors_last_seen_at ON visitors(last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitors_first_seen_at ON visitors(first_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitors_utm_source ON visitors(first_utm_source);

      CREATE TABLE IF NOT EXISTS visitor_sessions (
        id text PRIMARY KEY,
        visitor_id text NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        started_at timestamp NOT NULL DEFAULT now(),
        last_activity_at timestamp NOT NULL DEFAULT now(),
        utm_source text,
        utm_medium text,
        utm_campaign text,
        utm_term text,
        utm_content text,
        referrer_url text,
        entry_path text,
        exit_path text,
        device_class text NOT NULL DEFAULT 'UNKNOWN',
        browser_family text,
        ip_hash text,
        page_view_count integer NOT NULL DEFAULT 0,
        event_count integer NOT NULL DEFAULT 0,
        duration_seconds integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id ON visitor_sessions(visitor_id);
      CREATE INDEX IF NOT EXISTS idx_visitor_sessions_customer_id ON visitor_sessions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON visitor_sessions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_activity ON visitor_sessions(last_activity_at DESC);

      CREATE TABLE IF NOT EXISTS visitor_events (
        id text PRIMARY KEY,
        visitor_id text NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        session_id text NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
        customer_id text REFERENCES customers(id) ON DELETE SET NULL,
        event_type text NOT NULL,
        page_path text,
        page_title text,
        entity_type text,
        entity_id text,
        entity_slug text,
        area_basis text,
        duration_seconds integer,
        client_event_id text,
        metadata jsonb,
        occurred_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_occurred ON visitor_events(visitor_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitor_events_customer_occurred ON visitor_events(customer_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitor_events_session_occurred ON visitor_events(session_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitor_events_type_occurred ON visitor_events(event_type, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visitor_events_entity ON visitor_events(entity_type, entity_id);
      DROP INDEX IF EXISTS idx_visitor_events_client_event;

      WITH duplicate_groups AS (
        SELECT
          id,
          visitor_id,
          client_event_id,
          FIRST_VALUE(customer_id) OVER (
            PARTITION BY visitor_id, client_event_id
            ORDER BY
              CASE WHEN customer_id IS NOT NULL THEN 0 ELSE 1 END ASC,
              occurred_at ASC,
              id ASC
          ) AS canonical_customer_id,
          ROW_NUMBER() OVER (
            PARTITION BY visitor_id, client_event_id
            ORDER BY
              CASE WHEN customer_id IS NOT NULL THEN 0 ELSE 1 END ASC,
              occurred_at ASC,
              id ASC
          ) AS rn
        FROM visitor_events
        WHERE client_event_id IS NOT NULL
      ),
      updated_canonical AS (
        UPDATE visitor_events ve
        SET customer_id = dg.canonical_customer_id
        FROM duplicate_groups dg
        WHERE ve.id = dg.id
          AND dg.rn = 1
          AND ve.customer_id IS NULL
          AND dg.canonical_customer_id IS NOT NULL
        RETURNING ve.id
      )
      DELETE FROM visitor_events
      WHERE id IN (
        SELECT id FROM duplicate_groups WHERE rn > 1
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_events_visitor_client_event ON visitor_events(visitor_id, client_event_id);

      UPDATE enquiries
      SET visitor_id = NULL
      WHERE visitor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM visitors WHERE visitors.id = enquiries.visitor_id
        );

      UPDATE enquiries
      SET session_id = NULL
      WHERE session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM visitor_sessions WHERE visitor_sessions.id = enquiries.session_id
        );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_visitor_id_visitors_id_fk'
        ) THEN
          ALTER TABLE enquiries
            ADD CONSTRAINT enquiries_visitor_id_visitors_id_fk
            FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_session_id_visitor_sessions_id_fk'
        ) THEN
          ALTER TABLE enquiries
            ADD CONSTRAINT enquiries_session_id_visitor_sessions_id_fk
            FOREIGN KEY (session_id) REFERENCES visitor_sessions(id) ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_enquiries_session_id ON enquiries(session_id);

      -- Install Phase 2C submission and partner tables idempotently
      CREATE TABLE IF NOT EXISTS customer_partner_profiles (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT UNIQUE,
        status text NOT NULL DEFAULT 'PENDING',
        approved_by_staff_id text REFERENCES staff_users(id) ON DELETE SET NULL,
        approved_at timestamp with time zone,
        suspension_reason text,
        revocation_reason text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_partner_profiles_status ON customer_partner_profiles(status);
      CREATE INDEX IF NOT EXISTS idx_customer_partner_profiles_customer ON customer_partner_profiles(customer_id);

      CREATE TABLE IF NOT EXISTS customer_partner_audit_history (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        previous_status text,
        new_status text NOT NULL,
        acting_staff_user_id text REFERENCES staff_users(id) ON DELETE SET NULL,
        reason text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_partner_audit_customer ON customer_partner_audit_history(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_partner_audit_created ON customer_partner_audit_history(created_at DESC);

      CREATE TABLE IF NOT EXISTS property_submissions (
        id text PRIMARY KEY,
        submitter_customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        listing_type text NOT NULL,
        listing_source text NOT NULL,
        submission_status text NOT NULL DEFAULT 'DRAFT',
        resale_listing_id text REFERENCES resale_listings(id) ON DELETE RESTRICT,
        rental_listing_id text REFERENCES rental_listings(id) ON DELETE RESTRICT,
        payload jsonb NOT NULL,
        submitted_at timestamp with time zone,
        reviewed_at timestamp with time zone,
        approved_at timestamp with time zone,
        withdrawn_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT uq_submission_id_customer UNIQUE (id, submitter_customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_property_submissions_customer ON property_submissions(submitter_customer_id);
      CREATE INDEX IF NOT EXISTS idx_property_submissions_status ON property_submissions(submission_status);
      CREATE INDEX IF NOT EXISTS idx_property_submissions_source ON property_submissions(listing_source);
      CREATE INDEX IF NOT EXISTS idx_property_submissions_resale ON property_submissions(resale_listing_id);
      CREATE INDEX IF NOT EXISTS idx_property_submissions_rental ON property_submissions(rental_listing_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_resale_listing_submission ON property_submissions (resale_listing_id) WHERE resale_listing_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_listing_submission ON property_submissions (rental_listing_id) WHERE rental_listing_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS property_submission_reviews (
        id text PRIMARY KEY,
        submission_id text NOT NULL REFERENCES property_submissions(id) ON DELETE RESTRICT,
        staff_user_id text REFERENCES staff_users(id) ON DELETE SET NULL,
        event_type text NOT NULL,
        previous_status text,
        new_status text NOT NULL,
        internal_note text,
        submitter_feedback text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_property_submission_reviews_submission ON property_submission_reviews(submission_id);
      CREATE INDEX IF NOT EXISTS idx_property_submission_reviews_staff ON property_submission_reviews(staff_user_id);

      CREATE TABLE IF NOT EXISTS partner_attestations (
        id text PRIMARY KEY,
        submission_id text NOT NULL,
        partner_customer_id text NOT NULL,
        attestation_version text NOT NULL DEFAULT 'v1.0',
        declaration_text text NOT NULL,
        accepted_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT fk_partner_attestation_ownership 
          FOREIGN KEY (submission_id, partner_customer_id) 
          REFERENCES property_submissions (id, submitter_customer_id) 
          ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_partner_attestations_submission ON partner_attestations(submission_id);
      CREATE INDEX IF NOT EXISTS idx_partner_attestations_partner ON partner_attestations(partner_customer_id);

      CREATE OR REPLACE FUNCTION prevent_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Updates and deletions are strictly prohibited on append-only table %', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_partner_attestations_immutable ON partner_attestations;
      CREATE TRIGGER trg_partner_attestations_immutable
      BEFORE UPDATE OR DELETE ON partner_attestations
      FOR EACH ROW EXECUTE FUNCTION prevent_modification();

      DROP TRIGGER IF EXISTS trg_property_submission_reviews_immutable ON property_submission_reviews;
      CREATE TRIGGER trg_property_submission_reviews_immutable
      BEFORE UPDATE OR DELETE ON property_submission_reviews
      FOR EACH ROW EXECUTE FUNCTION prevent_modification();

      DROP TRIGGER IF EXISTS trg_customer_partner_audit_immutable ON customer_partner_audit_history;
      CREATE TRIGGER trg_customer_partner_audit_immutable
      BEFORE UPDATE OR DELETE ON customer_partner_audit_history
      FOR EACH ROW EXECUTE FUNCTION prevent_modification();

      CREATE OR REPLACE FUNCTION prevent_truncate()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'TRUNCATE is strictly prohibited on table %', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_truncate_attestations ON partner_attestations;
      CREATE TRIGGER trg_prevent_truncate_attestations
      BEFORE TRUNCATE ON partner_attestations
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

      DROP TRIGGER IF EXISTS trg_prevent_truncate_reviews ON property_submission_reviews;
      CREATE TRIGGER trg_prevent_truncate_reviews
      BEFORE TRUNCATE ON property_submission_reviews
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

      DROP TRIGGER IF EXISTS trg_prevent_truncate_audit ON customer_partner_audit_history;
      CREATE TRIGGER trg_prevent_truncate_audit
      BEFORE TRUNCATE ON customer_partner_audit_history
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
    `);
  } catch (visitorSchemaError) {
    schemaUpdatesPromise = null;
    schemaUpdated = false;
    globalForDb.__ghSchemaUpdatesPromise = null;
    globalForDb.__ghSchemaUpdated = false;
    console.error('CRITICAL: Visitor intelligence schema initialization failed:', visitorSchemaError);
    throw visitorSchemaError;
  }
  schemaUpdated = true;
  globalForDb.__ghSchemaUpdated = true;
  })();
  globalForDb.__ghSchemaUpdatesPromise = schemaUpdatesPromise;
  return schemaUpdatesPromise;
}

export function isPostgresRequired(): boolean {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') {
    return false;
  }
  if (process.env.NEXT_PHASE === 'phase-production-build' && !process.env.DATABASE_URL) {
    return false;
  }
  return process.env.PERSISTENCE_PROVIDER === 'postgres' || process.env.NODE_ENV === 'production';
}

export function getDb() {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') {
    return null;
  }
  if (!dbInstance && globalForDb.__ghDbInstance) {
    pool = globalForDb.__ghPgPool ?? null;
    dbInstance = globalForDb.__ghDbInstance;
  }
  const postgresRequired = isPostgresRequired();
  if (!dbInstance) {
    let connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      if (postgresRequired) {
        throw new Error(
          'FATAL: PostgreSQL DATABASE_URL is required in production or when PERSISTENCE_PROVIDER=postgres. Silent fallback to in-memory mode is disabled.'
        );
      }
      return null;
    }
    if (connectionString.includes('sslmode=') && !connectionString.includes('uselibpqcompat=') && !connectionString.includes('sslmode=verify-full')) {
      connectionString = connectionString.replace(/sslmode=(require|prefer|verify-ca)/g, 'sslmode=verify-full');
    }
    try {
      pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
        keepAlive: true,
      });
      pool.on('error', (err) => {
        console.warn('PostgreSQL pool idle client error (handled):', err?.message || err);
      });
      dbInstance = drizzle(pool, { schema });
      globalForDb.__ghPgPool = pool;
      globalForDb.__ghDbInstance = dbInstance;
      // Note: ensureSchemaUpdates is decoupled from getDb() to guarantee ordinary runtime startups never mutate schema.
    } catch (err: any) {
      if (postgresRequired) {
        throw new Error(`FATAL: Failed to connect to PostgreSQL database: ${err?.message || err}`);
      }
      return null;
    }
  }
  return dbInstance;
}

export async function getDbReady() {
  return getDb();
}

export function resetSchemaInitializationStateForTesting() {
  schemaUpdated = false;
  schemaUpdatesPromise = null;
  globalForDb.__ghSchemaUpdated = false;
  globalForDb.__ghSchemaUpdatesPromise = null;
}

export function isPostgresConfigured(): boolean {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return false;
  return Boolean(process.env.DATABASE_URL && isPostgresRequired());
}

