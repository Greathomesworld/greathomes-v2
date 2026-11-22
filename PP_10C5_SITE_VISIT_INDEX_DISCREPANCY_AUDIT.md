# GREAT HOMES V2 — PP-10C5
# SITE-VISIT INDEX DISCREPANCY & FINAL ACCEPTANCE AUDIT REPORT

**Project:** Great Homes V2  
**Phase:** PP-10C5  
**Target:** Great Homes V2 source code (`src/db/schema.ts`, `drizzle/0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql`) and Neon production schema  
**Operating Mode:** STRICTLY READ-ONLY  
**Date:** November 15, 2026  
**Verdict:** **CONDITIONAL**

---

## 1. Executive Summary

Phase PP-10C5 performs a rigorous read-only inspection and discrepancy audit regarding the site-visit active slot uniqueness index (`uq_site_visits_active_enquiry_slot`), cross-visit-type concurrency, distributed rate-limiting evidence, and reporting consistency.

Key findings:
1. **Index Discrepancy Identified:** The PP-10C4 report incorrectly described the partial unique index columns as `visit_date` and `time_window` and predicate as `status NOT IN ('CANCELLED', 'REJECTED')`. 
2. **Canonical Source Definition:** The actual source migration (`0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql`) and schema definition (`src/db/schema.ts`) correctly define the columns as `enquiry_id`, `preferred_date`, `preferred_time_window`, `visit_type` with predicate `status <> 'CANCELLED'`.
3. **Visit-Type Concurrency:** Because `visit_type` is part of the uniqueness tuple, distinct visit types (`IN_PERSON` vs `VIRTUAL`) for the same enquiry, date, and time window are permitted as separate active slots.
4. **Cancelled vs. Rejected Behaviour:** Only `CANCELLED` visits release the slot via the index predicate (`status <> 'CANCELLED'`). `REJECTED` visits remain constrained unless transitioned.
5. **Final Verdict:** **CONDITIONAL** — The implementation in source code and migration `0011` is robust and correct, but documentation/reporting text in PP-10C4 contained descriptive inaccuracies that must be formally reconciled.

---

## 2. Canonical Migration Definition

The canonical definition in source migration `drizzle/0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql` and `src/db/schema.ts` is:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "uq_site_visits_active_enquiry_slot"
  ON "site_visits" ("enquiry_id", "preferred_date", "preferred_time_window", "visit_type")
  WHERE "status" <> 'CANCELLED';
```

---

## 3. Actual Production Index Definition vs. PP-10C4 Report

| Attribute | Previously Approved Spec | PP-10C4 Reported Definition | Actual Canonical Source (`0011` & `schema.ts`) |
| :--- | :--- | :--- | :--- |
| **Columns** | `enquiry_id`, `preferred_date`, `preferred_time_window`, `visit_type` | `enquiry_id`, `visit_date`, `time_window` *(Inaccurate)* | `enquiry_id`, `preferred_date`, `preferred_time_window`, `visit_type` *(Correct)* |
| **Predicate** | `status <> 'CANCELLED'` | `status NOT IN ('CANCELLED', 'REJECTED')` *(Inaccurate)* | `status <> 'CANCELLED'` *(Correct)* |

**Conclusion:** PP-10C4's report contained an inaccurate textual summary of the index structure, while the actual code and migration `0011` correctly implemented the approved specification.

---

## 4. Column-by-Column Comparison

- **`enquiry_id`**: Present in both. Links the visit to its parent enquiry.
- **`preferred_date`**: Canonical column name in `site_visits` table (incorrectly referred to as `visit_date` in PP-10C4 report).
- **`preferred_time_window`**: Canonical column name in `site_visits` table (incorrectly referred to as `time_window` in PP-10C4 report).
- **`visit_type`**: Included in the composite uniqueness key (`IN_PERSON`, `VIRTUAL`, etc.).

---

## 5. Visit-Type Concurrency Analysis

- **Behavior:** Because `visit_type` is included in `uq_site_visits_active_enquiry_slot`, two concurrent or sequential site-visit bookings for the *same* enquiry, date, and time window with *different* visit types (e.g. one `IN_PERSON` and one `VIRTUAL`) are **permitted** by the database constraint.
- **Business Rationale:** A customer may theoretically request a virtual walkthrough and an in-person site visit at the same preferred time slot, or separate visit streams. However, if the business rule intends strictly **one active visit per enquiry per time window regardless of type**, `visit_type` should be removed from the unique index in a future migration.

---

## 6. Cancelled and Rejected Visit Behaviour

- **`CANCELLED`:** Excluded from the unique index predicate (`WHERE status <> 'CANCELLED'`). When a visit is cancelled, it releases the slot, allowing a new valid booking for that slot.
- **`REJECTED`:** Included in the unique index (not excluded by `status <> 'CANCELLED'`). If an enquiry visit is rejected by staff, the slot remains locked under the unique index unless the status is updated to `CANCELLED` or deleted.

---

## 7. Rate-Limiting Evidence Assessment

- **Source Inspection:** Rate limiting is implemented in `src/lib/rateLimit.ts` using the PostgreSQL `rate_limit_buckets` table created in migration `0010`.
- **Atomic Upserts:** Uses `INSERT ... ON CONFLICT (id) DO UPDATE SET request_count = request_count + 1`.
- **Fail-Closed Guarantee:** Exceptions thrown during database connection/query execution fail closed.
- **Evidence Status:** Supported by robust unit tests (`test-connection-validation.mjs`) and repository integration tests, though multi-process live worker execution remains subject to dedicated test database availability.

---

## 8. Validity of PP-10C4 PASS Verdict

- The **PASS** verdict in PP-10C4 was correct regarding code logic and database migration execution.
- However, because the text of the PP-10C4 report misstated index column names (`visit_date` vs `preferred_date`) and predicate filters (`NOT IN ('CANCELLED', 'REJECTED')` vs `status <> 'CANCELLED'`), the formal verdict is adjusted to **CONDITIONAL** pending this reconciliation audit.

---

## 9. Recommended Remediation (Read-Only Recommendation)

1. **Documentation Correction:** Adopt this PP-10C5 audit report as the canonical record of the site-visit index definition.
2. **Future Schema Alignment (Optional):** If `REJECTED` visits should also release slots, update the index predicate in a future migration to `WHERE status NOT IN ('CANCELLED', 'REJECTED')`. If `visit_type` should not distinguish slots, remove `visit_type` from the composite index.

---

## 10. Final Acceptance Decision

- **Verdict:** **CONDITIONAL**
- **Justification:** Source code and migration `0011` correctly enforce active slot uniqueness on (`enquiry_id`, `preferred_date`, `preferred_time_window`, `visit_type`) where `status <> 'CANCELLED'`. The discrepancy was strictly in the PP-10C4 report's textual description. All functional and security guarantees remain sound.
