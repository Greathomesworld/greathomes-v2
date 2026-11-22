# GREAT HOMES V2 — GLOBAL PARTNER PROFILE ELIGIBILITY AUDIT
## Platform-Wide Read-Only Forensic Investigation

**Audit Date:** November 16, 2026  
**Scope:** Complete platform-wide Partner Profile architecture, lifecycle, database schema/migrations, server-side eligibility & authorization, frontend Post Property Hub/Wizard/Account UX, Admin RBAC/operations, and automated test coverage (Audits 1–7).  
**Mode:** Strictly Read-Only Investigation (zero source-code edits, zero database writes, zero schema/migration/env changes, zero deployments, zero single-account investigation or PII inspection).

---

## 1. Executive Summary

The observed Post Property wizard error when `PARTNER` is selected:

> *"Partner submission requires an ACTIVE Great Homes Partner Profile verified on the server."*  
> *"Partner Profile Not Eligible (Status: NONE). You do not have a registered partner profile."*

is **not** an isolated customer glitch, a frontend display bug, or a broken lookup query. Forensic inspection of the entire Great Homes V2 codebase confirms that **every authenticated customer on the platform will fail `PARTNER` eligibility** unless an engineering/database operator manually inserts a row directly into PostgreSQL `customer_partner_profiles` via raw SQL.

Specifically:
1. **The Partner Profile system was built strictly as a read-only gate (`SELECT`) paired with schema placeholders and unit-test seeding helpers, with zero runtime creation, onboarding, approval, activation, suspension, or revocation mechanisms.**
2. Across `app/**` and `src/**`, **only one runtime location** queries `customer_partner_profiles` (`PropertySubmissionRepository.getPartnerEligibility`), and **zero runtime paths** insert into or update `customer_partner_profiles` or `customer_partner_audit_history`.
3. Consequently, for all real users registering through the customer OTP flow, `customer_partner_profiles` has no matching row, causing `evaluatePartnerEligibility()` to synthesize `status: 'NONE'`, `isPartner: false`, `eligible: false`.
4. Secondary architectural and safety defects also exist across the eligibility evaluator (silent fallback of unknown DB statuses to `'REVOKED'`), schema/migration drift (partner/submission tables absent from `/drizzle/*.sql` and FK drift on `partner_attestations`), publication identity fallbacks (`'Verified Owner'` / `'9876543210'`), missing mid-flight partner re-verification at approval/publication, unverified `phoneVerifiedAt` / profile-phone mutation gaps, and missing admin capability/UI surfaces.

---

## 2. True Root Cause(s) of the Observed Partner Eligibility Failure

### Primary Root Cause (Platform-Wide): Complete Absence of Partner Onboarding & Lifecycle Write Paths
- **Endpoint behavior is technically working as coded, but no customer can become a partner:**
  - `GET /api/customer/partner-status` (`app/api/customer/partner-status/route.ts:8-56`) authenticates the customer via `verifyCustomerAuth(req)` and calls `propertySubmissionService.getPartnerEligibility(auth.customerId)`.
  - `PropertySubmissionRepository.getPartnerEligibility()` (`src/domain/propertySubmission/repository.ts:1039-1055`) runs `SELECT * FROM customer_partner_profiles WHERE customer_id = $1`.
  - Because there is **no customer partner application endpoint**, **no onboarding UI** (neither in `/post-property`, `/account/profile`, nor anywhere in `app/`), **no admin partner-creation/approval endpoint** under `/app/api/admin/*`, and **no automatic partner provisioning**, `profile` is `null` for all organic customers.
  - `evaluatePartnerEligibility(customerId, null)` (`src/domain/propertySubmission/repository.ts:382-395`) returns:
    - `isPartner: false`
    - `status: 'NONE'`
    - `eligible: false`
    - `message: 'You do not have a registered partner profile. Only verified Great Homes partners with an ACTIVE profile can submit properties on behalf of owners.'`
  - On Step 1 of `PostPropertyWizard.tsx` (`lines 2173-2185`), this renders:
    - Heading: **`Partner Profile Not Eligible (Status: NONE)`**
    - Body: `partnerStatus.message` (`You do not have a registered partner profile...`)
  - Clicking **Continue** on Step 1 invokes `handleNextStep()` (`src/components/post-property/PostPropertyWizard.tsx:1048-1056`), which re-calls `checkPartnerStatusOnServer()` and emits:
    - Step Error Banner: **`Partner submission requires an ACTIVE Great Homes Partner Profile verified on the server.`**

### Contributing Root Causes
1. **Incomplete Schema for Real-World Partner Onboarding:** `customer_partner_profiles` (`src/db/schema.ts:900-913`) only stores `id`, `customerId`, `status`, `approvedByStaffId`, `approvedAt`, `suspensionReason`, `revocationReason`, `createdAt`, `updatedAt`. It lacks agency/firm name, RERA registration ID, GST/PAN/KYC references, operational localities, partner tier, contact person/business phone, and rejection/review notes needed for an actual onboarding workflow.
2. **Dead Audit & Admin Columns:** `approvedByStaffId`, `approvedAt`, `suspensionReason`, `revocationReason`, and the entire append-only `customer_partner_audit_history` table (`src/db/schema.ts:916-927`, `src/db/client.ts:741-751`) have **zero callers** in `app/` or `src/`.
3. **False Sense of Completeness in Tests:** Test suite `scripts/test-pp-04-wizard.ts:276-337` inserts `'ACTIVE'` and `'PENDING'` rows directly via `db.insert(customerPartnerProfiles)` and `setMemoryPartnerProfileForTesting()`, masking the complete absence of application-level partner creation and approval APIs.

---

## 3. Complete Partner Profile Architecture

### 3.1 Database Layer
| Component | File & Lines | Purpose / State |
|---|---|---|
| `customerPartnerProfiles` | `src/db/schema.ts:900-913` | 1:1 customer-to-partner status table (`customer_id` UNIQUE FK → `customers.id` `ON DELETE RESTRICT`). **Read-only in runtime app.** |
| `customerPartnerAuditHistory` | `src/db/schema.ts:916-927` | Intended append-only audit trail for partner status transitions (`previousStatus`, `newStatus`, `actingStaffUserId`, `reason`). **Unused at runtime.** |
| `propertySubmissions` | `src/db/schema.ts:930-954` | Stores `listingSource` (`'OWNER' \| 'PARTNER'`), `submitterCustomerId`, composite `uq_submission_id_customer (id, submitter_customer_id)`. |
| `partnerAttestations` | `src/db/schema.ts:973-983` | Immutable record of canonical partner declaration accepted at `submitForReview()`. |
| Runtime DDL & Immutability Triggers | `src/db/client.ts:726-850` | Creates above tables idempotently via `ensureSchemaUpdates()` and attaches PostgreSQL triggers blocking `UPDATE`/`DELETE`/`TRUNCATE` on `partner_attestations`, `property_submission_reviews`, and `customer_partner_audit_history`. |

### 3.2 Domain, Validation & Persistence Layer
| Symbol | File & Lines | Responsibility |
|---|---|---|
| `PartnerEligibilityStatus` & canonical constants | `src/domain/propertySubmission/validation.ts` (`CANONICAL_PARTNER_ATTESTATION_TEXT`, `CANONICAL_ATTESTATION_VERSION`) | Canonical legal attestation text & Step 1 / Step 5 payload validation. |
| `evaluatePartnerEligibility()` | `src/domain/propertySubmission/repository.ts:382-438` | Pure evaluator converting DB/memory row to `{ customerId, isPartner, status, eligible, message }`. |
| `PropertySubmissionRepository.getPartnerEligibility()` | `src/domain/propertySubmission/repository.ts:1039-1055` | Reads `customerPartnerProfiles` (or `memoryPartnerProfiles` in `NODE_ENV=test` memory mode). |
| `PropertySubmissionRepository.setMemoryPartnerProfileForTesting()` | `src/domain/propertySubmission/repository.ts:1057-1075` | Test-only in-memory seeder (`NODE_ENV=test` + explicit memory activation). |
| `createDraft()` / `updateDraft()` / `submitForReview()` | `src/domain/propertySubmission/repository.ts:1190-1206, 1589-1598, 1700-1714, 1881-1892` | Enforces `getPartnerEligibility()` returning HTTP `403` when `listingSource === 'PARTNER'` and `!eligible`; inserts `partner_attestations` on submit. |
| `PropertySubmissionService.getPartnerEligibility()` | `src/domain/propertySubmission/service.ts:203-208` | Thin pass-through to repository. |

### 3.3 API Layer
| Endpoint | File | Status |
|---|---|---|
| `GET /api/customer/partner-status` | `app/api/customer/partner-status/route.ts:8-56` | Implemented; returns `{ success, customerId, phone, isPartner, status, eligible, message }` (`401`/`403` via `verifyCustomerAuth`, `503` on DB unavailable). |
| `POST /api/customer/submissions` | `app/api/customer/submissions/route.ts`, `src/domain/propertySubmission/customerSubmissionRouteHandlers.ts` | Calls `service.createDraft()` → enforces `403` if `PARTNER` & ineligible. |
| `PUT /api/customer/submissions/[id]` | `app/api/customer/submissions/[id]/route.ts`, `customerSubmissionRouteHandlers.ts` | Calls `service.updateDraft()` → enforces `403` if `PARTNER` & ineligible. |
| `POST /api/customer/submissions/[id]/submit` | `app/api/customer/submissions/[id]/submit/route.ts` | Calls `service.submitForReview()` → enforces `403` if `PARTNER` & ineligible + writes `partner_attestations`. |
| `/api/customer/partner*` (apply/register/profile) | — | **MISSING** |
| `/api/admin/partners*` (list/approve/suspend/revoke) | — | **MISSING** |

### 3.4 Frontend & Admin Layer
| Component / Page | File & Lines | Partner Behavior |
|---|---|---|
| `PostPropertyHub.tsx` | `src/components/post-property/PostPropertyHub.tsx:68-170` | Allows selecting `PARTNER`, triggers `GET /api/customer/partner-status`, blocks navigation if `!eligible`, shows static status banner with **no** registration CTA. |
| `PostPropertyWizard.tsx` | `src/components/post-property/PostPropertyWizard.tsx:892-933, 1047-1056, 2130-2188` | Re-fetches `/api/customer/partner-status` on mount when `PARTNER` selected; renders Step 1 eligibility banner; blocks `handleNextStep()` if ineligible. |
| `/account` & `/account/profile` | `app/account/page.tsx:1-6`, `app/account/profile/page.tsx:1-141` | Customer account hub / profile editor; **zero** mention of Partner Profile status or application. |
| `StaffSubmissionsWorkspace.tsx` & `StaffSubmissionDetailWorkspace.tsx` | `src/components/admin/StaffSubmissionsWorkspace.tsx:1-295`, `src/components/admin/StaffSubmissionDetailWorkspace.tsx:323-358` | Shows `listingSource` (`OWNER` vs `PARTNER`) and attestation block, but **does not display current partner profile status** and misleadingly prints `"Partner Attestation Recorded"` even if `attestation` is `null`. |
| `app/admin/intelligence/customers/[id]/page.tsx` | `app/admin/intelligence/customers/[id]/page.tsx:1-675` | Customer 360 intelligence view; **does not display partner status or provide partner actions**. |

---

## 4. Partner Profile Lifecycle & Status State Machine

### 4.1 Discovered Statuses in Code & Schema
Only **five** status values exist in the partner model (`customer_partner_profiles` + `evaluatePartnerEligibility`):

| Status | Stored in DB? | `isPartner` | `eligible` | Origin / Meaning |
|---|---|---|---|---|
| `NONE` | No (or explicit `'NONE'` string treated as absent) | `false` | `false` | Synthesized when no row exists in `customer_partner_profiles` or `profile.status` is null/empty/`'NONE'`. |
| `PENDING` | Yes (DB default `'PENDING'`) | `true` | `false` | Intended initial status after partner application; blocked from creating/editing/submitting `PARTNER` listings. |
| `ACTIVE` | Yes | `true` | `true` | **Only** status authorized to create, edit, or submit `PARTNER` property listings. |
| `SUSPENDED` | Yes | `true` | `false` | Temporarily barred partner; blocked from `PARTNER` draft/update/submit. |
| `REVOKED` | Yes (also returned as catch-all fallback!) | `true` | `false` | Permanently barred partner. |

> **Clarification on Audit List:** Statuses `UNDER_REVIEW`, `APPROVED`, `REJECTED`, and `DEACTIVATED` do **not** exist in the partner profile lifecycle (`UNDER_REVIEW`, `APPROVED`, and `REJECTED` belong to `property_submissions.submission_status`, not `customer_partner_profiles.status`).

### 4.2 Lifecycle Transitions Matrix (Intended vs. Implemented)
| Transition | Schema Support | Runtime API / Repository / UI Support |
|---|---|---|
| `NONE → PENDING` (Partner Registration / Application) | Partial (column default `'PENDING'`, missing business/KYC columns) | **NOT IMPLEMENTED** |
| `PENDING → ACTIVE` (Staff Verification & Approval) | Columns exist (`approved_by_staff_id`, `approved_at`) + audit table | **NOT IMPLEMENTED** |
| `PENDING → REJECTED` (Application Denial) | Neither `'REJECTED'` status nor `rejection_reason` column exists | **NOT IMPLEMENTED** |
| `ACTIVE → SUSPENDED` (Staff Suspension) | Column exists (`suspension_reason`) + audit table | **NOT IMPLEMENTED** |
| `SUSPENDED → ACTIVE` (Reinstatement) | Audit table exists | **NOT IMPLEMENTED** |
| `ACTIVE / SUSPENDED → REVOKED` (Permanent Revocation) | Column exists (`revocation_reason`) + audit table | **NOT IMPLEMENTED** |

### 4.3 Critical Defect in `evaluatePartnerEligibility()` State Normalization (`repository.ts:386-438`)
1. **Pre-normalization `'NONE'` check (`line 386`):** `if (!profile || !profile.status || profile.status === 'NONE')` runs *before* `.toUpperCase()` / `.trim()`. A DB row containing `'none'` or `' NONE '` bypasses this check and is misclassified as `'REVOKED'`.
2. **Missing `.trim()` (`line 397`):** `const normalized = profile.status.toUpperCase()` does not trim whitespace (`'ACTIVE '` falls through as ineligible).
3. **Catch-all Fallback Misclassifies Unknown Values as `'REVOKED'` (`lines 430-437`):** Any unrecognized status (e.g., `'APPROVED'`, `'INACTIVE'`, `'UNDER_REVIEW'`, `'ACTIVE '`, `'none'`) falls into the final `else` branch and returns:
   `status: 'REVOKED', isPartner: true, eligible: false` with `"Your partner profile authorization has been REVOKED..."`.  
   Instead of throwing or returning a safe unrecognized/blocked status, data typos or future enum additions falsely accuse the user of being `REVOKED`.

---

## 5. Database Schema, Migration & Aggregate Integrity Verification

### 5.1 Schema vs. Migration Drift Findings (Verified in Code & `/drizzle/`)
1. **Zero SQL Migrations for Submission & Partner Tables:** Grepping `/drizzle/*.sql` confirms that `customer_partner_profiles`, `customer_partner_audit_history`, `property_submissions`, `property_submission_reviews`, and `partner_attestations` **do not appear in any Drizzle SQL migration file**. They exist solely in `src/db/schema.ts` and runtime bootstrap DDL `ensureSchemaUpdates()` (`src/db/client.ts:726-850`). Running `drizzle-kit migrate` on a fresh database without invoking runtime `ensureSchemaUpdates()` will fail to create the partner/submission tables.
2. **Missing PostgreSQL `CHECK` Constraints on `status`:** Neither `src/db/schema.ts:903` nor `src/db/client.ts:730` enforces `CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'))` at the PostgreSQL level, permitting arbitrary strings (including `'APPROVED'` or lowercase values) to trigger the fallback-to-`'REVOKED'` bug.
3. **Redundant Index on `customer_partner_profiles`:** `customer_id` has `.unique()` (`schema.ts:902`) / `UNIQUE` (`client.ts:729`), which automatically creates a unique B-tree index in PostgreSQL, yet an identical non-unique index `idx_customer_partner_profiles_customer` is also created (`schema.ts:912`, `client.ts:739`), adding redundant write overhead.
4. **Schema-to-DDL Foreign Key Mismatch on `partner_attestations`:** `src/db/client.ts:799-802` defines composite foreign key `fk_partner_attestation_ownership` (`(submission_id, partner_customer_id) REFERENCES property_submissions (id, submitter_customer_id) ON DELETE RESTRICT`), whereas `src/db/schema.ts:973-983` omits this foreign key completely—creating Drizzle Kit schema introspection drift.
5. **Runtime Bootstrap Trigger/DDL Exposure:** `ensureSchemaUpdates()` runs inside request paths (`getPartnerEligibility`, `verifyCustomerAuth`, etc.) via `backend.db.execute(sql.raw(...))`. While cached per process by `schemaUpdatesPromise`, any DDL failure clears the promise (`client.ts:852`) and blocks eligibility requests with `503`.

### 5.2 Live Database Aggregate Inspection Status
- **Environment Verification Result:** In this isolated sandbox workspace, `process.env.DATABASE_URL` and `process.env.TEST_DATABASE_URL` are both **`NOT_CONFIGURED`**.
- **Result:** Live PostgreSQL aggregate counts (total customers, partner profiles grouped by `status`, orphaned partner profiles, `PARTNER` submissions without `ACTIVE` partner profiles, `partner_attestations` counts, and live trigger/constraint presence) **could not be verified from this isolated sandbox**. No counts have been inferred or fabricated.

### 5.3 Exact Read-Only Aggregate Diagnostic Queries for Operator Execution
When executed by an authorized operator against the target database, the following non-PII aggregate queries verify live schema and data integrity:

```sql
-- 1. Verify partner & submission tables and CHECK/FK constraints exist
SELECT conname, conrelid::regclass AS table_name, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN (
  'customer_partner_profiles',
  'customer_partner_audit_history',
  'property_submissions',
  'partner_attestations'
);

-- 2. Verify append-only immutability triggers
SELECT event_object_table, trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table IN (
  'customer_partner_audit_history',
  'partner_attestations',
  'property_submission_reviews'
);

-- 3. Aggregate distribution of customer statuses & partner profiles (zero PII)
SELECT
  COUNT(*) AS total_customers,
  COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_customers,
  COUNT(*) FILTER (WHERE phone_verified_at IS NOT NULL) AS phone_verified_customers
FROM customers;

SELECT COALESCE(status, '<NULL>') AS partner_status, COUNT(*) AS profile_count
FROM customer_partner_profiles
GROUP BY status
ORDER BY profile_count DESC;

-- 4. Aggregate check for PARTNER submissions vs current partner profile status
SELECT
  ps.submission_status,
  COALESCE(cpp.status, 'NONE') AS current_partner_status,
  COUNT(*) AS submission_count
FROM property_submissions ps
LEFT JOIN customer_partner_profiles cpp
  ON cpp.customer_id = ps.submitter_customer_id
WHERE ps.listing_source = 'PARTNER'
GROUP BY ps.submission_status, COALESCE(cpp.status, 'NONE')
ORDER BY submission_count DESC;

-- 5. Check for PARTNER non-draft submissions missing partner_attestations rows
SELECT ps.submission_status, COUNT(*) AS missing_attestation_count
FROM property_submissions ps
LEFT JOIN partner_attestations pa
  ON pa.submission_id = ps.id AND pa.partner_customer_id = ps.submitter_customer_id
WHERE ps.listing_source = 'PARTNER'
  AND ps.submission_status <> 'DRAFT'
  AND pa.id IS NULL
GROUP BY ps.submission_status;
```

---

## 6. Server-Side Eligibility, Authorization & Security Findings

### 6.1 Controls Verified as Sound (`PASS`)
- **Strict Customer vs. Staff Credential Boundary (`src/domain/customer/customerAuth.ts:141-215`):** `verifyCustomerAuth` explicitly rejects any request containing `x-staff-role` (`403`) and verifies opaque SHA-256 hashed tokens against PostgreSQL `customer_auth_sessions` (`revoked_at IS NULL AND expires_at > now()`) joined with `customers.status = 'ACTIVE'`.
- **Server-Side Gate at All Write Boundaries:**
  - `createDraft` (`repository.ts:1193-1198`): Rejects `listingSource === 'PARTNER'` with HTTP `403` unless `getPartnerEligibility(submitterCustomerId).eligible === true`.
  - `updateDraft` (`repository.ts:1593-1598`): Enforces `getPartnerEligibility(customerId)` with HTTP `403` whenever incoming or existing `listingSource === 'PARTNER'`, preventing `OWNER → PARTNER` privilege escalation via `PUT /api/customer/submissions/[id]`. Also updates top-level `listingSource` column (`lines 1641-1645`).
  - `submitForReview` (`repository.ts:1706-1714`): Re-verifies `getPartnerEligibility(customerId)` with HTTP `403` before transition and inserts a canonical, server-controlled `partner_attestations` row (`lines 1881-1892`), overwriting client-supplied declaration text/version (`lines 1716-1725`).
- **Partner Eligibility Endpoint Isolation:** `GET /api/customer/partner-status` derives `customerId` exclusively from `verifyCustomerAuth(req)` (never from query params or request body), preventing IDOR enumeration of other users' partner status.

### 6.2 Security, Data Integrity & Authorization Gaps (`FAIL` / `WARN`)
1. **No Partner Re-Verification at Staff Approval or Publication (`repository.ts:3088-3369`):**
   - `approveSubmission()` and `publishSubmission()` check photograph counts (`3–15`) and submission status, **but never check `getPartnerEligibility(detail.submission.submitterCustomerId)`**.
   - If a partner is `ACTIVE` at submission time (`submitForReview`), then `SUSPENDED` or `REVOKED` due to fraud/policy violation prior to staff action, staff can still approve and publish the `PARTNER` listing to `resale_listings` / `rental_listings`—and `StaffSubmissionDetailWorkspace` provides no indication that the partner is now `SUSPENDED`/`REVOKED`.
2. **Published `PARTNER` Listings Emit Hardcoded Placeholder Contact Identity (`repository.ts:3227-3228, 3314-3316, 3335-3337`):**
   - `publishSubmission` reads `payload.submitterName || 'Verified Owner'` and `payload.submitterPhone || '9876543210'`.
   - The wizard payload schema does not collect `submitterName` or `submitterPhone`, and `customer_partner_profiles` stores no agency name or verified business phone.
   - Result: Any published `PARTNER` listing (`listingPartyType: 'PARTNER'`) falls back to storing `'Verified Owner'` and dummy phone `'9876543210'` in `resale_listings` / `rental_listings` instead of verified customer/partner identity.
3. **Submission Media Upload Does Not Re-Check Partner Eligibility (`src/domain/propertySubmission/mediaService.ts`):**
   - Media upload checks submission ownership (`submitterCustomerId`) and editable status (`DRAFT` / `CHANGES_REQUESTED`), which is safe for ownership, though a `PARTNER` draft whose partner was suspended after draft creation can still upload images to R2 until `PUT` or `POST /submit` rejects them.
4. **Customer Phone Verification Not Re-Checked at Submission Boundary:**
   - OTP login (`src/domain/customer/customerOtp.ts:278`) requires `phone_verified_at IS NOT NULL`, while `verifyCustomerAuth` (`customerAuth.ts:189-198`) only checks `c.status = 'ACTIVE'`. Furthermore, `PATCH /api/customer/profile` (`app/api/customer/profile/route.ts`) allows updating profile phone without clearing/re-verifying `phone_verified_at` if a customer mutates their contact phone post-login (relevant when trusted partner contact identity is established).
5. **No Database-Level `CHECK` Constraint on `customer_partner_profiles.status`:**
   - Any direct SQL insert/update with a casing error or legacy status (`'APPROVED'`, `'active'`) succeeds at DB write time and is misinterpreted as `'REVOKED'` by `evaluatePartnerEligibility()`.

---

## 7. Frontend User Experience & Hub / Wizard / Account Findings

1. **Dead-End UX on `/post-property` Hub (`src/components/post-property/PostPropertyHub.tsx:68-170`):**
   - Selecting *Authorized Partner* checks `GET /api/customer/partner-status`. For all standard customers (`NONE`), an inline error box displays explaining that no active partner profile exists, **with zero path forward**: no *"Apply to Become a Partner"* flow, no partner registration link, and no partner support contact link.
2. **Duplicate Error Messaging & Dead-End in Wizard Step 1 (`src/components/post-property/PostPropertyWizard.tsx:1047-1056, 2157-2187`):**
   - Direct navigation to `/post-property/new?source=PARTNER` immediately shows `Partner Profile Not Eligible (Status: NONE)` inside the card. Clicking `Continue` runs `checkPartnerStatusOnServer()` again and displays a second red banner (`Partner submission requires an ACTIVE Great Homes Partner Profile verified on the server.`).
   - Like the Hub, Step 1 offers only one resolution: switching back to `OWNER`.
3. **Auth Expiry Misclassified as `'ERROR'` in `checkPartnerStatusOnServer()` (`PostPropertyWizard.tsx:897-906`):**
   - If `GET /api/customer/partner-status` returns HTTP `401` (expired/revoked session mid-session), `PostPropertyWizard.tsx` does **not** check `res.status === 401` to trigger `openAuthModal('login')`; it sets `partnerStatus.status = 'ERROR'` (`Could not verify partner eligibility.`). `PostPropertyHub.tsx:85-96` has the same behavior.
4. **Resumed `PARTNER` Drafts When Partner Was Suspended/Revoked Later:**
   - `computeHighestReachedWizardStep()` (`src/domain/propertySubmission/validation.ts:1201-1205`) resets incomplete `PARTNER` drafts back to Step `1` if Step 2 isn't reached, forcing Step 1 re-check; however, if Step 2+ was already completed and saved, `hydrateExistingSubmission` does not block or warn on load until Step 6 or draft sync triggers a `403`, rather than surfacing an immediate suspension/revocation banner on wizard load.
5. **Customer Account Surface (`/account`, `/account/profile`) Lacks Partner Visibility:**
   - Authenticated customers have no Account section showing their Partner status (`NONE` / `PENDING` / `ACTIVE` / `SUSPENDED` / `REVOKED`), reason for suspension/revocation, or onboarding status.
6. **Staff Detail Workspace Misleading Attestation UI (`src/components/admin/StaffSubmissionDetailWorkspace.tsx:339-350`):**
   - For any `listingSource === 'PARTNER'` submission, the UI unconditionally renders heading **`Partner Attestation Recorded`** and falls back to `'Partner attestation accepted on behalf of verified owner.'` when `attestation` is `null`—even before submission (`DRAFT`) or if an attestation record is unexpectedly missing. It also displays zero information on whether `submitterCustomerId` currently holds an `ACTIVE`, `SUSPENDED`, or `REVOKED` partner profile.

---

## 8. Admin Partner Management & Operations Gaps

Inspection of `/src/domain/auth/capabilityModel.ts`, `/app/api/admin/*`, and `/src/components/admin/*` confirms **complete absence of operational tooling** for Partner Profiles:

| Capability / Surface | Current Status |
|---|---|
| `StaffCapability` permissions (`src/domain/auth/capabilityModel.ts:1-155`) | **MISSING.** Capabilities exist for `submission.*`, `rera.*`, `developer.*`, `customer_intelligence.*`, `staff.*`, etc., but **zero** `partner.*` capabilities exist (`partner.read`, `partner.create`, `partner.approve`, `partner.suspend`, `partner.revoke`). |
| Admin API routes (`/app/api/admin/*`) | **MISSING.** No `/api/admin/partners`, `/api/admin/partners/[customerId]/approve`, `suspend`, or `revoke` endpoints exist. |
| Admin UI (`src/components/admin/*`, `/app/admin/*`) | **MISSING.** Neither Admin Sidebar nor Customer Intelligence (`/app/admin/intelligence/customers/[id]/page.tsx`) nor Submissions Detail (`StaffSubmissionDetailWorkspace.tsx`) provides partner lookup, KYC/RERA review, approval, suspension, revocation, or audit-history viewing. |
| Audit Trail (`customer_partner_audit_history`) | Table + PostgreSQL immutability triggers (`client.ts:741-751, 824-827, 846-849`) exist in DB bootstrap, **but zero code ever reads or writes to this table**. |

---

## 9. Test Coverage & Verification Gaps

| Test Script | What It Tests | Critical Gap |
|---|---|---|
| `scripts/test-post-property-entry.ts` (`1-27`) | Tests a **local inline copy** of `evaluatePartnerStatus()`, NOT `repository.evaluatePartnerEligibility()` or `/api/customer/partner-status`. | False confidence; does not catch the real repo `'NONE'` / `'REVOKED'` fallback bug or HTTP route behavior. |
| `scripts/test-property-submission-foundation.ts` (`1-139`) | Validates Drizzle schema exports + static declaration helpers. | Does not test partner lifecycle, DB constraints, or FK alignment. |
| `scripts/test-pp-04-wizard.ts` (`276-367`) | Seeds `'ACTIVE'` and `'PENDING'` in `customerPartnerProfiles` via raw SQL/memory; verifies `PENDING` `403` block and `ACTIVE` pass. | Directly inserts SQL rows (bypassing missing app onboarding); **never tests `SUSPENDED`, `REVOKED`, lowercase/whitespace statuses, or HTTP routes**. |
| `scripts/test-pp-04b-security-regression.ts` (`1-561`) | Uses `setMemoryPartnerProfileForTesting` to verify `ACTIVE` partner can submit, `NONE`/`PENDING` get `403`, and `OWNER → PARTNER` escalation in `updateDraft` fails (`403`). | Memory-only for partner check; **no `SUSPENDED`/`REVOKED` HTTP tests**, no `GET /api/customer/partner-status` route handler test. |
| `scripts/test-pp-05-property-engine.ts` (`1-696`) | Memory-mode `ACTIVE` partner `PARTNER` resale/rental payload creation + `partnerAttestations` insertion. | Memory-only; no DB transaction or FK verification for `PARTNER`. |
| `scripts/test-pp-wizard-premature-validation.ts` (`1-810`) | Memory-mode `ACTIVE` partner wizard step validation. | Assumes pre-seeded `ACTIVE` partner. |
| `scripts/test-pp-07-my-properties-resume.ts` (`1-842`) | Draft resume, list, withdrawal for `OWNER` submissions. | **`PARTNER` draft resume when partner becomes `SUSPENDED`/`REVOKED` is untested.** |
| `scripts/test-pp-08-admin-verification-workspace.ts` (`1-179`) | Staff moderation workflow (`OWNER` submission). | **Zero tests for `PARTNER` submission staff detail, attestation display, or partner status check.** |
| `scripts/test-pp-09-approval-publication.ts` (`1-128`) | Staff approval & publication (`OWNER` submission). | **Zero tests for `PARTNER` publication (`listingPartyType = 'PARTNER'`, owner/partner contact population, or mid-flight partner revocation).** |
| `scripts/test-pp-11-photo-upload-remediation.ts` (`1-618`) | Step 4 photo upload error/XHR/storage behavior (`OWNER`). | No `PARTNER` upload test or suspended-partner upload block test. |

**Untested Platform Scenarios Summary:** Partner registration (`NONE → PENDING`), staff approval (`PENDING → ACTIVE`), suspension/revocation transitions, `customer_partner_audit_history` immutability triggers in practice, `GET /api/customer/partner-status` HTTP handler, `PARTNER` listing publication, and mid-flight partner revocation between `SUBMITTED` and `PUBLISHED`.

---

## 10. Prioritized Remediation Findings

| ID | Severity | Finding | Primary Evidence |
|---|---|---|---|
| **GP-01** | **CRITICAL** | **Zero runtime Partner Onboarding, Registration, or Admin Approval/Activation paths exist.** `customer_partner_profiles` is read-only across the entire app, blocking 100% of organic customers at `Status: NONE`. | `app/api/customer/partner-status/route.ts`, `src/domain/propertySubmission/repository.ts:1039-1055`, absence of `/api/admin/partners*` & `/api/customer/partner/*` write routes |
| **GP-02** | **CRITICAL** | **Zero Admin RBAC capabilities, API endpoints, or Admin UI exist** to review, approve, suspend, or revoke partner profiles; `customer_partner_audit_history` and reason/approval columns are completely dead code. | `src/domain/auth/capabilityModel.ts:1-155`, `src/db/schema.ts:900-927`, `/app/api/admin/*` |
| **GP-03** | **HIGH** | **`customer_partner_profiles` lacks required business/KYC/RERA metadata** (firm name, RERA ID, GST/PAN, verified business phone, rejection notes) needed to responsibly verify an agent/broker before granting `PARTNER` authority. | `src/db/schema.ts:900-913` |
| **GP-04** | **HIGH** | **`evaluatePartnerEligibility()` misclassifies unknown/untrimmed statuses as `'REVOKED'`** and checks `'NONE'` before `.toUpperCase().trim()`, while DB lacks a `CHECK` constraint on `status`. | `src/domain/propertySubmission/repository.ts:382-438`, `src/db/client.ts:727-737` |
| **GP-05** | **HIGH** | **Schema & Drizzle migration drift:** `customer_partner_profiles`, `customer_partner_audit_history`, `property_submissions`, and `partner_attestations` are absent from `/drizzle/*.sql`, and `fk_partner_attestation_ownership` in `client.ts` is missing from `schema.ts`. | `/drizzle/*`, `src/db/client.ts:726-850`, `src/db/schema.ts:900-983` |
| **GP-06** | **HIGH** | **No partner eligibility re-check at Staff Approval/Publication** (`approveSubmission`/`publishSubmission`), allowing suspended or revoked partners' pending submissions to go live silently. | `src/domain/propertySubmission/repository.ts:3088-3369`, `src/components/admin/StaffSubmissionDetailWorkspace.tsx:339-350` |
| **GP-07** | **HIGH** | **`publishSubmission()` writes hardcoded fallback contact `'Verified Owner'` / `'9876543210'`** for `PARTNER` (and `OWNER`) listings because wizard payload and partner profile do not carry verified submitter/partner contact fields. | `src/domain/propertySubmission/repository.ts:3227-3228, 3314-3316, 3335-3337` |
| **GP-08** | **MEDIUM** | **Misleading Staff Attestation Banner:** `StaffSubmissionDetailWorkspace.tsx` renders `"Partner Attestation Recorded"` and fallback prose even when `attestation === null`, and omits current partner profile status. | `src/components/admin/StaffSubmissionDetailWorkspace.tsx:339-350` |
| **GP-09** | **MEDIUM** | **Wizard & Hub 401 Expiry Misclassification + Dead-End UX:** HTTP `401` on `/api/customer/partner-status` renders as generic `'ERROR'` rather than prompting OTP login; Hub, Wizard, and `/account` provide zero Partner application or status visibility. | `src/components/post-property/PostPropertyWizard.tsx:897-906, 2173-2185`, `PostPropertyHub.tsx:85-96`, `app/account/profile/page.tsx` |
| **GP-10** | **MEDIUM** | **Submission Media & Auth Identity Consistency:** `verifyCustomerAuth` + `createDraft`/`submitForReview` do not check `customers.phone_verified_at IS NOT NULL`; redundant index `idx_customer_partner_profiles_customer` duplicates `UNIQUE`. | `src/domain/customer/customerAuth.ts:189-198`, `src/db/schema.ts:902, 912` |
| **GP-11** | **LOW** | **Test Suite Masks Lifecycle Absence:** `test-post-property-entry.ts` tests a mock inline copy; `PP-04` seeds raw SQL; `PP-07/08/09/11` skip `PARTNER` lifecycle and `SUSPENDED`/`REVOKED` flows entirely. | `scripts/test-post-property-entry.ts`, `scripts/test-pp-04-wizard.ts`, `scripts/test-pp-08*`, `scripts/test-pp-09*` |

---

## 11. Recommended Platform-Wide Solution Design

1. **Partner Profile Domain & Schema Expansion (Backward-Compatible):**
   - Extend `customer_partner_profiles` with business/compliance fields (`partner_type`, `firm_name`, `business_city`, `rera_registration_number`, `pan_masked` / verification doc refs, `business_phone`, `rejection_reason`, `rejected_at`, `rejected_by_staff_id`, `submitted_at`) and enforce `CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'REJECTED'))`.
   - Remove redundant index `idx_customer_partner_profiles_customer` (keeping the unique constraint index) and synchronize `schema.ts`, `client.ts`, and official `/drizzle/*.sql` migrations.
   - Fix `evaluatePartnerEligibility()` to trim/uppercase before comparisons, recognize `'REJECTED'`, and fail closed on unrecognized status strings without mislabeling them as `'REVOKED'`.

2. **Customer Partner Onboarding & Self-Service Status (`App` + `API`):**
   - Add `/api/customer/partner-profile` (`GET` status + profile metadata + latest review decision reason; `POST` / `PUT` apply or re-apply from `NONE` / `REJECTED` → `PENDING`, writing an immutable `customer_partner_audit_history` row).
   - Add a dedicated `/account/partner` (or `/post-property/partner-onboarding`) page linked from `/account`, `PostPropertyHub`, and `PostPropertyWizard` Step 1 whenever status is `NONE` or `REJECTED`, plus clear status/reason banners for `PENDING`, `SUSPENDED`, and `REVOKED`.
   - Handle `401` on `/api/customer/partner-status` by invoking `openAuthModal('login')`.

3. **Admin Partner Verification & Governance (`RBAC` + `API` + `Admin UI`):**
   - Add granular capabilities in `capabilityModel.ts`: `partner.read`, `partner.approve`, `partner.reject`, `partner.suspend`, `partner.reinstate`, `partner.revoke`.
   - Implement transactional admin service/repository methods + `/api/admin/partners` routes that atomically update `customer_partner_profiles`, set `approvedByStaffId`/`approvedAt`/`suspensionReason`/`revocationReason`, and append an immutable event to `customer_partner_audit_history`.
   - Build `/admin/partners` workspace and embed current partner status badges + audit link inside `StaffSubmissionDetailWorkspace` and `/admin/intelligence/customers/[id]`.

4. **End-to-End Integrity Across Approval & Publication:**
   - Enforce live `ACTIVE` partner status during `approveSubmission()` and `publishSubmission()` for `listingSource === 'PARTNER'` (throwing HTTP `409`/`403` with clear guidance if the partner was `SUSPENDED` or `REVOKED` after submission).
   - Update `publishSubmission()` to source verified customer/partner identity (`customers.name`/`phone` and partner `firm_name`/`business_phone`) rather than `'Verified Owner'` / `'9876543210'`.
   - Fix `StaffSubmissionDetailWorkspace.tsx` to display `Pending Partner Attestation (Draft)` when `attestation` is `null` and show the live partner status badge.

---

## 12. Step-by-Step Implementation Roadmap (Not Executed — For Approval)

1. **Phase 1 — Database & Migration Synchronization:** Reconcile `schema.ts`, `client.ts`, and `/drizzle/` migrations for all submission/partner tables; add `CHECK` constraints, `REJECTED` status + KYC/business columns, and sync `fk_partner_attestation_ownership`. Verify against a real PostgreSQL instance.
2. **Phase 2 — Domain Logic, Security Hardening & Repository Write Methods:** Fix `evaluatePartnerEligibility()` normalization/fallback; implement transactional partner application, approval, rejection, suspension, reinstatement, and revocation methods writing `customer_partner_audit_history`; enforce live partner status at `approveSubmission` / `publishSubmission` and fix `publishSubmission` contact identity.
3. **Phase 3 — RBAC & API Routes:** Add `partner.*` capabilities to `capabilityModel.ts`, `/api/customer/partner-profile` (apply/view), and `/api/admin/partners/*` (list/detail/transition).
4. **Phase 4 — Customer & Admin UI:** Build customer Partner Onboarding flow (`/account/partner`), connect Hub/Wizard Step 1 CTAs & `401` handling, build `/admin/partners` moderation queue, and update `StaffSubmissionDetailWorkspace` attestation/status rendering.
5. **Phase 5 — End-to-End & PostgreSQL Test Coverage:** Replace mock inline test logic in `test-post-property-entry.ts` with real service/route tests; add full PostgreSQL integration tests covering `NONE → PENDING → ACTIVE → SUSPENDED → ACTIVE → REVOKED`, `PARTNER` approval/publication, mid-flight revocation blocks, and concurrent transition locks.

---

## 13. Acceptance Criteria for Future Remediation

- [ ] A newly registered OTP-verified customer can submit a partner application via UI and transitions `NONE → PENDING` with an append-only `customer_partner_audit_history` row.
- [ ] While `PENDING`, `SUSPENDED`, `REVOKED`, or `REJECTED`, both `GET /api/customer/partner-status` and all submission write routes (`POST`, `PUT`, `POST /submit`) fail closed with HTTP `403`.
- [ ] Authorized staff with `partner.approve` / `partner.suspend` / `partner.revoke` capabilities can review and transition partner profiles in Admin UI, writing tamper-proof `customer_partner_audit_history` entries; unauthorized staff roles receive `403`.
- [ ] Once transitioned to `ACTIVE`, any eligible customer (without manual SQL intervention) passes Step 1 in `PostPropertyHub` and `PostPropertyWizard`, creates/submits a `PARTNER` draft, records an immutable `partner_attestations` row, and publishes with verified partner/customer contact details (never `'9876543210'`).
- [ ] Suspending or revoking a partner after a submission enters `SUBMITTED`/`UNDER_REVIEW` blocks `approveSubmission` and `publishSubmission` with an explicit eligibility error.
- [ ] Unrecognized/malformed DB `status` values are blocked at PostgreSQL (`CHECK`) and never misclassified as `'REVOKED'` by `evaluatePartnerEligibility()`.
- [ ] All schema changes are captured in `/drizzle/*.sql` and verified against clean PostgreSQL initialization.

---

## 14. Evidence & Inspected Files Appendix

- **Database & Migrations:** `src/db/schema.ts` (`543`, `899–984`), `src/db/client.ts` (`726–850`), `/drizzle/*.sql`
- **Eligibility & Submission Repository/Service:** `src/domain/propertySubmission/repository.ts` (`382–438`, `1039–1075`, `1190–1230`, `1580–1675`, `1690–1735`, `1870–1900`, `2880–2941`, `3085–3375`), `src/domain/propertySubmission/service.ts` (`203–208`), `src/domain/propertySubmission/validation.ts` (`1150–1225`), `src/domain/propertySubmission/mediaService.ts` (`1–626`), `src/domain/propertySubmission/customerSubmissionRouteHandlers.ts` (`1–209`)
- **Customer Auth & Routes:** `app/api/customer/partner-status/route.ts` (`1–57`), `app/api/customer/submissions/route.ts` (`1–86`), `app/api/customer/submissions/[id]/route.ts` (`1–124`), `app/api/customer/submissions/[id]/submit/route.ts` (`1–126`), `app/api/customer/submissions/[id]/media/route.ts` (`1–31`), `src/domain/customer/customerAuth.ts` (`1–224`), `src/domain/customer/customerOtp.ts` (`1–564`), `src/domain/customer/services/customerService.ts` (`1–120`), `app/api/customer/profile/route.ts`
- **Staff RBAC & Admin Surfaces:** `src/domain/auth/capabilityModel.ts` (`1–656`), `/app/api/admin/*`, `src/components/admin/StaffSubmissionsWorkspace.tsx` (`1–295`), `src/components/admin/StaffSubmissionDetailWorkspace.tsx` (`1–507`), `app/admin/intelligence/customers/[id]/page.tsx` (`1–675`)
- **Frontend Customer Surfaces:** `src/components/post-property/PostPropertyHub.tsx` (`50–250`), `src/components/post-property/PostPropertyWizard.tsx` (`870–1140`, `1680–1850`, `2130–2300`), `app/account/page.tsx` (`1–6`), `app/account/profile/page.tsx` (`1–141`)
- **Automated Test Scripts:** `scripts/test-post-property-entry.ts`, `scripts/test-property-submission-foundation.ts`, `scripts/test-pp-04-wizard.ts`, `scripts/test-pp-04b-security-regression.ts`, `scripts/test-pp-05-property-engine.ts`, `scripts/test-pp-07-my-properties-resume.ts`, `scripts/test-pp-08-admin-verification-workspace.ts`, `scripts/test-pp-09-approval-publication.ts`, `scripts/test-pp-11-photo-upload-remediation.ts`, `scripts/test-pp-wizard-premature-validation.ts`

---

## 15. Strict Read-Only Compliance Confirmation

- **Source Code:** Zero existing application, schema, config, test, or migration files were modified. Only this audit report (`GLOBAL_PARTNER_PROFILE_ELIGIBILITY_AUDIT.md`) was written.
- **Database & Infrastructure:** Zero database writes, schema migrations, row updates, environment variable changes, deployments, merges, or commits were performed.
- **Data Privacy & Scope:** Investigation was strictly platform-wide; zero customer-specific lookups were conducted and zero PII, credentials, tokens, or secrets were accessed or disclosed.
