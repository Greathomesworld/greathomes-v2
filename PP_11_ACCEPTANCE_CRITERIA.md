# GREAT HOMES V2 — PP-11 STEP 2
# ACCEPTANCE CRITERIA & RELEASE GATES

**Project:** Great Homes V2  
**Phase:** PP-11 (Step 2 — Acceptance Criteria)  
**Operating Mode:** STRICTLY READ-ONLY PLANNING  
**Date:** November 16, 2026  
**Status:** PREPARED FOR REVIEW & APPROVAL

---

## 1. Phase PP-11 Overall Acceptance Rules

Phase PP-11 can only receive a final **PASS** (or **CONDITIONAL** where external isolated cloud infrastructure is required) if all of the following gates are met without exception:

1. **Zero Security Bypass or Weakening:** No authentication, customer ownership check, staff RBAC capability check, rate-limiting rule, or fail-closed persistence guard may be weakened or bypassed to make a test pass.
2. **100% Pass Rate on Executable P0 & P1 Scenarios:** Every executable `P0` (Critical) and `P1` (High) test scenario in `PP_11_SECURITY_TEST_MATRIX.md` must pass with exit code `0`.
3. **100% Remediation of Baseline Findings (`MED-01`, `LOW-01`, `LOW-02`):** Each baseline finding from Step 1 must satisfy its specific functional and security acceptance criteria below and pass its dedicated verification test.
4. **Honest Environment Classification:** Mocked unit tests (`ENV-UNIT`), in-memory repository tests (`ENV-MEM-INT`), and simulated PostgreSQL concurrency tests (`ENV-SIM-PG`) must be clearly distinguished from live isolated PostgreSQL database tests (`ENV-PG-ISOLATED`). Any test requiring unavailable external infrastructure must be explicitly marked `BLOCKED`.
5. **Production Data Inviolability:** Zero queries, writes, schema changes, or object uploads may be executed against production Neon (`greathomes-production`) or production Cloudflare R2 (`greathomes-media`).
6. **Zero Build, Type, or Regression Failures:** TypeScript (`tsc --noEmit`), ESLint, database connection safety unit tests (`test-connection-validation.mjs`), and Next.js production build (`next build`) must all exit with code `0`.

---

## 2. Specific Acceptance Criteria for Step 1 Baseline Remediation Candidates

### Candidate 1: `MED-01` — Server-Side Magic-Number / Binary Signature Verification
- **Target Files:** `src/domain/propertySubmission/validation.ts`, `src/domain/propertySubmission/mediaService.ts`, `src/domain/propertySubmission/mediaRouteHandlers.ts` (and storage verification helpers).
- **Acceptance Criteria:**
  1. **Magic-Byte Inspection Function:** A deterministic, zero-dependency binary header validator (`verifyImageMagicBytes(buffer, declaredMimeType)`) inspects the initial bytes of uploaded/finalized image content:
     - `image/jpeg`: Starts with `FF D8 FF`
     - `image/png`: Starts with `89 50 4E 47 0D 0A 1A 0A`
     - `image/webp`: Starts with `52 49 46 46` (`RIFF`) at bytes `0..3` and `57 45 42 50` (`WEBP`) at bytes `8..11`
     - `image/avif`: Contains `66 74 79 70` (`ftyp`) at bytes `4..7` with major/compatible brand `avif` or `avis` or `mif1`
  2. **Polyglot & Spoof Rejection:** Files with valid extensions/MIME declarations (e.g., `evil.jpg` declared as `image/jpeg`) whose binary content is HTML (`<!DOCTYPE` / `<html` / `<script`), SVG (`<svg` / `<?xml`), PDF (`%PDF-`), GIF (`GIF89a`), ELF (`7F 45 4C 46`), PE (`4D 5A`), or random non-image bytes are strictly rejected with HTTP `400`/`422` (`INVALID_IMAGE_BINARY_SIGNATURE`).
  3. **Finalization Enforcement:** During media finalization (`POST /api/customer/submissions/[id]/media/complete` or upload verification), if binary signature verification fails, no `media_assets` or `property_submission_media` record is created, and any unverified object in storage is deleted/aborted.
  4. **Verification Test:** Verified by `PP11-MEDIA-01` (valid JPEG/PNG/WebP/AVIF buffers accepted) and `PP11-MEDIA-03` (spoofed HTML/SVG/EXE/PDF buffers disguised as `.jpg`/`.png` rejected).

### Candidate 2: `LOW-01` — Customer Session Expiry UX Notification
- **Target Files:** `src/components/post-property/PostPropertyWizard.tsx` (and customer submission API client calls).
- **Acceptance Criteria:**
  1. **HTTP `401` Interception in Wizard:** When any background draft save, step save, media upload presign/finalization, or final submit call in `PostPropertyWizard.tsx` receives HTTP `401 Unauthorized` (session expired or invalidated):
     - The wizard **does not** silently fail or wipe the user's current in-memory form state.
     - Current unsaved form state is preserved locally (e.g., `sessionStorage` draft recovery snapshot keyed by submission/draft context) so no typed input is lost.
     - A clear, accessible session-expiry alert banner/modal is displayed informing the customer that their session has expired and providing a direct action to re-authenticate and resume.
  2. **Proactive / Graceful Handling:** Users are never left clicking "Save & Continue" repeatedly with a generic network error when the root cause is an expired session.
  3. **Verification Test:** Verified by `PP11-AUTH-03`.

### Candidate 3: `LOW-02` — Consistent Wizard Step Transition Scroll Reset
- **Target Files:** `src/components/post-property/PostPropertyWizard.tsx`.
- **Acceptance Criteria:**
  1. **Unified Step Scroll Helper:** Every step change in `PostPropertyWizard.tsx`—including clicking "Continue / Next Step", "Back / Previous Step", clicking a completed step in the top/mobile step progress bar, or transitioning to the confirmation/review view—invokes a unified scroll-to-top helper (`scrollToWizardTop()`).
  2. **Mobile & Desktop Viewport Coverage:** Resets both `window.scrollTo({ top: 0, behavior: 'smooth' })` and the wizard container element (`wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`) safely within a `typeof window !== 'undefined'` guard.
  3. **Verification Test:** Verified by `PP11-UX-04` at `390x844` mobile and `1440x900` desktop viewports.

---

## 3. Domain-by-Domain Acceptance Criteria Summary

| Domain | Mandatory Acceptance Criteria |
| :--- | :--- |
| **A. Authentication & Authorization** | • 100% of unauthenticated requests to `/api/customer/submissions*` and `/api/admin/property-submissions*` return `401`.<br>• 100% of cross-customer IDOR attempts (`GET`, `PATCH`, `POST /submit`, `POST /resubmit`, media operations) return `403` or `404` with zero data mutation.<br>• Staff RBAC strictly enforces `submissions:read`, `submissions:verify`, and `submissions:publish` capabilities.<br>• Customer cookies are never accepted on `/api/admin/*` routes. |
| **B. Media Security** | • Only `image/jpeg`, `image/png`, `image/webp`, and `image/avif` within configured size and per-submission count limits are accepted.<br>• Server-side magic-number inspection (`MED-01`) rejects polyglot or spoofed non-image files.<br>• Composite FK `(submission_id, submitter_customer_id)` and ownership checks prevent cross-customer media attachment.<br>• Media cannot be added, reordered, or deleted when a submission is in `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, or `PUBLISHED` status. |
| **C. Property Submission** | • Both `OWNER` and `CHANNEL_PARTNER` submissions require explicit legal/consent declarations (`PP04B-F04`) before transitioning to `SUBMITTED`.<br>• Invalid pricing, area ratios (`carpetArea > builtUpArea`), and out-of-bounds coordinates are rejected.<br>• Concurrent `/submit` and `PATCH` requests are serialized via row locks without duplicate audit logs or corrupted JSONB payloads. |
| **D. Property Lifecycle** | • Only canonical state transitions (`DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED/CHANGES_REQUESTED`, `APPROVED -> PUBLISHED <-> DEACTIVATED`) are permitted.<br>• Publication atomically creates/updates exactly 1 live `resale_listings` or `rental_listings` row linked via partial unique index (`uq_resale_listing_submission` / `uq_rental_listing_submission`).<br>• Deactivation immediately removes the listing from public discovery.<br>• Public listing payloads never leak submitter phone, email, `submitter_customer_id`, or internal staff notes. |
| **E. Concurrency & Persistence** | • When PostgreSQL is unavailable in production/postgres mode, all routes fail closed with HTTP `503` (`PERSISTENCE_UNAVAILABLE`) and never fall back to in-memory Maps.<br>• All repository methods return rejected Promises on persistence failure even when invoked before `await` (`P-01`).<br>• Public enquiries and site visits enforce `uq_enquiries_idempotency_key` and `uq_site_visits_active_enquiry_slot`.<br>• Proxy headers (`cf-ray`, `x-vercel-forwarded-for`, `x-forwarded-for`) are ignored unless provenance is verified via timing-safe secret or explicit ingress enforcement flag. |
| **F. Customer Experience** | • Complete Owner and Partner wizard journeys, draft save/resume, and My Property Submissions dashboard render with zero console/hydration errors.<br>• Zero horizontal overflow across `360x800`, `390x844`, `768x1024`, and `1440x900`.<br>• `LOW-01` (session expiry UX) and `LOW-02` (step transition scroll reset) verified.<br>• 100% compliance with Great Homes V2 Typography Lock (`Fjalla One`, `Plus Jakarta Sans`, `Inter`). |
| **G. Platform Regression** | • 100% pass rate across all existing Phase 01–10 regression suites (`test-phase-07.mjs`, `test-pp-02` through `test-pp-10c2`, `test-visitor-customer-360.mjs`, `test-customer-otp.mjs`, `test-seo-governance.ts`, `test-connection-validation.mjs`, `tsc --noEmit`, `eslint`, and `next build`). |
