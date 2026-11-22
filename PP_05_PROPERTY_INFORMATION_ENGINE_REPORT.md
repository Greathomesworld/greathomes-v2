# GREAT HOMES V2 — PP-05
# PROPERTY INFORMATION ENGINE — IMPLEMENTATION REPORT

- **Project**: Great Homes V2 — Post Property Module
- **Phase Identifier**: PP-05
- **Phase Name**: Property Information Engine
- **Expected Branch**: `br-autumn-voice-b3ci16wp` (Note: `.git` metadata is not mounted inside `/app/applet`, so branch identity cannot be independently verified from Git metadata in this workspace)
- **Operating Mode**: Isolated-branch implementation; Preview-first verification
- **Date**: 2026-11-14
- **Overall Verdict**: **PASS — Stopped at Gate (Awaiting PP-06 Authorization)**

---

## A. Executive Summary

PP-05 (Property Information Engine) has been implemented across the validation, domain service, repository, API, and Post Property wizard layers without altering locked categories, authentication/RBAC, PP-06 media binary infrastructure, or PP-07 dashboard workflows.

### Core Capabilities Delivered
1. **Cross-Field Area Validation**: Enforced `carpetArea <= builtUpArea <= superBuiltUpArea` across any supplied subset of area fields (`carpetArea`, `builtUpArea`, `superBuiltUpArea`) for `APARTMENT` and `INDEPENDENT_HOUSE` without making optional area fields required, with live inline client errors (`aria-invalid` + `role="alert"`) and matching server-side rejection (including across partial draft updates).
2. **Locality-Filtered Project Selection & Server Compatibility**: Replaced unconditional project fetching in Step 2 with locality-scoped queries (`/api/projects?locationId=...&limit=50`), disabled the selector when no canonical locality is chosen or when custom locality is toggled, automatically cleared incompatible `projectId` values with a user-facing notice, and enforced server-side `projectId` ↔ `locationId` / `isCustomLocality` compatibility (supporting up to 4 levels of location `parentId` hierarchy).
3. **Structured Residential Attributes & Deep-Merge Persistence**: Added `balconies`, `coveredParking`, `openParking`, `propertyAgeYears`, `possessionDate` (`RESALE`), `leaseDuration`, `noticePeriod`, and `availabilityDate` (`RENTAL`), plus canonical structured `amenities` backed by a new read-only `GET /api/amenities` endpoint. Implemented recursive nested payload deep-merging (`mergeSubmissionPayloads`) and patch-safe Zod schemas so partial `PUT` updates never overwrite omitted `photos` or sibling `location`/`details`/`consent` keys.
4. **Property-Type & Listing-Purpose Conditional Rules**: Enforced strict separation between `PLOT` and `APARTMENT`/`INDEPENDENT_HOUSE` fields, between `RESALE` and `RENTAL` commercial/timeline fields, and across property-type-applicable amenities on both the client (`sanitizeDetailsForSelection`) and server (`validateConditionalPropertyRules`).

---

## B. Pre-Implementation Inspection Findings

1. **Canonical Next.js App Router Location**: Confirmed at `/app/` (alongside domain, infrastructure, and UI components in `/src/`).
2. **Database & Migration Strategy**: `property_submissions.payload` in `/src/db/schema.ts` is already typed as `jsonb` without restrictive DB column checks against new structured residential attributes. Adding PP-05 structured fields and deep-merge persistence required **zero Drizzle schema changes and zero SQL migrations**, preserving full backward compatibility with existing drafts.
3. **Branch Verification Status**: `.git` is absent inside `/app/applet`, so the workspace branch name `br-autumn-voice-b3ci16wp` could not be independently verified from Git metadata; all work remained strictly isolated to local source files.

---

## C. Detailed Implementation Breakdown

### 1. Cross-Field Area Validation (`A`)
- **`/src/domain/propertySubmission/validation.ts`**:
  - Added `validateAreaHierarchy(details)` checking every supplied pair (`carpetArea <= builtUpArea`, `builtUpArea <= superBuiltUpArea`, and `carpetArea <= superBuiltUpArea`) and returning structured `fieldErrors` keyed to `details.builtUpArea` and `details.superBuiltUpArea`.
  - Added `.superRefine(...)` inside `propertyDetailsPayloadSchema` invoking `validateAreaHierarchy` while keeping optional area inputs optional.
  - Updated `validateWizardStep` and `validateSubmissionForSubmit` to propagate structured `fieldErrors` alongside human-readable error arrays.
- **`/src/components/post-property/PostPropertyWizard.tsx`**:
  - Added live inline field validation alerts (`role="alert"` and `aria-invalid`) beneath Carpet Area, Built-Up Area, and Super Built-Up Area inputs in Step 3.

### 2. Locality-Filtered Project Selection & Compatibility (`B`)
- **`/src/components/post-property/PostPropertyWizard.tsx` (Step 2)**:
  - Replaced unconditional `/api/projects?limit=100` loading with locality-scoped requests to `/api/projects?locationId=${selectedLocationId}&limit=50` when `!isCustomLocality && locationId`.
  - Added loading and empty states, disabled project selection when no canonical locality is selected or when `isCustomLocality` is active, and automatically cleared stale `projectId` selections with an explanatory `projectResetNotice` banner on locality switch or custom-locality toggle.
- **`/src/domain/propertySubmission/service.ts` & `validation.ts`**:
  - Added `SubmissionReferenceLookup` (defaulting to lazy imports of `projectRepository`, `locationRepository`, and `amenityRepository`, injectable for unit tests).
  - Implemented `validateLocationProjectCompatibility` to reject:
    - Any `projectId` paired with `isCustomLocality: true`.
    - Non-existent `projectId` references.
    - Projects whose `locationId` (walking up to 4 levels of `parentId` hierarchy) does not match the selected `locationId` or locality name.

### 3. Structured Residential Attributes, Canonical Amenities & Deep-Merge (`C`)
- **`/src/domain/propertySubmission/validation.ts`**:
  - Added `LEASE_DURATION_OPTIONS` (`'6 Months' | '11 Months' | '12 Months' | '24 Months' | '36 Months'`), `NOTICE_PERIOD_OPTIONS` (`'15 Days' | '1 Month' | '2 Months' | '3 Months'`), and `isoDateFieldSchema` (`YYYY-MM-DD`).
  - Added `CANONICAL_RESIDENTIAL_AMENITIES`, `CANONICAL_AMENITY_SLUG_SET`, and `getCanonicalAmenitiesForPropertyType(propertyType)` defining structured amenity slugs, categories, icons, and applicability (`APARTMENT`, `INDEPENDENT_HOUSE`, `PLOT`).
  - Extended `propertyDetailsPayloadSchema` with `balconies` (`0–10`), `coveredParking` (`0–10`), `openParking` (`0–10`), `propertyAgeYears` (`0–100`), `possessionDate`, `availabilityDate`, `leaseDuration`, `noticePeriod`, and `amenities` (`string[]`, max 30).
  - Fixed partial `updateSubmissionSchema` using `locationPatchSchema` and `submissionPhotosPatchSchema` (omitting `.default([])` on `photos`) and added `mergeSubmissionPayloads(existingPayload, patchPayload)` so partial `PUT` saves deep-merge nested `location`, `details`, and `consent` without erasing existing `photos` or sibling fields.
- **`/app/api/amenities/route.ts`** (Created):
  - Public read-only `GET /api/amenities` (supporting `?propertyType=APARTMENT|INDEPENDENT_HOUSE|PLOT`) merging live `amenityRepository.findAll()` records by slug with `CANONICAL_RESIDENTIAL_AMENITIES`.
- **`/src/domain/propertySubmission/repository.ts` & `service.ts`**:
  - Updated `PropertySubmissionRepository.updateDraft` to apply `mergeSubmissionPayloads(existingPayloadObj, payload)` instead of shallow top-level spread.
  - Updated `PropertySubmissionService.createDraft`, `updateDraft`, and `submitForReview` to validate the post-merge candidate payload against cross-field area rules, conditional property/listing rules, and canonical amenity identifiers, propagating `fieldErrors` through `PropertySubmissionDomainError` and the `/app/api/customer/submissions*` endpoints.
- **`/src/components/post-property/PostPropertyWizard.tsx` (Steps 3 & 6)**:
  - Added Step 3 controls for Balconies, Covered Parking, Open Parking, Property Age (Years), Possession Date (`RESALE`), Lease Duration / Notice Period / Available From (`RENTAL`), and an interactive canonical Amenities grid with `aria-pressed` state and `lucide-react` `Check` icons (no static status pills or arbitrary free-text input).
  - Updated Step 6 Review Summary to display all newly captured PP-05 attributes using `tabular-nums`.

### 4. Property-Type & Listing-Purpose Conditional Rules (`D`)
- Locked categories preserved (`APARTMENT`, `INDEPENDENT_HOUSE`, `PLOT`; `RESALE`, `RENTAL`; `OWNER`, `PARTNER`).
- `validateConditionalPropertyRules` rejects apartment/house fields (`bedroomCount`, `bathroomCount`, `balconies`, `floorCategory`, `totalFloors`, `furnishing`, `carpetArea`, `builtUpArea`, `superBuiltUpArea`, `coveredParking`, `openParking`, `propertyAgeYears`) on `PLOT` submissions, rejects `leaseDuration`/`noticePeriod`/`availabilityDate` on `RESALE`, rejects `possessionDate` on `RENTAL`, and rejects amenities not applicable to the selected `propertyType`.
- `sanitizeDetailsForSelection(details, propertyType, listingType)` cleans incompatible fields automatically in the wizard on Step 1 type/purpose switches as well as before draft sync and final submission.

---

## D. Files Created & Modified

### Created
1. `/app/api/amenities/route.ts`
2. `/scripts/test-pp-05-property-engine.ts`
3. `/PP_05_PROPERTY_INFORMATION_ENGINE_REPORT.md`

### Modified
1. `/src/domain/propertySubmission/validation.ts`
2. `/src/domain/propertySubmission/repository.ts`
3. `/src/domain/propertySubmission/service.ts`
4. `/app/api/customer/submissions/route.ts`
5. `/app/api/customer/submissions/[id]/route.ts`
6. `/app/api/customer/submissions/[id]/submit/route.ts`
7. `/src/components/post-property/PostPropertyWizard.tsx`

---

## E. Verification Evidence

### 1. Automated Domain & Security Regression Suites
Executed cleanly with exit code `0` (note: live `DATABASE_URL` is unset in this workspace, so DB-backed live queries are skipped while fail-closed `503` checks and isolated test-memory domain tests ran in full):
- `./node_modules/.bin/tsx scripts/test-pp-05-property-engine.ts` — **PASS** (cross-field area validation including partial update re-validation, locality-project hierarchy & mismatch/custom-locality checks, structured attributes deep-merge & persistence, Rental vs Resale field isolation + active Partner flow, Plot field/amenity exclusions, ownership `404` & fail-closed `503` persistence guard).
- `./node_modules/.bin/tsx scripts/test-pp-04b-security-regression.ts` — **PASS**
- `./node_modules/.bin/tsx scripts/test-pp-04-wizard.ts` — **PASS**
- `./node_modules/.bin/tsx scripts/test-post-property-entry.ts` — **PASS**
- `./node_modules/.bin/tsx scripts/test-property-submission-foundation.ts` — **PASS**

### 2. TypeScript, ESLint & Production Build Verification
- **`compile_applet` (`NODE_ENV=production next build`)**: **PASS** (`Build succeeded - the applet is compiled`).
- **`lint_applet` (`tsc --noEmit && eslint app src --max-warnings 100`)**: **PASS** (`0 errors`; 77 pre-existing warnings, primarily `<img>` and `react-hooks/exhaustive-deps` warnings across existing components).

---

## F. Safety, Scope & Gate Confirmation

- **Zero Scope Creep**: PP-06 (binary photo upload/R2/`sharp`), PP-07 (`/dashboard/listings`), authentication/RBAC rules, and moderation workflows were not modified.
- **Zero Production Mutations**: No production database queries, environment variable updates, schema migrations, branch merges, or deployments were performed.
- **Gate Status**: Stopping at the PP-05 completion gate. Ready for preview verification and awaiting explicit authorization before starting **PP-06**.
