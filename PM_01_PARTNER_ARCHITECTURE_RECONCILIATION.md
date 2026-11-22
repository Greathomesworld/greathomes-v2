# GREAT HOMES V2 — PM-01
# PARTNER MANAGEMENT SYSTEM
## READ-ONLY ARCHITECTURE & DATABASE SCHEMA RECONCILIATION

**Phase:** PM-01 (Inspection & Architecture Reconciliation Only)  
**Audit Date:** November 16, 2026  
**Business Decisions Confirmed:**
- **Partner Eligibility:** BOTH individuals (sole proprietors / independent brokers / advisors) AND registered companies / real estate agencies.
- **Verification Model:** Manual verification and approval by authorized Great Homes staff.
- **Target Scope:** Platform-wide Partner Management System spanning customer onboarding, organization & representative management, private document verification, admin review workspace, database schema & Drizzle migrations, APIs, staff RBAC, Post Property Hub/Wizard integration, notifications, and publication integrity.

---

## 1. Executive Summary

Independent forensic reconciliation of the Great Homes V2 codebase, configuration, Drizzle migration history, storage layer, RBAC model, and test suites confirms **all 10 findings** reported by the prior platform-wide audit and uncovers additional architectural gaps critical to PM-02+ implementation:

1. **Partner System Is Currently a Read-Only Gate:** `customer_partner_profiles` is queried solely via `SELECT` in `PropertySubmissionRepository.getPartnerEligibility()` (`src/domain/propertySubmission/repository.ts:1039-1055`). Zero runtime API routes, UI screens, or domain services exist to apply, register, approve, reject, suspend, or revoke a partner profile or manage partner organizations.
2. **All 5 Partner/Submission Tables Bypass Drizzle Migrations:** `customer_partner_profiles`, `customer_partner_audit_history`, `property_submissions`, `property_submission_reviews`, and `partner_attestations` exist in `src/db/schema.ts` and runtime `ensureSchemaUpdates()` (`src/db/client.ts:726-850`), **but are completely absent from `/drizzle/0000_*.sql` through `0011_*.sql`**.
3. **Private Document Storage Is Not Yet Safe for KYC/Business Docs:** While `fileSecurity.ts` already validates PDF/image magic bytes, `S3StorageProvider` (`src/domain/media/storage/storageProvider.ts:144-289`) targets a single public-mapped CDN bucket (`S3_BUCKET` / `MEDIA_PUBLIC_BASE_URL`) and **`getSignedUrl()` is a stub returning `this.getPublicUrl(key)`** (`lines 286-288`) despite `@aws-sdk/s3-request-presigner` being installed in `package.json`.
4. **Submission Approval/Publication Gap Is Even Deeper Than Previously Reported:** Not only do `approveSubmission()` and `publishSubmission()` in `repository.ts:3088-3369` skip partner eligibility revalidation and fall back to `'Verified Owner'` / `'9876543210'`, **neither method is currently wired to any HTTP route in `staffSubmissionRouteHandlers.ts` or UI button in `StaffSubmissionDetailWorkspace.tsx`**, and `publishSubmission()` also has nested-payload mapping gaps (`payload.askingPrice` vs `payload.details.askingPrice`).
5. **No Live PostgreSQL Connection in Sandbox:** `DATABASE_URL` and `TEST_DATABASE_URL` are not configured in this isolated workspace (`NOT_CONFIGURED`). Live database state could not be inspected; all live DB statements are explicitly flagged below as unverifiable here and accompanied by safe read-only verification queries for pre-PM-02 execution.

---

## 2. Repository and Git Status

| Attribute | Verified Finding | Source / Evidence | Verification & Confidence |
|---|---|---|---|
| **Repository Root** | `/app/applet` (Next.js App Router workspace) | `pwd`, `list_dir /` | `[Source]` High |
| **Git Status & Branch** | **No Git repository present** (`fatal: not a git repository`) — `.git` directory does not exist in `/app/applet` or parents. Per strict rules, no replacement repo was created. | `git status --short --branch` | `[Runtime/FS]` High |
| **Next.js & React Versions** | Next.js `15.5.28` (`next.config.mjs`), React `19.0.0`, TypeScript `5.8.2`, Zod `^4.6.7`, Sharp `^0.33.5` | `package.json:34-58`, `next.config.mjs:1-121` | `[Source]` High |
| **Domain Architecture** | Modular domain-driven layout under `src/domain/*` (`audit`, `auth`, `comparison`, `customer`, `developers`, `editorial`, `enquiry`, `google`, `locationComparison`, `locations`, `marketIntelligence`, `media`, `places`, `projects`, `propertySubmission`, `repositories`, `search`, `seo`, `siteVisit`, `visitorIntelligence`) + PostgreSQL/memory repos in `src/infrastructure/repositories/*` | `list_dir /src/domain`, `src/infrastructure/repositories/` | `[Source]` High |
| **API Conventions** | Thin Next.js App Router route handlers (`app/api/**/*.ts`) delegating to domain route handlers (`*RouteHandlers.ts`) or domain services, wrapped with `extractRequestContext()` + `withCorrelationHeaders()`, returning `{ success: boolean, ... }` JSON | `app/api/customer/partner-status/route.ts`, `src/domain/propertySubmission/staffSubmissionRouteHandlers.ts`, `mediaRouteHandlers.ts` | `[Source]` High |
| **DB Connection Architecture** | `pg` `Pool` + `drizzle-orm/node-postgres` (`^0.39.3`) in `src/db/client.ts:884-938`. Fails closed in Production/Preview or `PERSISTENCE_PROVIDER=postgres` if `DATABASE_URL` missing. Guarded runtime DDL via `ensureSchemaUpdates()` (`lines 64-864`). | `src/db/client.ts:1-956`, `package.json:33,37` | `[Source]` High |
| **Drizzle Config** | Lives at `/src/db/drizzle.config.ts` (NOT workspace root `/drizzle.config.ts`). Points to `schema: "./src/db/schema.ts"`, `out: "./drizzle"`, `dialect: "postgresql"`. | `src/db/drizzle.config.ts:1-14` | `[Source]` High |
| **Migrations Directory** | `/drizzle` contains 12 SQL files (`0000_adorable_unus.sql` through `0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql`) + `/drizzle/meta/_journal.json` (version `7`, 12 entries). | `list_dir /drizzle`, `drizzle/meta/_journal.json` | `[Source]` High |
| **Admin Structure** | `/app/admin/*` routes wrapped in `AdminLayout` → `AdminShell` (`AdminAuthProvider`, `AdminSidebar`, `AdminTopbar`); components in `src/components/admin/*`. Staff auth via HMAC cookie `gh_staff_session` (`verifyInternalStaff` in `authorizationBoundary.ts`). | `app/admin/layout.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/domain/auth/authorizationBoundary.ts` | `[Source]` High |
| **Storage Config** | `@aws-sdk/client-s3` (`^3.750.0`) & `@aws-sdk/s3-request-presigner` (`^3.750.0`); `.env.example` specifies `STORAGE_PROVIDER="s3"`, `S3_BUCKET="greathomes-media"`, Cloudflare R2 endpoint, `MEDIA_PUBLIC_BASE_URL="https://media.greathomes.co.in"`. | `package.json:22-23`, `.env.example:43-50`, `storageProvider.ts` | `[Source/Config]` High |
| **Test Infrastructure** | `tsx`-executed assertion scripts in `/scripts/test-*.ts` and `.mjs` (`node:assert/strict`), using `testIsolationContext.ts` (`/tmp/gh-media-test-sandbox`) and repository `enableTestMemoryPersistence(true)`. | `package.json:10-19`, `src/lib/testIsolationContext.ts`, `scripts/test-pp-*.ts` | `[Source]` High |
| **Live DB Access** | **Unavailable in sandbox.** `process.env.DATABASE_URL` and `process.env.TEST_DATABASE_URL` are `NOT_CONFIGURED`. | Environment check | `[Runtime]` High |

---

## 3. Current Partner Architecture

### Independent Verification of Prior Audit Hypotheses (1–10)
| # | Hypothesis from Prior Audit | Verification Verdict | Supporting Evidence |
|---|---|---|---|
| 1 | `customer_partner_profiles` is read-only at runtime | **CONFIRMED** | Only queried in `PropertySubmissionRepository.getPartnerEligibility()` (`src/domain/propertySubmission/repository.ts:1048-1051`); zero `.insert()`/`.update()`/`.delete()` outside `scripts/test-pp-04-wizard.ts:314-336,505`. |
| 2 | No customer-facing partner registration workflow exists | **CONFIRMED** | `/api/customer/partner-status` is `GET`-only; `PostPropertyHub.tsx`, `PostPropertyWizard.tsx`, `/account/*`, and `CustomerNavControl.tsx` contain no application form or CTA. |
| 3 | No partner application creation or approval services exist | **CONFIRMED** | `src/domain/` has no `partner` domain module; `PropertySubmissionService` (`service.ts:203-208`) only exposes `getPartnerEligibility()`. |
| 4 | No partner-specific admin capabilities or management UI exist | **CONFIRMED** | `capabilityModel.ts:1-656` has zero `partner.*` capabilities; `/app/admin/*` & `/app/api/admin/*` have zero partner routes; `AdminSidebar.tsx` has no Partners nav entry. |
| 5 | `customer_partner_audit_history` is unused at runtime | **CONFIRMED** | Defined in `schema.ts:916-927` & `client.ts:741-751`; zero imports/references in `app/` or `src/`. |
| 6 | `partner_attestations` has incomplete schema representation | **CONFIRMED** | `client.ts:799-802` defines composite FK `fk_partner_attestation_ownership (submission_id, partner_customer_id) -> property_submissions(id, submitter_customer_id)`, omitted from `schema.ts:973-983`. |
| 7 | Partner eligibility normalization has defects | **CONFIRMED** | `repository.ts:386-437` checks `profile.status === 'NONE'` pre-uppercase, lacks `.trim()`, and defaults unknown values to `'REVOKED'`. |
| 8 | Partner eligibility is not revalidated during approval & publication | **CONFIRMED (+EXPANDED)** | `approveSubmission()` (`repository.ts:3088-3151`) and `publishSubmission()` (`lines 3208-3369`) never call `getPartnerEligibility()` — AND neither method is wired to HTTP routes in `staffSubmissionRouteHandlers.ts` or buttons in `StaffSubmissionDetailWorkspace.tsx` yet. |
| 9 | Publication uses hardcoded fallback contact details | **CONFIRMED (+EXPANDED)** | `publishSubmission()` (`repository.ts:3227-3343`) falls back to `'Verified Owner'` / `'9876543210'`, ignores `brokerName`/`brokerPhone`/`listingPartyDisplayName` columns, and reads flat `payload.askingPrice`/`payload.monthlyRent` instead of wizard `payload.details.*`. |
| 10 | Partner-related schema objects are missing from Drizzle migrations | **CONFIRMED** | Zero occurrences of `customer_partner_*`, `property_submission*`, or `partner_attestation*` across `/drizzle/*.sql`. |

---

## 4. Database Schema Reconciliation

### 4.1 Five Target Objects Inspected

| Table | `src/db/schema.ts` Lines | `src/db/client.ts` Runtime DDL Lines | `/drizzle/*.sql` | Live PostgreSQL |
|---|---|---|---|---|
| `customer_partner_profiles` | `900–913` | `727–739` | **ABSENT** | Unverified (`DATABASE_URL` absent) |
| `customer_partner_audit_history` | `916–927` | `741–751`, triggers `824–827, 846–849` | **ABSENT** | Unverified |
| `property_submissions` | `930–954` | `753–776` | **ABSENT** | Unverified |
| `property_submission_reviews` | `957–970` | `778–790`, triggers `819–822, 841–844` | **ABSENT** | Unverified |
| `partner_attestations` | `973–983` | `792–805`, triggers `814–817, 836–839` | **ABSENT** | Unverified |

### 4.2 Detailed Column, Constraint, Index & Dependency Breakdown

#### A. `customer_partner_profiles` (`schema.ts:900-913` vs `client.ts:727-739`)
- **Columns & Nullability:**
  - `id`: `text` PK (`NOT NULL`)
  - `customer_id`: `text` `NOT NULL`, `UNIQUE`, FK → `customers(id) ON DELETE RESTRICT`
  - `status`: `text` `NOT NULL` `DEFAULT 'PENDING'`
  - `approved_by_staff_id`: `text` nullable, FK → `staff_users(id) ON DELETE SET NULL`
  - `approved_at`: `timestamp with time zone` nullable (`schema.ts:905` uses `{ withTimezone: true }`)
  - `suspension_reason`: `text` nullable
  - `revocation_reason`: `text` nullable
  - `created_at`: `timestamp with time zone` `DEFAULT now()` `NOT NULL`
  - `updated_at`: `timestamp with time zone` `DEFAULT now()` `NOT NULL`
- **Indexes:** `idx_customer_partner_profiles_status (status)`, `idx_customer_partner_profiles_customer (customer_id)` (plus implicit unique index from `UNIQUE(customer_id)`).
- **Check Constraints:** **NONE** in `schema.ts` or `client.ts`.
- **Discrepancies:**
  1. Redundant non-unique index `idx_customer_partner_profiles_customer` duplicates PostgreSQL's unique index on `customer_id`.
  2. Missing `CHECK` constraint enforcing valid status values.
  3. Lacks individual vs organization discriminator, legal/brand/RERA/KYC fields, `rejection_reason`, or multi-user organization relationship.

#### B. `customer_partner_audit_history` (`schema.ts:916-927` vs `client.ts:741-751`)
- **Columns:** `id` (`text` PK), `customer_id` (`text` `NOT NULL`, FK → `customers(id) ON DELETE RESTRICT`), `previous_status` (`text` nullable), `new_status` (`text` `NOT NULL`), `acting_staff_user_id` (`text` nullable, FK → `staff_users(id) ON DELETE SET NULL`), `reason` (`text` nullable), `created_at` (`timestamptz` `DEFAULT now() NOT NULL`).
- **Indexes:** `idx_customer_partner_audit_customer (customer_id)`, `idx_customer_partner_audit_created (created_at)` (note: `client.ts:751` specifies `created_at DESC`, `schema.ts:926` omits `DESC`).
- **Triggers (`client.ts:824-827, 846-849`):** `trg_customer_partner_audit_immutable` (`BEFORE UPDATE OR DELETE`) and `trg_prevent_truncate_audit` (`BEFORE TRUNCATE`).
- **Discrepancies:** Completely unreferenced at runtime; cannot distinguish self-service customer events (`actor_type = CUSTOMER` vs `STAFF`) or organization-level audit events cleanly if `customer_id` is the only subject column.

#### C. `partner_attestations` (`schema.ts:973-983` vs `client.ts:792-805`)
- **Columns:** `id` (`text` PK), `submission_id` (`text NOT NULL`), `partner_customer_id` (`text NOT NULL`), `attestation_version` (`text DEFAULT 'v1.0' NOT NULL`), `declaration_text` (`text NOT NULL`), `accepted_at` (`timestamptz DEFAULT now() NOT NULL`).
- **Indexes:** `idx_partner_attestations_submission (submission_id)`, `idx_partner_attestations_partner (partner_customer_id)`.
- **Foreign Keys & Triggers:** `client.ts:799-802` defines composite FK `fk_partner_attestation_ownership` (`(submission_id, partner_customer_id) REFERENCES property_submissions(id, submitter_customer_id) ON DELETE RESTRICT`); triggers `trg_partner_attestations_immutable` & `trg_prevent_truncate_attestations` (`lines 814-817, 836-839`).
- **Discrepancies:**
  1. `schema.ts:973-983` **omits `fk_partner_attestation_ownership`** completely—running `drizzle-kit generate` against `schema.ts` would emit `DROP CONSTRAINT fk_partner_attestation_ownership` if not reconciled!
  2. No `organization_id` snapshot (needed if a partner submits under a verified agency so organizational attribution remains immutable even if membership changes later).

#### D. `property_submissions` (`schema.ts:930-954` vs `client.ts:753-776`)
- **Columns:** `id`, `submitter_customer_id` (FK → `customers.id RESTRICT`), `listing_type`, `listing_source`, `submission_status` (default `'DRAFT'`), `resale_listing_id` (FK → `resale_listings.id RESTRICT`), `rental_listing_id` (FK → `rental_listings.id RESTRICT`), `payload` (`jsonb NOT NULL`), `submitted_at`, `reviewed_at`, `approved_at`, `withdrawn_at`, `created_at`, `updated_at`.
- **Constraints / Indexes:** `uq_submission_id_customer (id, submitter_customer_id)`, partial uniques `uq_resale_listing_submission` & `uq_rental_listing_submission`, plus 5 single-column indexes.
- **Discrepancies:** `schema.ts:935` comment lists 8 statuses omitting `'PUBLISHED'` & `'DEACTIVATED'` even though `repository.ts:3239,3346` sets `'PUBLISHED'` and `PP-09` (`repository.ts:3375`, `scripts/test-pp-09-approval-publication.ts:114`) transitions to `'DEACTIVATED'`.

#### E. `property_submission_reviews` (`schema.ts:957-970` vs `client.ts:778-790`)
- **Columns:** `id`, `submission_id` (FK → `property_submissions.id RESTRICT`), `staff_user_id` (FK → `staff_users.id SET NULL`), `event_type`, `previous_status`, `new_status`, `internal_note`, `submitter_feedback`, `created_at`.
- **Triggers (`client.ts:819-822, 841-844`):** `trg_property_submission_reviews_immutable` & `trg_prevent_truncate_reviews`.
- **Discrepancies:** Consistent between `schema.ts` and `client.ts`, missing from `/drizzle/*.sql`.

### 4.3 Additional Related Tables Discovered
1. `resale_listings` (`schema.ts:252-261`) & `rental_listings` (`schema.ts:321-330`): Include `listing_party_type`, `listing_party_display_name`, `owner_name`, `owner_phone`, `owner_email`, `broker_name`, `broker_phone`, `broker_email`, `private_phone`, `private_email`. Note vocabulary drift: `seed.ts:776` uses `listingPartyType: 'LISTING_PARTNER'`, whereas `repository.ts:3258,3314` and `enquiryService.ts:174,242` expect `'PARTNER'`!
2. `media_assets` (`schema.ts:496-528` vs `client.ts:180-213` vs `drizzle/0009_submission_media_assets.sql`): `0009` added `customer_id` + `idx_media_assets_customer` to `media_assets` in SQL, which were intentionally omitted from `schema.ts` and `client.ts` during PP-11 remediation (see `PP11_PHOTO_UPLOAD_REMEDIATION_REPORT.md`)—another migration-vs-schema alignment point to preserve carefully.
3. `customers` (`schema.ts:534-552` vs `client.ts:215-240`): `client.ts:237-239` creates `idx_customers_canonical_phone_unique` functional index not represented in `schema.ts`.
4. `notifications` & `alert_delivery_attempts` (`schema.ts:642-680`): Existing customer in-app + email-attempt-logging tables reusable for Partner lifecycle notifications.
5. `audit_logs` (`schema.ts:467-493`, `client.ts:152-178`): Staff action audit log table (`auditActions.ts`, `auditResources.ts`), reusable alongside `customer_partner_audit_history`.

### 4.4 Explicit Schema Comparison Matrix
1. **PostgreSQL vs `src/db/schema.ts`:** *Live PostgreSQL not accessible in sandbox (`DATABASE_URL` unconfigured).* Compared against runtime `client.ts` DDL instead: `schema.ts` lacks `fk_partner_attestation_ownership`, lacks `DESC` on `idx_customer_partner_audit_created`, lacks `idx_customers_canonical_phone_unique`, and `media_assets` in `0009` differs from `schema.ts`.
2. **PostgreSQL / `schema.ts` vs `/drizzle/*.sql`:** 5 submission/partner tables (`customer_partner_profiles`, `customer_partner_audit_history`, `property_submissions`, `property_submission_reviews`, `partner_attestations`) and `rate_limit_buckets` (also in `client.ts`) are absent from `/drizzle/*.sql`, meaning `drizzle-kit migrate` alone cannot provision them.
3. **Runtime `ensureSchemaUpdates()` vs Migration History:** `ensureSchemaUpdates()` (`client.ts:64-864`) silently absorbs DDL drift when `ALLOW_DB_MIGRATIONS` or `allowSafeBootstrap: true` runs on first request, bypassing Drizzle `_journal.json`.
4. **Repository Queries vs Column Names:** Existing `getPartnerEligibility()` (`select().from(customerPartnerProfiles)`) matches current `schema.ts` column names (`customerId`, `status`), **but** `publishSubmission()` (`repository.ts:3227-3368`) reads non-existent wizard payload keys (`payload.askingPrice`, `payload.monthlyRent`, `payload.submitterName`, `payload.submitterPhone`, `payload.configuration`) instead of the actual `PropertySubmissionPayload` shape (`payload.details.*`, `payload.location.*`) and ignores `brokerName`, `brokerPhone`, `listingPartyDisplayName`.

---

## 5. Migration and Runtime Schema Findings

- `src/db/drizzle.config.ts` exists inside `/src/db/` (not root), using `schema: "./src/db/schema.ts"` and `out: "./drizzle"`.
- `/drizzle/meta/_journal.json` tracks tags `0000` through `0011`; no `0012` exists.
- `isMigrationAuthorizedForDatabase()` (`src/db/client.ts:20-62`) allows `ensureSchemaUpdates(..., { allowSafeBootstrap: true })` to run `CREATE TABLE IF NOT EXISTS` even when `activeDbName.includes('production')` (line `53` exempts `allowSafeBootstrap`!). That is safe for idempotent additive `CREATE TABLE IF NOT EXISTS`, **unsafe** for destructive `ALTER` or data backfills, and causes Drizzle Kit drift if PM-02+ changes aren't placed in versioned `/drizzle/0012_*.sql` migrations first.

---

## 6. Partner Service and Repository Inventory

| Category | Status | File Path & Symbol | Responsibility & Callers | DB Operations / Auth |
|---|---|---|---|---|
| **Partner Profile Repository** | **Partial (Read-Only)** | `src/domain/propertySubmission/repository.ts`: `getPartnerEligibility()` (`1039–1055`), `setMemoryPartnerProfileForTesting()` (`1057–1075`) | Queries `customerPartnerProfiles` by `customerId`. Called by `service.getPartnerEligibility()`, `createDraft()`, `updateDraft()`, `submitForReview()`. | `SELECT` only (`customer_partner_profiles`). No writes. |
| **Eligibility Evaluator** | **Partial (Defective)** | `src/domain/propertySubmission/repository.ts`: `evaluatePartnerEligibility()` (`382–438`) | Pure mapper `{ status } -> PartnerEligibilityStatus`. Called by `getPartnerEligibility()`. | Pure function. **Duplicated inline** in `scripts/test-post-property-entry.ts` and partially duplicated in `PostPropertyHub.tsx:112-120`! |
| **Partner Registration / App Submission** | **ABSENT** | — | No customer apply/draft/submit service or route exists. | N/A |
| **Approval / Rejection / Suspend / Revoke** | **ABSENT** | — | No admin lifecycle service or repository methods exist. | N/A |
| **Organization & Membership Mgmt** | **ABSENT** | — | No schema, service, or RBAC for organizations/agencies or authorized representatives. | N/A |
| **Partner Document Handling** | **ABSENT** | Reuse candidate: `src/lib/fileSecurity.ts` | Property submission media only (`SubmissionMediaService`); zero private KYC/RERA document service. | N/A |
| **Partner Attestations** | **Partial (Submit-Only)** | `src/domain/propertySubmission/repository.ts`: `submitForReview()` (`1881–1892`), `getSubmissionDetailForStaff()` (`2918`) | Inserts canonical declaration into `partner_attestations` on `PARTNER` `submitForReview()`. Read in staff detail. | `INSERT` (`partner_attestations`), `SELECT` (staff). |
| **Partner Audit History** | **ABSENT (Dead Schema)** | `src/db/schema.ts:916-927` (`customerPartnerAuditHistory`) | Schema + immutability triggers exist; zero callers or writers. | None |
| **Background Jobs** | **ABSENT** | — | No partner expiry, RERA re-verification, or document cleanup cron/job exists. | None |
| **Partner Notifications** | **ABSENT (Reusable Infra)** | `src/domain/customer/services/notificationService.ts:44-68` | Creates `notifications` + logs `alert_delivery_attempts` (`IN_APP` working; `EMAIL` throws if SMTP/SendGrid unconfigured). Zero partner calls. | `INSERT notifications`, `alert_delivery_attempts`. |

**Duplicated Eligibility Logic Found:**
1. Canonical backend: `evaluatePartnerEligibility()` (`src/domain/propertySubmission/repository.ts:382-438`).
2. Frontend Hub status switch: `PostPropertyHub.tsx:98-127` (re-checks `data.eligible && data.status === 'ACTIVE'` and re-generates its own status messages).
3. Frontend Wizard check: `PostPropertyWizard.tsx:908-915, 2159-2185` (re-checks `Boolean(data.eligible && data.status === 'ACTIVE')`).
4. Test inline duplicate: `scripts/test-post-property-entry.ts` implements an inline `evaluatePartnerStatus()` copy instead of importing `evaluatePartnerEligibility()`.

---

## 7. Customer Experience Inventory

| Surface | File & Lines | Current State | Reusable Components / Integration Points for PM-02+ |
|---|---|---|---|
| **Post Property Entry** | `app/post-property/page.tsx`, `src/components/post-property/PostPropertyHub.tsx:68-170, 428-529` | Two-card chooser (`OWNER` vs `PARTNER`). Clicking Partner calls `GET /api/customer/partner-status`; if not `ACTIVE`, shows alert banner with only `"Submit My Own Property as Owner Instead"`. | **Integration Point:** Add `"Apply to Become a Partner"` (when `NONE`/`REJECTED`), `"View Partner Application"` (when `PENDING`), or `"View Partner Status"` CTA in banner (`lines 515-525`) & Partner card (`lines 470-491`). |
| **Post Property Wizard** | `src/components/post-property/PostPropertyWizard.tsx:892-933, 1047-1056, 2130-2188, 3765-3775` | Step 1 fetches `/api/customer/partner-status` on mount if `PARTNER` selected; blocks Step 1→2; Step 5 collects `partnerAttestationAccepted`. Misclassifies `401` session expiry as `'ERROR'` instead of `openAuthModal('login')`. | **Integration Point:** Add direct onboarding/status CTA in Step 1 Partner alert (`lines 2173-2185`), trigger `openAuthModal('login')` on HTTP `401`, and add Partner Organization context selector (if user belongs to active org or individual). |
| **Account Pages & Nav** | `app/account/layout.tsx:9-15`, `app/account/page.tsx`, `app/account/profile/page.tsx`, `src/components/customer/CustomerNavControl.tsx:93-153` | `NAV_TABS` lists Saved Homes, My Property Submissions, Recently Viewed, Preferences & Alerts, Profile. Zero Partner tab or status badge. | **Integration Point:** Add `Partner Profile` tab in `AccountLayout` (`app/account/layout.tsx:9-15`) & `CustomerNavControl.tsx` menu, routing to **PROPOSED** `/account/partner` (onboarding, draft/resume, doc upload, status timeline, corrections, active dashboard). |
| **Partner Status API** | `app/api/customer/partner-status/route.ts:8-56` | `GET` authenticated via `verifyCustomerAuth`; returns `{ success, customerId, phone, isPartner, status, eligible, message }`. | **Reuse & Extend:** Keep existing fields backward-compatible for `PostPropertyHub` / `PostPropertyWizard`, optionally adding `partnerType`, `applicationStatus`, `organization`. |
| **Customer Auth Modal** | `src/components/customer/CustomerAuthModal.tsx`, `CustomerAuthContext.tsx` | Passwordless 2Factor OTP sign-in; updates `customer` context seamlessly. | **Reuse directly:** `PostPropertyHub.tsx:143-153` already supports post-OTP `pendingAuthContinuation`; reuse pattern for `/account/partner` entry. |
| **Customer Submission Dashboard & Timeline** | `src/components/post-property/MyPropertiesDashboard.tsx:1-909` | Tabbed status filters, activity timeline, `CHANGES_REQUESTED` correction banner, pagination. | **Pattern Reuse:** Visual language (`#FAFAF8`, `#E85D3F`, `font-editorial`/`font-display`/`font-body`), status tabs, and review feedback banner conventions translate directly to Partner Application tracking & correction UI. |
| **Form / Doc Upload Patterns** | `PostPropertyWizard.tsx` (XHR upload queue + retry + validation) | Multi-step state persistence, client + server Zod validation, XHR progress upload. | **Pattern Reuse (UI only):** XHR upload progress/error-parsing patterns can be adapted for private KYC/RERA PDF & image uploads to a **new private document endpoint**. |

---

## 8. Admin and RBAC Inventory

| Component | File & Lines | Current Architecture & Findings | Integration Changes Required for PM-02+ |
|---|---|---|---|
| **Staff Roles** | `src/domain/auth/roles.ts:1-23` | 5 canonical roles (`SUPER_ADMIN`, `ADMIN`, `SALES_MANAGER`, `SALES_EXECUTIVE`, `TELECALLER`) + 4 legacy (`CONTENT_MANAGER`, `PROPERTY_MANAGER`, `SALES`, `ANALYST`). | Do not add new roles unless business requires; map partner capabilities cleanly to `SUPER_ADMIN`, `ADMIN`, `PROPERTY_MANAGER` (and read-only `SALES_MANAGER` if desired). |
| **Capability Model** | `src/domain/auth/capabilityModel.ts:1-656` | Flat union `StaffCapability` + `ROLE_CAPABILITIES` map + `hasCapability()`. Zero `partner.*` capabilities exist today. | Register **PROPOSED** capabilities: `partner.read`, `partner.review`, `partner.requestChanges`, `partner.approve`, `partner.reject`, `partner.suspend`, `partner.reinstate`, `partner.revoke`, `partner.documents.read`, `partner.organizations.manage`. |
| **Staff Auth Boundary** | `src/domain/auth/authorizationBoundary.ts:61-112` | `verifyInternalStaff(req)` verifies HMAC `gh_staff_session` cookie + live `staffRepository.findById()` (`enabled`, `sessionVersion`) + test-runner secret (`NODE_ENV !== 'production'`). | Reuse `verifyInternalStaff(req)` + `hasCapability()` + `verifyStaffCapability()` on every `/api/admin/partners/*` endpoint. |
| **Admin Navigation & Shell** | `app/admin/layout.tsx`, `src/components/admin/AdminSidebar.tsx:139-167` | Capabilities-filtered sidebar under `Operations`: `Property Submissions`, `Visitor & Customer 360`, `Enquiries`, `Site Visits`. | Add `"Partners & Agencies"` item under `Operations` gated by `partner.read`, linking to `/admin/partners`. |
| **Submission Moderation Pattern** | `src/domain/propertySubmission/staffSubmissionRouteHandlers.ts:1-296`, `StaffSubmissionsWorkspace.tsx`, `StaffSubmissionDetailWorkspace.tsx` | List + Detail + `/action` POST switch (`START_REVIEW`, `REQUEST_CHANGES`, `ADD_NOTE`, `ASSIGN_REVIEWER`). Uses `AuditService`? **Wait:** `staffSubmissionRouteHandlers.ts` does NOT even call `auditService.record()`, relying solely on `property_submission_reviews`! | Partner review routes should write **both** domain immutable `customer_partner_audit_history` AND central `audit_logs` via `auditService.record()` (after adding `'PARTNER'` / `'PARTNER_ORGANIZATION'` to `auditResources.ts`). |
| **Staff Audit Infrastructure** | `src/domain/audit/auditService.ts`, `auditActions.ts:1-40`, `auditResources.ts:1-26` | `AUDIT_ACTIONS` already has `'APPROVE'`, `'REJECT'`, `'REVIEW'`, `'VERIFY'`, `'REVOKE'`, `'STATUS_CHANGED'`, `'ENABLE'`, `'DISABLE'`. `AUDIT_RESOURCES` lacks `'PARTNER'`, `'PARTNER_APPLICATION'`, `'PARTNER_DOCUMENT'`, `'PARTNER_ORGANIZATION'`. | Add partner resource constants to `auditResources.ts` and wire `auditService.record()` into all partner admin mutations & document views. |

---

## 9. Document Storage Assessment

| Criterion | Verified Finding | Evidence | Impact on PM-02+ |
|---|---|---|---|
| **Configured Provider** | Cloudflare R2 via `@aws-sdk/client-s3` (`S3StorageProvider`, `STORAGE_PROVIDER="s3"`, `S3_BUCKET="greathomes-media"`, `S3_REGION="auto"`). Falls back to `LocalStorageProvider` in non-prod dev if `STORAGE_PROVIDER` unset; `TestSandboxStorageProvider` during isolated tests. | `.env.example:43-50`, `storageProvider.ts:144-322` | Production storage is Cloudflare R2. |
| **Private Object Support** | **UNSUITABLE AS-IS.** `S3StorageProvider` reads only one bucket (`S3_BUCKET` / `R2_BUCKET`) and generates public CDN URLs using `MEDIA_PUBLIC_BASE_URL` (`https://media.greathomes.co.in`). Uploading sensitive KYC docs (PAN, Aadhaar/passport, RERA cert, incorporation docs, owner authorization letters) into this bucket/key-scheme risks **public internet exposure** via CDN! | `storageProvider.ts:159,174-181,277-284` | Must **NEVER** store verification documents in public `mediaAssets` URLs or public R2 bucket without strict private ACL/bucket isolation. |
| **Signed Downloads** | **NOT IMPLEMENTED (STUBBED).** `S3StorageProvider.getSignedUrl()` (`storageProvider.ts:286-288`) ignores `_expiresInSeconds` and literally executes `return this.getPublicUrl(key);`! (`LocalStorageProvider.getSignedUrl` also returns `/uploads/...`). `@aws-sdk/s3-request-presigner` is in `package.json:23` but unused in `storageProvider.ts`. | `storageProvider.ts:124-126, 286-288`, `package.json:23` | Must implement real `GetObjectCommand` presigning **or** authenticated server-side binary streaming (`storage.read(key)` with `Cache-Control: private, no-store`, `Content-Disposition: inline/attachment`, `X-Content-Type-Options: nosniff`) from a dedicated private bucket/client. |
| **Upload & Magic-Byte Validation** | **STRONG FOUNDATION.** `src/lib/fileSecurity.ts` already implements path/null-byte sanitization, dangerous extension blocking (`DANGEROUS_EXTENSIONS`), MIME-to-extension matching, `application/pdf` (`%PDF-`) up to `25MB`, and raster image magic bytes (`JPEG`, `PNG`, `WebP`, `AVIF`) up to `10MB`. `SubmissionMediaService` additionally enforces Sharp metadata re-encoding (stripping EXIF/GPS). | `src/lib/fileSecurity.ts:1-620`, `mediaService.ts:175-320` | Reuse `validateFileMetadata()` + `validateBinarySignature()`; strip EXIF/metadata on raster verification images via Sharp (without watermark distortion on legible IDs/certificates!). |
| **Storage Isolation Verdict** | **Dedicated Private Bucket Required (Recommended) or Strictly Private Authenticated Proxy.** Do not rely on obscurity in `greathomes-media` if `media.greathomes.co.in` serves bucket objects publicly via R2 custom domain. Add `PRIVATE_DOCS_BUCKET` (e.g., `greathomes-private-docs` with public access disabled in Cloudflare R2) + separate `PrivateDocumentStorageProvider`, serving documents exclusively through authorized `/api/customer/partner/documents/[id]` (owner/org member only) and `/api/admin/partners/documents/[id]` (`partner.documents.read` + audit log). | `storageProvider.ts`, `next.config.mjs:61-83` | Prevents PII/KYC data breach. |

---

## 10. Eligibility and Submission Lifecycle Analysis

### Execution Trace of Current Flows
1. **`GET /api/customer/partner-status` (`app/api/customer/partner-status/route.ts:8-56`):**
   - `verifyCustomerAuth(req)` checks `gh_customer_token` (or Bearer/`x-customer-token`) against `customer_auth_sessions` joined with `customers.status = 'ACTIVE'` (`customerAuth.ts:189-198`), rejecting `x-staff-role` (`403`). Note: does **not** re-check `phone_verified_at IS NOT NULL`.
   - Calls `customerService.getProfile(auth.customerId)` and `propertySubmissionService.getPartnerEligibility(auth.customerId)`.
2. **`getPartnerEligibility()` & `evaluatePartnerEligibility()` (`repository.ts:1039-1055, 382-438`):**
   - Queries `customerPartnerProfiles` where `customerId = $1`.
   - **Defects:**
     - `if (!profile || !profile.status || profile.status === 'NONE')` runs *before* normalization (`'none'` / `' NONE '` leaks to `'REVOKED'`).
     - `profile.status.toUpperCase()` omits `.trim()`.
     - Unrecognized statuses (`'APPROVED'`, `'REJECTED'`, `'INACTIVE'`) silently return `status: 'REVOKED', isPartner: true, eligible: false`.
     - Zero organization membership resolution (`organization_members` / `partner_organizations` does not exist yet).
3. **`createDraft()` (`repository.ts:1190-1206`):**
   - If `listingSource === 'PARTNER'`, checks `getPartnerEligibility(submitterCustomerId)`. Fails closed with `403` if `!eligible`.
4. **`updateDraft()` (`repository.ts:1589-1598`):**
   - Computes `nextListingSource` from incoming or existing `listingSource`. If `'PARTNER'`, re-checks `getPartnerEligibility(customerId)` (`403`). Blocks `OWNER -> PARTNER` escalation on `PUT`.
5. **Media Upload (`mediaService.ts:421-430`):**
   - Checks submission ownership (`submitterCustomerId`) & editable status (`DRAFT`/`CHANGES_REQUESTED`), **does NOT re-check partner eligibility** for `PARTNER` drafts (a suspended partner can still upload R2 images to an existing `DRAFT`, though `PUT` and `/submit` reject).
6. **`submitForReview()` (`repository.ts:1700-1725, 1881-1892`):**
   - Re-checks `getPartnerEligibility(customerId)` (`403` if `!eligible`).
   - Ignores client declaration text/version, applies `CANONICAL_PARTNER_ATTESTATION_TEXT` (`v1.0`), transitions `DRAFT/CHANGES_REQUESTED -> SUBMITTED`, and inserts immutable `partner_attestations` row inside the transaction.
   - **Gap:** Does not capture explicit owner-contact/authorization metadata (e.g., owner name/masked confirmation or authorization ref) or organization ID on `partner_attestations`.
7. **`approveSubmission()` (`repository.ts:3088-3151`) & `publishSubmission()` (`lines 3208-3369`):**
   - **Finding A (Unwired):** Neither method is exposed via `staffSubmissionRouteHandlers.ts` (`lines 215-283`) or `StaffSubmissionDetailWorkspace.tsx` (`lines 371-472`) yet!
   - **Finding B (Missing Partner Revalidation):** Neither method calls `getPartnerEligibility(detail.submission.submitterCustomerId)`. If an active partner is `SUSPENDED` or `REVOKED` after submitting (`SUBMITTED`/`UNDER_REVIEW`/`APPROVED`), approval & publication proceed unchecked.
   - **Finding C (Hardcoded Fallback Contact & Payload Bug in `publishSubmission`):**
     - `lines 3227-3228`: `submitterName = payload.submitterName || 'Verified Owner'`, `submitterPhone = payload.submitterPhone || '9876543210'`.
     - Wizard payload (`PostPropertyWizard.tsx`) does **not** store `payload.submitterName` or `payload.submitterPhone`—nor does it store `payload.askingPrice` / `payload.monthlyRent` / `payload.configuration` at top level (they live under `payload.details.*`!).
     - Even worse, for `PARTNER` (`listingPartyType = 'PARTNER'`), `publishSubmission()` writes to `ownerName` / `ownerPhone` and leaves `brokerName`, `brokerPhone`, `brokerEmail`, `listingPartyDisplayName`, `privatePhone`, `privateEmail`, and `locationId` completely blank (`null`)!
     - **Authoritative Data Sources Available:** Submitter `customers.name` / `customers.phone` / `customers.email`, Partner `firm_name` / `business_phone` (once added in PM-02+), plus `payload.details.*` and `payload.location.*` (`locationId`, `projectId`).

---

## 11. Target Architecture Proposal

Below is the target architecture aligned strictly to Great Homes V2 patterns (reusing existing tables/infrastructure where sound and adding normalized entities only where missing).

### A. Individual Partner Applications
- **Support:** Both sole-practitioner brokers/advisors (`partner_type = 'INDIVIDUAL'`) and agencies (`'ORGANIZATION'`).
- **Design:** A unified `partner_applications` table (or columns/versioned application records linked to `customer_partner_profiles`) supporting draft saving, submission (`DRAFT -> SUBMITTED -> UNDER_REVIEW -> CHANGES_REQUESTED | APPROVED | REJECTED`), and resubmission after `CHANGES_REQUESTED`/`REJECTED`. Upon `APPROVED`, atomically creates/activates `customer_partner_profiles` (`status = 'ACTIVE'`, `partner_type = 'INDIVIDUAL'`) and writes `customer_partner_audit_history`.
- **Reuse:** Customer OTP verification (`customers`), `propertySubmission` draft/review state-machine style.

### B. Organization Partner Applications
- **Design:** Normalized `partner_organizations` table (`id`, `legal_name`, `brand_name`, `registration_type`, `rera_registration_number`, `gstin`, `pan_masked`, `official_email`, `official_phone`, `registered_address`, `city`, `operational_localities`, `status` [`PENDING | ACTIVE | SUSPENDED | REVOKED`], `approved_by_staff_id`, `approved_at`, `suspension_reason`, `revocation_reason`) linked from `partner_applications` (`application_type = 'ORGANIZATION'`).
- **Avoids Bloat:** Keeps `customer_partner_profiles` focused on customer-level partner eligibility/role while allowing an agency entity to outlive or swap individual staff/representatives cleanly.

### C. Organization Membership and Authorized Representatives
- **Design:** `partner_organization_members` (`id`, `organization_id`, `customer_id`, `role` [`OWNER_ADMIN | REPRESENTATIVE`], `status` [`INVITED | ACTIVE | SUSPENDED | REMOVED`], `invited_by_customer_id`, `accepted_at`, `removed_at`).
- **Rule:** An organization representative can submit `PARTNER` listings **only if BOTH** their `partner_organization_members.status === 'ACTIVE'` (or individual `customer_partner_profiles.status === 'ACTIVE'`) **AND** the parent `partner_organizations.status === 'ACTIVE'`. Removing a member or suspending the organization immediately revokes submission eligibility without affecting prior immutable `partner_attestations`.

### D. Partner Document Management
- **Design:** `partner_documents` table (`id`, `application_id`, `organization_id`, `customer_id`, `document_type` [`PAN_CARD | GOVT_ID | RERA_CERT | INCORPORATION_CERT | GST_CERT | ADDRESS_PROOF | AUTHORIZATION_LETTER`], `filename`, `mime_type`, `file_size_bytes`, `storage_provider`, `storage_bucket`, `storage_key`, `verification_status` [`PENDING | VERIFIED | REJECTED`], `rejection_reason`, `reviewed_by_staff_id`, `reviewed_at`, `created_at`).
- **Storage:** Separate **private** Cloudflare R2 bucket (`PRIVATE_DOCS_BUCKET` / `R2_PRIVATE_BUCKET`) accessed **never via `MEDIA_PUBLIC_BASE_URL`**, only via authorized backend streaming (`/api/customer/partner/documents/[id]` and `/api/admin/partners/documents/[id]`) or short-lived AWS S3 presigned URLs (`@aws-sdk/s3-request-presigner`), with `fileSecurity.ts` magic-byte checks and Sharp EXIF stripping on images.

### E. Manual Staff Review and Approval
- **Design:** Staff Moderation Queue (`/admin/partners`) following `StaffSubmissionsWorkspace` + `StaffSubmissionDetailWorkspace` pattern (`START_REVIEW`, `REQUEST_CHANGES`, `APPROVE`, `REJECT`, `SUSPEND`, `REINSTATE`, `REVOKE`, `VERIFY_DOCUMENT`, `REJECT_DOCUMENT`, `ADD_NOTE`). Staff must review private documents, enter structured approval/rejection/suspension reasons, and act with verified `partner.*` RBAC capabilities.

### F. Partner Lifecycle and Immutable Audit History
- **Design:** Extend existing `customer_partner_audit_history` (preserving immutability triggers!) with nullable `organization_id`, `application_id`, `actor_type` (`CUSTOMER | STAFF | SYSTEM`), and `acting_customer_id` (plus existing `acting_staff_user_id`), and mirror staff actions into `audit_logs` via `AuditService`.
- **Canonical Partner Statuses:** `NONE` (synthesized only when absent), `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED` (+ `REJECTED` on applications; optional `REJECTED` or keep `NONE`/`REJECTED` distinction cleanly on applications vs active profiles).

### G. Customer Partner Profile Dashboard
- **Design:** New customer workspace under `/account/partner` (linked from `AccountLayout` tabs, `CustomerNavControl`, `PostPropertyHub`, and `PostPropertyWizard` Step 1). Supports:
  - Onboarding path selector (Individual vs Organization),
  - Draft save & resume,
  - Document upload & replacement,
  - Status & review timeline + `CHANGES_REQUESTED` correction banner,
  - Active Partner overview (organization info, member management for `OWNER_ADMIN`, quick link to `Post Property as Partner` & `My Property Submissions`).

### H. Admin Partner Management Workspace
- **Design:** Dedicated `/admin/partners` list & `/admin/partners/[id]` detail workspace + link from `/admin/intelligence/customers/[id]` and `StaffSubmissionDetailWorkspace` (showing submitter's live partner profile & organization badge).

### I. Centralized Eligibility Engine
- **Design:** Single authoritative domain module `src/domain/partner/eligibility.ts` used by `/api/customer/partner-status`, `createDraft`, `updateDraft`, `uploadMedia` (for `PARTNER` drafts), `submitForReview`, `approveSubmission`, and `publishSubmission`. Fixes `.trim().toUpperCase()`, rejects unknown DB statuses safely (never returning `'REVOKED'` on unknown values), and checks both individual & organization status.

### J. Owner Authorization and Attestation
- **Design:** Extend `partner_attestations` (reconciled in `schema.ts` + `client.ts`) with optional `organization_id` and `owner_authorization_reference` / `owner_contact_summary` snapshot inside `property_submissions` + canonical `partner_attestations`, enforcing at submit time that client text cannot override server canonical text.

### K. Submission Approval and Publication Revalidation
- **Design:** Update `approveSubmission()` and `publishSubmission()` to:
  1. Re-verify `getPartnerEligibility(submitterCustomerId)` when `listingSource === 'PARTNER'` (failing `409`/`403` if `SUSPENDED` or `REVOKED`),
  2. Fix `publishSubmission()` to map `payload.details.*` & `payload.location.*` accurately,
  3. Populate `listingPartyType = 'PARTNER'`, `listingPartyDisplayName` (verified Agency Brand Name or Individual Partner Name), `brokerName`, `brokerPhone`, `brokerEmail` from verified `customers` + `customer_partner_profiles`/`partner_organizations` (eliminating hardcoded `'Verified Owner'` / `'9876543210'`), and wire `APPROVE`/`REJECT`/`PUBLISH` into `staffSubmissionRouteHandlers.ts` & `StaffSubmissionDetailWorkspace.tsx` if within PM/PP coordination scope.

### L. Notifications
- **Design:** Reuse `NotificationService.createNotification()` (`src/domain/customer/services/notificationService.ts`) to emit in-app notifications (`PARTNER_APPLICATION_SUBMITTED`, `PARTNER_CHANGES_REQUESTED`, `PARTNER_APPROVED`, `PARTNER_REJECTED`, `PARTNER_SUSPENDED`, `PARTNER_REVOKED`) so customers see immediate updates in header notifications + `/account/partner`.

---

## 12. Existing Versus Missing Functionality Matrix

| Capability Area | Exists Today | Needs Modification | Missing (New Build) | DB Changes Required |
|---|---|---|---|---|
| Individual Partner Onboarding | `customer_partner_profiles` base table | Add `partner_type`, KYC fields, `CHECK` constraints | `partner_applications` flow, `/api/customer/partner/*`, `/account/partner` UI | Extend `customer_partner_profiles`; add `partner_applications` |
| Organization Onboarding & Members | None | `eligibility.ts` to evaluate org + membership | `partner_organizations` + `partner_organization_members` services, APIs, UI | New `partner_organizations`, `partner_organization_members` |
| Private Document Storage | `fileSecurity.ts` magic-byte & PDF checks | Fix `storageProvider.ts` (never public URL for private docs) | `partner_documents` table, `PrivateDocumentStorageService`, auth proxy routes | New `partner_documents` table |
| Staff Review & RBAC | `verifyInternalStaff`, `AdminSidebar`, `AuditService` | Add `partner.*` to `capabilityModel.ts`; add `'PARTNER*'` to `auditResources.ts`; wire `AdminSidebar` | `/api/admin/partners/*`, `/admin/partners/*` UI, doc verification actions | Audit columns on `customer_partner_audit_history` |
| Centralized Eligibility | `evaluatePartnerEligibility()` & `getPartnerEligibility()` | Fix `'NONE'` / `.trim()` / `'REVOKED'` fallback bug; deduplicate Hub/Wizard/test copies | Org + member eligibility resolution | `CHECK` constraints on statuses |
| Post Property Integration | `PostPropertyHub`, `PostPropertyWizard`, `/api/customer/partner-status` | Add onboarding CTA, `401` login modal handling, suspended draft warning | Org selection when member of active agency | Optional `organization_id` in `property_submissions` / `partner_attestations` |
| Approval & Publication Safety | `approveSubmission`, `publishSubmission`, `StaffSubmissionDetailWorkspace` | Revalidate partner status; fix `'9876543210'` fallback & nested payload mapping; show live partner badge | Expose `APPROVE`/`REJECT`/`PUBLISH` in `staffSubmissionRouteHandlers.ts` | None beyond FK/org snapshot |

---

## 13. Exact File-Level Implementation Map

| Workstream | Existing Files | Proposed Modifications | Proposed New Files | Dependencies |
|---|---|---|---|---|
| **DB Schema & Migrations** | `src/db/schema.ts`, `src/db/client.ts`, `src/db/drizzle.config.ts`, `/drizzle/meta/_journal.json` | Reconcile `partner_attestations` FK, add `CHECK` constraints, drop duplicate `idx_customer_partner_profiles_customer`, extend `customer_partner_profiles` & `customer_partner_audit_history`, add org/application/doc tables | `/drizzle/0012_baseline_submission_partner_reconciliation.sql` (**PROPOSED**), `/drizzle/0013_partner_management_system.sql` (**PROPOSED**) | Target PostgreSQL verification first |
| **Eligibility & Partner Domain** | `src/domain/propertySubmission/repository.ts`, `service.ts` | Replace `evaluatePartnerEligibility()` / `getPartnerEligibility()` calls with centralized partner service; enforce live check in `approveSubmission`/`publishSubmission`/`mediaService` | `src/domain/partner/entities.ts` (**PROPOSED**), `eligibility.ts` (**PROPOSED**), `partnerRepository.ts` (**PROPOSED**), `partnerService.ts` (**PROPOSED**), `validation.ts` (**PROPOSED**) | Workstream 1 (Schema) |
| **Private Document Storage** | `src/domain/media/storage/storageProvider.ts`, `src/lib/fileSecurity.ts`, `.env.example` | Implement real presigned URL / private bucket isolation in `storageProvider.ts`; add `PRIVATE_DOCS_BUCKET` env var in `.env.example` | `src/domain/partner/partnerDocumentService.ts` (**PROPOSED**), `app/api/customer/partner/documents/[id]/route.ts` (**PROPOSED**), `app/api/admin/partners/documents/[id]/route.ts` (**PROPOSED**) | Cloudflare R2 private bucket provisioning |
| **Customer Partner APIs** | `app/api/customer/partner-status/route.ts` | Enrich `/api/customer/partner-status` via centralized `partnerService` while preserving response contract | `app/api/customer/partner/route.ts` (**PROPOSED**), `app/api/customer/partner/applications/route.ts` (**PROPOSED**), `app/api/customer/partner/applications/[id]/route.ts` (**PROPOSED**), `app/api/customer/partner/organizations/[id]/members/route.ts` (**PROPOSED**) | `verifyCustomerAuth`, Partner Domain |
| **Admin RBAC, Audit & APIs** | `src/domain/auth/capabilityModel.ts`, `src/domain/audit/auditResources.ts`, `src/domain/propertySubmission/staffSubmissionRouteHandlers.ts` | Add `partner.*` capabilities & role mappings; add `'PARTNER*'` audit resources; expose/harden submission approval & publication partner checks | `app/api/admin/partners/route.ts` (**PROPOSED**), `app/api/admin/partners/[id]/route.ts` (**PROPOSED**), `app/api/admin/partners/[id]/action/route.ts` (**PROPOSED**), `src/domain/partner/staffPartnerRouteHandlers.ts` (**PROPOSED**) | `verifyInternalStaff`, `AuditService` |
| **Customer UI & Wizard** | `src/components/post-property/PostPropertyHub.tsx`, `PostPropertyWizard.tsx`, `app/account/layout.tsx`, `src/components/customer/CustomerNavControl.tsx` | Add onboarding/application CTAs, `401` OTP trigger, partner account nav tab, suspended-draft alert | `app/account/partner/page.tsx` (**PROPOSED**), `src/components/partner/PartnerOnboardingWorkspace.tsx` (**PROPOSED**), `src/components/partner/PartnerDashboard.tsx` (**PROPOSED**) | Customer Partner APIs |
| **Admin Partner UI** | `src/components/admin/AdminSidebar.tsx`, `StaffSubmissionDetailWorkspace.tsx`, `app/admin/intelligence/customers/[id]/page.tsx` | Add sidebar nav item; fix misleading attestation fallback & display live partner badge in submission detail; show partner badge in Customer 360 | `app/admin/partners/page.tsx` (**PROPOSED**), `app/admin/partners/[id]/page.tsx` (**PROPOSED**), `src/components/admin/AdminPartnersWorkspace.tsx` (**PROPOSED**), `src/components/admin/AdminPartnerDetailWorkspace.tsx` (**PROPOSED**) | Admin Partner APIs |
| **Publication & Notifications** | `src/domain/propertySubmission/repository.ts`, `src/domain/customer/services/notificationService.ts` | Fix `publishSubmission()` contact identity (`brokerName`/`brokerPhone`/`listingPartyDisplayName`) & `payload.details.*` mapping; call `notificationService` on partner transitions | None (reuse `notificationService.ts`) | Partner Domain + Schema |
| **Automated Tests** | `scripts/test-post-property-entry.ts`, `test-pp-04*.ts`, `test-pp-08*.ts`, `test-pp-09*.ts` | Remove inline mock `evaluatePartnerStatus` in `test-post-property-entry.ts`; add `SUSPENDED`/`REVOKED` & `PARTNER` publication assertions | `scripts/test-pm-partner-lifecycle.ts` (**PROPOSED**), `scripts/test-pm-organization-rbac.ts` (**PROPOSED**), `scripts/test-pm-document-security.ts` (**PROPOSED**), `scripts/test-pm-publication-revalidation.ts` (**PROPOSED**) | All Workstreams |

---

## 14. Database and Migration Strategy

1. **Zero-Destructive Reconciliation First (Pre-Feature Baseline):**
   - Before adding new partner columns, run read-only diagnostics on staging/production PostgreSQL (queries below) to inspect any existing rows in `customer_partner_profiles`, `property_submissions`, `partner_attestations`, and `resale_listings`/`rental_listings` (`listing_party_type` values `'PARTNER'` vs `'LISTING_PARTNER'`).
   - Author an idempotent reconciliation migration (`0012`) using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `DO $$ ... EXCEPTION ... $$` so existing production tables created by `ensureSchemaUpdates()` are cleanly registered into Drizzle migration history **without dropping or recreating any table**.
2. **Safe Constraint Rollout (`NOT VALID` → Validate):**
   - Normalize any legacy whitespace/casing in `customer_partner_profiles.status` (if any exists) prior to adding `CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'))` using `NOT VALID` followed by `VALIDATE CONSTRAINT`.
3. **Preserve Existing Records:**
   - Existing `customer_partner_profiles` (if any), `partner_attestations`, `property_submissions`, and `property_submission_reviews` retain their primary keys, FKs, and append-only immutability triggers (`trg_*_immutable`, `trg_prevent_truncate_*`).
   - New columns on `customer_partner_profiles` (e.g., `partner_type`, `organization_id`, `latest_application_id`) must be **nullable or have safe defaults** (e.g., `partner_type DEFAULT 'INDIVIDUAL'`).
4. **Rollback Planning:**
   - Every forward migration (`0012`, `0013`) paired with an explicit non-destructive rollback script (dropping only newly added tables/columns/constraints if needed prior to data backfill, never touching pre-existing tables or audit triggers).
   - Feature code must never bypass Drizzle migrations by putting complex org/doc schema solely into `ensureSchemaUpdates()`.
5. **Pre-Implementation Read-Only DB Verification Questions:**
   - *Are there any pre-existing rows in production `customer_partner_profiles` or `partner_attestations`, and what distinct `status` values do they hold?*
   - *Are `resale_listings` / `rental_listings` using `'LISTING_PARTNER'` or `'PARTNER'` in production `listing_party_type`?*
   - *Does production PostgreSQL already have `fk_partner_attestation_ownership` and immutability triggers active?*

---

## 15. Security and Test Strategy

| Security / Reliability Risk | Required Control | Required Test Classification |
|---|---|---|
| **Customer IDOR** | Derive customer ID strictly from `verifyCustomerAuth()`; every application/org/document query scopes by `customerId` (or active org membership). | API Authorization + Security Regression |
| **Org Membership Authorization** | Verify `partner_organization_members.status = 'ACTIVE'` + role check (`OWNER_ADMIN` for member invites/removals; `REPRESENTATIVE` for submissions) + parent `partner_organizations.status = 'ACTIVE'`. | Repository/DB Integration + API Authorization |
| **Staff RBAC** | `verifyInternalStaff(req)` + granular `hasCapability(role, 'partner.*')`; reject `SALES_EXECUTIVE`/`TELECALLER`/`CONTENT_MANAGER`/`ANALYST` with `403`. | API Authorization |
| **Document Privacy** | Dedicated private R2 bucket (no public custom domain); magic-byte + Sharp sanitization; authenticated streaming/short-lived signed URLs (`Cache-Control: private, no-store`); audit log every staff doc view. | Security Regression + Integration |
| **Lifecycle Transitions & Concurrency** | Conditional SQL `UPDATE ... WHERE status = expected` + in-tx `SELECT ... FOR UPDATE` / status guard + append-only `customer_partner_audit_history` insert in same transaction; prevent duplicate active/pending applications per customer via partial unique index. | Repository/DB Integration |
| **Eligibility Normalization & Unknown Status** | Trim + uppercase; reject unknown DB statuses fail-closed (never return `'REVOKED'` on unknown); DB `CHECK` constraint. | Unit + Repository/DB Integration |
| **Partner Suspension / Revocation Mid-Flight** | Re-check `getPartnerEligibility()` in `uploadMedia` (for `PARTNER`), `submitForReview()`, `approveSubmission()`, and `publishSubmission()`. | Repository/DB Integration + API Authorization |
| **Owner Authorization & Attestation** | Canonical server declaration + explicit owner-consent attestation record bound by composite FK `fk_partner_attestation_ownership`. | Repository/DB Integration + Browser E2E |
| **OWNER Submission Regression** | Ensure `OWNER` Post Property Hub, Wizard, draft save, Step 4 photo upload, moderation, and publication remain 100% unaffected. | Browser E2E + Security Regression |

---

## 16. Unresolved Technical and Business Decisions

1. **Private Storage Bucket Provisioning:** Confirm whether a dedicated Cloudflare R2 private bucket (e.g., `greathomes-private-docs` with no public `r2.dev`/CDN binding) will be provisioned alongside `greathomes-media`, vs encrypted/private prefix proxy (dedicated private bucket strongly recommended).
2. **Multiple Organizations vs 1:1 Customer-to-Partner Binding:** Confirm whether an individual customer can belong to only **one** active partner organization at a time or multiple agencies (requires an `organizationId` selector on `PostPropertyWizard` Step 1 if multiple).
3. **Existing `ACTIVE` / Legacy Partner Rows (if any):** Confirm whether any existing DB rows in `customer_partner_profiles` lack KYC documents and should be grandfathered as `partner_type = 'INDIVIDUAL'` or flagged for KYC backfill.
4. **Live Public Listing Attribution Display (`listingPartyType`):** Reconcile `'PARTNER'` (used in `repository.ts` & `enquiryService.ts`) vs `'LISTING_PARTNER'` (used in `seed.ts`) and decide whether public listing pages display the partner's `firm_name` / `listingPartyDisplayName` while keeping phone private (`privatePhone`) behind Great Homes enquiry routing.
5. **Email Notification Provider Readiness:** `NotificationService.deliverEmail()` (`notificationService.ts:91-104`) currently throws because `EMAIL_SMTP_HOST` / `SENDGRID_API_KEY` are not implemented beyond a stub; confirm whether PM-01..PM-N scope includes in-app notifications only or live transactional email/SMS alerts for partner approval.
6. **Submission `APPROVE` / `PUBLISH` Route Exposure:** Confirm whether wiring `approveSubmission()` / `publishSubmission()` into `staffSubmissionRouteHandlers.ts` & `StaffSubmissionDetailWorkspace.tsx` will be completed in PM-02+ or a parallel PP remediation step before partner E2E tests run.

---

## 17. Prioritized Implementation Sequence

1. **PM-02 — Database Reconciliation, Partner Schema & Storage Isolation:** Reconcile migrations `0012`/`0013` (`schema.ts` + `client.ts` + `/drizzle/`), provision private R2 storage / fix `S3StorageProvider.getSignedUrl()` & private streaming, and run read-only live DB reconciliation queries first.
2. **PM-03 — Centralized Partner Domain, Lifecycle & Eligibility Engine:** Build `src/domain/partner/*` (individual + org applications, org membership, immutable audit history, fixed `evaluatePartnerEligibility()`), plus unit & PostgreSQL concurrency tests.
3. **PM-04 — Customer Onboarding & Account Partner Workspace:** Build `/api/customer/partner*` APIs, `/account/partner` dashboard (draft/resume, document upload, corrections, org team management), and integrate Hub/Wizard Step 1 + `401` modal fix.
4. **PM-05 — Admin RBAC, Moderation Workspace & Notifications:** Register `partner.*` capabilities & audit resources, build `/api/admin/partners/*` and `/admin/partners/*` UI, wire `NotificationService`, and display partner status in `StaffSubmissionDetailWorkspace` + Customer 360.
5. **PM-06 — Submission Approval/Publication Revalidation & Full E2E Regression:** Enforce live partner re-checks across upload/approve/publish, replace `'Verified Owner'` / `'9876543210'` fallbacks with verified partner/customer contact data, and run full Security + PostgreSQL + Browser E2E suites.

---

## 18. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **PII/KYC Leak via Public R2 CDN** (`S3StorageProvider.getSignedUrl` stub returning `MEDIA_PUBLIC_BASE_URL`) | High if reused naively | Critical | Mandatory dedicated private bucket + non-public streaming/presigning in PM-02 before accepting any KYC doc. |
| **Drizzle Migration Collision on Existing Prod DB** (tables already created by `ensureSchemaUpdates()`) | High | High | Inspect live `pg_tables`/`pg_constraint` first; author idempotent `0012` baseline reconciliation migration (`IF NOT EXISTS` + `NOT VALID` constraints). |
| **Dual Write Split Between `customer_partner_profiles` and `partner_organization_members`** | Medium | High | Keep single centralized `EligibilityService` evaluating both individual profile and org+membership status inside one query. |
| **Broken `publishSubmission()` Contact/Price Mapping** | Confirmed in code | High | Fix `payload.details.*` + verified partner/customer contact extraction and test both `OWNER` and `PARTNER` publication end-to-end. |
| **No Git History (`NO_GIT`) in Workspace** | Confirmed | Medium | Maintain strict incremental backups / snapshot diffs and verify `npm run lint` + `npm run build` at every PM phase gate. |

---

## 19. Explicit Read-Only Execution Confirmation

- **Files Modified / Created:** Zero existing source, schema, config, migration, or test files were modified, renamed, or deleted. Only this deliverable (`PM_01_PARTNER_ARCHITECTURE_RECONCILIATION.md`) was created.
- **Git & Environment State:** No `.git` repository was created or altered; no packages were installed; no environment variables were modified.
- **Database & Storage State:** Zero database writes, migrations, seed inserts, customer lookups, or R2 storage operations were performed. Live PostgreSQL was unavailable in this sandbox (`DATABASE_URL=NOT_CONFIGURED`) and is explicitly reported as unverified rather than inferred.
- **Stop Condition Respected:** Execution stops here pending user review and approval before starting PM-02.
