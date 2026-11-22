# GREAT HOMES V2 — PP-11 PHOTO UPLOAD REMEDIATION REPORT
## Implementation, Verification & Controlled End-to-End Testing

**Date:** 2026-11-16  
**Phase:** PP-11 (Post Property Step 4 Photo Upload Remediation)  
**Status:** COMPLETE — Ready for Review & Approval

---

## 1. EXECUTIVE SUMMARY

This remediation resolves the Post Property Step 4 (*Property Photographs*) upload failure:

> `"Upload failed (200). Please try again."`

as well as the related upload queue UI defects identified in the read-only investigation, while preserving the mandatory server-mediated upload architecture:

`Browser → Next.js API → Image validation → Sharp processing → Watermark → Cloudflare R2 → PostgreSQL media record → Gallery`

All 18 PP-11 photo-upload remediation regression tests, the PP-06 image management suite, the PP-04B security regression suite, the PP-05 property information engine suite, the PP-07 draft/resume suite, the wizard premature-validation regression suite, isolated PostgreSQL + sandbox storage end-to-end tests, and the authorized controlled Cloudflare R2 + PostgreSQL end-to-end test (with verified cleanup) passed 100%.

---

## 2. CONFIRMED ROOT CAUSE

Controlled diagnostic execution confirmed a three-stage failure chain behind `"Upload failed (200). Please try again."`:

1. **Stage 1 — Drizzle ORM `media_assets` Column Mismatch (`src/db/schema.ts:500`):**
   - `export const mediaAssets = pgTable('media_assets', ...)` in `src/db/schema.ts` defined `customerId: text('customer_id')`.
   - However, in `public.media_assets` in PostgreSQL (`greathomes-production`), the table contains 27 columns and **does not have a `customer_id` column** (ownership of submission photographs is enforced through `property_submissions.submitter_customer_id` joined via `entity_type = 'SUBMISSION' AND entity_id = submissionId`, and no repository in the codebase reads or writes `mediaAssets.customerId`).
   - When `SubmissionMediaService.uploadMedia()` called `this.repo.listSubmissionMedia(submissionId, customerId)` (and `addSubmissionMediaWithAtomicCap()`), Drizzle generated `SELECT "id", "entity_type", "entity_id", "customer_id", ... FROM "media_assets"`, which PostgreSQL rejected with:
     `error: column "customer_id" does not exist (SQLSTATE 42703)`.
   - `PropertySubmissionRepository.runWithPersistenceGuard()` caught the `42703` database error and threw `PropertySubmissionPersistenceError` (`statusCode = 503`, `code = 'PERSISTENCE_UNAVAILABLE'`).
   - Similarly, any storage exception in `SubmissionMediaService.uploadMedia()` threw `SubmissionStorageUnavailableError` (`statusCode = 503`, `code = 'STORAGE_UNAVAILABLE'`).

2. **Stage 2 — Route Handler Returned HTTP `503` (`src/domain/propertySubmission/mediaRouteHandlers.ts:40–50`):**
   - `handleMediaErrorResponse()` returned HTTP `503 Service Unavailable` for both `SubmissionStorageUnavailableError` and `PropertySubmissionPersistenceError`.

3. **Stage 3 — External Container Nginx Reverse Proxy Rewrote HTTP `503` into HTTP `200 OK` HTML (`/etc/nginx/nginx.conf:84–86`):**
   - The container runtime's Nginx reverse proxy has `proxy_intercept_errors on; error_page 502 503 504 = /warmup.html;`.
   - When Next.js returned HTTP `503`, Nginx intercepted the response, discarded the JSON error payload, and served `/var/www/assets/warmup.html` (`<!DOCTYPE html>...`) with **HTTP `200 OK` (`Content-Type: text/html`)**.
   - In `PostPropertyWizard.tsx` (`uploadQueueItemToServer`), `JSON.parse(xhr.responseText)` failed on the HTML body (`data = null`), `data?.success` was falsy, and the fallback message formatted `xhr.status` (`200`) into:
     `"Upload failed (200). Please try again."`

---

## 3. EXACT FILES MODIFIED

| File Path | Summary of Changes |
| :--- | :--- |
| `src/db/schema.ts` | Removed the unreferenced, non-existent `customerId` column and `idx_media_assets_customer` index from the `mediaAssets` Drizzle table definition so Drizzle queries match the exact 27 columns of `public.media_assets` without requiring any production DDL/schema change. |
| `src/domain/propertySubmission/mediaService.ts` | Added `StorageFailureDiagnostics`, `extractSafeStorageErrorDiagnostics()`, and `logStorageFailureDiagnostic()` to log structured, non-secret diagnostic details (`errorName`, `s3ErrorCode`, `httpStatus`, `operation`, `storageProvider`, `submissionId`) on `resolveStorage` and `storage.put` failures. |
| `src/domain/propertySubmission/mediaRouteHandlers.ts` | Updated `handleMediaErrorResponse()` and `MediaRouteDependencies` to include `code: 'STORAGE_UNAVAILABLE' \| 'PERSISTENCE_UNAVAILABLE'` in structured JSON error responses, preserve HTTP `503` where Nginx interception is fixed/disabled, and apply a narrowly scoped HTTP `500` workaround when running behind the container Nginx proxy (`shouldUseScoped500Workaround`) so JSON errors are never replaced with `warmup.html`. |
| `src/components/post-property/PostPropertyWizard.tsx` | Added and wired `parsePhotoUploadXhrResponse()`, `shouldShowPhotoGalleryEmptyState()`, `getUploadFileIdentityKey()`, and `isDuplicateUploadQueueFile()`; hardened `uploadQueueItemToServer()` for `Content-Type` inspection, HTML/warmup detection, malformed/empty JSON, 4xx/5xx structured JSON, network failure, and timeout (`60s`); fixed Step 4 empty-state visibility; added duplicate file selection protection; guarded `handleRetryUpload()` against duplicate in-flight retries. |
| `scripts/test-pp-11-photo-upload-remediation.ts` | Created the 18-scenario PP-11 photo-upload remediation regression test suite covering Workstream E requirements. |

---

## 4. STORAGE CONFIGURATION FINDINGS (WORKSTREAM A)

We verified the S3/Cloudflare R2 configuration in the runtime environment without modifying production credentials or guessing bucket names:

1. **Bucket Verification against Cloudflare R2:**
   - `HeadBucketCommand({ Bucket: 'greathomes-production' })` succeeded (`HTTP 200`).
   - `ListObjectsV2Command({ Bucket: 'greathomes-production', MaxKeys: 5 })` succeeded and returned existing Great Homes media objects (`media/developer/...`, `media/project/...`).
   - `HeadBucketCommand({ Bucket: 'greathomes-media' })` failed with `HTTP 403 Forbidden`, and `ListBucketsCommand` returned `AccessDenied` (`403`), confirming the R2 API credentials are bucket-scoped to `greathomes-production`.
2. **Conclusion:**
   - The live Cloudflare R2 bucket provisioned for the platform is named `greathomes-production` (`PUBLIC_URL`: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev`).
   - `S3_BUCKET=greathomes-production` in the runtime environment is valid and was preserved. No fallback to local storage was introduced for S3/R2 failures.

---

## 5. API & PROXY ERROR-HANDLING CHANGES (WORKSTREAM B)

- `/etc/nginx/nginx.conf` is owned by the external AI Studio container runtime image outside the application repository (`/app/applet`) and is not deployed with application code.
- In `src/domain/propertySubmission/mediaRouteHandlers.ts`:
  - `handleMediaErrorResponse()` now returns structured JSON with `Content-Type: application/json`:
    ```json
    {
      "success": false,
      "code": "STORAGE_UNAVAILABLE",
      "error": "Property media service is temporarily unavailable. Please try again later."
    }
    ```
  - Where Nginx `/api/` 503 passthrough is active (`NGINX_API_503_PASSTHROUGH=true` or `useScoped500Workaround: false`), HTTP `503` is preserved.
  - When running behind the container Nginx proxy (`APPLET_ID` present in non-test runtime, `MEDIA_ERROR_SCOPED_500_WORKAROUND=true`, or `useScoped500Workaround: true`), `handleMediaErrorResponse()` returns the narrowly scoped HTTP `500` status so Nginx passes the structured JSON directly to the client instead of serving `/warmup.html`.

---

## 6. DIAGNOSTIC LOGGING CHANGES (WORKSTREAM A)

In `src/domain/propertySubmission/mediaService.ts`:
- Added `extractSafeStorageErrorDiagnostics()` and `logStorageFailureDiagnostic()`, which log structured JSON via `logger.error`:
  - `errorName` (e.g., `NoSuchBucket`, `TimeoutError`)
  - `s3ErrorCode` (from `err.Code` or `err.code`)
  - `httpStatus` (from `err.$metadata.httpStatusCode` or `err.statusCode`)
  - `operation` (`resolveStorage` | `storage.put` | `storage.delete`)
  - `storageProvider` (`s3` | `local` | `unknown`)
  - `submissionId`
- Verified by automated assertion that secrets, access keys, endpoints, cookies, authorization headers, and signed URLs are never logged.

---

## 7. FRONTEND XHR HANDLING CHANGES (WORKSTREAM C)

In `src/components/post-property/PostPropertyWizard.tsx` (`parsePhotoUploadXhrResponse` & `uploadQueueItemToServer`):
1. **HTTP 201 with valid success JSON:** Requires `status >= 200 && status < 300`, `Content-Type` containing `application/json`, `data.success === true`, and `Array.isArray(data.photos)`. Removes item from `uploadQueue` and updates `wizardState.photos`.
2. **HTTP 4xx with structured JSON:** Preserves item in `uploadQueue` with `status: 'error'` and displays server `data.error`.
3. **HTTP 5xx with structured JSON:** Preserves item in `uploadQueue` with `status: 'error'` and surfaces `data.error` or `"The photo upload service is temporarily unavailable. Please try again."`.
4. **HTTP 200 with HTML (`text/html` or `<!DOCTYPE html>` / `<html>` warmup page):** Detected as `HTML_OR_WARMUP_RESPONSE` and treated as failure with `"The photo upload service is temporarily unavailable. Please try again."` — never `"Upload failed (200)"`.
5. **HTTP 200 with malformed JSON:** Detected as `MALFORMED_JSON_RESPONSE` and treated as failure with `"The photo upload service is temporarily unavailable. Please try again."`.
6. **Empty response body:** Detected as `EMPTY_RESPONSE_BODY` and treated as failure with `"The photo upload service is temporarily unavailable. Please try again."`.
7. **Network failure (`xhr.onerror`):** Marks queue item as failed with `"Network connection lost during upload. Please retry."`.
8. **Timeout (`xhr.ontimeout`, `xhr.timeout = 60000`):** Marks queue item as failed with `"Photo upload timed out. Please check your connection and try again."`.

---

## 8. EMPTY-STATE CORRECTION (WORKSTREAM D.A)

In `src/components/post-property/PostPropertyWizard.tsx`:
- Implemented `shouldShowPhotoGalleryEmptyState(confirmedPhotosCount, uploadQueueCount)` which returns `true` **only when** `confirmedPhotosCount === 0 && uploadQueueCount === 0`.
- The `"No property photographs uploaded yet"` empty-state box is no longer displayed alongside uploading or failed queue items.

---

## 9. DUPLICATE-SELECTION CORRECTION (WORKSTREAM D.B)

In `src/components/post-property/PostPropertyWizard.tsx`:
- Implemented `getUploadFileIdentityKey(file)` using composite identity `${name}::${size}::${lastModified}::${mimeType}` and `isDuplicateUploadQueueFile(candidate, existingQueue, alreadySelectedInBatch)`.
- Prevents re-adding an identical file when an equivalent file is already `'uploading'` or `'error'` in `uploadQueue` (or duplicated within the same selection batch), while permitting genuinely different files that share a filename.

---

## 10. TESTS EXECUTED & ACTUAL RESULTS

| Test Suite | Classification | Command | Result |
| :--- | :--- | :--- | :--- |
| **PP-11 Photo Upload Remediation Suite (18 scenarios)** | Unit + Mocked Route/Storage + Sandbox Storage Integration | `npx tsx scripts/test-pp-11-photo-upload-remediation.ts` | **PASS (18/18 scenarios)** |
| **PP-06 Property Image Management Suite** | In-Memory Repository + Sandbox Storage + Sharp/Watermark Integration | `npx tsx scripts/test-pp-06-image-management.ts` | **PASS (6/6 groups)** |
| **PP-04B Security, Persistence & Build Regression Suite** | Unit + In-Memory Repository + Fail-Closed Persistence Guards | `npx tsx scripts/test-pp-04b-security-regression.ts` | **PASS (4/4 groups)** |
| **PP-05 Property Information Engine Suite** | Unit + In-Memory Repository Validation & Deep-Merge | `npx tsx scripts/test-pp-05-property-engine.ts` | **PASS (6/6 groups)** |
| **PP-07 Draft, Resume & My Listings Suite** | In-Memory Repository + Sandbox Storage Integration | `npx tsx scripts/test-pp-07-my-properties-resume.ts` | **PASS (9/9 groups)** |
| **Wizard Premature Validation Regression Suite** | Unit + In-Memory Repository (11 scenarios) | `npx tsx scripts/test-pp-wizard-premature-validation.ts` | **PASS (11/11 scenarios)** |
| **Isolated PostgreSQL + Sandbox Storage E2E Test** | Real Isolated PostgreSQL (`TEST_DATABASE_URL`) + Sandbox Storage | Inline `tsx` E2E verification | **PASS** |
| **Controlled Production R2 + PostgreSQL E2E Test** | Real PostgreSQL (`DATABASE_URL`) + Real Cloudflare R2 (`S3_BUCKET=greathomes-production`) | Inline `tsx` E2E verification + cleanup | **PASS** |

---

## 11. BUILD, TYPECHECK & LINT RESULTS

- **TypeScript (`compile_applet` / `tsc`):** Verified clean (`0` errors).
- **ESLint (`lint_applet`):** Verified clean (`0` errors).
- **Next.js Production Build:** Verified clean via `compile_applet`.

---

## 12. ISOLATED POSTGRESQL & SANDBOX STORAGE TEST EVIDENCE (SECTION 8)

Executed against the dedicated isolated Neon PostgreSQL instance (`TEST_DATABASE_URL`, host `ep-nameless-silence...`) with `MEDIA_TEST_ISOLATED=true`:
- **Temporary Test Submission ID:** `sub_e54109c4-d2a7-48d5-ad8d-dd721779831b`
- **Temporary Test Media Asset ID:** `med_3a420be0-74fb-4f93-85b1-82259f27cf49`
- **Storage Key:** `media/submission/sub_e54109c4-d2a7-48d5-ad8d-dd721779831b/med_3a420be0-74fb-4f93-85b1-82259f27cf49/public_wm.webp`
- **Verified:** `POST /api/customer/submissions/[id]/media` returned `HTTP 201 Created`, persisted to isolated PostgreSQL `media_assets` and `property_submissions.payload.photos`, returned via `GET /api/customer/submissions/[id]/media`, and cleaned up completely via `DELETE /api/customer/submissions/[id]/media/[mediaId]`.
- *(Note: A separate dedicated test R2 bucket is not provisioned in environment secrets; isolated storage tests therefore used `TestSandboxStorageProvider`, while real R2 verification used the authorized controlled test in Section 13.)*

---

## 13. CONTROLLED CLOUDFLARE R2 & POSTGRESQL END-TO-END TEST EVIDENCE (SECTION 9)

Per explicit user authorization in Sections 2 and 9, a single controlled end-to-end test was executed through the application's actual `handlePostSubmissionMedia`, `handleGetSubmissionMedia`, and `handleDeleteSubmissionMediaItem` pipeline against PostgreSQL (`DATABASE_URL`, host `ep-royal-smoke...`) and Cloudflare R2 (`S3_BUCKET=greathomes-production`):

1. **Step 1 — Temporary Test Submission Created:**
   - **Submission ID:** `sub_d94e5cc6-ad98-4670-8d2a-02670730ac44`
   - **Address Marker:** `"PP-11 INTERNAL TECHNICAL TEST — TEMPORARY VERIFICATION ONLY"`
2. **Step 2 — Test Image Uploaded via Media API:**
   - **HTTP Status:** `201 Created`
   - **Content-Type:** `application/json`
   - **Media Asset ID:** `med_160e7ff1-b5e1-4b64-802c-b3375a1505c5`
   - **Storage Provider:** `s3` (Cloudflare R2)
   - **Exact R2 Object Key:** `media/submission/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/med_160e7ff1-b5e1-4b64-802c-b3375a1505c5/public_wm.webp`
   - **Public URL:** `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/med_160e7ff1-b5e1-4b64-802c-b3375a1505c5/public_wm.webp`
3. **Step 3 — Complete Pipeline Verification:**
   - Confirmed R2 object existence (`storage.exists(key) === true`) and read back the stored bytes from R2.
   - Confirmed Sharp processed output format (`image/webp`, `800x600`), mandatory watermark (`watermarkApplied: true`), and complete EXIF removal (`r2Meta.exif === undefined`).
   - Confirmed row existence in PostgreSQL `media_assets` (`id = 'med_160e7ff1-b5e1-4b64-802c-b3375a1505c5'`).
   - Confirmed `property_submissions.payload.photos` contained 1 photo with `id = 'med_160e7ff1-b5e1-4b64-802c-b3375a1505c5'`.
   - Confirmed `GET /api/customer/submissions/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/media` returned `HTTP 200` with `photos.length === 1`.
   - *(Note on external deployment: Because no code deployment was performed in this task, any separately hosted production deployment outside this workspace will require a separately approved deployment to receive the updated code.)*

---

## 14. PRODUCTION TEST IDENTIFIERS & OBJECT KEY

- **Temporary Test Submission ID:** `sub_d94e5cc6-ad98-4670-8d2a-02670730ac44`
- **Temporary Test Media Asset ID:** `med_160e7ff1-b5e1-4b64-802c-b3375a1505c5`
- **Exact R2 Object Key:** `media/submission/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/med_160e7ff1-b5e1-4b64-802c-b3375a1505c5/public_wm.webp`

---

## 15. CLEANUP CONFIRMATION

1. Executed `DELETE /api/customer/submissions/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/media/med_160e7ff1-b5e1-4b64-802c-b3375a1505c5` via `handleDeleteSubmissionMediaItem` -> returned `HTTP 200` (`photos: []`).
2. Deleted temporary submission `sub_d94e5cc6-ad98-4670-8d2a-02670730ac44` by exact primary key.
3. Verified R2 object deletion: `storage.exists('media/submission/sub_d94e5cc6-ad98-4670-8d2a-02670730ac44/med_160e7ff1-b5e1-4b64-802c-b3375a1505c5/public_wm.webp') === false`.
4. Verified PostgreSQL `media_assets` cleanup: `SELECT count(*)::int FROM media_assets WHERE id = 'med_160e7ff1-b5e1-4b64-802c-b3375a1505c5' OR entity_id = 'sub_d94e5cc6-ad98-4670-8d2a-02670730ac44'` returned `0`.
5. Verified PostgreSQL `property_submissions` cleanup: `SELECT count(*)::int FROM property_submissions WHERE id = 'sub_d94e5cc6-ad98-4670-8d2a-02670730ac44'` returned `0`.

---

## 16. CONFIRMATION OF NO UNAUTHORIZED PRODUCTION CHANGES

- No production deployment or git merge was executed.
- No production environment variables or credentials were modified.
- No production database DDL, schema changes, or migrations were executed.
- No existing customer submissions, media records, or R2 objects were modified or deleted.

---

## 17. REMAINING RISKS OR BLOCKED ITEMS

1. **External Production Deployment Pending Approval:** The code remediation in `src/db/schema.ts`, `src/domain/propertySubmission/mediaService.ts`, `src/domain/propertySubmission/mediaRouteHandlers.ts`, and `src/components/post-property/PostPropertyWizard.tsx` is active in the workspace and verified against the real database and R2 pipeline, but deploying the updated code to an external production hosting target requires a separately approved deployment step.
2. **Documentation Alignment Note:** `PROJECT_MASTER_KNOWLEDGE_BASE.md` and `.env.example` reference `greathomes-media` as an example bucket name, whereas the live Cloudflare R2 bucket and credentials use `greathomes-production`.
