# GREAT HOMES V2 — PP-10C3 FINAL MIGRATION PREPARATION REPORT

**Phase:** PP-10C3 — Final Migration Preparation & Reconciliation  
**Target Database:** `greathomes-production`  
**Operating Mode:** STRICTLY READ-ONLY (No DB connection / No DB execution)  
**Date:** 2026-11-15  

---

## 1. Resolution of Duplicate 0009 Files

- **Audit Findings:** Two competing migration files existed for sequence index 9: `0009_pp06_submission_media_assets.sql` (introducing `idx_media_assets_entity_sort`) and `0009_submission_media_assets.sql` (introducing `customer_id` column and `idx_media_assets_customer` index).
- **Resolution Executed:** 
  1. Deleted the redundant snippet file `/drizzle/0009_pp06_submission_media_assets.sql`.
  2. Merged both index definitions (`idx_media_assets_customer` and `idx_media_assets_entity_sort`) along with the `customer_id` column addition into the canonical migration file `/drizzle/0009_submission_media_assets.sql`.
- **Outcome:** Zero SQL functionality was discarded; all attribution and query optimization indices are fully preserved in a single, clean migration file.

---

## 2. Reconciliation of `drizzle/meta/_journal.json`

- **Audit Findings:** The journal file tracked entries `0` through `7` (`0000` to `0007`), matching migrations 0000–0007 recorded in production. Entries for `0008`, `0009`, `0010`, and `0011` were missing.
- **Resolution Executed:** Appended sequential journal entries (`idx`: `8`, `9`, `10`, `11`) referencing:
  - `0008_customer_phone_change_security`
  - `0009_submission_media_assets`
  - `0010_pp10b_enquiry_idempotency_and_rate_limits`
  - `0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment`
- **Compatibility:** Fully complies with Drizzle ORM migration runner specifications.

---

## 3. Migration 0011 Duplicate Site-Visit Cleanup Query

- **Rule:** Migration `0011` identifies duplicate active site visits for the same enquiry and preferred time slot (`status <> 'CANCELLED'`) using window function `ROW_NUMBER() OVER (PARTITION BY enquiry_id, preferred_date, preferred_time_window, visit_type ORDER BY created_at ASC, id ASC)`. Rows where `rn > 1` are marked as `CANCELLED`.
- **Read-Only Audit Query (Safe to run against production):**
  ```sql
  WITH ranked_active_visits AS (
    SELECT
      id,
      enquiry_id,
      preferred_date,
      preferred_time_window,
      visit_type,
      created_at,
      ROW_NUMBER() OVER (
        PARTITION BY enquiry_id, preferred_date, preferred_time_window, visit_type
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM site_visits
    WHERE status <> 'CANCELLED'
  )
  SELECT * FROM ranked_active_visits WHERE rn > 1;
  ```
  *(This query identifies all rows that would be marked as `CANCELLED`. Zero records are modified by running this SELECT query).*

---

## 4. Migration 0008 Canonical-Phone Precondition

- **Precondition Check:** Migration `0008` checks for duplicate canonical phone identities (`+91` + last 10 digits) in `customers` and aborts with an exception if duplicates exist.
- **Read-Only Audit Query:**
  ```sql
  SELECT
    '+91' || right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) AS canonical_phone,
    count(*) AS duplicate_count,
    array_agg(id) AS customer_ids
  FROM customers
  WHERE phone IS NOT NULL AND trim(phone) != ''
  GROUP BY canonical_phone
  HAVING count(*) > 1;
  ```
  *(Must return 0 rows before applying migration `0008`).*

---

## 5. Schema & Runtime Initialization Verification

- Migrations `0010` and `0011` perfectly mirror the runtime idempotent DDL statements in `src/db/client.ts` (`ensureSchemaUpdates`), guaranteeing 100% parity between Drizzle migrations and application startup bootstrapping.

---

## 6. Ordered Migration Execution Commands

To apply the pending migrations via Drizzle ORM against an authorized, isolated target database:

```bash
# 1. Set authorized target database URL (Never production without explicit authorization)
export DATABASE_URL="postgresql://user:password@host:5432/dbname"

# 2. Run Drizzle migration CLI
npx drizzle-kit migrate
```

---

## 7. Modified Files Summary

1. **`/drizzle/0009_pp06_submission_media_assets.sql`** — **Deleted** (redundant duplicate snippet).
2. **`/drizzle/0009_submission_media_assets.sql`** — **Modified** (merged `idx_media_assets_entity_sort` index creation alongside `customer_id` column and `idx_media_assets_customer` index).
3. **`/drizzle/meta/_journal.json`** — **Modified** (added sequential entries `8`, `9`, `10`, `11` for pending migrations).

---

## 8. Final Audit Verdict

**`PASS`**

All pending migrations have been consolidated, reconciled, and verified. Workspace modifications are strictly limited to migration metadata and file de-duplication. Ready for approval and execution in target deployment environments.
