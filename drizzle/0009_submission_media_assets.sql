-- PP-06: Submission Media Assets Attribution & Indexing
-- Additive, backward-compatible migration for customer submission image uploads.

ALTER TABLE IF EXISTS media_assets
  ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_customer
  ON media_assets(customer_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_entity_sort
  ON media_assets (entity_type, entity_id, sort_order, created_at);

