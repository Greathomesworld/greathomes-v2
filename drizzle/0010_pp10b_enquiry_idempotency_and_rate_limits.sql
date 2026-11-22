-- Forward-only migration for Great Homes V2 PP-10B
-- Adds durable database-level idempotency on enquiries and distributed PostgreSQL rate-limit buckets.
-- Historical enquiries preserve NULL idempotency_key and remain unaffected.

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"
  ON "enquiries" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "id" text PRIMARY KEY,
  "window_start" timestamptz NOT NULL DEFAULT now(),
  "request_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_expires_at"
  ON "rate_limit_buckets" ("expires_at");
