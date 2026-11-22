# GREAT HOMES V2 — PP-07 COMPLETION REPORT
## Customer Submission Management: Draft, Resume & My Listings

**Phase:** PP-07  
**Status:** Completed & Verified (Stopped at PP-07 Gate; Awaiting Review Before PP-08)  
**Operating Mode:** Isolated Development Workspace Only (`NODE_ENV=test`, `MEDIA_TEST_ISOLATED=true`)  
**Production Policy Compliance:** Zero production database writes, zero production environment changes, zero production Cloudflare R2 operations, zero branch merges, zero Vercel production deployments.

---

## 1. Branch and Workspace Verification Status

- **Expected Branch:** `br-autumn-voice-b3ci16wp`
- **Git Metadata Status:** `.git` metadata is **not mounted** inside `/app/applet` in this isolated preview environment.
- **Verification Statement:** In strict compliance with Step 1 of the PP-07 authorization instructions, branch identity (`br-autumn-voice-b3ci16wp`) **cannot be independently verified via Git CLI** in this container. No replacement `.git` repository was initialized, and all existing PP-02 through PP-06 implementation files, migrations (`0008`, `0009`), domain services, and verification reports were verified intact before and after PP-07 implementation.

---

## 2. Files Created and Modified

### Created Files
1. `/src/domain/propertySubmission/customerSubmissionRouteHandlers.ts`
   - Dependency-injectable route handlers (`handleListCustomerSubmissions`, `handleGetCustomerSubmissionDetail`, `handleWithdrawCustomerSubmission`) with customer session enforcement, correlation header propagation, input sanitization, and fail-closed HTTP `503` error handling.
2. `/app/api/customer/submissions/[id]/withdraw/route.ts`
   - Authenticated `POST` endpoint allowing customers to withdraw their own submission when in an eligible status (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`).
3. `/src/components/post-property/MyPropertiesDashboard.tsx`
   - Customer-facing **My Property Submissions** dashboard (`'use client'`) featuring status filter tabs with live counts, submission cards with PP-06 cover image and photo badge, `GH-XXXXXXXX` reference ID, formatted price/rent, status badge, staff `submitterFeedback` callout when `CHANGES_REQUESTED`, contextual action buttons (`Continue Draft`, `Edit & Resubmit`, `View Details`, `Withdraw`), slide-over detail & activity history drawer, and custom confirmation modal for withdrawals.
4. `/app/my-properties/page.tsx`
   - Next.js App Router page for `/my-properties` with SEO metadata (`noindex, nofollow`) and `<Suspense>` boundary wrapping `<MyPropertiesDashboard />`.
5. `/scripts/test-pp-07-my-properties-resume.ts`
   - Comprehensive 22-scenario automated test suite verifying all PP-07 requirements, security boundaries, `internalNote` exclusion, deep-merge draft updates, PP-06 media hydration, `CHANGES_REQUESTED` resubmission, withdrawal rules, pagination, and fail-closed `503` behavior.
6. `/PP_07_DRAFT_RESUME_MY_LISTINGS_REPORT.md`
   - Detailed completion and verification report for PP-07.

### Modified Files
1. `/src/domain/propertySubmission/repository.ts`
   - Added customer-safe DTOs (`CustomerVisibleReviewEvent`, `SubmissionActivityItem`, `CustomerSubmissionPermissions`, `CustomerSubmissionSummary`, `CustomerSubmissionDetail`, `PaginatedCustomerSubmissionsResult`, `ListCustomerSubmissionsOptions`).
   - Added `sanitizeReviewForCustomer()` which unconditionally strips `internalNote` and `staffUserId` so internal staff notes and reviewer identities can never leak to customer responses.
   - Added `buildCustomerActivityTimeline()` deriving chronological customer-visible events (`DRAFT_CREATED`, `DRAFT_UPDATED`, `SUBMITTED`, `RESUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`) from real persisted timestamps and `property_submission_reviews` records.
   - Added `computeSubmissionSummary()` computing reference IDs (`GH-...`), titles, formatted Indian currency price/rent (`₹ Cr`, `₹ Lakh`, `/ month`), cover photo URL from featured or first ordered `media_assets` record, photo count, permissions (`canEdit`, `canResubmit`, `canWithdraw`, `isReadOnly`), and `nextAction`.
   - Updated `submitForReview()` to record `eventType: 'RESUBMITTED'` when transitioning from `CHANGES_REQUESTED -> SUBMITTED` and `eventType: 'SUBMITTED'` when transitioning from `DRAFT -> SUBMITTED`.
   - Added `getSubmissionDetailForCustomer()` and `listCustomerSubmissionsPaginated()` using batched `inArray` queries on `mediaAssets` and `propertySubmissionReviews` (avoiding N+1 queries).
2. `/src/domain/propertySubmission/service.ts`
   - Updated `submitForReview()` to synchronize `payload.photos` from authoritative persisted `media_assets` records prior to final submission validation so drafts whose photos were uploaded via PP-06 endpoints validate and persist cleanly.
   - Added `getCustomerSubmissionDetail()` and `listCustomerSubmissionsPaginated()` service methods.
3. `/app/api/customer/submissions/route.ts`
   - Updated `GET` handler to delegate to `handleListCustomerSubmissions`, supporting `?status=...&page=...&limit=...` and returning `submissions`, `items`, `pagination`, and `countsByStatus`.
4. `/app/api/customer/submissions/[id]/route.ts`
   - Updated `GET` handler to delegate to `handleGetCustomerSubmissionDetail`, returning enriched customer-safe detail (`submission`, `summary`, `photos`, `reviews`, `latestFeedback`, `activityTimeline`, `permissions`, `nextAction`).
5. `/src/components/post-property/PostPropertyWizard.tsx`
   - Added full hydration for `/post-property/new?draftId={submissionId}` (and `?id={submissionId}`), restoring all PP-04/PP-05 fields, ordered PP-06 `photos` with featured cover indicator, and consent state.
   - Preserved hydrated `projectId` across initial project list load via `hydratedProjectPairRef` while still invalidating incompatible `projectId` selections when the user changes locality.
   - Added prominent **Changes Requested by Great Homes Verification Team** banner displaying `submitterFeedback` and switching the final CTA to **Resubmit Property for Verification** when `submissionStatus === 'CHANGES_REQUESTED'`.
   - Added **Read-Only Summary** mode when `submissionStatus` is `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, or `WITHDRAWN`, locking form edits and media mutations.
   - Added explicit **Save Draft** action (`handleSaveDraftOnly`) allowing customers to save drafts with `<3` photos at any step and navigate to `/my-properties`.
6. `/src/components/customer/CustomerNavControl.tsx`, `/app/account/layout.tsx`, and `/src/components/post-property/PostPropertyHub.tsx`
   - Added navigation links to `/my-properties` (**My Property Submissions**) across the header customer dropdown, mobile customer menu, `/account` sidebar navigation, and `/post-property` hub.

---

## 3. Database Schema and Migration Status

- **Schema Inspection:** Existing tables `property_submissions` (`0008_property_submissions_foundation.sql`), `property_submission_reviews` (`0008`), `partner_submission_attestations` (`0008`), and `media_assets` (`0009_pp06_submission_media_assets.sql`) already contain all required columns for PP-07:
  - `property_submission_reviews.submitter_feedback` (customer-visible feedback)
  - `property_submission_reviews.internal_note` (internal-only staff note)
  - `property_submission_reviews.staff_user_id` (internal-only staff reviewer ID)
  - `property_submission_reviews.event_type`, `previous_status`, `new_status`, `created_at`
  - `property_submissions.withdrawn_at`, `submitted_at`, `reviewed_at`, `approved_at`, `rejected_at`, `published_property_id`
- **Migration Changes:** Zero new database migrations or schema alterations were required for PP-07, preserving 100% compatibility with migrations `0008` and `0009`.

---

## 4. `/my-properties` Dashboard Implementation

- **Route:** `/my-properties`
- **Authentication Gate:** Requires an authenticated customer session via `/api/customer/auth/me`. Unauthenticated visitors are presented with an editorial sign-in prompt that redirects back to `/my-properties` after OTP verification.
- **Status Filter Tabs:**
  - `All` (`countsByStatus.ALL`)
  - `Drafts` (`DRAFT`)
  - `Submitted` (`SUBMITTED` + `UNDER_REVIEW`, plus individual status support)
  - `Needs Changes` (`CHANGES_REQUESTED`)
  - `Approved` (`APPROVED`)
  - `Rejected / Withdrawn` (`REJECTED`, `WITHDRAWN`)
- **Card Information Displayed:**
  - Generated or explicit property title (e.g., `3 BHK Apartment in New Town`)
  - Property type (`APARTMENT`, `VILLA`, `INDEPENDENT_HOUSE`, `PLOT`)
  - Listing purpose badge (`RESALE` / `RENTAL`) and source (`OWNER` / `PARTNER`)
  - Location & locality, plus selected project name when linked
  - Cover photograph from persisted PP-06 `media_assets` (featured image or first ordered image) and total uploaded photo count badge
  - Reference ID (`GH-XXXXXXXX`)
  - Submission status badge and human-readable status label
  - Price (`₹ Cr` / `₹ Lakh`) or monthly rent (`₹ ... / month`) summary
  - Last updated timestamp (`updatedAt`) and submitted timestamp (`submittedAt`)
  - Customer-visible reviewer feedback callout when `CHANGES_REQUESTED` or `REJECTED`

---

## 5. Draft Resume Implementation

- **Routes Supported:** `/post-property/new?draftId={submissionId}` (and `/post-property/new?id={submissionId}`)
- **Hydration Behavior:**
  - Fetches `GET /api/customer/submissions/{submissionId}` with customer session credentials.
  - Verifies customer ownership on the server; returns `404` if the submission does not exist or belongs to another customer.
  - Hydrates all 6 wizard steps:
    1. Listing purpose (`RESALE` / `RENTAL`) and capacity (`OWNER` / `PARTNER`)
    2. Property type, locality (`locationId`, `locality`, `customLocality`, `isCustomLocality`), project selection (`projectId`, `projectName`), address, landmark, pin code, and map coordinates
    3. Commercial & structural details (`askingPrice`, `monthlyRent`, `carpetArea`, `builtUpArea`, `superBuiltUpArea`, `plotArea`, `bedrooms`, `bathrooms`, `balconies`, `furnishing`, `PossessionStatus`, `floorNumber`, `totalFloors`, `facing`, `ageOfProperty`, `coveredParking`, `openParking`, `preferredTenant`, `availableFrom`, `leaseDurationMonths`, `noticePeriodDays`, `petsAllowed`, `nonVegAllowed`, `description`)
    4. Canonical residential `amenities`
    5. Ordered PP-06 `photos` with `isFeatured` cover selection, room category tags, and captions
    6. Legal declaration / partner attestation state
- **Save Draft (<3 Photos Permitted):**
  - Customers can save incomplete drafts with fewer than 3 photos at any step via `PATCH /api/customer/submissions/[id]`, and only final submission (`POST /api/customer/submissions/[id]/submit`) enforces the minimum 3 persisted PP-06 photographs requirement.

---

## 6. PP-06 Media Hydration and Cover-Photo Behavior

- Both `GET /api/customer/submissions` and `GET /api/customer/submissions/[id]` resolve persisted `media_assets` (`entityType = 'SUBMISSION'`) ordered by `sortOrder ASC, createdAt ASC`.
- Cover photo selection prioritizes the photograph marked `isFeatured = true` and falls back to the first ordered photograph (`photos[0]`).
- When resuming a draft or `CHANGES_REQUESTED` submission in the wizard, customers can upload additional photos (up to 15), reorder photos, change the featured cover photo, edit category/caption metadata, or delete photos (which removes both the `media_assets` record and the stored object).

---

## 7. `CHANGES_REQUESTED` Correction and Resubmission Workflow

- When a submission is in `CHANGES_REQUESTED` status:
  - `/my-properties` highlights the card with an amber **Action Required: Changes Requested** callout displaying `latestFeedback.submitterFeedback` and an **Edit & Resubmit** primary CTA.
  - Opening `/post-property/new?draftId={id}` renders a prominent banner at the top of the wizard showing the verification team's `submitterFeedback` and timestamp.
  - All property fields and PP-06 media controls remain unlocked for editing.
  - Submitting from Step 6 invokes `POST /api/customer/submissions/[id]/submit`, which validates all PP-04/PP-05/PP-06 rules, atomically transitions `CHANGES_REQUESTED -> SUBMITTED`, updates `submittedAt`, records a canonical legal declaration/attestation, and appends a `RESUBMITTED` review event to `property_submission_reviews`.

---

## 8. Customer-Visible Feedback and Activity History

- **Strict Internal Note Exclusion:**
  - `sanitizeReviewForCustomer()` explicitly projects only `{ id, submissionId, previousStatus, newStatus, eventType, submitterFeedback, createdAt }`.
  - `internalNote` and `staffUserId` are never included in any customer DTO or serialized JSON payload.
- **Derived Chronological Activity Timeline:**
  - `buildCustomerActivityTimeline()` constructs a truthful, chronological history from persisted submission timestamps and `property_submission_reviews` rows (`DRAFT_CREATED`, `DRAFT_UPDATED`, `SUBMITTED`, `RESUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`), displayed in the `/my-properties` detail drawer without fabricating events.

---

## 9. Withdrawal Workflow

- **Endpoint:** `POST /api/customer/submissions/[id]/withdraw`
- **Permitted Source Statuses:** `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`
- **Blocked Source Statuses:** `APPROVED`, `REJECTED`, `WITHDRAWN` (returns HTTP `409 Conflict` with a clear status transition message)
- **Persistence:** Atomically updates `submissionStatus = 'WITHDRAWN'`, sets `withdrawnAt` and `updatedAt`, and appends a `WITHDRAWN` event to `property_submission_reviews`. Once withdrawn, the submission becomes read-only and cannot be edited or resubmitted.

---

## 10. Security and Ownership Enforcement

| Security Control | Implementation & Verification |
| :--- | :--- |
| Session-Derived Customer Identity | `verifyCustomerAuth(req)` derives `customerId` strictly from the verified `gh_customer_session` JWT cookie. Client-supplied `customerId` fields are ignored/stripped. |
| Staff Token Rejection | Staff tokens presented on customer endpoints are rejected with HTTP `401`. |
| Cross-Customer Ownership Isolation | Every repository query and mutation filters by `and(eq(id, submissionId), eq(customerId, verifiedCustomerId))`. Cross-customer access returns HTTP `404` without leaking whether the ID exists. |
| Status Mutation Locking | Editing (`PATCH`) or mutating media on `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, or `WITHDRAWN` submissions is rejected by the server (`400`/`409`). |
| Fail-Closed Persistence (`503`) | Missing or unreachable database connections throw `PropertySubmissionPersistenceError` and return HTTP `503` without silent memory fallback in preview/production. |

---

## 11. Automated Test Results

All 7 automated verification suites (`PP-02` through `PP-07`) executed and passed 100%:

1. `scripts/test-pp-07-my-properties-resume.ts` — **PASSED** (All 22 PP-07 test scenarios: unauthenticated `401`, staff token `401`, cross-customer `404` isolation, `<3` photo draft save & deep-merge resume, PP-06 cover/order hydration, 3-photo minimum on final submit, `SUBMITTED` edit & media lock, `CHANGES_REQUESTED` `submitterFeedback` display, strict `internalNote` & `staffUserId` exclusion, correction & `RESUBMITTED` transition, withdrawal across allowed/disallowed statuses, pagination & status filter counts, empty state, PP-06 media deletion, PP-05 cross-field validation during draft edits, and fail-closed `503` behavior)
2. `scripts/test-pp-06-image-management.ts` — **PASSED**
3. `scripts/test-pp-05-property-engine.ts` — **PASSED**
4. `scripts/test-pp-04b-security-regression.ts` — **PASSED**
5. `scripts/test-pp-04-wizard.ts` — **PASSED**
6. `scripts/test-post-property-entry.ts` (`PP-03`) — **PASSED**
7. `scripts/test-property-submission-foundation.ts` (`PP-02`) — **PASSED**

---

## 12. TypeScript, ESLint, and Build Results

- `compile_applet` (`npm run build`): Verified clean compilation of all Next.js App Router pages and API routes including `/my-properties`, `/post-property/new`, `/api/customer/submissions`, `/api/customer/submissions/[id]`, and `/api/customer/submissions/[id]/withdraw`.
- `lint_applet` (`npm run lint`): Verified zero ESLint or TypeScript errors across all new and modified files.
- Live Dev Server Verification (Port 3000):
  - `GET /my-properties` → `HTTP 200`
  - `GET /post-property/new?draftId=sub_test` → `HTTP 200`
  - `GET /api/customer/submissions` (unauthenticated) → `HTTP 401`
  - `POST /api/customer/submissions/sub_test/withdraw` (unauthenticated) → `HTTP 401`

---

## 13. Remaining Scope for PP-08

Implementation is **stopped at the PP-07 completion gate**. The following capabilities remain reserved for **PP-08 (Staff Review, Moderation & Controlled Publication Queue)**:

1. Staff moderation queue UI and API endpoints (`/admin/submissions` or `/staff/property-submissions`) with RBAC enforcement (`SUPER_ADMIN`, `ADMIN`, `MODERATOR`).
2. Staff review actions: transition `SUBMITTED -> UNDER_REVIEW`, request changes (`CHANGES_REQUESTED` with `submitterFeedback` and confidential `internalNote`), reject (`REJECTED`), or approve (`APPROVED`).
3. Controlled publication workflow converting an `APPROVED` customer submission into a canonical public property listing (`published_property_id`) only upon explicit staff approval.
