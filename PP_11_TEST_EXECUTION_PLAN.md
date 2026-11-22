# GREAT HOMES V2 — PP-11 STEP 2
# TEST EXECUTION PLAN & INFRASTRUCTURE STRATEGY

**Project:** Great Homes V2  
**Phase:** PP-11 (Step 2 — Test Execution Plan)  
**Operating Mode:** STRICTLY READ-ONLY PLANNING  
**Date:** November 16, 2026  
**Status:** PREPARED FOR REVIEW & APPROVAL

---

## 1. Executive Prioritization Model (P0 / P1 / P2 / P3)

All 60 scenarios in `PP_11_SECURITY_TEST_MATRIX.md` are grouped into four ordered execution tiers. No lower-priority tier can compensate for a failure in `P0`.

### Priority Tier Breakdown

| Priority Tier | Definition & Gate Policy | Scenario Count | Included Test IDs |
| :--- | :--- | :---: | :--- |
| **P0 — Critical Security & Data Integrity** | Mandatory release blockers covering authentication, IDOR prevention, staff RBAC privilege boundaries, server-side binary signature verification (`MED-01`), legal declaration gates, state-machine locks, PII non-leakage, fail-closed persistence (`503`), database concurrency constraints, distributed rate limiting, and TypeScript/build gates. **100% of executable P0 tests must PASS.** | **26** | `PP11-AUTH-01`, `PP11-AUTH-02`, `PP11-AUTH-04`, `PP11-AUTH-05`, `PP11-AUTH-06`, `PP11-AUTH-07`, `PP11-MEDIA-02`, `PP11-MEDIA-03`, `PP11-MEDIA-04`, `PP11-MEDIA-06`, `PP11-MEDIA-07`, `PP11-SUB-03`, `PP11-SUB-05`, `PP11-SUB-09`, `PP11-LIFE-04`, `PP11-LIFE-05`, `PP11-LIFE-06`, `PP11-LIFE-07`, `PP11-LIFE-09`, `PP11-CONC-01`, `PP11-CONC-02`, `PP11-CONC-03`, `PP11-CONC-05`, `PP11-CONC-06`, `PP11-CONC-07`, `PP11-REG-08` |
| **P1 — Core Customer & Admin Journeys** | End-to-end functional workflows for Owner and Channel Partner submissions, draft save/resume, `CHANGES_REQUESTED` revision loops, admin review transitions (`UNDER_REVIEW -> APPROVED / REJECTED`), audit trail completeness, media format/size bounds, pre-signed URL confinement, staff session revocation, and SSR hydration integrity. | **21** | `PP11-AUTH-08`, `PP11-MEDIA-01`, `PP11-MEDIA-05`, `PP11-MEDIA-08`, `PP11-MEDIA-09`, `PP11-SUB-01`, `PP11-SUB-02`, `PP11-SUB-04`, `PP11-SUB-06`, `PP11-SUB-07`, `PP11-SUB-08`, `PP11-LIFE-01`, `PP11-LIFE-02`, `PP11-LIFE-03`, `PP11-LIFE-08`, `PP11-CONC-04`, `PP11-CONC-08`, `PP11-UX-01`, `PP11-UX-02`, `PP11-UX-05`, `PP11-UX-08` |
| **P2 — UX, Responsive Behaviour & Hardening** | Customer session expiry notification (`LOW-01`), consistent wizard step scroll reset (`LOW-02`), mobile/tablet/desktop viewport geometry (`360x800`, `390x844`, `768x1024`, `1440x900`), media upload progress/error UI, inline step validation UX, and canonical Great Homes V2 typography lock compliance. | **6** | `PP11-AUTH-03`, `PP11-UX-03`, `PP11-UX-04`, `PP11-UX-06`, `PP11-UX-07`, `PP11-UX-09` |
| **P3 — Platform Regression & Supplementary Checks** | Full regression verification across existing Phase 01–10 modules: Customer OTP & phone-change security, Staff Auth & Phase 07 248-assertion suite, CRM Enquiries & Visitor/Customer 360, Site Visits (`PP-10B`/`10C`/`10C2`), Discovery/Search/Locations/SEO, Project Detail pages, and Admin Workspace (`PP-08`/`PP-09`). | **7** | `PP11-REG-01`, `PP11-REG-02`, `PP11-REG-03`, `PP11-REG-04`, `PP11-REG-05`, `PP11-REG-06`, `PP11-REG-07` |
| **TOTAL** | **All PP-11 Security, QA & E2E Scenarios** | **60** | **60 Scenarios Across Domains A–G** |

---

## 2. Scenario Distribution by Required Environment

| Environment Code | Environment Description | Scenario Count | Execution Mode in Step 3 |
| :--- | :--- | :---: | :--- |
| **`ENV-UNIT`** | Pure unit, Zod validation, magic-byte parser, and static compiler/linter checks (`DATABASE_URL=""`) | **10** | Automated via Node/TSX & `tsc --noEmit` / `eslint` |
| **`ENV-MEM-INT`** | Isolated in-memory repository & API route integration tests (`NODE_ENV=test`, `DATABASE_URL=""`) | **36** | Automated via `npx tsx scripts/test-pp-11-*.ts` |
| **`ENV-SIM-PG`** | Simulated multi-connection PostgreSQL concurrency & rollback cluster (`DATABASE_URL=""`) | **8** | Automated via `npx tsx` concurrency harness |
| **`ENV-PG-ISOLATED`** | Live isolated disposable PostgreSQL branch (`TEST_DATABASE_URL` + `ALLOW_DISPOSABLE_DB_TESTS=1`) | **17** *(shared dual-mode with `ENV-MEM-INT`/`ENV-SIM-PG`, 1 exclusive raw FK test `PP11-MEDIA-07`)* | Executed **only** if isolated non-production `TEST_DATABASE_URL` is provisioned; otherwise explicitly marked `BLOCKED` |
| **`ENV-R2-SANDBOX`** | Isolated R2 sandbox or mocked S3 client verifier | **3** *(shared dual-mode with `ENV-MEM-INT`/`ENV-UNIT`)* | Verified via mocked S3/R2 adapter in container; live R2 bucket upload marked `BLOCKED` if sandbox credentials absent |
| **`ENV-BROWSER-E2E`** | Headless Playwright browser E2E & multi-viewport responsive inspection against local dev server (`localhost:3000`) | **11** | Automated via Playwright script against isolated local dev server |

*(Note: Several scenarios run in dual environments—first in `ENV-MEM-INT` / `ENV-SIM-PG` for deterministic logic verification, and second in `ENV-PG-ISOLATED` when an isolated PostgreSQL branch is available).*

---

## 3. Phased Execution Sequence (For Step 3 Implementation & Verification)

Once Step 2 is reviewed and approved, Step 3 will execute in the following strict order:

### Stage 3.1 — Baseline Remediation Implementation (Isolated Workspace Only)
1. **`MED-01` (Server-Side Magic-Number Verification):**
   - Enhance `src/domain/propertySubmission/validation.ts` and `src/domain/propertySubmission/mediaService.ts` (and `src/infrastructure/storage/r2Storage.ts` / media finalization handler) to inspect actual binary header signatures (`FF D8 FF` for JPEG, `89 50 4E 47 0D 0A 1A 0A` for PNG, `RIFF....WEBP` for WebP, `....ftypavif` / `....ftypavis` for AVIF) during upload verification/finalization, rejecting mismatched or polyglot payloads (`PP11-MEDIA-03`).
2. **`LOW-01` (Customer Session Expiry Notification):**
   - Enhance `src/components/post-property/PostPropertyWizard.tsx` to detect `401 Unauthorized` responses during draft save, media upload, or step submission, preserving current form state in client memory/storage and surfacing a clear session-expired banner/modal prompting re-authentication (`PP11-AUTH-03`).
3. **`LOW-02` (Consistent Wizard Scroll Reset):**
   - Audit and unify all step transitions (Next, Back, direct step indicator click, validation error jump, and draft resume) in `src/components/post-property/PostPropertyWizard.tsx` so viewport and wizard container scroll position reliably resets to the top (`PP11-UX-04`).

### Stage 3.2 — Automated Unit & In-Memory Integration Suite (`ENV-UNIT`, `ENV-MEM-INT`, `ENV-SIM-PG`)
- Execute existing and newly created PP-11 verification scripts with `DATABASE_URL=""` and `TEST_DATABASE_URL=""`:
  1. `node scripts/test-connection-validation.mjs` (Safety gate verification)
  2. `npx tsx scripts/test-pp-11-security-qa.ts` (Dedicated PP-11 suite covering `PP11-AUTH-*`, `PP11-MEDIA-*`, `PP11-SUB-*`, `PP11-LIFE-*`, `PP11-CONC-*`)
  3. Existing Post Property suites:
     - `scripts/test-property-submission-foundation.ts` (`PP-02`)
     - `scripts/test-post-property-entry.ts` (`PP-03`)
     - `scripts/test-pp-04-wizard.ts` (`PP-04`)
     - `scripts/test-pp-04b-security-regression.ts` (`PP-04B`)
     - `scripts/test-pp-05-property-engine.ts` (`PP-05`)
     - `scripts/test-pp-06-image-management.ts` (`PP-06`)
     - `scripts/test-pp-07-my-properties-resume.ts` (`PP-07`)
     - `scripts/test-pp-08-admin-verification-workspace.ts` (`PP-08`)
     - `scripts/test-pp-09-approval-publication.ts` (`PP-09`)
     - `scripts/test-pp-10-enquiry-crm-integration.ts` (`PP-10`)
     - `scripts/test-pp-10b-remediation.ts` (`PP-10B`)
     - `scripts/test-pp-10c-remediation.ts` (`PP-10C`)
     - `scripts/test-pp-10c2-remediation.ts` (`PP-10C2`)

### Stage 3.3 — Browser E2E & Multi-Viewport Responsive Verification (`ENV-BROWSER-E2E`)
- Run headless Playwright E2E and responsive checks against the local development server (`http://localhost:3000`) across viewports `360x800`, `390x844`, `768x1024`, and `1440x900` to verify `PP11-UX-01` through `PP11-UX-09` and `PP11-AUTH-03`.

### Stage 3.4 — Platform Regression, Typecheck, Lint & Production Build (`PP11-REG-01`–`08`)
- Run Customer 360, OTP isolation, Staff Auth, Phase 07 (248 checks), SEO governance, `tsc --noEmit`, `eslint`, and `next build`.

### Stage 3.5 — Isolated PostgreSQL Execution (`ENV-PG-ISOLATED`)
- Run `scripts/test-connection-validation.mjs` first.
- **Only if** a verified non-production disposable database (`TEST_DATABASE_URL` with a compute hostname distinct from production and `ALLOW_DISPOSABLE_DB_TESTS=1`) is available, execute live PostgreSQL concurrency and constraint tests.
- If no isolated disposable PostgreSQL instance is provisioned in the container, record `ENV-PG-ISOLATED` live database execution as `BLOCKED` in the test report while reporting `ENV-MEM-INT` and `ENV-SIM-PG` results accurately under their true environment classification.

---

## 4. Missing Infrastructure & External Dependencies Identified

| Infrastructure Component | Current Availability in AI Studio Container | Impact on PP-11 Test Execution | Required Action / Mitigation |
| :--- | :--- | :--- | :--- |
| **1. Isolated Disposable PostgreSQL Branch (`ENV-PG-ISOLATED`)** | **UNAVAILABLE / UNCONFIGURED** (`TEST_DATABASE_URL` is either unset or previously pointed to production `greathomes-production`, which is strictly off-limits for destructive/write testing). | Live PostgreSQL multi-process concurrency and raw FK constraint tests (`PP11-MEDIA-07`, live DB mode of `PP11-CONC-01`–`05`, `PP11-CONC-07`) cannot be run against production. | Must be marked **`BLOCKED (Isolated Test DB Required)`** for live PostgreSQL mode unless a separate disposable Neon branch URL is supplied with `ALLOW_DISPOSABLE_DB_TESTS=1`. In-memory and simulated PostgreSQL harnesses (`ENV-MEM-INT`, `ENV-SIM-PG`) will verify all application logic. |
| **2. Isolated Cloudflare R2 Sandbox Bucket (`ENV-R2-SANDBOX`)** | **UNAVAILABLE IN CONTAINER** (Production R2 bucket `greathomes-media` must never be polluted with test objects). | Live network round-trips to Cloudflare R2 via pre-signed URLs cannot be executed against production storage. | Pre-signed URL generation, header signing, key-prefix confinement, and server-side magic-number buffer verification (`MED-01`) will be verified using deterministic buffer streams and storage adapter tests (`ENV-UNIT` / `ENV-MEM-INT`). Live R2 network upload will be marked **`BLOCKED (R2 Sandbox Bucket Required)`**. |
| **3. External Edge / Proxy Firewall (`Cloudflare / Vercel Edge`)** | **EXTERNAL TO CONTAINER** | Network-level mTLS / IP firewall blocking direct-to-origin traffic cannot be tested from inside the container. | Application-layer provenance verification (`RL-01-ARCH`, `RL-01`) is 100% testable in `ENV-UNIT` / `ENV-MEM-INT`. |
