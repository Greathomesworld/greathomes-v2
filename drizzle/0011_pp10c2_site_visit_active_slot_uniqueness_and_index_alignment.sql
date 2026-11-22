-- Forward-only additive migration for Great Homes V2 PP-10C2
-- 1. MIG-0010-IDX: Align enquiries partial unique index naming to canonical "uq_enquiries_idempotency_key"
--    and drop any unintended duplicate "uq_enquiries_idempotency_key_not_null" index.
-- 2. I-02-CONC: Enforce database-level active slot uniqueness on site_visits
--    ("enquiry_id", "preferred_date", "preferred_time_window", "visit_type") WHERE "status" <> 'CANCELLED'
--    so concurrent requests with distinct idempotency keys cannot create duplicate active visits for the same slot,
--    while preserving historical cancelled visits, rescheduling, and separate appointment slots.

DROP INDEX IF EXISTS "uq_enquiries_idempotency_key_not_null";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"
  ON "enquiries" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.site_visits') IS NOT NULL THEN
    -- Safely mark any pre-existing duplicate active slots as CANCELLED (preserving the earliest row)
    -- before creating the partial unique index.
    WITH ranked_active_visits AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY enquiry_id, preferred_date, preferred_time_window, visit_type
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM site_visits
      WHERE status <> 'CANCELLED'
    )
    UPDATE site_visits
    SET
      status = 'CANCELLED',
      cancel_reason = COALESCE(cancel_reason, 'Deduplicated prior to uq_site_visits_active_enquiry_slot index creation'),
      cancelled_at = COALESCE(cancelled_at, now()),
      updated_at = now()
    WHERE id IN (
      SELECT id FROM ranked_active_visits WHERE rn > 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "uq_site_visits_active_enquiry_slot"
      ON "site_visits" ("enquiry_id", "preferred_date", "preferred_time_window", "visit_type")
      WHERE "status" <> 'CANCELLED';
  END IF;
END $$;
