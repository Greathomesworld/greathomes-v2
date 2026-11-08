-- Great Homes V2: Visitor Intelligence & Customer 360 Schema Migration

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

-- Drop redundant non-unique index on (visitor_id, client_event_id); covered by uq_visitor_events_visitor_client_event
DROP INDEX IF EXISTS idx_visitor_events_client_event;

-- Deterministic deduplication rule for pre-existing (visitor_id, client_event_id) duplicates:
-- 1. Backfill customer_id onto the canonical row if any duplicate in the group was linked to a customer.
-- 2. Retain the single canonical event per non-null (visitor_id, client_event_id) ordered by:
--    (a) customer_id IS NOT NULL first, (b) earliest occurred_at ASC, (c) id ASC tie-breaker.
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

-- Clean up any orphaned visitor_id or session_id references in enquiries before adding foreign-key constraints.
-- Preserves all enquiry rows and business fields while nulling out only dangling attribution IDs.
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

