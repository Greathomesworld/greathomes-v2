# GREAT HOMES V2 — POST PROPERTY MODULE
## PP-04: Post Property Hub & Submission Wizard — Completion Report

- **Phase:** PP-04 (`Post Property Hub & Submission Wizard`)
- **Status:** COMPLETED & VERIFIED
- **Target Branch:** `br-autumn-voice-b3ci16wp`
- **Operating Mode:** Controlled Implementation (Zero Production Changes)
- **Applet ID:** `625b6c99-7b1b-4396-b0f6-647903650b73`

---

## 1. Executive Summary

Phase **PP-04** establishes the complete customer-facing **Post Property Hub** (`/post-property`) and the **Six-Step Property Submission Wizard** (`/post-property/new`), connected end-to-end with the PP-02 database/domain foundation and PP-03 customer OTP authentication and partner eligibility gating.

During pre-implementation forensic inspection, we also identified and remediated a structural routing discrepancy from PP-03 where files had been placed under `/src/app/...` instead of the canonical Next.js App Router root `/app/...`, and where `getSessionCustomerFromRequest` was referenced instead of the canonical `verifyCustomerAuth(req)` helper in `/src/domain/customer/customerAuth.ts`. All Post Property pages and API routes now reside in the canonical `/app/` directory and enforce strict server-side customer session verification.

Every PP-04 requirement has been classified below:

| Requirement Area | Classification | Summary of Evidence |
| :--- | :--- | :--- |
| **1. Pre-Implementation Inspection & Remediation** | `COMPLETED` | Audited PP-01, PP-02, PP-03, customer OTP auth, partner eligibility, and design system. Relocated misplaced `/src/app` files to canonical `/app/post-property` and `/app/api/customer/...`. |
| **2. Post Property Hub (`/post-property`)** | `COMPLETED` | Implemented `PostPropertyHub.tsx` with value proposition, Owner vs. Partner path cards, 4-step workflow overview, photo requirements callout, OTP sign-in continuation, and live partner eligibility status banner. |
| **3. Six-Step Wizard Structure (`/post-property/new`)** | `COMPLETED` | Implemented `PostPropertyWizard.tsx` with 6 structured steps, mobile-first progress header, step-by-step client & server validation, back/next navigation, and state preservation across steps. |
| **4. Step 1: Listing Purpose, Property Type & Source** | `COMPLETED` | Supports `RESALE` / `RENTAL`, `APARTMENT` / `INDEPENDENT_HOUSE` / `PLOT`, and `OWNER` / `PARTNER` with server-verified `ACTIVE` partner profile gating. |
| **5. Step 2: Location & Project Context** | `COMPLETED` | City defaulted to `Kolkata`, searchable locality selector backed by `/api/locations` with custom locality fallback, project/society selector backed by `/api/projects`, and street address/landmark validation. |
| **6. Step 3: Property Details & Pricing** | `COMPLETED` | Conditional fields for `APARTMENT` / `INDEPENDENT_HOUSE` (BHK configuration, bedrooms, bathrooms, carpet/built-up area, floor, furnishing, possession) vs. `PLOT` (plot area, facing, possession), and `RESALE` (asking price) vs. `RENTAL` (monthly rent, security deposit, maintenance). |
| **7. Step 4: Photographs (Min 3, Image-Only)** | `COMPLETED` | Enforces minimum 3 property photographs (`JPEG`, `PNG`, `WebP`, `AVIF`), blocks video/document uploads and URLs (`.mp4`, `.mov`, `.pdf`, `.doc`, etc.), and supports room categorization, captions, ordering, and featured cover selection. |
| **8. Step 5: Identity & Declaration** | `COMPLETED` | Displays verified customer identity (`name`, `phone`, `email`) and enforces mandatory `CANONICAL_OWNER_DECLARATION_TEXT` for `OWNER` or `CANONICAL_PARTNER_ATTESTATION_TEXT` for `PARTNER`. |
| **9. Step 6: Review & Final Submission** | `COMPLETED` | Structured summary with quick-Jump "Edit" actions for Steps 1–5, explicit moderation disclosure, and final submission to `POST /api/customer/submissions/[id]/submit` transitioning status to `SUBMITTED` without public listing creation. |
| **10. Navigation & Entry Integration** | `COMPLETED` | Added `Post Property` links in `Header.tsx` (desktop & mobile drawer), `CustomerNavControl.tsx` account dropdown, and `Footer.tsx`. |
| **11. Automated Testing & Build Verification** | `COMPLETED` | Created and executed `scripts/test-pp-04-wizard.ts` along with PP-03, PP-02, and Customer OTP regression suites; verified zero TypeScript or ESLint errors. |

---

## 2. Pre-Implementation Inspection Findings

1. **Canonical Next.js App Router Root (`/app` vs `/src/app`)**:
   - The repository uses `/app` at the project root for all Next.js App Router pages and API routes (`/app/page.tsx`, `/app/api/customer/auth/...`, `/app/api/locations/route.ts`, `/app/api/projects/route.ts`).
   - In PP-03, two files had been placed in `/src/app/post-property/page.tsx` and `/src/app/api/customer/partner-status/route.ts`, where Next.js ignored them.
   - **Remediation**: Removed `/src/app` and established canonical routes in `/app/post-property/page.tsx`, `/app/post-property/new/page.tsx`, and `/app/api/customer/...`.
2. **Customer Authentication Helper (`verifyCustomerAuth`)**:
   - `/src/domain/customer/customerAuth.ts` exports `verifyCustomerAuth(request)` (which validates the `gh_customer_session` HTTP-only cookie and returns `{ authorized, customerId, statusCode, error }`).
   - All `/app/api/customer/partner-status` and `/app/api/customer/submissions` endpoints now use `verifyCustomerAuth(request)` and `customerService.getProfile(auth.customerId)`.
3. **Dual Persistence Support (PostgreSQL + In-Memory Fallback)**:
   - Following `/src/domain/customer/repositories/index.ts`, `PropertySubmissionRepository` in `/src/domain/propertySubmission/repository.ts` now supports both Drizzle PostgreSQL persistence (`getDb()`) and deterministic in-memory fallback when `DATABASE_URL` is absent in local sandbox environments, ensuring identical ownership isolation, status transition enforcement, and partner eligibility checks across environments.

---

## 3. Post Property Hub Implementation (`/post-property`)

**Files Created / Updated:**
- `/app/post-property/page.tsx`
- `/src/components/post-property/PostPropertyHub.tsx`

**Key Features Implemented:**
- **Editorial & Display Typography Lock**: Uses `font-editorial` (`Fjalla One`) for the hero headline, `font-display` (`Plus Jakarta Sans`) for cards, badges, and CTAs, and `font-body` (`Inter`) for explanatory copy.
- **Interactive Intent Pre-Selection**: Customers can pre-select **Listing Purpose** (`RESALE` or `RENTAL`), **Property Type** (`APARTMENT`, `INDEPENDENT_HOUSE`, or `PLOT`), and **Submission Channel** (`OWNER` or `PARTNER`).
- **Four-Stage Moderation Transparency**: Clearly explains the workflow:
  1. *Verify Identity via OTP*
  2. *Guided 6-Step Property Details*
  3. *Upload Minimum 3 Property Photographs*
  4. *Great Homes Staff Verification & Curated Publication*
- **OTP Sign-In Continuation**:
  - Unauthenticated visitors who click **Start Property Submission** open the existing Great Homes `CustomerAuthModal` (`openAuthModal('login')`) and automatically resume their chosen submission path once authenticated.
- **Partner Eligibility Status Banner**:
  - Fetches `/api/customer/partner-status` on session load.
  - If a customer selects `PARTNER` without an `ACTIVE` partner profile (`NONE`, `PENDING`, `SUSPENDED`, or `REVOKED`), the Hub displays a clear status explanation and prevents launching a Partner submission while allowing switching to `OWNER`.

---

## 4. Six-Step Submission Wizard Implementation (`/post-property/new`)

**Files Created / Updated:**
- `/app/post-property/new/page.tsx`
- `/src/components/post-property/PostPropertyWizard.tsx`

### Step-by-Step Breakdown

#### Step 1: Listing Purpose, Property Type & Submission Source
- Allows selecting `RESALE` or `RENTAL`, `APARTMENT`, `INDEPENDENT_HOUSE`, or `PLOT`, and `OWNER` or `PARTNER`.
- Validates against `validateWizardStep(1, payload)`.
- Enforces `ACTIVE` partner eligibility before allowing `PARTNER` progression.
- Automatically initializes or updates the `DRAFT` record via `POST /api/customer/submissions` or `PUT /api/customer/submissions/[id]`.

#### Step 2: Location & Project Context
- **City**: Locked/defaulted to `Kolkata`.
- **Locality Selection**: Fetches verified Kolkata micro-markets from `/api/locations` with instant search filtering and a toggle for custom locality entry if not listed.
- **Project / Society Context**: Fetches verified residential projects from `/api/projects` (filtered by selected locality when applicable) or accepts custom society/building name entry (hidden when `PLOT` is selected, optional for `INDEPENDENT_HOUSE`).
- **Complete Address / Landmark**: Required text input validated before moving to Step 3.

#### Step 3: Property Details & Pricing
- Dynamically adapts fields by `propertyType` and `listingType`:
  - **Apartment / Independent House**: BHK Configuration (`1 BHK`–`5+ BHK`), Bedroom Count, Bathroom Count, Carpet Area (sq. ft.), Built-Up Area (sq. ft.), Super Built-Up Area (sq. ft.), Floor Level, Total Floors, Furnishing (`UNFURNISHED`, `SEMI_FURNISHED`, `FULLY_FURNISHED`), Facing, and Possession Status.
  - **Plot**: Plot Area (sq. ft.), Facing, Possession Status, and Description (omits irrelevant bedroom/bathroom/furnishing/floor fields).
  - **Resale**: Asking Price in INR (`askingPrice`) and optional Monthly Maintenance.
  - **Rental**: Monthly Rent in INR (`monthlyRent`), Security Deposit (`securityDeposit`), and Monthly Maintenance.

#### Step 4: Property Photographs (Minimum 3, Images Only)
- **Strict Media Rules**:
  - Minimum **3** property photographs required to proceed (`photos.length >= 3`).
  - Maximum 15 photographs per submission.
  - Accepts valid image files (`image/jpeg`, `image/png`, `image/webp`, `image/avif`) via client file picker (with safe data-URI preview generation) or verified HTTPS image URLs.
  - Strictly rejects video files/URLs (`.mp4`, `.mov`, `.webm`, `video/*`) and document files/URLs (`.pdf`, `.doc`, `.docx`, `application/*`) on both client and server (`isValidImageUrlOrDataUri` & `photoItemSchema`).
- **Photo Management Controls**:
  - Room/view category tag (`Exterior / Building`, `Living Room`, `Bedroom`, `Kitchen`, `Bathroom`, `Balcony / View`, `Plot / Site View`).
  - Optional caption input.
  - Select primary cover photo (`isFeatured`).
  - Reorder photographs (Move Left / Move Right) and remove photographs.

#### Step 5: Submitter Identity & Legal Declaration
- Displays the authenticated customer's verified identity (`name`, `phone`, `email`) in a read-only verification card.
- Renders the source-specific legal declaration checkbox:
  - **Owner Path (`OWNER`)**: Requires accepting `CANONICAL_OWNER_DECLARATION_TEXT`.
  - **Partner Path (`PARTNER`)**: Displays verified partner badge and requires accepting `CANONICAL_PARTNER_ATTESTATION_TEXT` certifying explicit owner consent.

#### Step 6: Comprehensive Review & Final Submission
- Displays structured summary cards for Steps 1–5 with one-click **Edit** buttons to jump directly back to any step while preserving state.
- Clearly states that submitting transitions the property to `SUBMITTED` for Great Homes moderation and does **not** immediately publish a public listing.
- Invokes `POST /api/customer/submissions/[id]/submit` and transitions to a dedicated **Submission Confirmation Screen** displaying the submission reference ID, status badge (`SUBMITTED — PENDING STAFF REVIEW`), and next-step guidance.

---

## 5. Backend API & Validation Integration

| Endpoint | Method | Purpose & Security Enforcement |
| :--- | :--- | :--- |
| `/api/customer/partner-status` | `GET` | Verifies customer session via `verifyCustomerAuth`, loads customer profile, and returns server-side partner eligibility (`ACTIVE`, `PENDING`, `SUSPENDED`, `REVOKED`, `NONE`). |
| `/api/customer/submissions` | `GET` | Returns only submissions owned by the authenticated `customerId`. |
| `/api/customer/submissions` | `POST` | Validates `createSubmissionSchema`, verifies `ACTIVE` partner status if `listingSource === 'PARTNER'`, and creates a `DRAFT` submission owned by `customerId`. |
| `/api/customer/submissions/[id]` | `GET` | Enforces ownership isolation (`submitterCustomerId === auth.customerId`); returns `404` if not found or owned by another customer. |
| `/api/customer/submissions/[id]` | `PUT` | Validates `updateSubmissionSchema`, enforces ownership isolation, verifies draft is editable (`DRAFT` or `CHANGES_REQUESTED`), and updates the draft payload. |
| `/api/customer/submissions/[id]/submit` | `POST` | Executes full `validateSubmissionForSubmit` (min 3 photos, image-only check, location, conditional details/pricing, owner/partner declaration), logs review event (`SUBMITTED`) and partner attestation (if `PARTNER`), and transitions status to `SUBMITTED`. |

---

## 6. Automated Test Results

All automated test suites were executed and passed:

1. **PP-04 Wizard & Hub Suite (`npx tsx scripts/test-pp-04-wizard.ts`)**:
   - Open-redirect protection (`sanitizeInternalRedirectPath` blocking external URLs, protocol-relative URLs, `javascript:`, and `data:` URIs).
   - Media URL & MIME validation (`isValidImageUrlOrDataUri` accepting JPEG/PNG/WebP/HTTPS images and blocking `.mp4`, `.mov`, `.pdf`, `.docx`, `video/*`, `application/pdf`).
   - Step 1–6 validation rules (`validateWizardStep` covering Apartment vs. Plot and Resale vs. Rental conditional rules, min-3 photo requirement, and Owner/Partner consent checks).
   - End-to-end service & repository lifecycle:
     - Partner eligibility checks (`ACTIVE` allowed; `PENDING` and `NONE` rejected).
     - Ownership isolation (Customer B blocked from reading or updating Customer A's draft).
     - Full Owner `DRAFT` -> `updateDraft` -> `submitForReview` -> `SUBMITTED` transition with `resaleListingId === null`.
     - Duplicate final submission prevention (`SUBMITTED` cannot be re-submitted).
     - Full Active Partner `DRAFT` -> `submitForReview` -> `SUBMITTED` transition with partner attestation logging.
2. **PP-03 Entry & Identity Suite (`npx tsx scripts/test-post-property-entry.ts`)**: Passed.
3. **PP-02 Submission Foundation Suite (`npx tsx scripts/test-property-submission-foundation.ts`)**: Passed.
4. **Customer OTP Security Suite (`node scripts/test-customer-otp.mjs`)**: Passed.

---

## 7. Scope Discipline & Deferred Phases

In strict compliance with PP-04 boundaries:
- **No Public Listing Auto-Publication**: Submitting a property sets `submissionStatus = 'SUBMITTED'` and leaves `resaleListingId` and `rentalListingId` as `null`.
- **Deferred to Subsequent Phases**:
  - Persistent multi-draft management dashboard & resume-from-dashboard workflows (PP-05 / PP-08).
  - Direct Cloudflare R2 presigned binary upload pipeline (PP-06 / PP-07).
  - Staff moderation queue, review workspace, and approval/publication engine (PP-09 / PP-10).
  - Partner onboarding application workflow (PP-11).
- **Production Safety**: Zero changes were made to production databases, production R2 buckets, or production deployments.
