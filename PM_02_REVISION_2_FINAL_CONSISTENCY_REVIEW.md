# GREAT HOMES V2 — PM-02 REVISION 2
## Final Technical Consistency Review

**Phase:** PM-02 Revision 2 — Final Pre-Execution Consistency Review  
**Mode:** 100% STRICTLY READ-ONLY — NO IMPLEMENTATION  
**Authoritative Hierarchy:** `PM_02_REVISION_2_FINAL_CONSISTENCY_REVIEW.md` > `PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` > `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md`  
**Prior Documents Preserved Unchanged:** `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md`, `PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md`  
**Workspace:** `/app/applet`  

> **Verification & Environment Honesty Notice**
> - Claims marked **`[Source]`** were verified directly against files in `/app/applet` (`src/db/schema.ts`, `src/db/client.ts`, `src/domain/propertySubmission/repository.ts`, `src/domain/projects/services/resaleService.ts`, `src/domain/projects/services/rentalService.ts`, `src/domain/projects/dto/resaleDto.ts`, `src/domain/projects/entities/resaleEntities.ts`, `src/domain/projects/entities/rentalEntities.ts`, `src/domain/projects/viewModels/listingDetailViewModel.ts`, `src/domain/enquiry/services/enquiryService.ts`, `app/buy/[slug]/page.tsx`, `app/api/resale/route.ts`, `app/api/rent/route.ts`, `package.json`).
> - Live staging and production PostgreSQL database state remains **`[UNVERIFIED — Live DB Unavailable]`** (`DATABASE_URL` and `TEST_DATABASE_URL` are not configured in this sandbox). Live DB verification is **never** claimed from source-code inspection.
> - Workspace Git state: **`NO_GIT`**.

---

## Executive Summary of Revision 2 Findings

This final consistency review resolves six subtle schema, security, concurrency, privacy, and invariant contradictions across `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` and `PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` prior to **PM-03**:

| ID | Finding | Core Resolution |
|---|---|---|
| **C-11** | PostgreSQL Catalog Definition Verification | Replace name-only checks in `0012` with exact definition inspection (`pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `tgfoid`, `information_schema.columns`) and safe drift repair. |
| **C-12** | Malware Scanner Approval Policy | Explicitly block `INFECTED`; gate `NOT_CONFIGURED`/`SCAN_ERROR` approvals behind fail-closed env toggle or `SUPER_ADMIN`/`ADMIN`-only `partner.approve_unscanned_override` + mandatory acknowledgement & `PARTNER_APPROVED_WITHOUT_AV_SCAN` audit. |
| **C-13** | Transactional Outbox Recovery | Add `locked_by`, `locked_at`, `lease_expires_at`, `max_attempts`, atomic `FOR UPDATE SKIP LOCKED` expired-lease reclamation, single-TX outbox + `ON CONFLICT (outbox_id)` idempotent `notifications` insert, and `DEAD_LETTER` backoff. |
| **C-14** | Representative Reassignment Consistency | Keep `submitter_customer_id` + `fk_partner_attestation_ownership` 100% immutable; enforce `managing_customer_id` (`UNIQUE(id, managing_customer_id)`) + immutable `partner_submission_manager_attestations` so reassignment genuinely unblocks approval/publication without corrupting historical attestation. |
| **C-15** | Public Listing Schema & Privacy | Verify `resale_listings`/`rental_listings` already strip all phone/email fields in `buildPublicDto()`, `ListingDetailViewModel`, JSON-LD, and search; keep personal contact strictly in `customers`/`property_submissions` (defaulting listing contact columns to `NULL`), add only `partner_organization_id` to listing tables, and resolve the verified `'PARTNER'` vs `'LISTING_PARTNER'` code conflict. |
| **C-16** | Last `OWNER_ADMIN` Protection | Enforce `ACTIVE org => >= 1 ACTIVE OWNER_ADMIN` across self-leave, member removal, demotion, concurrent admins, and staff moderation via `FOR UPDATE` locking, explicit `transfer-ownership` flow, and optional deferred constraint trigger. |

---

## C-11 — PostgreSQL Catalog Definition Verification

### 1. Original Contradiction or Defect
`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` (Correction 1) improved `0012_baseline_submission_partner_reconciliation.sql` by checking `pg_constraint` (`conname`), `pg_trigger` (`tgname`), and running `CREATE [UNIQUE] INDEX IF NOT EXISTS`. However, checking only by **object name** (`IF NOT EXISTS`) assumes any pre-existing PostgreSQL object with that name already has the **correct definition**:
- An existing `fk_partner_attestation_ownership` could have `ON DELETE CASCADE` instead of `ON DELETE RESTRICT` or reference the wrong columns.
- An existing `uq_resale_listing_submission` or `uq_rental_listing_submission` index could lack its partial predicate `WHERE ... IS NOT NULL` or be non-unique.
- An existing `CHECK` constraint could permit an outdated status list.
- An existing immutability trigger (`trg_*_immutable` or `trg_prevent_truncate_*`) could point to an old/wrong `tgfoid` function, or use `AFTER` instead of `BEFORE`.

### 2. Verified Source-Code / Database Evidence
- **`[Source: src/db/schema.ts:900-983]`** defines `customerPartnerProfiles`, `customerPartnerAuditHistory`, `propertySubmissions`, `propertySubmissionReviews`, `partnerAttestations`—omitting `fk_partner_attestation_ownership` and including redundant `idx_customer_partner_profiles_customer`.
- **`[Source: src/db/client.ts:726-850]`** contains runtime `ensureSchemaUpdates()` creating those 5 tables, `fk_partner_attestation_ownership` (`ON DELETE RESTRICT`), `prevent_modification()`, `prevent_truncate()`, and 6 triggers (`DROP TRIGGER IF EXISTS ... CREATE TRIGGER ...`), with no `CHECK` constraints.
- **`[Source: drizzle/meta/_journal.json]`** ends at `0011` (zero baseline migration coverage for these 5 tables).
- **`[UNVERIFIED — Live DB Unavailable]`** Live staging/production `pg_constraint`, `pg_indexes`, `pg_trigger`, and `information_schema.columns` definitions cannot be inspected in this sandbox.

### 3. Final Decision
`0012` (and its mandatory pre-flight verification script) MUST inspect and reconcile **exact PostgreSQL catalog definitions**, never relying solely on `IF NOT EXISTS` name presence:

1. **Mandatory Pre-Flight Catalog Inspection SQL (Read-Only):**
   ```sql
   -- Columns (type, nullability, default)
   SELECT table_name, column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('customer_partner_profiles','customer_partner_audit_history','property_submissions','property_submission_reviews','partner_attestations')
   ORDER BY table_name, ordinal_position;

   -- Constraints with full canonical definition & FK delete action ('r'=RESTRICT, 'c'=CASCADE, 'a'=NO ACTION)
   SELECT conrelid::regclass AS table_name, conname, contype, confdeltype, convalidated,
          pg_get_constraintdef(oid, true) AS definition
   FROM pg_constraint
   WHERE conrelid::regclass::text IN ('customer_partner_profiles','customer_partner_audit_history','property_submissions','property_submission_reviews','partner_attestations');

   -- Indexes with exact pg_get_indexdef (columns, uniqueness, partial WHERE predicate)
   SELECT tablename, indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename IN ('customer_partner_profiles','customer_partner_audit_history','property_submissions','property_submission_reviews','partner_attestations');

   -- Triggers with exact trigger definition AND bound function name
   SELECT c.relname AS table_name, t.tgname, p.proname AS function_name,
          pg_get_triggerdef(t.oid, true) AS trigger_def
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND c.relname IN ('customer_partner_profiles','customer_partner_audit_history','property_submissions','property_submission_reviews','partner_attestations');
   ```
2. **Safe Definition-Aware Reconciliation Rules in `0012`:**
   - **Columns:** Run `ADD COLUMN IF NOT EXISTS`; assert `information_schema.columns` types/nullability match `schema.ts` (abort migration clearly if an incompatible legacy column type exists requiring a manual data backfill).
   - **Constraints (`UNIQUE`, `FOREIGN KEY`, `CHECK`):** Look up `pg_get_constraintdef(oid, true)` and `confdeltype` (`= 'r'` for `RESTRICT`, `'n'` for `SET NULL`):
     - If missing → `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` (for `FK` / `CHECK`), run orphan/status normalization check, then `ALTER TABLE ... VALIDATE CONSTRAINT`.
     - If **present with mismatched definition** (e.g., `confdeltype <> 'r'` or wrong column/check expression) → `DROP CONSTRAINT <conname>` + `ADD CONSTRAINT <conname> ... NOT VALID` + `VALIDATE CONSTRAINT` inside a guarded `DO $$ ... END $$;` block.
   - **Indexes:** Inspect `pg_get_indexdef(indexrelid)` (plus `indisunique` and `pg_get_expr(indpred, indrelid)` in `pg_index`):
     - Always `DROP INDEX IF EXISTS idx_customer_partner_profiles_customer;` (duplicate of unique index).
     - For every required index (`uq_resale_listing_submission`, `uq_rental_listing_submission`, `uq_submission_id_customer`, etc.), if an index exists with that name whose normalized `pg_get_indexdef` lacks `UNIQUE` or the expected columns/`WHERE` predicate → `DROP INDEX IF EXISTS <name>` followed by `CREATE [UNIQUE] INDEX <name> ...`.
   - **Trigger Functions & Triggers:**
     - Always execute `CREATE OR REPLACE FUNCTION prevent_modification()` and `CREATE OR REPLACE FUNCTION prevent_truncate()`.
     - For each of the 6 immutability triggers (`trg_partner_attestations_immutable`, `trg_property_submission_reviews_immutable`, `trg_customer_partner_audit_immutable`, `trg_prevent_truncate_attestations`, `trg_prevent_truncate_reviews`, `trg_prevent_truncate_audit`), verify `pg_trigger` matches BOTH `p.proname` AND `pg_get_triggerdef(t.oid, true)` (`BEFORE UPDATE OR DELETE ... FOR EACH ROW` / `BEFORE TRUNCATE ... FOR EACH STATEMENT`). Only recreate (`DROP TRIGGER IF EXISTS ...` + `CREATE TRIGGER ...`) if missing or definition/function drifted.

### 4. Exact Database and API Implications
- **Database:** `0012` converges **brand-new**, **valid `ensureSchemaUpdates()`**, and **partially drifted legacy databases** to byte-equivalent constraint, index, and trigger semantics without dropping tables or losing rows.
- **API:** None directly; protects runtime domain integrity against drifted delete cascades or disabled immutability triggers.

### 5. Security and Authorization Implications
- Prevents silent retention of `ON DELETE CASCADE` on `fk_partner_attestation_ownership` or broken partial unique indexes (`uq_resale_listing_submission`) that could allow duplicate listing publication or loss of legal attestation records.
- Guarantees `prevent_modification()` and `prevent_truncate()` triggers cannot be silently bound to no-op functions.

### 6. Tests Required to Prove Correctness
- **Migration Drift-Repair Integration Test (`T-16b`, Real PostgreSQL):** Seed an isolated PostgreSQL DB with intentionally broken definitions (wrong `ON DELETE CASCADE` on `fk_partner_attestation_ownership`, non-partial `uq_resale_listing_submission`, missing `CHECK` constraint, `trg_customer_partner_audit_immutable` bound to a dummy function), execute `0012` + `0013`, and assert `pg_get_constraintdef`, `pg_get_indexdef`, and `pg_get_triggerdef` match `src/db/schema.ts` 100%.

### 7. Remaining Policy Decision
- Confirm whether `0012` runs during a brief deployment maintenance window (`ACCESS EXCLUSIVE` lock is brief for small tables, and `NOT VALID` + `VALIDATE CONSTRAINT` avoids blocking concurrent reads/writes during validation).

---

## C-12 — Malware Scanner Approval Policy

### 1. Original Contradiction or Defect
`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` (Correction 2) introduced `malware_scan_status` (`NOT_CONFIGURED`, `PENDING`, `CLEAN`, `INFECTED`, `SCAN_ERROR`), yet its approval check stated:
> *"`partner.approve` requires all mandatory documents to have `validation_status === 'PASSED'`, `malware_scan_status !== 'INFECTED'`, and `staff_verification_status === 'VERIFIED'`."*

This created a silent policy contradiction: it allowed any `PROPERTY_MANAGER` (or any approver) to approve partners with **unscanned (`NOT_CONFIGURED`) or errored (`SCAN_ERROR`) documents** with zero role restriction, zero acknowledgement, and zero dedicated audit trail.

### 2. Verified Source-Code / Database Evidence
- **`[Source: package.json]`** and **`[Source: src/lib/fileSecurity.ts]`** confirm there is **no antivirus daemon (ClamAV), YARA engine, or cloud AV scanner** integrated in Great Homes V2 today. Only magic-byte detection (`detectFileSignature()`), `sharp` image re-encoding, and PDF structural/active-content checks are available in-process.

### 3. Final Decision
Establish a strict, transparent distinction between **Document Acceptance** (format, magic bytes, EXIF sanitization, PDF active-content heuristics) and **Malware Clearance** (`malware_scan_status === 'CLEAN'` from a real AV engine):

1. **Honest Status Semantics (Never Falsify Clearance):**
   - `malware_scan_status = 'CLEAN'` may **ONLY** be written when a live external AV engine (`MALWARE_SCANNER_PROVIDER !== 'none'`) scans the buffer and returns clean.
   - When no scanner is configured, `malware_scan_status` remains **`'NOT_CONFIGURED'`**. Never label an unscanned file "clean" or "virus-free" in DB or UI.
2. **Hard Blocks (Zero Exceptions):**
   - `malware_scan_status === 'INFECTED'` → **ALWAYS REJECTED / BLOCKED** at upload (`422 MALWARE_DETECTED`) and approval (`409`). No role can override `'INFECTED'`.
   - `malware_scan_status === 'PENDING'` (when an async AV queue is active) → blocks `partner.approve` (`409 MALWARE_SCAN_PENDING`).
   - `validation_status !== 'PASSED'` or `sanitization_status === 'FAILED'` → **ALWAYS BLOCKED**.
3. **Approval Policy When `malware_scan_status IN ('NOT_CONFIGURED', 'SCAN_ERROR')`:**
   - **Strict Fail-Closed Mode (Default when `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL='true'`):** `partner.approve` is **strictly blocked (`409 MALWARE_SCAN_REQUIRED`)** if any mandatory document lacks `malware_scan_status = 'CLEAN'`.
   - **Controlled Manual-Review Override Mode (Only when `ALLOW_UNSCANNED_PARTNER_DOC_APPROVAL='true'` AND `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL='false'`):**
     - **Authorized Roles:** Restricted strictly to **`SUPER_ADMIN` and `ADMIN`** holding a dedicated capability **`partner.approve_unscanned_override`**. **`PROPERTY_MANAGER` is DENIED (`403`)** from approving partners with unscanned/`SCAN_ERROR` documents.
     - **Mandatory Explicit Request Payload:** `APPROVE` action payload MUST include:
       ```ts
       unscannedDocumentOverride: {
         acknowledged: true, // literal true required
         reason: string,     // min 15 chars justification
         documentIds: string[] // exact unscanned/errored doc IDs being accepted under manual risk
       }
       ```
     - **UI & Evidence:** Admin Workspace displays an explicit red/amber banner (`"Automated Malware Scan Unavailable (NOT_CONFIGURED) — Manual Risk Override Required (Admin/Super Admin Only)"`) and requires checking the risk acknowledgement box + entering justification.
     - **Mandatory Audit Trail & Record:**
       - Persist override evidence in `partner_applications.verification_checklist.unscannedOverride` (`{ acknowledgedByStaffId, acknowledgedAt, reason, documentIds, malwareStatusesSnapshot }`).
       - Emit **dedicated audit event** `PARTNER_APPROVED_WITHOUT_AV_SCAN` into both `customer_partner_audit_history` and `audit_logs` (alongside `APPLICATION_APPROVED`).

### 4. Exact Database and API Implications
- **Database:** Keep 4 separate columns on `partner_documents` (`validation_status`, `sanitization_status`, `malware_scan_status`, `staff_verification_status`). `partner_applications.verification_checklist` stores structured override evidence. Add `PARTNER_APPROVED_WITHOUT_AV_SCAN` to `AuditAction` constants.
- **API:** `POST /api/admin/partners/[id]/action` (`APPROVE`) inspects `malware_scan_status` of all non-deleted application documents:
  - If all mandatory docs are `'CLEAN'` → `partner.approve` suffices.
  - If any mandatory doc is `'INFECTED'` → `409 MALWARE_DETECTED` (always).
  - If any mandatory doc is `'NOT_CONFIGURED'` or `'SCAN_ERROR'`:
    - If `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL === 'true'` → `409 MALWARE_SCAN_REQUIRED`.
    - Else require `partner.approve_unscanned_override` (`403` for `PROPERTY_MANAGER`) + valid `unscannedDocumentOverride` body (`422` if missing/incomplete).
- **Environment Config (`.env.example` addition in PM-03):** Document `MALWARE_SCANNER_PROVIDER="none"`, `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL="true"` (safe fail-closed default for production; explicitly documented toggle if manual override is authorized during initial rollout).

### 5. Security and Authorization Implications
- Prevents privilege creep: `PROPERTY_MANAGER` can review and approve AV-cleared applications (`partner.approve`), but **only `ADMIN` / `SUPER_ADMIN`** can authorize accepting unscanned external KYC files (`partner.approve_unscanned_override`), with non-repudiable audit attribution.

### 6. Tests Required to Prove Correctness
- **Unit & API Authorization Tests:**
  1. Document with `malware_scan_status = 'INFECTED'` rejected for all roles including `SUPER_ADMIN` (`409`).
  2. When `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL='true'` and doc is `'NOT_CONFIGURED'`, even `SUPER_ADMIN` approval fails `409`.
  3. When override toggle enabled and doc is `'NOT_CONFIGURED'`:
     - `PROPERTY_MANAGER` receives `403`.
     - `ADMIN` without `unscannedDocumentOverride` receives `422`.
     - `ADMIN` with valid `unscannedDocumentOverride` succeeds (`200`), leaves `malware_scan_status = 'NOT_CONFIGURED'` (never mutates to `'CLEAN'`), and writes `PARTNER_APPROVED_WITHOUT_AV_SCAN` audit log.

### 7. Remaining Policy Decision
- **`[OPEN DECISION]` Launch Gate Policy:** Business/security leadership must decide before PM-03/PM-07 production cutover whether `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL` remains `'true'` (requiring ClamAV/R2 AV integration before go-live) or launches with `'false'` + `ADMIN`/`SUPER_ADMIN` `partner.approve_unscanned_override`.

---

## C-13 — Transactional Outbox Recovery

### 1. Original Contradiction or Defect
`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` (Correction 7) introduced `notification_outbox` polling `WHERE status = 'PENDING' AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED`. Because it omitted `locked_at`, `locked_by`, and `lease_expires_at` (and only polled `status = 'PENDING'`), any worker crash *after* setting `status = 'PROCESSING'` would leave the notification permanently stranded in `'PROCESSING'` forever. Additionally, it did not detail exact crash-recovery idempotency if an `IN_APP` notification row was inserted prior to outbox status update.

### 2. Verified Source-Code / Database Evidence
- **`[Source: src/db/schema.ts:641-680]`**: `notifications` (`id`, `customerId`, `type`, `title`, `message`, `resourceType`, `resourceId`, `metadata`, `isRead`, `createdAt`) and `alert_delivery_attempts` (`id`, `notificationId`, `channel`, `status`, `attempts`, `lastAttemptAt`, `failureReason`) currently have **no** `outbox_id` column or unique idempotency constraint on `(notification_id, channel)`.
- **`[Source: src/domain/customer/services/notificationService.ts:44-104]`**: `createNotification()` currently does sequential unguarded inserts without transaction/outbox wrapping, and `deliverEmail()` throws when SMTP/SendGrid are unconfigured.

### 3. Final Decision
Specify a **lease-based, crash-recoverable PostgreSQL Transactional Outbox**:

1. **Outbox Schema Additions (`notification_outbox` in `0013`):**
   - `id text PRIMARY KEY` (`nout_...`)
   - `idempotency_key text NOT NULL UNIQUE`
   - `event_type text NOT NULL`
   - `recipient_customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT`
   - `aggregate_type text NOT NULL`
   - `aggregate_id text NOT NULL`
   - `payload jsonb NOT NULL`
   - `status text NOT NULL DEFAULT 'PENDING'` (`CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER'))`)
   - `attempts integer NOT NULL DEFAULT 0`
   - `max_attempts integer NOT NULL DEFAULT 5`
   - `locked_by text` *(nullable; worker instance + UUID)*
   - `locked_at timestamp with time zone`
   - `lease_expires_at timestamp with time zone`
   - `next_attempt_at timestamp with time zone NOT NULL DEFAULT now()`
   - `processed_at timestamp with time zone`
   - `last_error text`
   - `created_at timestamp with time zone NOT NULL DEFAULT now()`
   - Index: `idx_notification_outbox_claimable ON notification_outbox (status, next_attempt_at, lease_expires_at) WHERE status IN ('PENDING', 'PROCESSING')`.
2. **Idempotency Columns on `notifications` & `alert_delivery_attempts` (`0013`):**
   - `notifications.outbox_id text` + `CREATE UNIQUE INDEX uq_notifications_outbox_id ON notifications (outbox_id) WHERE outbox_id IS NOT NULL;`
   - `CREATE UNIQUE INDEX uq_alert_delivery_notif_channel ON alert_delivery_attempts (notification_id, channel);`
3. **Atomic Claim Query (Reclaims Both Due `PENDING` and Expired `PROCESSING` Leases):**
   - Lease TTL: **`60 seconds`**.
   ```sql
   WITH claimable AS (
     SELECT id
     FROM notification_outbox
     WHERE (
       (status = 'PENDING' AND next_attempt_at <= now())
       OR
       (status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= now())
     )
     ORDER BY created_at ASC
     LIMIT $batchSize
     FOR UPDATE SKIP LOCKED
   )
   UPDATE notification_outbox o
   SET status = 'PROCESSING',
       locked_by = $workerId,
       locked_at = now(),
       lease_expires_at = now() + interval '60 seconds'
   FROM claimable
   WHERE o.id = claimable.id
   RETURNING o.*;
   ```
4. **Transactional Delivery & Zombie-Worker Protection:**
   - When dispatching a claimed record `$row` (`locked_by = $workerId`):
     1. **All-in-One DB TX for `IN_APP`:** Execute inside a single PostgreSQL transaction:
        - `INSERT INTO notifications (..., outbox_id) VALUES (..., $row.id) ON CONFLICT (outbox_id) WHERE outbox_id IS NOT NULL DO NOTHING RETURNING id` (if conflict, look up existing `SELECT id FROM notifications WHERE outbox_id = $row.id`).
        - `INSERT INTO alert_delivery_attempts (..., notification_id, channel='IN_APP', status='SENT') ON CONFLICT (notification_id, channel) DO UPDATE ...`
        - If external Email/SMS provider is unconfigured: upsert `alert_delivery_attempts` (`channel='EMAIL', status='SKIPPED_PROVIDER_UNCONFIGURED'`).
        - Mark outbox processed **guarded by lease ownership**:
          ```sql
          UPDATE notification_outbox
          SET status = 'PROCESSED',
              processed_at = now(),
              locked_by = NULL,
              locked_at = NULL,
              lease_expires_at = NULL
          WHERE id = $row.id
            AND status = 'PROCESSING'
            AND locked_by = $workerId;
          ```
          If `rowCount === 0` (meaning lease expired and another worker reclaimed it), roll back TX cleanly (`CONCURRENT_LEASE_LOST`).
     2. **Crash Scenario Proof ("Crash after creating `notifications` before marking `PROCESSED`"):**
        - For PostgreSQL `IN_APP` delivery, step (1) wraps `notifications` insert + `PROCESSED` update in **one atomic DB transaction**, so a process crash cannot commit `notifications` without marking `PROCESSED`.
        - Even if a future external channel or split-step processor creates `notifications` in TX-1 and crashes before marking `PROCESSED` in TX-2: after 60s `lease_expires_at <= now()`, the next sweep reclaims the expired `'PROCESSING'` row, hits `ON CONFLICT (outbox_id) DO NOTHING`, skips duplicate `notifications` creation, reuses the existing `notification_id`, and transitions the outbox row cleanly to `'PROCESSED'`.
5. **Retry Backoff & Dead-Letter Policy:**
   - On failure (caught inside failure-update TX guarded by `AND locked_by = $workerId`):
     - `nextAttempts = row.attempts + 1`.
     - If `nextAttempts >= row.max_attempts` (`5`): set `status = 'DEAD_LETTER'`, clear `locked_by` / `locked_at` / `lease_expires_at`, store truncated `last_error` (`<=1000 chars`, zero secrets/PII), and emit a high-severity operational log / Admin alert.
     - Else: set `status = 'PENDING'`, `attempts = nextAttempts`, `next_attempt_at = now() + (interval '30 seconds' * power(2, nextAttempts - 1))` (`30s`, `60s`, `120s`, `240s`), clear lease fields.
   - Expose staff replay action (`POST /api/admin/notifications/outbox/[id]/replay`, `SUPER_ADMIN`/`ADMIN` only) to reset a `DEAD_LETTER` item back to `PENDING` (`attempts = 0`).

### 4. Exact Database and API Implications
- **Database:** `0013` adds `notification_outbox` with lease columns + claimable partial index, adds `notifications.outbox_id` + partial unique index `uq_notifications_outbox_id`, and adds `uq_alert_delivery_notif_channel` on `alert_delivery_attempts`.
- **API:** Internal sweep endpoint `POST /api/internal/jobs/notification-outbox` protected by `CRON_SECRET` timing-safe bearer auth; Admin DLQ replay endpoint restricted to `SUPER_ADMIN` / `ADMIN`.

### 5. Security and Authorization Implications
- Ensures guaranteed crash-safe delivery of security-critical notifications (Suspension, Revocation, Info Request) without duplicate inbox spam or exposed PII in `last_error`.
- Cron sweep endpoint cannot be triggered by public callers (`401` without `CRON_SECRET`).

### 6. Tests Required to Prove Correctness
- **Real PostgreSQL Outbox Recovery Tests:**
  1. Simulated worker claims row (`PROCESSING`, `lease_expires_at = now() - 1s`), crashes → sweep reclaims expired lease and completes `PROCESSED`.
  2. Pre-existing row in `notifications` sharing `outbox_id` → recovery worker hits `ON CONFLICT` cleanly, produces exactly 1 notification, and marks `PROCESSED`.
  3. Slow worker with expired `locked_by` tries `UPDATE ... WHERE locked_by = $oldWorker` after new worker reclaimed → `rowCount === 0`, zero overwrite.
  4. 5 simulated failures → exponential `next_attempt_at` progression ending in `DEAD_LETTER`.

### 7. Remaining Policy Decision
- **`[OPEN DECISION]` Sweep Trigger Cadence:** Confirm Cloud Scheduler interval (recommended: every 1–2 minutes) calling `/api/internal/jobs/notification-outbox` alongside immediate post-commit fire-and-forget dispatch.

---

## C-14 — Representative Reassignment Consistency

### 1. Original Contradiction or Defect
`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` (Correction 9) contained two internal contradictions:
1. It introduced `managing_customer_id` to support reassigning org submissions when a `REPRESENTATIVE` is removed, **yet** stated: *"`approveSubmission()` and `publishSubmission()` block with `409 SUBMITTER_MEMBERSHIP_INACTIVE` while `submitter_customer_id` is `SUSPENDED`/`REMOVED` from `$orgId`."* Checking `submitter_customer_id` instead of `managing_customer_id` meant reassignment would **still fail to unblock approval/publication**!
2. Conversely, mutating `submitter_customer_id` would break the existing composite foreign key **`fk_partner_attestation_ownership (submission_id, partner_customer_id) REFERENCES property_submissions (id, submitter_customer_id) ON DELETE RESTRICT`** and alter historical audit attribution, while leaving unresolved whether the newly assigned managing representative must provide a fresh attestation.

### 2. Verified Source-Code / Database Evidence
- **`[Source: src/db/schema.ts:946, 973-983]`** & **`[Source: src/db/client.ts:768, 792-803]`**:
  - `property_submissions` defines `CONSTRAINT uq_submission_id_customer UNIQUE (id, submitter_customer_id)`.
  - `partner_attestations` defines `CONSTRAINT fk_partner_attestation_ownership FOREIGN KEY (submission_id, partner_customer_id) REFERENCES property_submissions (id, submitter_customer_id) ON DELETE RESTRICT`.
  - Both `partner_attestations` and `property_submission_reviews` carry `BEFORE UPDATE OR DELETE` (`prevent_modification()`) and `BEFORE TRUNCATE` (`prevent_truncate()`) immutability triggers (`client.ts:814-849`).
- Therefore, `submitter_customer_id` and existing `partner_attestations` rows **cannot and must not be mutated or deleted** after creation!

### 3. Final Decision
Cleanly separate **Immutable Historical Originator (`submitter_customer_id` + `partner_attestations`)** from **Current Operational Manager (`managing_customer_id` + `partner_submission_manager_attestations`)**:

1. **Schema Reconciliation on `property_submissions` (`0013`):**
   - `submitter_customer_id`: **Strictly immutable forever.** Anchors `uq_submission_id_customer` and `fk_partner_attestation_ownership` cleanly without any change to existing `partner_attestations` behavior.
   - `partner_organization_id text REFERENCES partner_organizations(id) ON DELETE RESTRICT` (nullable; `NULL` for `OWNER` & Individual `PARTNER`, non-null for Organization `PARTNER`).
   - `managing_customer_id text REFERENCES customers(id) ON DELETE RESTRICT` (backfilled on all existing rows via `UPDATE property_submissions SET managing_customer_id = submitter_customer_id WHERE managing_customer_id IS NULL`, then set **`NOT NULL`** on `0013` with `CONSTRAINT uq_submission_id_manager UNIQUE (id, managing_customer_id)`!).
2. **New Immutable Table (`0013`): `partner_submission_manager_attestations`:**
   - Captures fresh ownership-authority attestations whenever an organization submission is reassigned (`managing_customer_id !== submitter_customer_id`), without modifying `partner_attestations` or weakening `fk_partner_attestation_ownership`:
     - `id text PRIMARY KEY` (`pma_...`)
     - `submission_id text NOT NULL`
     - `managing_customer_id text NOT NULL`
     - `partner_organization_id text NOT NULL REFERENCES partner_organizations(id) ON DELETE RESTRICT`
     - `previous_manager_customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT`
     - `reassigned_by_customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT`
     - `attestation_version text NOT NULL DEFAULT 'v1.0'`
     - `declaration_text text NOT NULL`
     - `accepted_at timestamp with time zone NOT NULL DEFAULT now()`
     - **Composite FK:** `CONSTRAINT fk_manager_attestation_ownership FOREIGN KEY (submission_id, managing_customer_id) REFERENCES property_submissions (id, managing_customer_id) ON DELETE RESTRICT`!
     - **Immutability Triggers:** Protected by `prevent_modification()` and `prevent_truncate()` identically to `partner_attestations`.
3. **Exact Membership & Attestation Checked at Every Lifecycle Stage:**
   - **Invariant for `PARTNER` Organization Submissions (`partner_organization_id IS NOT NULL`):**
     - **Draft Editing / Media Upload (`DRAFT`, `CHANGES_REQUESTED`, `updateDraft`, `uploadMedia`):**
       - Caller `auth.customerId` must be `ACTIVE` member of `partner_organization_id` (`FOR SHARE`), AND (`auth.customerId === submission.managing_customer_id` OR `caller.memberRole === 'OWNER_ADMIN'`).
       - Original `submitter_customer_id` (if removed/suspended) receives **`403`** immediately.
     - **Submit / Resubmit (`submitForReview`):**
       - Checks `PartnerEligibilityService` for `submission.managing_customer_id` (NOT `submitter_customer_id`!) under `partner_organization_id` (`ACTIVE` customer + `ACTIVE` org + `ACTIVE` membership).
       - Requires valid attestation for the **current `managing_customer_id`**:
         - If `managing_customer_id === submitter_customer_id` → satisfied by original `partner_attestations` (`fk_partner_attestation_ownership`).
         - If `managing_customer_id !== submitter_customer_id` → satisfied **only** by a matching row in `partner_submission_manager_attestations` for `(submission.id, submission.managing_customer_id)`!
     - **Staff Approval (`approveSubmission`) & Publication (`publishSubmission`):**
       - Canonical row-lock check (`FOR SHARE`) evaluates **`submission.managing_customer_id`** (not departed `submitter_customer_id`)!
       - Verifies:
         1. `partner_organizations` (`partner_organization_id`) is `ACTIVE`.
         2. `partner_organization_members` (`partner_organization_id`, `submission.managing_customer_id`) is `ACTIVE`.
         3. `customers` (`submission.managing_customer_id`) is `ACTIVE`.
         4. Valid attestation exists for `(submission.id, submission.managing_customer_id)` (either original `partner_attestations` when never reassigned, OR `partner_submission_manager_attestations` for current manager).
         - Missing manager attestation → **`409 MANAGER_ATTESTATION_REQUIRED`**.
         - Inactive manager membership → **`409 MANAGER_MEMBERSHIP_INACTIVE`**.
4. **How Reassignment Unblocks Submissions Cleanly:**
   - `POST /api/customer/partner/organizations/[id]/submissions/[submissionId]/reassign` (`ACTIVE` `OWNER_ADMIN` of `$id` only, allowed for `DRAFT`, `CHANGES_REQUESTED`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED` — not `PUBLISHED`/`REJECTED`/`WITHDRAWN`):
     - Verifies target `newManagerCustomerId` is an `ACTIVE` member of `$id`.
     - Updates **`managing_customer_id = newManagerCustomerId`** inside TX (never touches `submitter_customer_id`!).
     - Writes `property_submission_reviews` audit event (`MANAGER_REASSIGNED`) + `customer_partner_audit_history`.
     - **Attestation rule:** If `newManagerCustomerId === auth.customerId` (`OWNER_ADMIN` taking over directly) and `acceptAttestation === true` + `declarationText` provided, inserts `partner_submission_manager_attestations` atomically inside the same TX, **immediately unblocking staff review/approval/publication**! If reassigned to another active rep `C`, `C` signs via `POST /api/customer/property-submissions/[id]/manager-attestation`, which inserts `partner_submission_manager_attestations` and unblocks approval/publication.

### 4. Exact Database and API Implications
- **Database:** `0013` adds `managing_customer_id` (`NOT NULL` after backfill, `UNIQUE (id, managing_customer_id)`), `partner_organization_id`, and `partner_submission_manager_attestations` (with composite FK `fk_manager_attestation_ownership` and immutability triggers). Zero modification to `fk_partner_attestation_ownership`!
- **API:** Updates customer draft/media ownership checks and staff `approveSubmission`/`publishSubmission` eligibility queries to evaluate `managing_customer_id`. Adds reassignment and manager-attestation endpoints.

### 5. Security and Authorization Implications
- Preserves non-repudiable chain of custody: original creator attestation (`partner_attestations`) is untouched, and the active responsible manager (`managing_customer_id`) explicitly assumes legal marketing authority (`partner_submission_manager_attestations`) before staff can approve or publish.

### 6. Tests Required to Prove Correctness
- **Real PostgreSQL Lifecycle + Reassignment Tests:**
  1. Rep A creates & submits org listing (`partner_attestations` created with `A`); `OWNER_ADMIN` removes Rep A → Rep A gets `403`, staff `approveSubmission` returns `409 MANAGER_MEMBERSHIP_INACTIVE`.
  2. `OWNER_ADMIN` reassigns `managing_customer_id` to Rep B without B's attestation → `submitter_customer_id` & `partner_attestations` remain `A`, staff `approveSubmission` returns `409 MANAGER_ATTESTATION_REQUIRED`.
  3. Rep B signs manager attestation → `partner_submission_manager_attestations` row created (`fk_manager_attestation_ownership` satisfied); staff `approveSubmission` & `publishSubmission` succeed (`200`), while `partner_attestations` remains immutably pointing to `A`.

### 7. Remaining Policy Decision
- None (fully specified; reassignment requires fresh manager attestation whenever `managing_customer_id !== submitter_customer_id`).

---

## C-15 — Public Listing Schema and Privacy

### 1. Original Contradiction or Defect
`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` (Correction 6) kept `resale_listings` / `rental_listings` populated with `private_phone`/`private_email`/`owner_phone` during `publishSubmission()` and stated no extra columns were needed on listing tables, without auditing actual `resale_listings` / `rental_listings` definitions, public serializers, JSON-LD, search indexes, or the live code conflict between `'PARTNER'` and `'LISTING_PARTNER'`.

### 2. Verified Source-Code / Database Evidence
- **`[Source: src/db/schema.ts:235-275 & 300-344]`** (`resaleListings` & `rentalListings`):
  - **Existing attribution & contact columns:** `listingPartyType` (`NOT NULL`), `listingPartyDisplayName`, `ownerName`, `ownerPhone`, `ownerEmail`, `brokerName`, `brokerPhone`, `brokerEmail`, `privatePhone`, `privateEmail`, `source`, `crmId`.
  - **Missing columns on listing tables:** Neither table currently has `partner_organization_id` (foreign key to `partner_organizations.id`). *(Note: `property_submissions` links 1:1 to `resale_listing_id` / `rental_listing_id`, but listing tables themselves have no direct indexed org FK.)*
- **`[Source: src/domain/projects/dto/resaleDto.ts:48-103]`**, **`[Source: resaleService.ts:365-440]`**, **`[Source: rentalService.ts:375-450]`**, **`[Source: listingDetailViewModel.ts:51-153]`**:
  - `buildPublicDto()` explicitly constructs `PublicResaleListingDto` / `PublicRentalListingDto` with ONLY `listingParty: { type, label }` (`'Owner Listed'` or `'Listing Partner'`), **stripping `listingPartyDisplayName`, `ownerName`, `ownerPhone`, `ownerEmail`, `brokerName`, `brokerPhone`, `brokerEmail`, `privatePhone`, `privateEmail`**.
  - Only `buildAdminDto()` (served behind `verifyStaffCapability(req, 'listing.read' | 'MANAGE_RESALE' | 'MANAGE_RENTAL')` in `app/api/resale/route.ts:12-14` & `app/api/rent/route.ts:12-14`) returns private/broker/owner fields.
- **`[Source: app/buy/[slug]/page.tsx:163-200]`** & grep across `src/domain/search`, `app/rent/[slug]`, `src/components/properties/detail/**`:
  - Zero JSON-LD `<script type="application/ld+json">`, search index payloads, or public UI components render personal phone/email or `ownerPhone`/`brokerPhone`/`privatePhone`.
- **`[Source: CONFLICT DETECTED]` `'PARTNER'` vs `'LISTING_PARTNER'`:**
  - `resaleEntities.ts:4`, `rentalEntities.ts:4`, `resaleService.ts:548-550` (hard runtime validation error!), `seed.ts:776,933,983`, and `app/admin/listings/...` strictly enforce **`'LISTING_PARTNER'`**.
  - `propertySubmission/repository.ts:3258,3314` and `enquiryService.ts:174,242` write/check **`'PARTNER'`**.

### 3. Final Decision
1. **Existing vs Net-New Columns on `resale_listings` & `rental_listings`:**
   - **Existing columns reused:**
     - `listing_party_type` (`NOT NULL`) — canonicalized across codebase (see #4 below).
     - `listing_party_display_name` — public-safe attribution label only (e.g., Organization `trade_name || legal_name` or `'Verified Partner'` / `'Verified Owner'`; **never personal phone/email**).
     - `source` (`'CUSTOMER_PORTAL'`), `crm_id` (submission reference ID e.g. `submission.id`).
   - **Net-new column added via `0013` on BOTH `resale_listings` & `rental_listings`:**
     - `partner_organization_id text REFERENCES partner_organizations(id) ON DELETE SET NULL` + indexes `idx_resale_listings_partner_org` and `idx_rental_listings_partner_org` (enables fast O(1) staff suspension/revocation cascade of published org listings without full-table joins to `property_submissions`).
2. **Preferred Private Contact Storage (Keep Personal PII Out of Listing Tables):**
   - **Do NOT duplicate customer personal phone/email into `resale_listings` / `rental_listings` (`owner_phone`, `owner_email`, `broker_phone`, `broker_email`, `private_phone`, `private_email`) during `publishSubmission()`.** Leave all 6 personal/contact columns **`NULL`** on newly published submissions by default!
   - **Authoritative Private Contact Resolution:** Internal CRM, Staff Submission Detail, and Enquiry Dispatch read verified owner/partner/organization contact directly from **`customers` (`submitter_customer_id` / `managing_customer_id`)** and **`partner_organizations` (`official_phone`, `official_email`)** via `property_submissions`.
   - Still enforce at `publishSubmission()` time inside TX that the active submitter/manager (`customers`) has a verified `phone` (`422 MISSING_VERIFIED_CONTACT`), permanently deleting `'Verified Owner'` and `'9876543210'` fake fallbacks (`repository.ts:3227-3338`).
3. **Public Exposure & Phone Display Policy:**
   - **Public phone display is DISABLED by default** across all public resale/rental cards, detail pages (`/buy/[slug]`, `/rent/[slug]`), public APIs (`/api/resale`, `/api/rent`), search endpoints, and JSON-LD structured data. All buyer inquiries route 100% through Great Homes CRM (`POST /api/enquiries`).
   - `PublicResaleListingDto` / `PublicRentalListingDto` continue strictly stripping all `*Phone`, `*Email`, `ownerName`, `brokerName`, `internalNotes`, and `crmId` fields.
   - Public attribution (`listingParty.label` / `listingPartyDisplayName`) exposes at most non-PII category (`'Owner Listed'` / `'Partner Listed'`) or verified agency `trade_name || legal_name` (if opted in by Open Decision #2 below), never personal phone/email.
4. **Canonical Vocabulary Resolution (`'PARTNER'` vs `'LISTING_PARTNER'`):**
   - Inspect live DB counts in pre-flight (`SELECT listing_party_type, COUNT(*) FROM resale_listings/rental_listings GROUP BY listing_party_type`).
   - **Target Canonical Standard:** Standardize on **`'LISTING_PARTNER'`** in `resale_listings.listing_party_type` & `rental_listings.listing_party_type` (matching existing `resaleEntities.ts:4`, `rentalEntities.ts:4`, `resaleService.ts:548`, `seed.ts`, and `app/admin/listings/**`!), while updating `propertySubmission/repository.ts:3258,3314` to write `'LISTING_PARTNER'` and updating `enquiryService.ts:174,242` to match `=== 'PARTNER' || === 'LISTING_PARTNER'` (while `property_submissions.listing_source` continues using `'OWNER' | 'PARTNER'`). Zero breaking changes to existing admin listing editors or validators!

### 4. Exact Database and API Implications
- **Database (`0013`):**
  ```sql
  ALTER TABLE resale_listings ADD COLUMN IF NOT EXISTS partner_organization_id text REFERENCES partner_organizations(id) ON DELETE SET NULL;
  ALTER TABLE rental_listings ADD COLUMN IF NOT EXISTS partner_organization_id text REFERENCES partner_organizations(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_resale_listings_partner_org ON resale_listings(partner_organization_id);
  CREATE INDEX IF NOT EXISTS idx_rental_listings_partner_org ON rental_listings(partner_organization_id);
  ```
- **API & DTOs:** `PublicResaleListingDto` & `PublicRentalListingDto` maintain strict allowlist projection; `buildAdminDto` remains gated behind `verifyStaffCapability`; `publishSubmission()` stops writing `'9876543210'` and keeps personal contact out of listing rows.

### 5. Security and Authorization Implications
- Defense-in-depth PII protection: even if a developer mistakenly serializes a raw `resale_listings` or `rental_listings` row in a future endpoint, personal `customers.phone` / `customers.email` are not stored there (`NULL`), and `buildPublicDto()` / `ListingDetailViewModel` strictly exclude all contact fields.

### 6. Tests Required to Prove Correctness
- **Publication & Public Privacy Regression Tests:**
  1. Publish `PARTNER` resale & rental listings (`T-13b`, Real PG): verify `resale_listings` / `rental_listings` rows contain `listing_party_type = 'LISTING_PARTNER'`, `partner_organization_id` (for org), `owner_phone = NULL`, `broker_phone = NULL`, `private_phone = NULL`, and zero `'Verified Owner'` / `'9876543210'`.
  2. Assert `GET /api/resale`, `GET /api/rent`, `/buy/[slug]`, `/rent/[slug]`, HTML `<script type="application/ld+json">`, and search responses contain **zero** occurrences of submitter/partner phone or email strings.
  3. Assert `POST /api/enquiries` routes leads on `'LISTING_PARTNER'` listings with `listingSource = 'PARTNER_SUBMITTED_PROPERTY'`.

### 7. Remaining Policy Decision
- **`[OPEN DECISION]` Agency Display Name on Public Cards:** Confirm whether public resale/rental cards show the verified agency's trade/legal name (`listingPartyDisplayName`, e.g., `"Apex Realty · Verified Partner"`) or strictly `"Listing Partner"` with zero agency name.

---

## C-16 — Last `OWNER_ADMIN` Protection

### 1. Original Contradiction or Defect
`PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` §9.1 mentioned `409 LAST_OWNER_ADMIN` only on `PATCH /api/customer/partner/organizations/[id]/members/[memberId]`, leaving major gaps:
1. It did not specify what happens if the sole `ACTIVE` `OWNER_ADMIN` tries to **self-deactivate/leave** via membership vs deactivating the organization.
2. It did not define the **ownership transfer / promotion** workflow, eligibility requirements, or audit trail.
3. It did not apply the same safeguard to **staff moderation** (e.g., if staff suspends or removes an individual `OWNER_ADMIN`'s membership while leaving the organization `ACTIVE`) or concurrent multi-admin demotion/removal races.

### 2. Verified Source-Code / Database Evidence
- **`[Source: PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md §9.1 & §10.2]`** and **`[Source: PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md Correction 8]`**.
- Currently no `partner_organizations` or `partner_organization_members` code exists in `/src` yet (net-new PM-03+ schema).

### 3. Final Decision
Enforce the **Non-Orphaned Active Organization Invariant**:
> **An organization (`partner_organizations`) with `status = 'ACTIVE'` MUST ALWAYS have `>= 1` `ACTIVE` `OWNER_ADMIN` in `partner_organization_members`.**

1. **Exact Locking Rule for Any Mutation Affecting an `OWNER_ADMIN` Membership:**
   - Inside PostgreSQL TX (`SET LOCAL lock_timeout = '5s'`):
     1. Lock the parent org: `SELECT id, status, owner_customer_id FROM partner_organizations WHERE id = $orgId FOR UPDATE`.
     2. Lock all active admin memberships: `SELECT id, customer_id FROM partner_organization_members WHERE organization_id = $orgId AND member_role = 'OWNER_ADMIN' AND status = 'ACTIVE' FOR UPDATE`.
     3. If the operation would remove (`REMOVED`), suspend (`SUSPENDED`), leave (`LEAVE`), or demote (`OWNER_ADMIN → REPRESENTATIVE`) an `ACTIVE` `OWNER_ADMIN` **and** `remainingActiveAdmins.length === 0` while `org.status === 'ACTIVE'`:
        - **REJECT (`409 LAST_OWNER_ADMIN_REQUIRED`)** across ALL actors unless paired atomically with a valid replacement or org deactivation/suspension!
2. **Behavior by Exact Scenario:**
   - **Customer Self-Removal / Demotion (`PATCH .../members/[memberId]` with `REMOVE` / `LEAVE` / `memberRole: 'REPRESENTATIVE'`):**
     - Blocked with **`409 LAST_OWNER_ADMIN_REQUIRED`** if caller is the last `ACTIVE` `OWNER_ADMIN`. Must first transfer ownership to an existing `ACTIVE` member OR use org deactivation.
   - **Customer Voluntary Organization Self-Deactivation (`POST /api/customer/partner/deactivate` with `organizationId`):**
     - **Allowed** for the sole `ACTIVE` `OWNER_ADMIN` because it transitions **`partner_organizations.status` from `'ACTIVE'` to `'DEACTIVATED'`** (the org is no longer `ACTIVE`), while preserving the `OWNER_ADMIN` membership record (`PARTNER_SELF_DEACTIVATED`). Note: deactivating the org locks new org drafts/submissions and handles published org listings per org deactivation policy.
   - **Ownership Transfer & Admin Promotion Workflow (`POST /api/customer/partner/organizations/[id]/transfer-ownership`):**
     - Caller must be an `ACTIVE` `OWNER_ADMIN` of `$id` (`partner_organizations.status === 'ACTIVE'`).
     - Target `newOwnerCustomerId` MUST already be an **`ACTIVE`** member of `$id` (`status = 'ACTIVE'` + `customers.status = 'ACTIVE'`)—an `INVITED` or `SUSPENDED` customer **cannot** be promoted or made owner!
     - Inside one atomic TX (`partner_organizations FOR UPDATE` + both member rows `FOR UPDATE`):
       1. Promote target member (`member_role = 'OWNER_ADMIN'`).
       2. Update `partner_organizations.owner_customer_id = newOwnerCustomerId`.
       3. Optional caller step (`callerAction: 'STAY_ADMIN' | 'DEMOTE_TO_REPRESENTATIVE' | 'LEAVE_ORG'`): safe because target is already verified `ACTIVE` `OWNER_ADMIN`.
       4. Write immutable `customer_partner_audit_history` (`PARTNER_ORG_OWNERSHIP_TRANSFERRED`) + `audit_logs` + `notification_outbox` notifications for both parties.
   - **Staff Moderation of an `OWNER_ADMIN` Membership (`POST /api/admin/partners/[id]/action`):**
     - Staff (`partner.suspend` / `partner.revoke`) **CANNOT** suspend/remove an individual `OWNER_ADMIN` membership and leave an `ACTIVE` org with zero admins (`409 LAST_OWNER_ADMIN_REQUIRED`).
     - Staff has two explicit valid actions when moderating a sole `OWNER_ADMIN`:
       1. **Suspend/Revoke the Organization (`SUSPEND_ORG` / `REVOKE_ORG`)** if the entity itself is non-compliant; OR
       2. **Staff-Assisted Admin Replacement (`REPLACE_OWNER_ADMIN`, `SUPER_ADMIN` / `ADMIN` only):** Atomically promotes an existing `ACTIVE` member (requiring customer consent/verification confirmation and dedicated audit event `PARTNER_ORG_ADMIN_REPLACED_BY_STAFF`) before suspending/removing the outgoing admin.
3. **Database Safety-Net Guard (`0013`):**
   - Optional/recommended `CONSTRAINT TRIGGER trg_ensure_active_org_has_admin AFTER UPDATE OR DELETE ON partner_organization_members DEFERRABLE INITIALLY DEFERRED` (and `AFTER UPDATE ON partner_organizations`) enforcing at commit time that no `ACTIVE` org commits with `0` `ACTIVE` `OWNER_ADMIN` rows!

### 4. Exact Database and API Implications
- **Database:** Canonical `FOR UPDATE` locking on `partner_organizations` + `partner_organization_members`; optional deferred constraint trigger as absolute DB invariant; `PARTNER_ORG_OWNERSHIP_TRANSFERRED` and `PARTNER_ORG_ADMIN_REPLACED_BY_STAFF` audit events.
- **API:** Add `POST /api/customer/partner/organizations/[id]/transfer-ownership`; apply identical last-admin check to `PATCH .../members/[memberId]` (`REMOVE`, `SUSPEND`, `LEAVE`, role change) and admin membership moderation routes. Return consistent `409 LAST_OWNER_ADMIN_REQUIRED`.

### 5. Security and Authorization Implications
- Prevents concurrent race conditions where two co-admins simultaneously remove or demote each other leaving an active agency completely unadministered.
- Prevents an attacker or departed employee from promoting an unaccepted `INVITED` account or leaving an agency stranded without team/submission reassignment governance.

### 6. Tests Required to Prove Correctness
- **Real PostgreSQL & Concurrency Tests:**
  1. Sole `ACTIVE` `OWNER_ADMIN` attempts `REMOVE` / `LEAVE` / `DEMOTE` → fails `409 LAST_OWNER_ADMIN_REQUIRED`.
  2. Sole `OWNER_ADMIN` attempts `transfer-ownership` to an `INVITED` user → fails `409 TARGET_MEMBER_NOT_ACTIVE`.
  3. Sole `OWNER_ADMIN` transfers ownership to an `ACTIVE` `REPRESENTATIVE` (`callerAction = 'DEMOTE_TO_REPRESENTATIVE'` or `'LEAVE_ORG'`) → succeeds atomically (`200`), updates `owner_customer_id`, writes audit + outbox.
  4. **Concurrent Race Test:** Org with 2 `ACTIVE` `OWNER_ADMIN`s (`A` and `B`) runs `Promise.all([A demotes B, B demotes A])` → `FOR UPDATE` serializes them so **exactly 1 succeeds (`200`) and 1 fails (`409 LAST_OWNER_ADMIN_REQUIRED`)**, guaranteeing `>= 1` `ACTIVE` `OWNER_ADMIN`.
  5. Staff attempt to suspend sole `OWNER_ADMIN` membership without suspending org or replacing admin → fails `409 LAST_OWNER_ADMIN_REQUIRED`.

### 7. Remaining Policy Decision
- **`[OPEN DECISION]` Promoted Admin Verification Requirement:** Confirm whether an `ACTIVE` `REPRESENTATIVE` promoted to `OWNER_ADMIN` via self-service `transfer-ownership` gains immediate org-admin permissions (recommended if already KYC-verified `ACTIVE` org member), or requires uploading a fresh board resolution / authorization letter for staff review before promotion activates.

---

## Consolidated Pre-PM-03 Open Decisions Summary

All open policy decisions across Revision 1 and Revision 2 requiring stakeholder confirmation before PM-03–PM-07 execution:
1. **`[OPEN DECISION]` Dedicated Private R2 Bucket:** Confirm provisioning `PRIVATE_DOCS_BUCKET="greathomes-private-docs"` with zero public CDN bindings.
2. **`[OPEN DECISION]` Malware Scanner Gate (`C-12`):** Confirm whether initial launch enforces `REQUIRE_MALWARE_SCAN_FOR_PARTNER_APPROVAL='true'` (ClamAV/R2 AV required before launch) or `'false'` with `ADMIN`/`SUPER_ADMIN` `partner.approve_unscanned_override`.
3. **`[OPEN DECISION]` Multi-Org UX vs Single-Org Cap:** Schema cleanly supports multi-org; confirm whether v1 UI allows multiple active org memberships (with Wizard selector) or caps at 1 per customer.
4. **`[OPEN DECISION]` Pre-Existing Live DB Rows (`[UNVERIFIED — Live DB Unavailable]`):** Execute C-11 pre-flight catalog & count SQL on staging/production prior to running `0012`/`0013`.
5. **`[OPEN DECISION]` Public Listing Attribution & `listing_party_type` (`C-15`):** Confirm canonical `listing_party_type` standardization (`'LISTING_PARTNER'` across `publishSubmission`/`enquiryService`/`resaleService`) and whether agency `trade_name || legal_name` displays publicly while phones stay hidden.
6. **`[OPEN DECISION]` Outbox Sweep Cadence (`C-13`) & Statutory Retention Period (`C-10`):** Confirm Cloud Scheduler interval (`1–2 min`), Email/SMS provider timeline, and legal retention window (proposed `7 years` decided dossiers / `90 days` unsubmitted drafts).
7. **`[OPEN DECISION]` Promoted `OWNER_ADMIN` Document Check (`C-16`) & Reassignment Re-Attestation Scope (`C-14`):** Confirm whether promoted `OWNER_ADMIN` requires fresh authorization-letter verification.

---

## Explicit Read-Only Confirmation & Stop Condition

- **Files Modified / Created:** Zero source files, Drizzle schemas, migration SQL files, configuration files, environment files, or test files were modified, renamed, or deleted. Both `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` and `PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md` remain completely intact and unmodified. Only **`PM_02_REVISION_2_FINAL_CONSISTENCY_REVIEW.md`** was created.
- **Database, Storage, Packages & Git State:** Zero database connections, queries, migrations, or writes were executed; zero Cloudflare R2 operations, package installations, deployments, or `.git` initializations/modifications occurred. Live PostgreSQL state is explicitly marked `[UNVERIFIED — Live DB Unavailable]`.
- **Stop Condition Respected:** Execution stops here awaiting human review and approval before beginning **PM-03**.
