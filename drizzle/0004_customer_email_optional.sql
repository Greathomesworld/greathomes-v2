-- Great Homes customer optional email migration
-- Makes customers.email nullable while preserving uniqueness for non-null emails.
-- Additive, safe, and idempotent migration.

ALTER TABLE IF EXISTS customers ALTER COLUMN email DROP NOT NULL;

-- Drop legacy unique constraint/index on email if present
DROP INDEX IF EXISTS idx_customers_email;
ALTER TABLE IF EXISTS customers DROP CONSTRAINT IF EXISTS customers_email_key;
ALTER TABLE IF EXISTS customers DROP CONSTRAINT IF EXISTS customers_email_unique;

-- Create partial unique index on lowercased non-null email
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique_non_null 
  ON customers (LOWER(email)) 
  WHERE email IS NOT NULL;

-- Retain standard query index for lookup
CREATE INDEX IF NOT EXISTS idx_customers_email_lookup 
  ON customers (LOWER(email));
