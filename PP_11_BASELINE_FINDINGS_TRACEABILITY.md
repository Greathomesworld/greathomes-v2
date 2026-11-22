# GREAT HOMES V2 — PP-11 STEP 2
# BASELINE FINDINGS & ARCHITECTURAL INVARIANTS TRACEABILITY MATRIX

**Project:** Great Homes V2  
**Phase:** PP-11 (Step 2 — Baseline Findings Traceability)  
**Operating Mode:** STRICTLY READ-ONLY PLANNING  
**Date:** November 16, 2026  
**Status:** PREPARED FOR REVIEW & APPROVAL

---

## 1. Bi-Directional Traceability: Step 1 Baseline Remediation Candidates

Every remediation candidate identified in `PP_11_BASELINE_SECURITY_QA_AUDIT.md` (Step 1) is mapped below to its target source files, priority tier, test scenario ID(s) in `PP_11_SECURITY_TEST_MATRIX.md`, and formal acceptance criteria in `PP_11_ACCEPTANCE_CRITERIA.md`.

| Baseline Finding ID | Domain & Severity | Finding Summary | Target Source File(s) (For Step 3) | Mapped Test ID(s) | Priority Tier | Required Environment(s) | Verification & Acceptance Gate |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **`MED-01`** | **Domain B: Media Security**<br>*(Medium — Security Hardening)* | Client-side and pre-sign validation check file extensions and declared MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/avif`), but post-upload finalization lacked deep binary magic-number signature verification against polyglot or spoofed payloads. | • `src/domain/propertySubmission/validation.ts`<br>• `src/domain/propertySubmission/mediaService.ts`<br>• `src/domain/propertySubmission/mediaRouteHandlers.ts` | • **`PP11-MEDIA-03`** *(Primary spoof/polyglot rejection)*<br>• **`PP11-MEDIA-01`** *(Valid binary signature pass)*<br>• **`PP11-MEDIA-02`** *(MIME/ext rejection)* | **P0 (Critical)** | `ENV-UNIT`, `ENV-MEM-INT`, `ENV-R2-SANDBOX` | Server inspects binary header bytes (`FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`, `ftypavif`/`avis`); rejects HTML/SVG/EXE/PDF disguised as images with `400`/`422`; prevents `media_assets` creation. |
| **`LOW-01`** | **Domain A: Auth & Authz / Domain F: UX**<br>*(Low — UX & Session Continuity)* | Customer sessions rely on HttpOnly cookies (`gh_customer_session`); if a session expires while a customer is filling out the multi-step Post Property wizard, API `401` responses lacked a dedicated session-expiry recovery banner/modal and local form-state preservation snapshot. | • `src/components/post-property/PostPropertyWizard.tsx` | • **`PP11-AUTH-03`** *(Primary session expiry UX)*<br>• **`PP11-AUTH-02`** *(Backend `401` enforcement)* | **P2 (Medium)** | `ENV-BROWSER-E2E`, `ENV-MEM-INT` | On `401 Unauthorized` during draft save or step submit, wizard preserves current form state locally and displays an explicit session-expiry recovery banner/modal with re-authentication CTA. |
| **`LOW-02`** | **Domain F: Customer Experience**<br>*(Low — Mobile & Wizard UX)* | On deep mobile viewports (`360x800`, `390x844`), certain wizard step transitions (such as step-bar jumps or validation recovery) did not consistently reset scroll position to the top of the wizard container. | • `src/components/post-property/PostPropertyWizard.tsx` | • **`PP11-UX-04`** *(Primary scroll reset check)*<br>• **`PP11-UX-03`** *(Multi-viewport layout check)* | **P2 (Medium)** | `ENV-BROWSER-E2E` | 100% of forward, backward, and step-indicator transitions invoke unified `scrollToWizardTop()`, resetting window and container scroll offset to top. |

---

## 2. Traceability of Historical Post Property Security & Concurrency Invariants (`PP-01`–`PP-10C6`)

To guarantee zero regression on previously remediated findings across `PP-04B`, `PP-08A`, `PP-09A`, `PP-10B`, `PP-10C`, and `PP-10C2`–`10C6`, every core architectural invariant is also traced to explicit PP-11 test scenarios:

| Invariant / Prior Audit ID | Source Phase | Architectural Invariant Description | Enforcing Source File(s) | Mapped PP-11 Test ID(s) | Priority Tier |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **`PP04B-F01` / `P-01` / `P-02`** | `PP-04B` / `PP-10B` / `PP-10C2` | Fail-closed persistence guard (`503 PERSISTENCE_UNAVAILABLE`); zero silent fallback to in-memory Maps outside `NODE_ENV=test`; all repository methods reject asynchronously as Promises. | `src/lib/persistenceGuard.ts`, `src/domain/propertySubmission/repository.ts`, `src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts` | `PP11-CONC-06`, `PP11-REG-04` | **P0** |
| **`PP04B-F02` / `IDOR-01`** | `PP-03` / `PP-04B` / `PP-06` | Strict customer ownership isolation (`submitter_customer_id = customerId`) across draft read, patch, submit, resubmit, and media attachment, plus composite FK `fk_submission_media_owner_consistency`. | `src/domain/propertySubmission/repository.ts`, `src/domain/propertySubmission/mediaService.ts`, `src/db/client.ts` | `PP11-AUTH-04`, `PP11-MEDIA-06`, `PP11-MEDIA-07`, `PP11-SUB-09` | **P0** |
| **`PP04B-F04`** | `PP-04B` / `PP-05` | Mandatory canonical legal & consent declarations for both `OWNER` (`isDirectOwner`, `termsAccepted`) and `CHANNEL_PARTNER` (`hasOwnerAuthorization`, `ownerConsentConfirmed`). | `src/domain/propertySubmission/validation.ts`, `src/domain/propertySubmission/service.ts` | `PP11-SUB-01`, `PP11-SUB-02`, `PP11-SUB-03` | **P0** |
| **`PP04B-F05`** | `PP-04B` / `PP-08` / `PP-09` | Strict lifecycle state machine transitions with row-level `SELECT ... FOR UPDATE` locking and 1:1 partial unique indexes (`uq_resale_listing_submission`, `uq_rental_listing_submission`). | `src/domain/propertySubmission/repository.ts`, `src/domain/propertySubmission/service.ts`, `src/db/schema.ts` | `PP11-LIFE-01`–`08`, `PP11-SUB-05`, `PP11-CONC-01` | **P0** |
| **`RBAC-01`** | `PP-08` / `PP-09` | Staff capability enforcement (`submissions:read`, `submissions:verify`, `submissions:publish`) and strict rejection of customer tokens on `/api/admin/*`. | `src/lib/staffAuth.ts`, `src/domain/auth/capabilities.ts`, `src/domain/propertySubmission/staffSubmissionRouteHandlers.ts` | `PP11-AUTH-06`, `PP11-AUTH-07`, `PP11-AUTH-08`, `PP11-REG-02`, `PP11-REG-07` | **P0** |
| **`PII-01`** | `PP-09` / `PP-10` | Submitter PII protection: public resale/rental endpoints never expose owner/partner phone numbers, emails, `submitter_customer_id`, or internal verification notes. | `src/domain/propertySubmission/service.ts`, `src/infrastructure/repositories/postgres/resaleRepositoryPostgres.ts` | `PP11-LIFE-09`, `PP11-REG-03` | **P0** |
| **`I-01-IDEM`** | `PP-10B` | Durable PostgreSQL enquiry idempotency (`uq_enquiries_idempotency_key`) and `409 Conflict` on payload mismatch with reused key. | `src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts`, `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql` | `PP11-CONC-02`, `PP11-REG-04` | **P0** |
| **`I-02-CONC` & `MIG-0010-IDX`** | `PP-10C2` / `PP-10C5` / `PP-10C6` | Active site-visit slot uniqueness via parent enquiry `SELECT ... FOR UPDATE` lock and partial unique index `uq_site_visits_active_enquiry_slot` on `(enquiry_id, preferred_date, preferred_time_window, visit_type) WHERE status <> 'CANCELLED'`. | `src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts`, `drizzle/0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql` | `PP11-CONC-03`, `PP11-CONC-05`, `PP11-REG-04` | **P0** |
| **`RL-01-ARCH` & `RL-01`** | `PP-10C` / `PP-10C2` | Distributed PostgreSQL rate limiting (`rate_limit_buckets`), timing-safe origin shared secret verification (`constantTimeSecretEquals`), and `TRUSTED_PROXY_COUNT` right-to-left hop extraction without `x-forwarded-for` fallthrough. | `src/lib/requestContext.ts`, `src/lib/rateLimit.ts` | `PP11-CONC-07`, `PP11-REG-04` | **P0** |

---

## 3. Traceability Completeness Check

- **Total Baseline Findings Mapped:** 3 / 3 (`MED-01`, `LOW-01`, `LOW-02` — 100% covered)
- **Total Prior Phase Security Invariants Mapped:** 9 / 9 (`PP-01` through `PP-10C6` — 100% covered)
- **Total Test Matrix Scenarios Mapped:** 60 / 60 (`PP11-AUTH-01` through `PP11-REG-08` — 100% covered)
- **Unmapped Findings or Orphan Requirements:** 0
