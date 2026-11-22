# GREAT HOMES V2 — POST PROPERTY WIZARD PREMATURE CROSS-STEP VALIDATION INSPECTION

**Report Reference:** `PP_WIZARD_PREMATURE_VALIDATION_INSPECTION`  
**Operating Mode:** STRICTLY READ-ONLY (Zero code, schema, migration, or API changes)  
**Target Subsystem:** Post Property Six-Step Wizard (`PP-04` – `PP-07` Customer Submission Flow)  
**Reported Symptom:** Step 1 (*Listing Purpose & Property Type*) displays validation errors for **Locality** and **Address**, even though those fields belong to Step 2 (*Location & Project*).

---

## 1. EXECUTIVE SUMMARY & CONFIRMED ROOT CAUSE

### Confirmed Root Cause (Not a Hypothesis)
The premature **Locality** and **Address** validation error on Step 1 is caused by a **three-part interaction** between client state initialization in `PostPropertyWizard.tsx`, full-payload server draft synchronization on Step 1 navigation, and non-empty string constraints (`.min(1)`) inside the server-side draft Zod schemas (`createSubmissionSchema` and `updateSubmissionSchema`):

1. **Client State Pre-Populates Step 2 Fields with Empty Strings (`""`) on Mount:**  
   In `src/components/post-property/PostPropertyWizard.tsx` (lines `226–240`), `wizardState` is initialized as a single composite `PropertySubmissionPayload` object covering all 6 steps. Step 2’s `location` sub-object is initialized on Step 1 mount as:
   ```ts
   location: {
     city: 'Kolkata',
     locality: '',
     locationId: null,
     address: '',
     projectId: null,
     projectName: '',
     isCustomLocality: false,
     latitude: null,
     longitude: null,
   }
   ```
   Similarly, when hydrating an existing draft via `?draftId=...` (`hydrateExistingSubmission`, lines `501–511`), any unpopulated `locality` or `address` defaults to `''`.

2. **Step 1 Navigation Immediately Syncs the Full Multi-Step `wizardState` to the Server:**  
   When the customer clicks **"Continue to Step 2"** on Step 1 (`handleNextStep`, lines `811–862`)—or clicks **"Save Draft"** in the header (`handleSaveDraftOnly`, lines `1254–1277`)—client-side step validation `validateWizardStep(1, sanitizedPayload)` (line `835`) runs first and **passes** (checking only `listingType`, `propertyType`, and `listingSource`).  
   Immediately afterward (line `853`), `handleNextStep` calls `const syncedId = await syncDraftWithServer()` and blocks advancing to Step 2 if `!syncedId`.  
   Inside `syncDraftWithServer()` (lines `752–796`), the client strips only `photos` (`const { photos: _omitPhotos, ...draftPayloadWithoutPhotos } = sanitizedPayload`, line `762`) and sends the **entire** `wizardState`—including `location: { city: 'Kolkata', locality: '', address: '', ... }`—to `POST /api/customer/submissions` (for a fresh submission) or `PUT /api/customer/submissions/${submissionId}` (for an existing draft).

3. **Server Draft Schemas Reject `location.locality = ""` and `location.address = ""`:**  
   - **Fresh Submission (`POST /api/customer/submissions`):** Calls `propertySubmissionService.createDraft` (`src/domain/propertySubmission/service.ts`, line `217`), which validates input with `createSubmissionSchema` (`src/domain/propertySubmission/validation.ts`, lines `844–854`):
     ```ts
     export const createSubmissionSchema = z.object({
       listingType: listingTypeSchema,
       listingSource: listingSourceSchema,
       payload: propertySubmissionPayloadSchema
         .omit({ photos: true })
         .partial()
         .extend({
           photos: submissionPhotosPatchSchema,
         })
         .default({}),
     });
     ```
     Because Zod’s `.partial()` is **shallow**, it only makes the top-level keys of `propertySubmissionPayloadSchema` optional (`location?: locationPayloadSchema`). Because `payload.location` is present as an object, Zod validates its properties against `locationPayloadSchema` (`src/domain/propertySubmission/validation.ts`, lines `382–392`), where:
     - `locality: z.string().min(1, 'Locality is required')` → **fails on `""`**
     - `address: z.string().min(1, 'Address is required')` → **fails on `""`**
   - **Existing / Restored Draft (`PUT /api/customer/submissions/[id]`):** Calls `propertySubmissionService.updateDraft` (`src/domain/propertySubmission/service.ts`, line `298`), which validates input with `updateSubmissionSchema` (`src/domain/propertySubmission/validation.ts`, lines `856–864`) using `locationPatchSchema` (lines `827–837`):
     ```ts
     const locationPatchSchema = z.object({
       city: z.string().min(1, 'City is required').optional(),
       locality: z.string().min(1, 'Locality is required').optional(),
       locationId: z.string().optional().nullable(),
       address: z.string().min(1, 'Address is required').optional(),
       ...
     });
     ```
     In Zod, `z.string().min(1).optional()` allows `undefined`, but **rejects `""` (empty string)**.
   - The server responds with HTTP `400 Bad Request`:
     - Fresh draft: `"Invalid submission input: Locality is required, Address is required"`
     - Existing draft: `"Invalid update payload: Locality is required, Address is required"`
   - `syncDraftWithServer()` catches this error, sets `setApiError(err?.message)` (line `801`), and returns `null`. `handleNextStep()` aborts step progression (`if (!syncedId) return;` at line `854`), leaving the user stuck on Step 1 with the alert banner (lines `1667–1687`) displaying:
     > **Please resolve the following before continuing:**  
     > • Invalid submission input: Locality is required, Address is required

---

## 2. COMPLETE VALIDATION FLOW TRACE

### 2.1 Initial Wizard Rendering (Mount & Query Param Hydration)
- **File:** `src/components/post-property/PostPropertyWizard.tsx`
- **Lines `206–280`:**
  - Reads URL query params (`?purpose=`, `?type=`, `?source=`, `?draftId=`, `?step=`).
  - Initializes `currentStep = 1` (line `222`) and `highestReachedStep = 1` (line `223`).
  - Initializes `wizardState` (lines `226–280`) with Step 1 defaults (`listingType`, `propertyType`, `listingSource`), Step 2 empty strings (`location.locality: ''`, `location.address: ''`, `location.projectName: ''`), Step 3 defaults (`details`), Step 4 empty array (`photos: []`), and Step 5 defaults (`consent`).
  - No validation error is shown on initial mount (`stepErrors = []`, `apiError = null`, lines `283–284`), unless the user is on Step 3 where `validateAreaHierarchy(wizardState.details)` runs inline for live area feedback (line `2347`).

### 2.2 Draft Restoration (`?draftId={id}`)
- **File:** `src/components/post-property/PostPropertyWizard.tsx`
- **Lines `467–589` (`hydrateExistingSubmission`):**
  - Fetches `GET /api/customer/submissions/${draftId}`.
  - Hydrates `wizardState.location` (lines `501–511`):
    ```ts
    location: {
      city: typeof loc.city === 'string' && loc.city ? loc.city : 'Kolkata',
      locality: typeof loc.locality === 'string' ? loc.locality : '',
      locationId: typeof loc.locationId === 'string' ? loc.locationId : null,
      address: typeof loc.address === 'string' ? loc.address : '',
      ...
    }
    ```
  - Sets `setHighestReachedStep(6)` unconditionally (line `558`), and keeps `currentStep` at `1` unless `searchParams.get('step') === '6'` (lines `559–562`).

### 2.3 Step Navigation (`handleNextStep`, `handlePreviousStep`, `handleJumpToStep`)
- **File:** `src/components/post-property/PostPropertyWizard.tsx`
- **Forward Navigation (`handleNextStep`, lines `811–862`):**
  1. Clears `stepErrors` and `apiError` (lines `812–813`).
  2. Checks customer authentication (lines `815–818`) and active Step 4 uploads (lines `820–823`).
  3. Builds `sanitizedPayload` via `sanitizeDetailsForSelection(wizardState.details, wizardState.propertyType, wizardState.listingType)` (lines `825–832`).
  4. Runs client-side step validation: `const validation = validateWizardStep(currentStep, sanitizedPayload)` (line `835`).
     - On Step 1, `validateWizardStep(1, sanitizedPayload)` (`src/domain/propertySubmission/validation.ts`, lines `946–957`) validates **only** `listingType`, `propertyType`, and `listingSource`.
  5. If `currentStep === 1 && wizardState.listingSource === 'PARTNER'`, checks `partnerStatus.eligible` (lines `842–850`).
  6. Calls `const syncedId = await syncDraftWithServer()` (line `853`). If `!syncedId`, returns early without advancing `currentStep` (lines `854–856`).
  7. Only if `syncedId` is truthy does it advance `setCurrentStep(nextStep)` and update `highestReachedStep` (lines `858–860`).
- **Backward / Progress Bar Navigation (`handlePreviousStep` lines `864–871`, `handleJumpToStep` lines `873–879`):**
  - Clears `stepErrors` and `apiError` and changes `currentStep` locally without calling `syncDraftWithServer()`.

### 2.4 Server Draft Synchronization (`syncDraftWithServer`)
- **File:** `src/components/post-property/PostPropertyWizard.tsx` (lines `741–809`)
- Strips `photos` from `sanitizedPayload` and sends the entire remaining `wizardState` (`listingType`, `propertyType`, `listingSource`, `location`, `details`, `consent`) to:
  - `POST /api/customer/submissions` (`app/api/customer/submissions/route.ts`, lines `15–85`) when `!submissionId`
  - `PUT /api/customer/submissions/${submissionId}` (`app/api/customer/submissions/[id]/route.ts`, lines `23–123`) when `submissionId` exists
- On HTTP error, throws `new Error(data.error || ...)` which is caught at line `800`, setting `setApiError(err?.message)` and returning `null`.

### 2.5 Final Submission (`handleFinalSubmit`)
- **File:** `src/components/post-property/PostPropertyWizard.tsx` (lines `1186–1252`)
- Runs `validateWizardStep(6, sanitizedPayload)` on the client (line `1210`), which delegates to `validateSubmissionForSubmit(payload)` (`src/domain/propertySubmission/validation.ts`, lines `800–825`).
- Calls `syncDraftWithServer()` (line `1218`) followed by `POST /api/customer/submissions/${activeId}/submit` (line `1225`), which invokes `propertySubmissionService.submitForReview` (`src/domain/propertySubmission/service.ts`, lines `376–460`) and runs full server-side `validateSubmissionForSubmit` + `validateLocationProjectCompatibility`.

---

## 3. RESPONSIBLE COMPONENTS, FUNCTIONS, SCHEMAS & HANDLERS

| Layer | File Path | Symbol / Lines | Role in Premature Validation |
| :--- | :--- | :--- | :--- |
| **Client State Init** | `src/components/post-property/PostPropertyWizard.tsx` | `useState<PropertySubmissionPayload>` (lines `226–280`) | Initializes `location.locality = ''` and `location.address = ''` while user is still on Step 1. |
| **Client Draft Hydration** | `src/components/post-property/PostPropertyWizard.tsx` | `hydrateExistingSubmission` (lines `501–511`) | Hydrates missing `loc.locality` and `loc.address` as `''` (empty strings) instead of `undefined`. |
| **Client Draft Sync** | `src/components/post-property/PostPropertyWizard.tsx` | `syncDraftWithServer` (lines `741–809`) | Sends the entire `wizardState` (including unvisited Step 2 `location` with empty strings) on Step 1 transition and "Save Draft". |
| **Client Step Handler** | `src/components/post-property/PostPropertyWizard.tsx` | `handleNextStep` (lines `811–862`) & `handleSaveDraftOnly` (lines `1254–1277`) | Invokes `syncDraftWithServer()` on Step 1 and blocks transition to Step 2 when the server returns HTTP 400. |
| **Client Error Banner** | `src/components/post-property/PostPropertyWizard.tsx` | JSX Alert Block (lines `1667–1687`) | Renders `apiError` inside the step error list under `"Please resolve the following before continuing:"`. |
| **Server Create Schema** | `src/domain/propertySubmission/validation.ts` | `createSubmissionSchema` (lines `844–854`) & `locationPayloadSchema` (lines `382–392`) | Uses shallow `.partial()` on `propertySubmissionPayloadSchema`, leaving `payload.location` bound to strict `locationPayloadSchema` (`locality: z.string().min(1)`, `address: z.string().min(1)`). |
| **Server Update Schema** | `src/domain/propertySubmission/validation.ts` | `updateSubmissionSchema` (lines `856–864`) & `locationPatchSchema` (lines `827–837`) | Defines `locality` and `address` in `locationPatchSchema` as `z.string().min(1).optional()`, which rejects `""` (empty string). |
| **Server Service** | `src/domain/propertySubmission/service.ts` | `createDraft` (lines `210–225`) & `updateDraft` (lines `290–306`) | Runs `createSubmissionSchema.safeParse` / `updateSubmissionSchema.safeParse`, extracts Zod issues via `extractZodIssues` (lines `80–102`), and throws HTTP 400 `PropertySubmissionDomainError`. |

---

## 4. WHY LATER-STEP FIELDS ARE VALIDATED ON STEP 1

1. **Client Step 1 validation is NOT the culprit:**  
   `validateWizardStep(1, sanitizedPayload)` (`src/domain/propertySubmission/validation.ts`, lines `946–957`) only checks:
   - `listingType` (`RESALE` | `RENTAL`)
   - `propertyType` (`APARTMENT` | `INDEPENDENT_HOUSE` | `PLOT`)
   - `listingSource` (`OWNER` | `PARTNER`)
2. **Server Draft Sync on Step 1 IS the culprit:**  
   Because `handleNextStep` persists a server draft on every step transition (starting with Step 1 → Step 2) and sends the **entire** `wizardState` payload rather than only the fields relevant to the completed steps (or omitting unpopulated empty strings), the server validates `payload.location` during Step 1.
3. **Why existing automated tests (`scripts/test-pp-04-wizard.ts`) did not catch this:**  
   In `scripts/test-pp-04-wizard.ts` (lines `369–377`), the test called `propertySubmissionService.createDraft` with:
   ```ts
   payload: {
     listingType: 'RESALE',
     listingSource: 'OWNER',
     propertyType: 'APARTMENT',
   }
   ```
   Because `payload.location` was omitted (`undefined`) in the test script, `createSubmissionSchema`’s shallow `.partial()` passed. In the real React component (`PostPropertyWizard.tsx`), however, `wizardState.location` is always an object `{ city: 'Kolkata', locality: '', address: '', ... }`, which triggers `locationPayloadSchema` / `locationPatchSchema` and fails on `""`.

---

## 5. IMPACT ON FRESH SUBMISSIONS VS. RESTORED DRAFTS

**Confirmed Finding:** The defect affects **BOTH** fresh submissions and restored drafts whenever Step 2 (`locality` and `address`) has not yet been populated:

| Scenario | HTTP Endpoint & Schema Triggered | Affected? | Exact Mechanism |
| :--- | :--- | :--- | :--- |
| **1. Fresh Submission on Step 1** (`/post-property/new`) | `POST /api/customer/submissions` → `createSubmissionSchema` → `locationPayloadSchema` | **YES (100% of fresh submissions)** | `submissionId` is `null`. Clicking **"Continue to Step 2"** or **"Save Draft"** sends `location: { city: 'Kolkata', locality: '', address: '', ... }`. `locationPayloadSchema` fails with `Invalid submission input: Locality is required, Address is required`. User is completely blocked from reaching Step 2. |
| **2. Restored Draft where Step 2 was not completed** (`/post-property/new?draftId=...`) | `PUT /api/customer/submissions/[id]` → `updateSubmissionSchema` → `locationPatchSchema` | **YES** | `hydrateExistingSubmission` (lines `503, 505`) sets `locality: ''` and `address: ''` and starts on `currentStep = 1`. Clicking **"Continue to Step 2"** or **"Save Draft"** sends `location: { locality: '', address: '' }`, which fails `locationPatchSchema` (`z.string().min(1).optional()` rejects `""`) with `Invalid update payload: Locality is required, Address is required`. |
| **3. Restored Draft where Step 2 WAS previously completed** (`/post-property/new?draftId=...`) | `PUT /api/customer/submissions/[id]` → `updateSubmissionSchema` → `locationPatchSchema` | **NO (unless user clears Locality/Address)** | `hydrateExistingSubmission` restores non-empty `locality` and `address` strings, which satisfy `.min(1)`. |

---

## 6. AUDIT OF OTHER WIZARD STEPS FOR SIMILAR PREMATURE VALIDATION

A complete step-by-step audit of Steps 1 through 6 (`PostPropertyWizard.tsx` + `validation.ts` + `service.ts`) confirmed the following behaviors across all other steps:

### 6.1 Confirmed Premature / Draft-Save Validation Issues on Other Steps
1. **Step 2 Header "Save Draft" Button (`handleSaveDraftOnly`, line `1254`):**
   - **Confirmed Issue:** If a customer is on Step 2 and clicks **"Save Draft"** in the top bar before filling both `Locality` and `Address` (for example, after selecting a Locality or Project while `address` is still `""`), `handleSaveDraftOnly` calls `syncDraftWithServer()`. The server rejects the draft save with `Invalid update payload: Address is required` (or `Locality is required`) because `locationPatchSchema` rejects `""`.
2. **Step 2 Mode-Switch Resets (`locality: ''` in `PostPropertyWizard.tsx`, lines `1962, 1999, 2047, 2080, 2126, 2172, 2226`):**
   - **Confirmed Issue:** Switching between "Select Verified Locality" and "Enter Custom Locality" on Step 2 resets `locality: ''`. If the user then clicks **"Save Draft"** or navigates back to Step 1 and clicks **"Continue to Step 2"**, `syncDraftWithServer()` fails on the server with `Locality is required`.
3. **Restored Draft Unvalidated Progress-Bar Step Jumping (`hydrateExistingSubmission`, line `558` & `handleJumpToStep`, line `873`):**
   - **Confirmed Issue:** When a draft is loaded via `?draftId=...`, line `558` sets `setHighestReachedStep(6)` regardless of which steps were actually completed in that draft. If the draft has no `locality` or `address` yet and the user clicks Step 3, Step 4, or Step 5 in the progress bar and then clicks **"Continue"**, **"Save Draft"**, or **"Select Photographs"** (which calls `syncDraftWithServer()` at line `1029`), the server rejects the request on Step 3/4/5 with `Invalid update payload: Locality is required, Address is required`.

### 6.2 Confirmed Safe Fields on Steps 3, 4, and 5 During Early Draft Sync
- **Step 3 (`details`):**
  - Numeric fields required in Step 3 (`carpetArea`, `builtUpArea`, `superBuiltUpArea`, `plotArea`, `askingPrice`, `monthlyRent`) are initialized in `wizardState.details` to `undefined` (lines `246–253`) and cleared to `undefined` when inputs are emptied (`e.target.value ? Number(e.target.value) : undefined`).
  - In `propertyDetailsPayloadSchema` (`src/domain/propertySubmission/validation.ts`, lines `404–440`), all numeric fields are `.optional()` and `description` (`''`) is `z.string().optional()` (without `.min(1)`).
  - Cross-type forbidden fields (e.g., switching `APARTMENT` → `PLOT` or `RESALE` → `RENTAL` on Step 1) are stripped both on the client by `sanitizeDetailsForSelection()` (`PostPropertyWizard.tsx`, lines `415–465`) and on the server by `mergeSubmissionPayloads()` (`validation.ts`, lines `869–914`) prior to `validateConditionalPropertyRules()`.
- **Step 4 (`photos`):**
  - `syncDraftWithServer()` strips `photos` before calling `POST` or `PUT` (line `762`), and the minimum 3-photo requirement (`MIN_SUBMISSION_PHOTOS = 3`) is enforced only in `validateWizardStep(4)` (Step 4 → 5) and `validateSubmissionForSubmit` (Step 6 final submission).
- **Step 5 (`consent`):**
  - `wizardState.consent` initializes `ownerDeclarationAccepted: false` and `partnerAttestationAccepted: false` (lines `273–274`). In `consentPayloadSchema` (`validation.ts`, lines `394–402`), both are `z.boolean().optional()`, so `false` is accepted during Steps 1–4 draft saves and is only required to be `true` in `validateWizardStep(5)` and `validateSubmissionForSubmit` (Step 6).

---

## 7. POTENTIAL IMPACT OF CORRECTING THE ISSUE

1. **Unblocks Step 1 → Step 2 Progression and Draft Saving:**
   - Customers starting a new property submission (`/post-property/new`) or resuming an early draft will be able to complete Step 1 and advance to Step 2 (or click "Save Draft" on Steps 1–2) without encountering premature `Locality is required` / `Address is required` errors.
2. **Zero Weakening of Step 2 or Final Submission Security/Validation Gates:**
   - Client-side `validateWizardStep(2, sanitizedPayload)` (`validation.ts`, lines `959–995`) still strictly requires non-empty `locality` and `address` before the user can advance from Step 2 to Step 3.
   - Client-side `validateWizardStep(6, sanitizedPayload)` and server-side `validateSubmissionForSubmit()` (`validation.ts`, lines `800–825`, `locationPayloadSchema` lines `382–392`, and `service.ts` `submitForReview` lines `416–429`) remain **100% strict and fail-closed**: no submission can transition to `SUBMITTED` without a valid non-empty `city`, `locality`, and `address`.
3. **Downstream Repository & UI Compatibility (`computeSubmissionSummary`):**
   - Confirmed in `src/domain/propertySubmission/repository.ts` (lines `747–809`): `computeSubmissionSummary` already safely handles drafts where `locality` or `address` is empty or `null` (`locality` resolves to `null` at lines `751–754`, and the generated draft title cleanly falls back to `"3 BHK Apartment for Resale in Kolkata"` at lines `803–807`).
   - Confirmed in `src/domain/propertySubmission/service.ts` (lines `124–201`): `validateLocationProjectCompatibility` already guards against empty/absent `projectId` and `locality` (`if (!loc.projectId) return;` at line `133`).

---

## 8. SMALLEST SAFE REMEDIATION PROPOSAL (DO NOT IMPLEMENT YET)

To fix the issue cleanly with defense-in-depth and zero risk to final submission validation:

### 8.1 Server-Side Draft Schema Fix (`src/domain/propertySubmission/validation.ts`)
1. **Allow empty strings (`""`) or `undefined` in `locationPatchSchema` (lines `827–837`) for draft creation & draft updates:**
   - Normalize empty/whitespace strings in `locationPatchSchema` (or allow `z.string().optional()`) for `city`, `locality`, and `address` during **draft** creation (`createSubmissionSchema`) and **draft** updates (`updateSubmissionSchema`), while keeping `locationPayloadSchema` (`z.string().min(1)`) strictly enforced inside `propertySubmissionPayloadSchema` / `validateSubmissionForSubmit` for final submission:
   ```ts
   const locationPatchSchema = z.object({
     city: z.string().optional(),
     locality: z.string().optional(),
     locationId: z.string().optional().nullable(),
     address: z.string().optional(),
     projectId: z.string().optional().nullable(),
     projectName: z.string().optional(),
     isCustomLocality: z.boolean().optional(),
     latitude: z.number().min(-90).max(90).optional().nullable(),
     longitude: z.number().min(-180).max(180).optional().nullable(),
   });
   ```
2. **Use `locationPatchSchema` inside `createSubmissionSchema` (lines `844–854`) just like `updateSubmissionSchema` does:**
   ```ts
   export const createSubmissionSchema = z.object({
     listingType: listingTypeSchema,
     listingSource: listingSourceSchema,
     payload: propertySubmissionPayloadSchema
       .omit({ photos: true, location: true })
       .partial()
       .extend({
         location: locationPatchSchema.optional(),
         photos: submissionPhotosPatchSchema,
       })
       .default({}),
   });
   ```

### 8.2 Client-Side Step-Progress Hygiene (`src/components/post-property/PostPropertyWizard.tsx`)
1. **Compute `highestReachedStep` accurately during `hydrateExistingSubmission` (line `558`):**
   - Instead of unconditionally setting `setHighestReachedStep(6)` for every draft, derive `highestReachedStep` from the highest contiguous step whose `validateWizardStep(step, hydratedPayload).valid` is `true` (plus `1`, capped at `6`), so resuming a Step 1 draft does not unlock unvalidated jumping to Steps 3–6 before Step 2 is completed.

---

## 9. REQUIRED REGRESSION TESTS

When remediation is authorized, the following regression tests should be added to `scripts/test-pp-04-wizard.ts` (and the PP-11 test suite):

1. **Fresh Wizard Step 1 Draft Creation with Initial React `wizardState` Payload:**
   - Call `propertySubmissionService.createDraft` (and `POST /api/customer/submissions`) with the exact initial `wizardState` payload produced by `PostPropertyWizard.tsx` on Step 1 (`location: { city: 'Kolkata', locality: '', locationId: null, address: '', projectId: null, projectName: '', isCustomLocality: false, latitude: null, longitude: null }`).
   - **Assert:** Succeeds with HTTP `201 Created` and `submissionStatus === 'DRAFT'`; does **not** throw `Locality is required` or `Address is required`.
2. **Step 1 / Step 2 Draft Update (`updateDraft`) with Partial/Empty Location Strings:**
   - Call `propertySubmissionService.updateDraft` (and `PUT /api/customer/submissions/[id]`) with `location: { city: 'Kolkata', locality: '', address: '' }` and with partial Step 2 state (`locality: 'Ballygunge', address: ''`).
   - **Assert:** Succeeds with HTTP `200 OK` and preserves draft progress.
3. **Step 2 Client Gate Enforcement (`validateWizardStep(2, ...)`):**
   - Call `validateWizardStep(2, payload)` with `locality: ''` or `address: ''`.
   - **Assert:** Returns `{ valid: false }` with `'Locality is required'` and `'Property address is required'`—blocking transition from Step 2 → Step 3 on the client.
4. **Final Submission Gate Enforcement (`validateWizardStep(6, ...)` & `submitForReview`):**
   - Call `propertySubmissionService.submitForReview` on a draft whose `location.locality` is `''` or `location.address` is `''`.
   - **Assert:** Fails closed with HTTP `400 Bad Request` (`Locality is required`, `Address is required`) and keeps `submissionStatus === 'DRAFT'`.
5. **Restored Draft Step-Reachability Gate:**
   - Hydrate a draft created at Step 1 (where `locality` and `address` are empty) and verify that `highestReachedStep` does not allow bypassing Step 2 validation.
