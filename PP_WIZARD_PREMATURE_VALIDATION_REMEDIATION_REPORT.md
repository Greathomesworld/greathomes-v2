# GREAT HOMES V2 — POST PROPERTY WIZARD
# PREMATURE CROSS-STEP VALIDATION REMEDIATION REPORT

**Report Reference:** `PP_WIZARD_PREMATURE_VALIDATION_REMEDIATION_REPORT`  
**Prior Inspection Reference:** `PP_WIZARD_PREMATURE_VALIDATION_INSPECTION.md`  
**Operating Mode:** Isolated Development Workspace Remediation (Zero Production Database Access)  
**Status:** **COMPLETED & VERIFIED**

---

## 1. ROOT CAUSE ADDRESSED

The remediation resolves the confirmed three-part interaction that caused **Step 1 (*Listing Purpose & Property Type*)** of the Post Property six-step wizard to fail with **Step 2 (*Location & Project*)** validation errors (`"Invalid submission input: Locality is required, Address is required"` / `"Invalid update payload: Locality is required, Address is required"`), as well as the unvalidated progress-bar step-jumping behavior on restored drafts:

1. **Client State Initialization (`PostPropertyWizard.tsx`):**  
   `wizardState` initializes all 6 steps on mount, populating Step 2's `location` object with empty strings (`locality: ''`, `address: ''`). On Step 1 → Step 2 navigation (`handleNextStep`) and Step 1 "Save Draft" (`handleSaveDraftOnly`), `syncDraftWithServer()` sends the full `wizardState` (minus `photos`) to `POST /api/customer/submissions` or `PUT /api/customer/submissions/[id]`.
2. **Server Draft Schema Rejection of Empty Location Strings (`validation.ts`):**  
   - Previously, `createSubmissionSchema` applied a shallow `.partial()` to `propertySubmissionPayloadSchema`, leaving `payload.location` validated by `locationPayloadSchema` (`locality: z.string().min(1)`, `address: z.string().min(1)`), which rejected `""`.
   - Previously, `updateSubmissionSchema` used `locationPatchSchema` with `city: z.string().min(1).optional()`, `locality: z.string().min(1).optional()`, and `address: z.string().min(1).optional()`, which allowed `undefined` but rejected `""` (empty string).
   - Additionally, when switching `propertyType` (e.g., `APARTMENT` → `PLOT`) or `listingType` (`RESALE` → `RENTAL`) on an existing draft on Step 1, `mergeSubmissionPayloads` previously retained stale incompatible keys from `existing.payload.details` that had been deleted on the client by `sanitizeDetailsForSelection`.
3. **Unconditional `setHighestReachedStep(6)` on Draft Hydration (`PostPropertyWizard.tsx`):**  
   Previously, `hydrateExistingSubmission` unconditionally set `setHighestReachedStep(6)`, allowing a user resuming an incomplete draft to jump past incomplete mandatory earlier steps via the top progress bar.

---

## 2. FILES MODIFIED

| File Path | Summary of Changes |
| :--- | :--- |
| `src/domain/propertySubmission/validation.ts` | • Updated `locationPatchSchema` to allow empty/incomplete strings (`z.string().optional()`) for `city`, `locality`, and `address` while preserving strict type, UUID (`projectId`), boolean (`isCustomLocality`), and coordinate range (`latitude` `[-90, 90]`, `longitude` `[-180, 180]`) validation.<br>• Updated `createSubmissionSchema` to omit `location` from `propertySubmissionPayloadSchema` before `.partial()` and extend with `location: locationPatchSchema.optional()`, matching `updateSubmissionSchema`.<br>• Updated `mergeSubmissionPayloads` so that when `propertyType` or `listingType` changes on a draft update, stale keys from `existingDetails` that were omitted by client-side `sanitizeDetailsForSelection` and are incompatible with the new `propertyType`/`listingType` are stripped unless explicitly supplied in `patchDetails`.<br>• Added exported `computeHighestReachedWizardStep(payload, options)` helper that computes the highest reachable wizard step (`1..6`) from contiguous valid/completed steps.<br>• Kept `locationPayloadSchema` untouched and tightened `validateSubmissionForSubmit` to verify non-empty `.trim()` on `city`, `locality`, and `address`. |
| `src/components/post-property/PostPropertyWizard.tsx` | • Imported and applied `computeHighestReachedWizardStep` in `hydrateExistingSubmission`, replacing the unconditional `setHighestReachedStep(6)`.<br>• Applied `sanitizeDetailsForSelection` to hydrated draft details so restored `PLOT`, `INDEPENDENT_HOUSE`, and `RENTAL` drafts do not carry default apartment/resale keys.<br>• Added a contiguous step-validation guard in `handleJumpToStep` when jumping forward (`targetStep > currentStep`) on editable submissions so users cannot bypass an earlier step that was edited into an invalid state. |
| `scripts/test-pp-wizard-premature-validation.ts` | • Created isolated regression test suite covering all 11 required remediation and security scenarios without touching production PostgreSQL. |

---

## 3. EXACT VALIDATION BEHAVIOUR: BEFORE VS. AFTER

| Operation / Stage | Behaviour Before Remediation | Behaviour After Remediation |
| :--- | :--- | :--- |
| **Fresh Draft Creation (`POST /api/customer/submissions` / `createSubmissionSchema`)** | Rejected `location: { city: 'Kolkata', locality: '', address: '' }` with HTTP 400 (`Invalid submission input: Locality is required, Address is required`) because shallow `.partial()` enforced `locationPayloadSchema`. | **Accepted (HTTP 201 `DRAFT`).** `createSubmissionSchema` uses `location: locationPatchSchema.optional()`, permitting omitted `location` or empty string fields while still rejecting malformed types, invalid `projectId` UUIDs, or out-of-bounds coordinates. |
| **Existing Draft Update (`PUT /api/customer/submissions/[id]` / `updateSubmissionSchema`)** | Rejected `location: { locality: '', address: '' }` with HTTP 400 (`Invalid update payload: Locality is required, Address is required`) because `z.string().min(1).optional()` rejects `""`. | **Accepted (HTTP 200 `DRAFT`).** `locationPatchSchema` permits `""` or partial location strings during draft saves (including Step 1 saves, Step 2 partial saves, and Verified/Custom locality mode switches). |
| **Step 1 Type Switching on Saved Draft (`mergeSubmissionPayloads`)** | Switching an existing draft on Step 1 from `APARTMENT` to `PLOT` (or `RESALE` to `RENTAL`) retained stale `existingDetails` keys (`bedroomCount`, `floorCategory`, etc.) and failed `updateDraft` with HTTP 400. | **Accepted (HTTP 200 `DRAFT`).** `mergeSubmissionPayloads` strips stale `existingDetails` keys not present in `patchDetails` when incompatible with the updated `propertyType`/`listingType`, while still rejecting explicit invalid fields sent in `patchDetails`. |
| **Client Step 2 Gate (`validateWizardStep(2, payload)`)** | Required non-empty `city`, `locality`, and `address` (`>= 3` chars), and forbade `isCustomLocality && projectId`. | **Unchanged (Strict).** Clicking *"Continue to Step 3"* on Step 2 continues to reject missing or whitespace-only `city`, `locality`, or `address`. |
| **Final Submission Gate (`validateWizardStep(6)`, `validateSubmissionForSubmit`, `submitForReview`)** | Enforced `locationPayloadSchema` (`city`, `locality`, `address` required). | **Strict & Hardened.** `locationPayloadSchema` is untouched, and `validateSubmissionForSubmit` additionally verifies `.trim()` non-empty strings for `city`, `locality`, and `address`. Any draft with missing or whitespace-only `locality` or `address` is rejected with HTTP 400 and remains in `DRAFT` status. |

---

## 4. DRAFT RESTORATION & PROGRESS CALCULATION LOGIC

`computeHighestReachedWizardStep(payload, { isReadOnly, rawPersistedPayload })` in `src/domain/propertySubmission/validation.ts` determines `highestReachedStep` (`1 | 2 | 3 | 4 | 5 | 6`) as follows:

1. **Read-Only Submissions (`isReadOnly: true` for `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN`):**  
   Returns `6` so the customer views the complete read-only summary on Step 6.
2. **Unpersisted Step 1 Guard:**  
   If `rawPersistedPayload` is provided and does not contain a valid `propertyType` (`APARTMENT` | `INDEPENDENT_HOUSE` | `PLOT`), or if `validateWizardStep(1, payload).valid` is `false`, returns `1`.
3. **Step 2 (Location) Contiguous Check:**  
   Evaluates `validateWizardStep(2, payload).valid` (which requires non-empty trimmed `city`, `locality`, and `address` of at least 3 characters, and no custom-locality project conflict).
   - If Step 2 is **incomplete** (including when `location` is an initialized object `{ city: 'Kolkata', locality: '', address: '' }`):
     - Returns `1` if `listingSource === 'PARTNER'` (so partner eligibility is verified via Step 1 *Continue*), or `2` if `listingSource === 'OWNER'` (Step 1 is complete, Step 2 is the active frontier step, and **Steps 3, 4, 5, and 6 are locked**).
4. **Step 3 (Details & Pricing) Contiguous Check:**  
   If Step 2 is valid, evaluates `validateWizardStep(3, payload).valid`.
   - If Step 3 is **incomplete** (including when `details` is an initialized object without positive area or price/rent), returns `3` (**Steps 1, 2, 3 accessible; Steps 4, 5, 6 locked**).
5. **Step 4 (Photographs) Contiguous Check:**  
   If Step 3 is valid, evaluates `validateWizardStep(4, payload).valid` (`>= 3` valid persisted submission photos).
   - If Step 4 is **incomplete**, returns `4` (**Steps 1–4 accessible; Steps 5, 6 locked**).
6. **Step 5 (Declaration / Attestation) & Step 6 Check:**  
   If Step 4 is valid, evaluates `validateWizardStep(5, payload).valid` (`ownerDeclarationAccepted === true` or `partnerAttestationAccepted === true`).
   - If Step 5 is **incomplete** (including when `consent` is an initialized object with `false` booleans), returns `5` (**Steps 1–5 accessible; Step 6 locked**).
   - If Steps 1–5 and `validateWizardStep(6, payload).valid` are all `true`, returns `6` (**all Steps 1–6 accessible**).
7. **Forward Jump Guard (`handleJumpToStep` in `PostPropertyWizard.tsx`):**  
   When `loadedPermissions.canEdit` is `true` and a user clicks a progress-bar step `targetStep > currentStep`, `handleJumpToStep` validates every step `1 .. targetStep - 1` and stops at the first incomplete step if the user cleared a mandatory field on an earlier step.

---

## 5. TEST SCENARIOS, EXECUTION & ACTUAL RESULTS

### 5.1 Required Regression Scenarios (`scripts/test-pp-wizard-premature-validation.ts`)

| # | Scenario | Backing Mode | Result |
| :---: | :--- | :--- | :---: |
| **1** | Fresh draft creation with empty `locality: ''` and `address: ''` (plus omitted `location` and rejection of malformed `locality`, `projectId`, and `latitude` types) | Isolated In-Memory Repository & Zod Schema Unit Test | **PASS** |
| **2** | Fresh draft Step 1 → Step 2 navigation (`validateWizardStep(1)` + `service.createDraft` with full initial `wizardState`) | Isolated In-Memory Repository | **PASS** |
| **3** | Save Draft on Step 1 with incomplete location (both new draft via `createDraft` and existing draft via `updateDraft`, including Step 1 `propertyType` switching to `PLOT`) | Isolated In-Memory Repository | **PASS** |
| **4** | Existing draft update with empty location strings (`city: ''`, `locality: ''`, `address: ''`) | Isolated In-Memory Repository | **PASS** |
| **5** | Restored incomplete draft navigation (`computeHighestReachedWizardStep` across bare payload, Step 1 only, PARTNER Step 1, Step 2 complete, Step 3 complete, Step 4 complete, non-contiguous cleared Step 2 gap, all steps complete, and read-only submission) | Isolated Unit & State Hydration Test | **PASS** |
| **6** | Step 2 Save Draft before completing location (`locality: 'New Town'`, `projectId` set, `address: ''`) | Isolated In-Memory Repository + Mocked Reference Lookup | **PASS** |
| **7** | Verified/Custom locality toggle (`isCustomLocality: true`, `locality: ''`, `projectId: null`) followed by draft save | Isolated In-Memory Repository | **PASS** |
| **8** | Step 2 Continue (`validateWizardStep(2)`) still rejects missing/whitespace `locality`, `address`, `city`, and custom-locality with `projectId` | Isolated Unit Test | **PASS** |
| **9** | Final submission (`locationPayloadSchema`, `validateWizardStep(6)`, `validateSubmissionForSubmit`, and `service.submitForReview`) still rejects missing or whitespace-only `locality` and `address` and keeps status as `DRAFT` | Isolated In-Memory Repository | **PASS** |
| **10** | Valid completed submission follows existing lifecycle (`DRAFT` → `SUBMITTED`, `submittedAt` set, `resaleListingId: null`, duplicate submit blocked with 409, post-submit edit blocked with 400) | Isolated In-Memory Repository | **PASS** |
| **11** | Existing ownership (cross-customer IDOR 404), partner eligibility (`PENDING` 403, `ACTIVE` 201), and fail-closed persistence (503 when DB unavailable without test opt-in) remain intact | Isolated In-Memory Repository | **PASS** |

### 5.2 Existing Post Property Regression Suites Executed

| Test Suite Command | Backing Mode | Result |
| :--- | :--- | :---: |
| `npx tsx scripts/test-pp-wizard-premature-validation.ts` | Isolated In-Memory (`NODE_ENV=test`, `DATABASE_URL` unset) | **PASS (11/11 scenarios)** |
| `npx tsx scripts/test-pp-04b-security-regression.ts` | Isolated In-Memory (`NODE_ENV=test`, `DATABASE_URL` unset) | **PASS** |
| `npx tsx scripts/test-pp-05-property-engine.ts` | Isolated In-Memory (`NODE_ENV=test`, `DATABASE_URL` unset) | **PASS** |
| `npx tsx scripts/test-pp-07-my-properties-resume.ts` | Isolated In-Memory (`NODE_ENV=test`, `MEDIA_TEST_ISOLATED=true`) | **PASS** |

### 5.3 Blocked / Unverified Live PostgreSQL Tests
- **Live PostgreSQL Write Execution:** **BLOCKED (By Safety Policy)**  
  As established in `PP-10C3` / `PP-10C4`, the workspace environment has no separate disposable `TEST_DATABASE_URL` instance provisioned, and `DATABASE_URL` points to `greathomes-production`. In strict compliance with Section 6 (*"Do not modify production database or production data"*), all write/mutation regression tests were executed against the isolated in-memory test repository (`PropertySubmissionRepository.createForTesting({ dbResolver: () => null })`) with `DATABASE_URL` explicitly unset in the test process.

---

## 6. TYPESCRIPT, LINT & BUILD VERIFICATION

- **`compile_applet` (TypeScript & Production Next.js Build):** Executed and verified (`0` errors).
- **`lint_applet` (ESLint):** Executed and verified (`0` errors).

---

## 7. SAFETY & INVARIANT CONFIRMATIONS

1. **Final Submission Validation Remains Strict:** Confirmed. `locationPayloadSchema`, `validateSubmissionForSubmit`, `validateWizardStep(6)`, and `PropertySubmissionService.submitForReview` continue to strictly reject any submission missing a non-empty `city`, `locality`, or `address`.
2. **Production Untouched:** Confirmed. Zero connections, queries, writes, deletes, schema changes, or migrations were executed against `greathomes-production`. No environment variables or deployment configurations were modified.
