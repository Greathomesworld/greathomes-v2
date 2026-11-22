-- Migration: 0008_customer_phone_change_security.sql
-- Purpose: Add canonical customer phone uniqueness index and OTP challenge purpose/target_phone columns.

-- 1. Pre-migration safety check: log any legacy duplicate canonical phones before applying unique index
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT '+91' || right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) AS canonical_phone
    FROM customers
    WHERE phone IS NOT NULL AND trim(phone) != ''
    GROUP BY canonical_phone
    HAVING count(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found % legacy duplicate canonical phone identity groups in customers table. Please resolve duplicates before applying unique constraint.', dup_count;
  END IF;
END $$;
--> statement-breakpoint

-- 2. Add purpose and target_phone columns to customer_otp_challenges
ALTER TABLE IF EXISTS "customer_otp_challenges" ADD COLUMN IF NOT EXISTS "purpose" text DEFAULT 'CUSTOMER_LOGIN' NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "customer_otp_challenges" ADD COLUMN IF NOT EXISTS "target_phone" text;
--> statement-breakpoint

-- 3. Create canonical phone unique expression index on customers
CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_canonical_phone_unique" 
  ON "customers" ((('+91'::text || "right"(regexp_replace(COALESCE("phone", ''::text), '\D'::text, ''::text, 'g'::text), 10)))) 
  WHERE (("phone" IS NOT NULL) AND (TRIM(BOTH FROM "phone") <> ''::text));
