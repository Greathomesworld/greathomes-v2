# GREAT HOMES V2 — PM-02 REVISION 1
## Technical Design Corrections Before PM-03

**Phase:** PM-02 Revision 1 — Specification Amendment  
**Mode:** 100% READ-ONLY — SPECIFICATION REVISION ONLY  
**Amends:** `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` (preserved intact for history)  
**Project:** Great Homes V2  
**Workspace:** `/app/applet`  

> **Verification & Environment Honesty Notice**
> - Existing codebase references marked **`[Source]`** were directly verified in `src/db/schema.ts`, `src/db/client.ts`, `src/domain/customer/services/notificationService.ts`, `src/domain/enquiry/services/enquiryService.ts`, and `src/domain/propertySubmission/repository.ts`.
> - Live staging/production PostgreSQL state remains **`[UNVERIFIED — Live DB Unavailable]`** (`DATABASE_URL` / `TEST_DATABASE_URL` not configured in sandbox).
> - Workspace Git state remains **`NO_GIT`**.
> - `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` is preserved unmodified to retain full design history; this document (`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md`) is authoritative wherever the two differ prior to PM-03 execution.

---

## Executive Supersession Index

| # | Correction Topic | Primary Defect Resolved | Affected PM-02 Sections |
|---|---|---|---|
| **C-01** | Migration Reconciliation (`0012` / `0013`) | `CREATE TABLE IF NOT EXISTS` does not repair drifted columns/constraints/triggers; PM-02 cited inaccurate `customer_partner_*` columns and wrong `internal_users` FK target (real table is `staff_users`). | §2, §7, §8, §16, §19, §20 |
| **C-02** | Document Security Pipeline & Access | Conflated validation/sanitization/AV scan into one enum; risked misreporting un-scanned docs as clean; mixed presigned vs streaming defaults. | §4, §7E, §9, §11, §15, §18 |
| **C-03** | Partner Standing vs Organization Membership | Overloaded `customer_partner_profiles` with org member fields (`partner_type`, `primary_organization_id`), breaking multi-org membership and isolation. | §3, §7A, §7B, §7C, §12, §17 |
| **C-04** | Organization Creation & Circular FK Elimination | Circular FK between `partner_organizations` and `partner_applications`; unspecified atomic TX sequence for org approval + `OWNER_ADMIN` creation. | §6.4 (T7), §7B, §7D |
| **C-05** | Eligibility Concurrency & Row Locking | Missing PostgreSQL lock ordering (`FOR SHARE` / `FOR UPDATE`) allowed TOCTOU races between suspension/revocation/member removal and approval/publication. | §6.4, §12.3, §13, §15 |
| **C-06** | Contact Privacy & Public Listing Attribution | Mapped personal `customers.phone` into `broker_phone` on public listing tables; blurred public attribution vs private contact storage vs CRM routing. | §13.1, §15, §17, §18 |
| **C-07** | Reliable Notifications (Transactional Outbox) | Best-effort post-commit `try/catch` could silently drop notifications on failure after TX commit. | §6.4, §9, §14, §16 |
| **C-08** | Authorization Separation (Self-Deactivate vs Suspend) | Merged customer self-deactivation and staff suspension into one transition row (`T12`), blurring RBAC boundaries. | §6.1, §6.4, §9, §10 |
| **C-09** | Organization Membership Removal Impact | Undefined impact of removing/suspending a `REPRESENTATIVE` on existing drafts, in-review submissions, and published listings. | §3, §4, §9, §10.2, §12, §13 |
| **C-10** | Document Ownership, Retention & No-Cascade Rules | Set `ON DELETE CASCADE` from `partner_applications` and `customers` onto `partner_documents`, risking loss of compliance evidence. | §7D, §7E, §9.1, §11.4, §18 |

---

## Correction 1: Migration Reconciliation (`0012` & `0013`)

### Original Design Issue
1. **Broken `IF NOT EXISTS` Assumption:** PM-02 §8 proposed reconciling existing production tables in `0012_baseline_submission_partner_reconciliation.sql` using `CREATE TABLE IF NOT EXISTS`. In PostgreSQL, `CREATE TABLE IF NOT EXISTS` is a **complete no-op** if a table already exists—even if columns, `CHECK` constraints, foreign keys, indexes, or triggers are missing or drifted.
2. **Inaccurate Baseline Column & Table References Found on Direct Schema Re-Inspection:**
   - **Staff table name:** `src/db/schema.ts:369` defines **`staff_users`** (NOT `internal_users`). All FKs referencing staff in PM-02 §7 (`verified_by_staff_id`, `assigned_reviewer_staff_id`, `decided_by_staff_id`, `reviewed_by_staff_id`) MUST target `staff_users(id)`.
   - **Actual `customer_partner_profiles` columns (`schema.ts:900-913`, `client.ts:727-739`):** Currently has ONLY `id`, `customer_id`, `status`, `approved_by_staff_id`, `approved_at`, `suspension_reason`, `revocation_reason`, `created_at`, `updated_at`. *(It does NOT yet have `partner_code`, `firm_name`, `verified_by_staff_id`, `verified_at`, `suspended_at`, `revoked_at`, or `notes`—all of those are net-new columns that must be explicitly added in `0013`!)*
   - **Actual `customer_partner_audit_history` columns (`schema.ts:916-927`, `client.ts:741-751`):** Currently has ONLY `id`, `customer_id`, `previous_status`, `new_status`, `acting_staff_user_id`, `reason`, `created_at`. *(It does NOT yet have `partner_profile_id`, `action_type`, or `metadata`—so relaxing `partner_profile_id NOT NULL` doesn't apply; instead `partner_profile_id`, `action_type`, `metadata`, `application_id`, `organization_id`, `actor_customer_id`, `actor_type` must be added cleanly in `0013` as nullable or defaulted!)*

### Revised Decision
Redesign `0012_baseline_submission_partner_reconciliation.sql` around **explicit PostgreSQL catalog inspection (`information_schema` & `pg_catalog`)**:

1. **Table Creation Guard (`CREATE TABLE IF NOT EXISTS`):** Ensures tables exist on brand-new databases using exact baseline columns from `schema.ts:900-983`.
2. **Explicit Column Reconciliation (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`):** Runs unconditionally for every baseline column across `customer_partner_profiles`, `customer_partner_audit_history`, `property_submissions`, `property_submission_reviews`, and `partner_attestations` so partially provisioned tables from older `ensureSchemaUpdates()` versions are repaired in-place.
3. **Catalog-Inspected Foreign Keys & Unique Constraints (`pg_constraint`):**
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'uq_submission_id_customer'
         AND conrelid = 'property_submissions'::regclass
     ) THEN
       ALTER TABLE property_submissions
         ADD CONSTRAINT uq_submission_id_customer UNIQUE (id, submitter_customer_id);
     END IF;

     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_partner_attestation_ownership'
         AND conrelid = 'partner_attestations'::regclass
     ) THEN
       ALTER TABLE partner_attestations
         ADD CONSTRAINT fk_partner_attestation_ownership
         FOREIGN KEY (submission_id, partner_customer_id)
         REFERENCES property_submissions (id, submitter_customer_id)
         ON DELETE RESTRICT NOT VALID;
     END IF;
   END $$;
   ```
   Followed by explicit `VALIDATE CONSTRAINT` after pre-flight orphan verification.
4. **Safe Normalization + `NOT VALID` Check Constraints:** Normalize whitespace/case in `customer_partner_profiles.status` if rows exist, then add `chk_customer_partner_profiles_status CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'DEACTIVATED')) NOT VALID` + `VALIDATE CONSTRAINT`. Also verify/add `chk_property_submissions_listing_source` and `chk_property_submissions_listing_type`.
5. **Index Reconciliation:**
   - `DROP INDEX IF EXISTS idx_customer_partner_profiles_customer;` (removes redundant non-unique duplicate of `UNIQUE(customer_id)`).
   - `CREATE [UNIQUE] INDEX IF NOT EXISTS ...` for all baseline indexes including partial unique indexes `uq_resale_listing_submission` and `uq_rental_listing_submission`.
6. **Trigger Function & `pg_trigger` Reconciliation:**
   - Use `CREATE OR REPLACE FUNCTION prevent_modification()` and `CREATE OR REPLACE FUNCTION prevent_truncate()`.
   - Inspect `pg_trigger` (filtering `NOT tgisinternal`) and conditionally `CREATE TRIGGER` only if missing—avoiding unnecessary `DROP TRIGGER` DDL locks on live production tables:
     - `trg_partner_attestations_immutable` & `trg_prevent_truncate_attestations`
     - `trg_property_submission_reviews_immutable` & `trg_prevent_truncate_reviews`
     - `trg_customer_partner_audit_immutable` & `trg_prevent_truncate_audit`
7. **Drizzle Schema Alignment (`src/db/schema.ts`):** Update `partnerAttestations` in `schema.ts:973-983` to declare `foreignKey({ name: 'fk_partner_attestation_ownership', ... })`, remove `idx_customer_partner_profiles_customer`, and ensure `0013_partner_management_system.sql` explicitly adds `partner_code`, `firm_name`, `verified_by_staff_id`, `verified_at`, `suspended_at`, `revoked_at`, `deactivated_at`, `notes` to `customer_partner_profiles` (referencing `staff_users(id)`) and `action_type`, `metadata`, `partner_profile_id`, `application_id`, `organization_id`, `actor_customer_id`, `actor_type` to `customer_partner_audit_history`.

### Database / API / Security Impact
- **Database:** Eliminates silent schema drift on existing staging/production PostgreSQL instances that were previously initialized by `ensureSchemaUpdates()`. Prevents invalid FK failures against non-existent `internal_users`.
- **Security:** Guarantees `fk_partner_attestation_ownership` and append-only immutability triggers (`prevent_modification`, `prevent_truncate`) exist identically in Drizzle migrations and runtime databases.

### Affected Sections of PM-02
- **§2 (F-04, F-05)**, **§7 (ERD & Tables A, B, D, E, F, G)**, **§8.1 (`0012` / `0013` steps)**, **§16 (PM-03)**, **§19 (Criteria #2)**, **§20 (Step 2)**.

### Remaining Open Questions
- Live PostgreSQL catalog state (`pg_tables`, `pg_constraint`, `pg_trigger`, `pg_indexes`) remains `[UNVERIFIED — Live DB Unavailable]` until §8.1 read-only diagnostic queries run on staging/production prior to PM-03 migration execution.

---

## Correction 2: Document Security Pipeline & Access Mechanism

### Original Design Issue
1. PM-02 §7E combined format validation, metadata sanitization, and malware scanning into one `sanitization_status` column (`PENDING`, `SANITIZED`, `REJECTED`), which risked misrepresenting a file that only passed Sharp/magic-byte checks as malware-free.
2. PM-02 §11 described authenticated streaming alongside `S3StorageProvider.getSignedUrl()` presigned URLs without establishing authenticated streaming as the exclusive runtime mechanism, leaving room for accidental short-lived URL leakage in API payloads.

### Revised Decision
1. **Four Independent Status Dimensions on `partner_documents`:**
   - **`validation_status`** (`'PENDING' | 'PASSED' | 'FAILED'`): Server-side checks on max byte size (`<= 10 MB`), allowlisted extensions/MIME, magic-byte inspection via `detectFileSignature()` in `src/lib/fileSecurity.ts` (PDF `%PDF-`, JPEG, PNG, WebP only; rejects SVG/HTML/macros/executables), and PDF trailing `%%EOF` + active-content heuristic (`/JS`, `/JavaScript`, `/Launch`, `/OpenAction`).
   - **`sanitization_status`** (`'PENDING' | 'SANITIZED' | 'NOT_APPLICABLE' | 'FAILED'`): Raster images are re-encoded via `sharp().rotate()` (stripping EXIF/GPS/XMP/camera tags without watermarks) → `'SANITIZED'`. Validated PDFs without active-script markers → `'NOT_APPLICABLE'` (or `'SANITIZED'` if PDF flattening is added later).
   - **`malware_scan_status`** (`'NOT_CONFIGURED' | 'PENDING' | 'CLEAN' | 'INFECTED' | 'SCAN_ERROR'`): Explicitly records **`'NOT_CONFIGURED'`** whenever `MALWARE_SCANNER_PROVIDER` is unset/unimplemented in runtime! **Never records `'CLEAN'` unless an actual AV/scanner engine scanned the buffer and returned clean.**
   - **`staff_verification_status`** (`'PENDING' | 'VERIFIED' | 'REJECTED'`): Human staff verification outcome (`reviewed_by_staff_id` → `staff_users.id`, `reviewed_at`, `review_rejection_reason`).
2. **Strict Gate Before Staff Approval & Preview:**
   - Upload rejects (`415` / `422`) immediately if `validation_status === 'FAILED'`, `sanitization_status === 'FAILED'`, or `malware_scan_status === 'INFECTED'`.
   - Staff UI visibly displays a neutral warning badge when `malware_scan_status === 'NOT_CONFIGURED'` so staff exercise heightened caution before opening PDFs/images, and `partner.approve` requires all mandatory documents to have `validation_status === 'PASSED'`, `malware_scan_status !== 'INFECTED'`, and `staff_verification_status === 'VERIFIED'`.
3. **Authenticated Streaming Is the Default (and Exclusive) Access Mechanism:**
   - All customer (`/api/customer/partner/documents/[id]`) and staff (`/api/admin/partners/documents/[docId]`) document reads stream object bytes server-to-server from `PRIVATE_DOCS_BUCKET` via `@aws-sdk/client-s3` `GetObjectCommand` with:
     - `Cache-Control: private, no-store, no-cache, must-revalidate`
     - `Pragma: no-cache`
     - `X-Content-Type-Options: nosniff`
     - `Content-Security-Policy: default-src 'none'; sandbox`
     - `Content-Disposition: attachment; filename="..."` (for PDFs/downloads, or `inline` only inside sandboxed iframe/object viewer for raster images).
   - **Never return direct R2 URLs or presigned URLs in any API JSON response** during PM-03–PM-07. (Separately, harden `S3StorageProvider.getSignedUrl()` in `storageProvider.ts:286-288` with `@aws-sdk/s3-request-presigner` so the latent public-URL stub cannot exist anywhere in the codebase.)

### Database / API / Security Impact
- **Database:** Replaces single `sanitization_status` on `partner_documents` with `validation_status`, `sanitization_status`, `malware_scan_status`, and `staff_verification_status` (+ `CHECK` constraints).
- **API:** `POST /api/customer/partner/documents` and `GET /api/admin/partners/[id]` return all four statuses separately; zero `url` or `signedUrl` fields ever appear in partner document DTOs.
- **Security:** Eliminates false-assurance around unconfigured antivirus scanning; prevents URL forwarding and enables instant revocation on every read + mandatory `PARTNER_DOCUMENT_VIEWED` audit logging.

### Affected Sections of PM-02
- **§4.2**, **§7E (`partner_documents`)**, **§9.1 & §9.2**, **§11 (all subsections)**, **§15 (T-10, T-11)**, **§18**.

### Remaining Open Questions
- Whether an external malware scanner (e.g., ClamAV sidecar or Cloudflare R2 security scanning) will be provisioned prior to open public onboarding (`[OPEN DECISION]`).

---

## Correction 3: Partner Standing — Individual vs Organization Separation

### Original Design Issue
PM-02 §3.3 and §7A proposed adding `partner_type ('INDIVIDUAL' | 'ORGANIZATION_MEMBER')` and `primary_organization_id` to `customer_partner_profiles`. That overloaded a customer-level table with organization-membership state:
- If a customer belongs to two organizations (multi-org membership), `primary_organization_id` cannot represent both, and a single `customer_partner_profiles.status` cannot distinguish "active in Agency A, suspended in Agency B" or "active Individual Partner, removed from Agency A".

### Revised Decision
1. **`customer_partner_profiles` Represents INDIVIDUAL Partner Standing Exclusively:**
   - A row in `customer_partner_profiles` exists **if and only if** the customer has applied/been approved as an **Individual Partner**.
   - **Do NOT add `partner_type = 'ORGANIZATION_MEMBER'` or `primary_organization_id` to `customer_partner_profiles`.** Creating or joining an organization **never** creates or modifies `customer_partner_profiles`.
2. **`partner_organizations` + `partner_organization_members` Represent ORGANIZATION Standing Exclusively:**
   - Organization capability is governed by `partner_organizations.status` AND `partner_organization_members.status`.
3. **Consequences for Multi-Organization Membership (Cleanly Supported):**
   - A single customer can simultaneously hold:
     - `0..1` Individual Partner profile (`customer_partner_profiles`), AND
     - `0..N` Organization memberships (`partner_organization_members` across distinct `partner_organizations`).
   - **Blast-Radius Isolation:** Suspending or revoking Organization A (`partner_organizations.status = 'SUSPENDED' | 'REVOKED'`) immediately blocks all submissions/approvals/publications *under Organization A*, without invalidating the customer's independent Individual Partner standing or Organization B membership (unless staff explicitly also suspends/revokes the individual profile or sets `customers.status = 'DISABLED'`).
   - **Explicit Submission Context (`actingAsOrganizationId`):**
     - `PartnerEligibilityService.evaluateCustomerEligibility(customerId)` returns:
       - `individual`: `{ profileId, status, partnerCode, eligible }` (or `null`)
       - `organizations`: array of `{ organizationId, legalName, tradeName, partnerCode, organizationStatus, memberId, memberRole, memberStatus, eligible }`
       - `eligible`: `true` if `individual?.eligible || organizations.some(o => o.eligible)` (and `customer.status === 'ACTIVE'`).
     - In `PostPropertyWizard` Step 1 (`source=PARTNER`):
       - If the customer has **exactly 1** active track (either Individual OR 1 Active Org), auto-select it.
       - If the customer has **2+** active tracks (e.g., Individual + Org, or Multi-Org), Step 1 requires selecting which track/organization the property is being listed under (`actingAs: 'INDIVIDUAL' | 'ORGANIZATION'`, `partnerOrganizationId?: string`), persisted on `property_submissions.partner_organization_id` (`NULL` for Individual, `porg_*` for Organization).

### Database / API / Security Impact
- **Database:** Removes `partner_type` and `primary_organization_id` from `customer_partner_profiles` in §7A/0013; simplifies `customer_partner_profiles` to pure Individual standing (`partner_code`, `display_name`, `operating_city`, `operating_localities`, `rera_number`, `verified_by_staff_id`, `verified_at`, `suspended_at`, `revoked_at`, `deactivated_at`, `notes`). Removes `uq_member_single_active_org` constraint from schema unless single-org business rule is explicitly mandated at policy level.
- **API:** `/api/customer/partner-status` returns `tracks: { individual, organizations }` plus summary `eligible` boolean, eliminating overloaded status guessing. `POST /api/property-submissions` (and draft update) accepts optional `partnerOrganizationId` when `listingSource === 'PARTNER'`.
- **Security:** Every organization submission verifies active membership specifically for the submission's `partnerOrganizationId`—zero cross-org leakage.

### Affected Sections of PM-02
- **§3.1, §3.3**, **§4.1**, **§7A, §7B, §7C**, **§9.1**, **§12.1, §12.2**, **§17 (#2)**.

### Remaining Open Questions
- Product policy (§17 #2): Confirm whether v1 UX permits customers to join multiple active organizations concurrently (fully supported by this revised schema) or caps active org memberships at 1 via application-layer validation / partial unique index.

---

## Correction 4: Atomic Organization Creation & Circular FK Elimination

### Original Design Issue
1. PM-02 §7B/§7D had a circular foreign key: `partner_organizations.latest_application_id` → `partner_applications(id)` AND `partner_applications.target_organization_id` → `partner_organizations(id)`, which complicates inserts/deletes without `DEFERRABLE INITIALLY DEFERRED` constraints.
2. PM-02 §6.4 (T7) did not specify the exact ordered SQL/transaction sequence for creating a new organization from an approved `ORGANIZATION` application, linking the application, creating the `OWNER_ADMIN` membership, migrating/linking verified documents, and activating the organization.

### Revised Decision
1. **Eliminate Circular Foreign Key:**
   - Remove `latest_application_id` from `partner_organizations` (and from `customer_partner_profiles`).
   - Keep a **single one-way FK**: `partner_applications.target_organization_id REFERENCES partner_organizations(id) ON DELETE RESTRICT` (nullable while `DRAFT`/`PENDING`/`UNDER_REVIEW`/`REJECTED`; populated atomically upon `APPROVED`).
   - Similarly, add nullable `partner_applications.target_profile_id REFERENCES customer_partner_profiles(id) ON DELETE RESTRICT` for `INDIVIDUAL` approvals.
   - Latest approved/active application for any organization or individual profile is retrieved deterministically via partial/indexed query (`idx_partner_apps_target_org (target_organization_id, created_at DESC)` and `idx_partner_apps_target_profile (target_profile_id, created_at DESC)`). Zero circular FKs!
2. **Exact Atomic Transaction Sequence (`staffApproveApplication(applicationId, staffId, checklist, note)`):**
   Inside a single `READ COMMITTED` PostgreSQL transaction (`SET LOCAL lock_timeout = '5s'`):
   1. **Lock Application:** `SELECT * FROM partner_applications WHERE id = $appId FOR UPDATE` → fail `409` if `status !== 'UNDER_REVIEW'`.
   2. **Lock Applicant Customer:** `SELECT * FROM customers WHERE id = $app.applicant_customer_id FOR SHARE` → fail `403/409` if `customers.status !== 'ACTIVE'`.
   3. **Verify Documents & Checklist:** Query `partner_documents WHERE application_id = $appId AND deleted_at IS NULL` (`FOR SHARE`): assert every required document type for `application_type` has `validation_status = 'PASSED'`, `malware_scan_status <> 'INFECTED'`, and `staff_verification_status = 'VERIFIED'`; assert required checklist booleans are `true`.
   4. **Branch on `application_type === 'ORGANIZATION'`:**
      - Normalize `registration_number` (`UPPER(TRIM(...))`). If non-null, check/handle unique partial index conflict cleanly (`409 ORGANIZATION_REGISTRATION_EXISTS`).
      - Generate unique `orgId` (`porg_<uuid>`) and sequential/unique `partner_code` (`GH-ORG-...`).
      - **`INSERT INTO partner_organizations`** (`id`, `partner_code`, `legal_name`, `trade_name`, `organization_type`, `status = 'ACTIVE'`, `registration_number`, `tax_identifier`, `rera_agency_number`, `official_email`, `official_phone`, `registered_address`, `operating_city`, `operating_localities`, `owner_customer_id = $applicantId`, `verified_by_staff_id = $staffId`, `verified_at = now()`).
      - **`INSERT INTO partner_organization_members`** (`id = 'pmem_' + uuid`, `organization_id = $orgId`, `customer_id = $applicantId`, `member_role = 'OWNER_ADMIN'`, `status = 'ACTIVE'`, `designation = payload.designation`, `accepted_at = now()`).
      - **`UPDATE partner_documents`** `SET organization_id = $orgId WHERE application_id = $appId AND deleted_at IS NULL` (binds entity documents permanently to the newly created organization).
      - **`UPDATE partner_applications`** `SET status = 'APPROVED', target_organization_id = $orgId, verification_checklist = $checklist, decided_by_staff_id = $staffId, decided_at = now(), updated_at = now() WHERE id = $appId`.
   5. **Branch on `application_type === 'INDIVIDUAL'`:**
      - Lock or upsert `customer_partner_profiles` (`FOR UPDATE` on `customer_id = $applicantId`): reject `409` if existing profile is `REVOKED` or already `ACTIVE`; otherwise insert/update `status = 'ACTIVE'`, `partner_code = 'GH-IND-...'`, `verified_by_staff_id = $staffId`, `verified_at = now()`.
      - **`UPDATE partner_applications`** `SET status = 'APPROVED', target_profile_id = $profileId, ...`.
   6. **Write Audit & Outbox Inside Same TX:**
      - Insert into `customer_partner_audit_history` (`application_id`, `organization_id` / `partner_profile_id`, `action_type = 'APPLICATION_APPROVED'`, `previous_status = 'UNDER_REVIEW'`, `new_status = 'APPROVED'`, `acting_staff_user_id = $staffId`).
      - Insert into `audit_logs` (`resourceType = 'PARTNER_APPLICATION'`, `action = 'PARTNER_APPROVED'`).
      - Insert into `notification_outbox` (`event_type = 'PARTNER_APPROVED'`, `recipient_customer_id = $applicantId`, `idempotency_key = 'partner_approved:' || $appId`).
   7. **Commit TX** → trigger async/post-commit outbox flush for `IN_APP` delivery.

### Database / API / Security Impact
- **Database:** Zero circular foreign keys; zero `DEFERRABLE` DDL complexity; strictly deterministic insert order.
- **API:** `POST /api/admin/partners/[id]/action` (`APPROVE`) is fully atomic—cannot create an org without `OWNER_ADMIN`, cannot activate an org without binding its verified docs, and cannot leave `partner_applications` in `UNDER_REVIEW` after org creation.

### Affected Sections of PM-02
- **§6.4 (T7)**, **§7.2 (ERD)**, **§7A, §7B, §7D**, **§8.1 (`0013`)**.

### Remaining Open Questions
- None (design is self-contained). *Note for future phase:* If an existing `ACTIVE` organization ever submits a renewal/update application via `partner_applications`, `target_organization_id` will be pre-populated on draft creation and step 4 will `UPDATE` rather than `INSERT` `partner_organizations`.

---

## Correction 5: Eligibility Concurrency & Row Locking

### Original Design Issue
PM-02 §12.3 required revalidation inside transactions for `submitForReview`, `approveSubmission`, and `publishSubmission`, but did not specify PostgreSQL row-locking modes or lock acquisition order. Under PostgreSQL's default `READ COMMITTED` isolation, plain `SELECT` queries read a snapshot taken at statement start and **do NOT block or detect** a concurrent transaction that commits a partner suspension, revocation, or representative removal milliseconds before `publishSubmission` commits.

### Revised Decision
Enforce **explicit PostgreSQL row locking in a canonical global lock order** inside every state-changing Partner and `PARTNER`-Submission transaction (`SET LOCAL lock_timeout = '5s'`):

**Canonical Lock Order (to guarantee deadlock freedom across all endpoints):**
1. `customers`
2. `customer_partner_profiles`
3. `partner_organizations`
4. `partner_organization_members`
5. `property_submissions`

**Exact Locking Matrix Across Concurrent Operations:**

| Operation | Locked Rows & Modes (in canonical order) | Concurrent Race Prevention Behavior |
|---|---|---|
| **Staff Suspend / Revoke Individual Profile** | 1. `customer_partner_profiles WHERE id = $1 FOR UPDATE` | Serializes against any concurrent `approveSubmission` / `publishSubmission` holding `FOR SHARE` on that profile. |
| **Staff Suspend / Revoke Organization** | 1. `partner_organizations WHERE id = $1 FOR UPDATE` | Serializes against any concurrent org submission approval/publication holding `FOR SHARE` on that organization. |
| **`OWNER_ADMIN` Remove / Suspend Representative** | 1. `partner_organizations WHERE id = $orgId FOR SHARE`<br>2. `partner_organization_members WHERE id = $memId FOR UPDATE` | Serializes against `submitForReview` / `approveSubmission` / `publishSubmission` for that member; enforces last-`OWNER_ADMIN` check via `FOR UPDATE` on all active `OWNER_ADMIN` rows of `$orgId`. |
| **`PARTNER` `submitForReview` / `approveSubmission` / `publishSubmission`** | 1. `customers WHERE id = $submitterId FOR SHARE`<br>2. If Individual: `customer_partner_profiles WHERE customer_id = $submitterId FOR SHARE`<br>3. If Org: `partner_organizations WHERE id = $orgId FOR SHARE` + `partner_organization_members WHERE organization_id = $orgId AND customer_id = $submitterId FOR SHARE`<br>4. `property_submissions WHERE id = $subId FOR UPDATE` | Because PostgreSQL `READ COMMITTED` re-fetches the latest committed version of a row blocked on `FOR SHARE` once the concurrent `FOR UPDATE` commits, a simultaneous suspension/revocation/removal **guarantees** `approveSubmission`/`publishSubmission` sees the new inactive status and aborts (`409 PARTNER_NOT_ELIGIBLE`). And if publication acquires `FOR SHARE` first, suspension waits (`<=ms`) cleanly rather than splitting a published listing from an active partner check. |
| **Step 4 Partner Media Upload (`uploadMedia`)** | Same `FOR SHARE` eligibility check inside short read-check TX before committing `media_assets` insert (or inside `mediaService` DB check). | Prevents newly suspended/revoked partners from uploading media mid-draft. |

### Database / API / Security Impact
- **Database:** Eliminates TOCTOU race conditions between staff partner moderation (`SUSPEND`/`REVOKE`), `OWNER_ADMIN` team removal, and property submission approval/publication without resorting to expensive `SERIALIZABLE` retry loops across unrelated tables.
- **API:** Lock timeout (`55P03`) maps cleanly to `409 CONCURRENT_MODIFICATION` / `503` retryable response.

### Affected Sections of PM-02
- **§6.4**, **§12.3**, **§13.1–13.2**, **§15 (T-06, T-12)**.

### Remaining Open Questions
- None.

---

## Correction 6: Contact Privacy & Public Listing Attribution

### Original Design Issue
PM-02 §13.1 mapped `customers.phone` into `broker_phone` on `resale_listings` and `rental_listings` ("Verified Customer `phone` (or Org `official_phone`)"), which violated buyer/partner contact privacy by potentially exposing a partner's or owner's personal mobile number on public listing pages, and mixed public attribution fields with private contact storage.

### Revised Decision
Inspecting `src/db/schema.ts:252-261` (`resaleListings`), `321-330` (`rentalListings`), and `src/domain/enquiry/services/enquiryService.ts:173-176, 241-244`:

Strictly separate **three distinct concepts** on `resale_listings` / `rental_listings` during `publishSubmission()`:

1. **Public Listing Attribution (`listing_party_type`, `listing_party_display_name`):**
   - `OWNER` submission:
     - `listing_party_type = 'OWNER'`
     - `listing_party_display_name = 'Verified Owner'` (or explicit non-PII display label from payload if opted in; **never phone/email**).
   - `PARTNER` (Individual) submission:
     - `listing_party_type = 'PARTNER'`
     - `listing_party_display_name = partnerProfile.display_name || verifiedCustomer.name` (with `Partner` badge).
   - `PARTNER` (Organization) submission:
     - `listing_party_type = 'PARTNER'`
     - `listing_party_display_name = organization.trade_name || organization.legal_name` (and optionally `broker_name = representativeCustomer.name`).
2. **Private Contact Storage (`private_phone`, `private_email`, `owner_phone`, `owner_email`):**
   - Server-verified personal contact (`customers.phone`, `customers.email`) is stored **exclusively** in `private_phone` / `private_email` (for `PARTNER`) or `owner_phone` / `owner_email` (for `OWNER` internal CRM use—never rendered publicly).
   - **Publication Precondition:** `customers.phone` (or verified org `official_phone` for org-level business routing) MUST exist and be verified; otherwise `publishSubmission()` aborts with **`422 MISSING_VERIFIED_CONTACT`**. Hardcoded `'9876543210'` and `'Verified Owner'` phone/name fake fallbacks in `repository.ts:3227-3338` are **completely removed**.
3. **Public Contact Masking & Enquiry Routing (`broker_phone`, `broker_email`, `enquiries`):**
   - **`broker_phone` and `broker_email` are set to `NULL` by default** on public `resale_listings` / `rental_listings` rows unless an **Organization Partner** explicitly configures a verified **official agency helpline** (`partner_organizations.official_phone`) AND opts in to public agency contact display!
   - **Never copy personal `customers.phone` into `broker_phone` or any public listing API DTO.**
   - All buyer enquiries continue routing strictly through Great Homes' Enquiry & Site Visit CRM (`POST /api/enquiries` → `enquiryService.ts`), which reads `listing_party_type` (`'OWNER'` vs `'PARTNER'`), stamps `listing_source` (`'PARTNER_SUBMITTED_PROPERTY'` / `'OWNER_SUBMITTED_PROPERTY'`), and enables Great Homes staff / future partner portal lead routing without leaking personal phone numbers on the open web.

### Database / API / Security Impact
- **Database:** Uses existing `resale_listings` / `rental_listings` columns cleanly; adds optional `partner_organization_id` (nullable FK) + `submitter_customer_id` reference via `property_submissions` without needing extra listing columns.
- **API / Public DTOs:** Public resale/rental API responses expose `listingPartyType`, `listingPartyDisplayName`, and `brokerName` (if org public attribution applies), and **strictly strip `privatePhone`, `privateEmail`, `ownerPhone`, `ownerEmail`**.
- **Security:** Prevents automated scraping of personal customer/partner phone numbers from public residential listing pages.

### Affected Sections of PM-02
- **§13.1**, **§15 (T-13)**, **§17 (#4)**, **§18**, **§19 (#5)**.

### Remaining Open Questions
- **§17 #4 refinement:** Confirm whether `PARTNER` Organization listings may opt in to display `partner_organizations.official_phone` (`broker_phone`) publicly, or whether **all** resale/rental listings (Owner + Individual Partner + Organization Partner) route 100% through Great Homes Enquiries with zero public phone exposure. (Recommended default: 100% Enquiry-routed / masked by default.)

---

## Correction 7: Reliable Notifications via Transactional Outbox

### Original Design Issue
PM-02 §14 stated that `NotificationService` runs inside a post-commit `try/catch` ("never failing a committed partner transaction"). That pattern is best-effort and non-atomic: if the Node process crashes, restarts, or experiences a transient connection blip right after the partner transaction commits, the `IN_APP` notification and delivery audit are permanently lost.

### Revised Decision
Implement a **PostgreSQL Transactional Outbox Pattern** (`notification_outbox` table added in `0013`):

1. **Outbox Table (`notification_outbox` `[Proposed]`):**
   - `id text PRIMARY KEY` (`nout_...`)
   - `idempotency_key text NOT NULL UNIQUE` (e.g., `partner_approved:${applicationId}` or `partner_suspended:${entityId}:${auditId}`)
   - `event_type text NOT NULL` (e.g., `PARTNER_APPLICATION_SUBMITTED`, `PARTNER_INFO_REQUESTED`, `PARTNER_APPROVED`, `PARTNER_REJECTED`, `PARTNER_SUSPENDED`, `PARTNER_REACTIVATED`, `PARTNER_REVOKED`, `PARTNER_DEACTIVATED`, `PARTNER_ORG_INVITED`)
   - `recipient_customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT`
   - `aggregate_type text NOT NULL` (`'PARTNER_APPLICATION' | 'PARTNER_PROFILE' | 'PARTNER_ORGANIZATION' | 'PARTNER_ORG_MEMBER'`)
   - `aggregate_id text NOT NULL`
   - `payload jsonb NOT NULL` (title, message, deepLink, reason/feedback, partnerCode)
   - `status text NOT NULL DEFAULT 'PENDING'` (`CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER'))`)
   - `attempts integer NOT NULL DEFAULT 0`
   - `next_attempt_at timestamp with time zone NOT NULL DEFAULT now()`
   - `processed_at timestamp with time zone`
   - `last_error text`
   - `created_at timestamp with time zone NOT NULL DEFAULT now()`
   - Index: `idx_notification_outbox_pending (status, next_attempt_at) WHERE status IN ('PENDING', 'PROCESSING')`

2. **Atomic Write + Reliable Dispatch Lifecycle:**
   - **Step A (Inside Business TX):** Every partner lifecycle transition writes the `notification_outbox` row inside the **same PostgreSQL transaction** as the state change and audit log. Zero notifications are emitted if the TX rolls back; zero committed transitions lose their notification intent.
   - **Step B (Immediate Best-Latency Post-Commit Flush + Background Recovery Sweep):**
     - Immediately after TX commit, trigger `NotificationOutboxProcessor.processById(outboxId)` (non-blocking).
     - A scheduled/cron sweep worker (`NotificationOutboxProcessor.drainPending(limit=50)`) polls `WHERE status = 'PENDING' AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED`, claims rows (`PROCESSING`), creates the `notifications` (`IN_APP`) row idempotently (`ON CONFLICT DO NOTHING` / outbox idempotency key), logs `alert_delivery_attempts` (`SENT` for `IN_APP`, `SKIPPED_PROVIDER_UNCONFIGURED` for `EMAIL` until configured), and marks the outbox row `PROCESSED` (or schedules exponential backoff up to 5 attempts before `DEAD_LETTER`).
   - **Honest External Channel Boundary:** Because `NotificationService.deliverEmail()` (`notificationService.ts:91-104`) currently has no SMTP/SendGrid mailer implementation, the outbox guarantees **at-least-once durable delivery to the in-app `notifications` inbox** and accurate tracking in `alert_delivery_attempts`, while cleanly marking `EMAIL`/`SMS` as `SKIPPED_PROVIDER_UNCONFIGURED` rather than failing the outbox or fabricating success.

### Database / API / Security Impact
- **Database:** Adds `notification_outbox` in `0013` and idempotency column/unique index on `notifications` (`outbox_id` nullable unique) to prevent duplicate notifications under retry.
- **Reliability:** Eliminates silent post-commit notification loss while preserving rollback atomicity and zero impact on response latency if downstream delivery retries are needed.

### Affected Sections of PM-02
- **§6.4**, **§9.1 & §9.2**, **§14 (entire section)**, **§16 (PM-04/PM-05)**.

### Remaining Open Questions
- Execution trigger for the periodic outbox sweep in production Cloud Run deployment (e.g., Cloud Scheduler calling an internal authenticated `/api/internal/jobs/notification-outbox` endpoint every 1–5 minutes vs piggybacking on health/cron tasks) `[OPEN DECISION]`.

---

## Correction 8: Authorization Separation — Self-Deactivation vs Staff Suspension

### Original Design Issue
PM-02 §6.4 Transition `T12` combined Customer self-deactivation and Staff suspension capabilities into one mixed row (`verifyCustomerAuth (owner/OWNER_ADMIN) OR partner.suspend` on `ACTIVE → DEACTIVATED`), blurring customer self-service offboarding with staff disciplinary moderation.

### Revised Decision
1. **Strict Separation of Transitions & Capabilities:**

| Transition ID | Status Change | Actor & Auth Boundary | Required Capability | Route | Audit Event |
|---|---|---|---|---|---|
| **T12a: Customer Self-Deactivation** | `ACTIVE → DEACTIVATED` | Customer (`verifyCustomerAuth`): Individual profile owner OR `ACTIVE` Org `OWNER_ADMIN` (for their org) | **None** (`verifyCustomerAuth` + entity ownership check only; never uses `partner.*`) | `POST /api/customer/partner/deactivate` | `PARTNER_SELF_DEACTIVATED` (`actor_type = 'CUSTOMER'`) |
| **T12b: Staff Administrative Deactivation** *(support-requested offboarding)* | `ACTIVE → DEACTIVATED` | Internal Staff (`verifyInternalStaff`) | `partner.suspend` (`SUPER_ADMIN`, `ADMIN`, `PROPERTY_MANAGER`) | `POST /api/admin/partners/[id]/action` (`DEACTIVATE`) | `PARTNER_DEACTIVATED_BY_STAFF` (`actor_type = 'STAFF'`) |
| **T9: Staff Disciplinary Suspension** | `ACTIVE → SUSPENDED` | Internal Staff (`verifyInternalStaff`) | `partner.suspend` (`SUPER_ADMIN`, `ADMIN`, `PROPERTY_MANAGER`) | `POST /api/admin/partners/[id]/action` (`SUSPEND`) | `PARTNER_SUSPENDED` (`actor_type = 'STAFF'`) |
| **T10a: Reactivate Suspended Partner** | `SUSPENDED → ACTIVE` | Internal Staff (`verifyInternalStaff`) | `partner.reactivate` (`SUPER_ADMIN`, `ADMIN` only; `PROPERTY_MANAGER` **Denied `403`**) | `POST /api/admin/partners/[id]/action` (`REACTIVATE`) | `PARTNER_REACTIVATED` (`actor_type = 'STAFF'`) |
| **T10b: Reactivate Voluntarily Deactivated Partner** | `DEACTIVATED → ACTIVE` | Internal Staff (`verifyInternalStaff`) *(customers must contact staff or submit fresh application)* | `partner.reactivate` (`SUPER_ADMIN`, `ADMIN` only) | `POST /api/admin/partners/[id]/action` (`REACTIVATE`) | `PARTNER_REACTIVATED` (`actor_type = 'STAFF'`) |

2. **Zero Self-Unsuspend or Self-Reactivate Bypass:** A customer can voluntarily step down (`ACTIVE → DEACTIVATED` via `T12a`), **cannot** suspend/unsuspend themselves, and **cannot** unilaterally flip `DEACTIVATED → ACTIVE` without staff verification (`T10b` or a new vetted application).
3. **Complete RBAC Reconciliation:** Every single action in `/api/admin/partners/[id]/action` maps 1:1 to a single `StaffCapability` in `src/domain/auth/capabilityModel.ts`:
   - `CLAIM_REVIEW`, `ASSIGN_REVIEWER`, `UPDATE_CHECKLIST`, `VERIFY_DOCUMENT`, `REJECT_DOCUMENT`, `ADD_NOTE` → `partner.review`
   - `REQUEST_INFORMATION` → `partner.request_information`
   - `APPROVE` → `partner.approve`
   - `REJECT` → `partner.reject`
   - `SUSPEND`, `DEACTIVATE` → `partner.suspend`
   - `REACTIVATE` → `partner.reactivate`
   - `REVOKE` → `partner.revoke`

### Database / API / Security Impact
- **API & RBAC:** Prevents privilege confusion between customer self-service endpoints and staff moderation endpoints. Customer routes strictly reject staff tokens; staff routes strictly require `verifyInternalStaff` + `requireCapability`.
- **Audit:** Distinguishes `PARTNER_SELF_DEACTIVATED` (`actor_customer_id`) from `PARTNER_DEACTIVATED_BY_STAFF` / `PARTNER_SUSPENDED` (`acting_staff_user_id`), preserving clean compliance attribution.

### Affected Sections of PM-02
- **§6.1, §6.4 (T9, T10, T12)**, **§9.1 & §9.2**, **§10.1**.

### Remaining Open Questions
- Confirm whether `DEACTIVATED → ACTIVE` should allow a streamlined staff `partner.reactivate` within e.g. 90 days of self-deactivation, or always require a fresh `partner_applications` KYC check if deactivated > 90 days (`[OPEN DECISION]`).

---

## Correction 9: Effect of Organization Representative Removal on Listings & Submissions

### Original Design Issue
PM-02 did not define what happens when an organization's `OWNER_ADMIN` suspends or removes a `REPRESENTATIVE` (while the parent `partner_organizations` remains `ACTIVE`) across all property submission stages: `DRAFT`, `CHANGES_REQUESTED`, `SUBMITTED`/`UNDER_REVIEW`/`APPROVED`, and `PUBLISHED`.

### Revised Decision
Organization property submissions (`partner_organization_id IS NOT NULL`) belong to the **Organization** (`partner_organizations`), with the representative acting as the submitting/managing agent. When a `REPRESENTATIVE` (`member.status`) transitions to **`SUSPENDED`** or **`REMOVED`** (parent org still `ACTIVE`):

| Submission / Listing State | Behavior on Representative Suspension / Removal | Who Can Act Next |
|---|---|---|
| **`DRAFT` or `CHANGES_REQUESTED`** | 1. **Removed/Suspended representative immediately loses all edit, upload, and submit access (`403`)** on organization-backed submissions (`partner_organization_id = $orgId`).<br>2. Draft is **NOT deleted**.<br>3. Any `ACTIVE` `OWNER_ADMIN` of `$orgId` can **view, withdraw, or reassign ownership (`transferOrgSubmission`)** of that draft to another `ACTIVE` member of `$orgId` (updating `submitter_customer_id` or retaining `created_by_customer_id` + active `managing_customer_id`). | `ACTIVE` `OWNER_ADMIN` of the organization (or reassigned `ACTIVE` member). |
| **`SUBMITTED`, `UNDER_REVIEW`, or `APPROVED` (Not Yet Published)** | 1. **Staff `approveSubmission()` and `publishSubmission()` block with `409 SUBMITTER_MEMBERSHIP_INACTIVE`** while `submitter_customer_id` is `SUSPENDED`/`REMOVED` from `$orgId`.<br>2. Staff can either `REQUEST_CHANGES` / notify the org `OWNER_ADMIN`, or the org `OWNER_ADMIN` can reassign `managing_customer_id` to an `ACTIVE` org member (with fresh org-member re-attestation if required), unblocking review/publication without losing submission history. | Org `OWNER_ADMIN` reassigns/confirms, then Staff reviews/approves/publishes. |
| **`PUBLISHED` (`resale_listings` / `rental_listings`)** | **Remains `PUBLISHED` uninterrupted!** Because the listing is legally backed by the `ACTIVE` `partner_organizations` entity (whose verified attribution `listing_party_display_name` is the organization and whose leads route through Great Homes CRM), staff turnover at an agency does **not** take live verified agency listings offline. (`OWNER_ADMIN` / org continues receiving/managing enquiries; `removed` representative loses portal access to those org leads.) | Org `OWNER_ADMIN` / `ACTIVE` members (for portal access); Great Homes Staff can still deactivate if needed. |
| **Entire Organization `SUSPENDED` or `REVOKED`** *(Contrast)* | **Blocks all org `DRAFT`s, blocks `approveSubmission`/`publishSubmission` (`409`), AND triggers staff workflow/sweep to `DEACTIVATE`/`UNPUBLISH` all `PUBLISHED` listings belonging to `$orgId`.** | Staff only (`partner.suspend` / `partner.revoke`). |

> **Schema Note for Reassignment Support (`0013`):** Add nullable `managing_customer_id text REFERENCES customers(id) ON DELETE RESTRICT` alongside `submitter_customer_id` (and `partner_organization_id`) on `property_submissions`—preserving `submitter_customer_id` + `fk_partner_attestation_ownership` intact for original legal attestation while allowing an `OWNER_ADMIN` to delegate ongoing management of an org draft/listing to another `ACTIVE` member! *(Or `OWNER_ADMIN` takes over `managing_customer_id` with a new `partner_attestations` row signed by the new active member before `submitForReview`.)*

### Database / API / Security Impact
- **Database:** Preserves composite FK `fk_partner_attestation_ownership (submission_id, partner_customer_id)` intact; adding `managing_customer_id` + `partner_organization_id` on `property_submissions` supports clean org delegation without breaking immutable attestations.
- **API:** Customer submission/draft routes check `isSubmissionAuthorizedForCustomer(submission, auth.customerId)`:
  - For Individual/Owner: `submission.submitterCustomerId === auth.customerId`.
  - For Organization (`partner_organization_id IS NOT NULL`): customer must be `ACTIVE` member of `partner_organization_id` AND either `(managing_customer_id ?? submitter_customer_id) === auth.customerId` OR `member.memberRole === 'OWNER_ADMIN'`.
  - Add `POST /api/customer/partner/organizations/[id]/submissions/[submissionId]/reassign` (`OWNER_ADMIN` only).

### Affected Sections of PM-02
- **§3.2–3.3**, **§4.3**, **§9.1**, **§10.2**, **§12.3**, **§13.1–13.2**.

### Remaining Open Questions
- When an `OWNER_ADMIN` reassigns an `UNDER_REVIEW` or `APPROVED` submission from a departed `REPRESENTATIVE` to themselves/another `ACTIVE` member, confirm whether the new representative must click to sign a fresh `partner_attestations` record (`RECOMMENDED: Yes`) before publication (`[OPEN DECISION]`).

---

## Correction 10: Document Ownership, Non-Cascading Integrity & Legal Retention

### Original Design Issue
PM-02 §7E defined `partner_documents.application_id ... REFERENCES partner_applications(id) ON DELETE CASCADE` and `uploaded_by_customer_id ... ON DELETE CASCADE` (and similarly `CASCADE` on `partner_applications.applicant_customer_id`). That created a severe compliance and security bug: deleting a customer or application record in SQL would silently cascade-delete KYC/incorporation evidence, breaking regulatory auditability and `customer_partner_audit_history`.

### Revised Decision
1. **Legal & Technical Ownership:**
   - Partner verification documents (`partner_documents`) are **Great Homes Compliance & Audit Records**, NOT ephemeral customer user files. While an applicant uploads them and can manage replacements during `DRAFT` / `NEEDS_INFORMATION`, once submitted for review (`PENDING`+) they form part of the immutable compliance dossier.
2. **Prohibit `ON DELETE CASCADE` on All Compliance Foreign Keys:**
   - `partner_applications.applicant_customer_id` → **`ON DELETE RESTRICT`** (matches `customer_partner_profiles` & `property_submissions` in `schema.ts:902, 932`).
   - `partner_applications.target_organization_id` → **`ON DELETE RESTRICT`**.
   - `partner_applications.target_profile_id` → **`ON DELETE RESTRICT`**.
   - `partner_documents.application_id` → **`ON DELETE RESTRICT`** (never `CASCADE`!).
   - `partner_documents.uploaded_by_customer_id` → **`ON DELETE RESTRICT`**.
   - `partner_documents.organization_id` → **`ON DELETE SET NULL`** (nullable prior to org approval, `RESTRICT` or preserved once linked).
   - `partner_organization_members.organization_id` / `customer_id` → **`ON DELETE RESTRICT`**.
   - `notification_outbox.recipient_customer_id` → **`ON DELETE RESTRICT`**.
3. **Application & Document Deletion Rules:**
   - **Hard deletion of `partner_applications` is prohibited** at API, service, and DB FK levels. Customers withdraw unwanted `DRAFT` / `PENDING` / `NEEDS_INFORMATION` applications via `WITHDRAWN` status.
   - **Customer document removal (`DELETE /api/customer/partner/documents/[id]`):**
     - Permitted **ONLY** when `application.status IN ('DRAFT', 'NEEDS_INFORMATION')` AND `staff_verification_status <> 'VERIFIED'`.
     - Performs a **soft delete (`deleted_at = now()`)**—does **NOT** delete the DB row immediately.
     - Blocked with **`409 COMPLIANCE_DOCUMENT_LOCKED`** for any document on a `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`, or `REVOKED` record.
4. **Retention & Legal Erasure Policy:**

| Record / State | Soft-Delete Allowed by Customer? | Physical R2 + Metadata Purge Policy |
|---|---|---|
| **Abandoned `DRAFT` / `WITHDRAWN` (never reached `APPROVED` or `REJECTED`)** | Yes (while `DRAFT`/`NEEDS_INFO`) | Eligible for scheduled R2 `DeleteObjectCommand` + DB tombstone retention (`storage_purged_at = now()`, clearing binary R2 object while preserving `id`, `sha256_checksum`, `created_at`, `deleted_at`) after **90 days** of inactivity. |
| **Replaced document removed during `NEEDS_INFORMATION`** | Yes (`deleted_at` set, excluded from active review unless staff audits history) | If never `VERIFIED`, R2 object eligible for cleanup **90 days** after application final resolution (unless legal hold applies). |
| **`APPROVED`, `REJECTED`, `SUSPENDED`, `REVOKED` Compliance Dossier** | **No (`409`)** | **Mandatory Retention (`legal_hold_until` / `retention_expires_at`, default 7 years post-termination/decision).** Cannot be purged automatically or by customer request while within statutory retention or active dispute. |
| **Legal Erasure Request (DPDP / GDPR Right to Erasure)** | N/A (Staff Legal Workflow Only) | If a customer (`customers.status = 'DELETED'`) requests statutory erasure: **Active/Suspended/Revoked compliance records remain retained until `retention_expires_at` passes and no legal hold exists.** Once eligible, a privileged legal-admin process purges R2 objects (`storage_purged_at`), redacts PII metadata (`applicant_payload` PII scrubbed), and retains immutable non-PII compliance audit hashes (`customer_partner_audit_history`). |

### Database / API / Security Impact
- **Database:** Adds `retention_expires_at`, `legal_hold boolean DEFAULT false NOT NULL`, and `storage_purged_at timestamp with time zone` to `partner_documents`; changes all compliance FKs from `CASCADE` to `RESTRICT`.
- **API:** Enforces `409` on attempting to delete locked documents; adds zero hard-`DELETE` application routes.
- **Security & Compliance:** Prevents accidental or malicious destruction of KYC/fraud evidence via cascade deletes or account closure attacks (`"submit fraudulent docs, get caught, delete account to erase evidence"`).

### Affected Sections of PM-02
- **§7B, §7C, §7D, §7E**, **§8.1 (`0013`)**, **§9.1**, **§11.4**, **§18**.

### Remaining Open Questions
- Confirm exact statutory KYC document retention period with Great Homes legal counsel (default proposed: **7 years** post-decision/offboarding for `APPROVED`/`REJECTED`/`REVOKED`; **90 days** for unsubmitted/withdrawn `DRAFT`s) `[OPEN DECISION]`.

---

## Explicit Read-Only Confirmation & Next Step

- **Files Modified / Created:** Zero existing source, schema, config, migration, or test files were modified, renamed, or deleted. `PM_02_PARTNER_MANAGEMENT_TECHNICAL_SPECIFICATION.md` was left intact for history, and only **`PM_02_REVISION_1_TECHNICAL_CORRECTIONS.md`** was created.
- **Database, Storage, Env & Git State:** Zero database writes, migrations, R2 operations, package installations, environment edits, deployments, or Git initializations were performed.
- **Stop Condition Respected:** Execution stops here awaiting your review and sign-off before beginning **PM-03**.
