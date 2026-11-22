# GREAT HOMES V2 — PP-10C
## TARGETED SECURITY & PERSISTENCE REMEDIATION REPORT

**Phase:** PP-10C (Targeted Security & Persistence Remediation)  
**Target:** Remediation of all confirmed PP-10B1 verification findings (`P-01`, `P-02`, `RL-01`, `RL-02`, `RL-03`, `RL-04`, `I-02`, `CRM-01`, and test regressions)  
**Operating Mode:** Isolated development workspace (`/app/applet`)  
**Production Access / Deployment:** NONE (Strictly Prohibited)  
**Final Readiness Verdict:** **CONDITIONAL — implementation complete, external verification still required**

---

## 1. Executive Summary

This report documents the implementation and verification of **PP-10C**, remediating the architectural, persistence, proxy provenance, site-visit atomicity, CRM status compatibility, and regression findings identified during the independent **PP-10B1** verification audit:

1. **`P-01` (Critical — Unauthorized `globalThis` Memory Persistence Fallbacks Removed):**
   - Refactored `src/domain/enquiry/repositories/enquiryRepository.ts` (`EnquiryRepositoryMemory` & `GuardedEnquiryRepository`) and `src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts` (`SiteVisitRepositoryMemory`, `SiteVisitRepositoryPostgres`, & `GuardedSiteVisitRepository`) to enforce the canonical PP-04B fail-closed persistence guard (`resolveGuardedPersistenceBackend` / `runWithPersistenceGuard`).
   - Updated `src/db/client.ts` (`isPostgresRequired()` and `getDb()`) to align with `isPreviewOrProductionEnvironment()`, ensuring both Preview (`VERCEL_ENV=preview`) and Production (`NODE_ENV=production` / `VERCEL_ENV=production`) strictly require PostgreSQL and reject `PERSISTENCE_PROVIDER=memory` with `PersistenceUnavailableError` (HTTP `503`).
   - Removed all silent `catch` fallbacks from `SiteVisitRepositoryPostgres` to `SiteVisitRepositoryMemory`.
2. **`P-02` (Medium — Consistent HTTP 503 Handling Across 12 Secondary API Routes):**
   - Added explicit `isPersistenceUnavailableError(err)` -> HTTP `503` (`{ code: 'PERSISTENCE_UNAVAILABLE' }`) handling across all 12 secondary resale, rental, project-inventory, and public discovery API routes (`22` route handlers verified).
3. **`RL-01` to `RL-04` (High/Medium — Proxy Provenance, Right-to-Left Hop Selection, IPv4-Mapped IPv6 Canonicalization & Dev Rate-Limit Guard):**
   - Hardened `src/lib/requestContext.ts`:
     - **`RL-01`:** `x-vercel-forwarded-for`, `cf-connecting-ip`, `x-forwarded-for`, and `x-real-ip` are ignored by default unless explicit proxy provenance (`TRUST_VERCEL_PROXY=true` with verified `VERCEL=1`, `VERCEL_ENV`, and `x-vercel-id`; `TRUST_CLOUDFLARE_PROXY=true` with valid `cf-ray` and `x-forwarded-for`; or `TRUST_REVERSE_PROXY=true`) is active.
     - **`RL-02`:** Strict `getTrustedProxyCount()` validation (`/^\d+$/` in `[0..10]`, failing closed to `0` on empty/malformed/negative/float/out-of-range strings) and strict right-to-left hop walking (`selectRightToLeftHop`) without pre-filtering invalid hops or clamping to index `0`.
     - **`RL-03`:** Canonicalization of all IPv4-mapped IPv6 representations (compressed dotted-quad `::ffff:192.0.2.1`, expanded dotted-quad `0:0:0:0:0:ffff:192.0.2.1`, and hex-word `::ffff:c000:0201` / `0:0:0:0:0:ffff:c000:201`) to canonical IPv4 (`192.0.2.1`) so all forms share the exact same SHA-256 rate-limit bucket.
     - **`RL-04`:** Removed unconditional local-development memory fallback in `src/lib/rateLimit.ts`; local development without PostgreSQL now fails closed (`RateLimitUnavailableError` -> HTTP `503`) unless `ALLOW_DEV_MEMORY_RATE_LIMIT=true` is explicitly set (and is strictly forbidden in Preview/Production).
4. **`I-02` (High — Standalone `POST /api/site-visits` Atomicity & Durable Idempotency):**
   - Implemented `SiteVisitRepositoryPostgres.createStandaloneTransactional()` executing inside a single `db.transaction(async (tx) => ...)` that verifies the parent enquiry exists (`SiteVisitEnquiryNotFoundError` -> HTTP `404`), checks/inserts the site visit using a deterministic server-derived primary key (`deriveDeterministicSiteVisitId(idempotencyKey)`), and updates `enquiries.site_visit_id` + `status = 'SITE_VISIT_SCHEDULED'` atomically before commit.
   - Updated `SiteVisitService.createSiteVisitWithMeta()` and `POST /api/site-visits` to emit `CREATE_SITE_VISIT` audit events only after transaction commit and only when `created === true` (`201 Created` on initial creation, `200 OK` with `deduplicated: true` on replay).
5. **`CRM-01` (Medium — CRM Status Alias Compatibility):**
   - Updated `EnquiryRepositoryMemory.list()` and `EnquiryRepositoryPostgres.list()` so filtering by `NEW` or `RECEIVED` matches both `NEW` and `RECEIVED` records (`inArray(enquiries.status, ['NEW', 'RECEIVED'])`), and filtering by `QUALIFIED` or `IN_REVIEW` matches both `QUALIFIED` and `IN_REVIEW` records (`inArray(enquiries.status, ['QUALIFIED', 'IN_REVIEW'])`), without mutating stored enquiry statuses. Updated `/app/admin/enquiries/page.tsx` filter labels to `New / Received` and `Qualified / In Review`.
6. **`I-01` (Blocker — Live Isolated PostgreSQL Concurrency Verification):**
   - Both `DATABASE_URL` and `TEST_DATABASE_URL` in this container environment point to the production Neon database (`/greathomes-production`), and no local PostgreSQL server binary (`postgres` / `initdb` / `docker`) is installed in the container image. Per PP-10C §1 and §7, live concurrency testing against `/greathomes-production` is strictly prohibited and `I-01` is recorded as **`BLOCKED`**.

---

## 2. Workspace and Boundary Confirmation

- **Confirmed Workspace Root:** `/app/applet`
- **Git Metadata Disclosure:** `.git` directory is unavailable in `/app/applet`. In accordance with PP-10C §1 mandatory operating boundaries, branch isolation and commit history cannot be independently verified via Git metadata, and no replacement `.git` repository was initialized.
- **Strict Non-Interference Confirmation:**
  - Zero connections, queries, or migrations were executed against Neon Production (`/greathomes-production`).
  - Zero operations were performed against Cloudflare R2 or Vercel production deployments.
  - All existing PP-01 through PP-10B1 audit and verification reports remain unmodified.

---

## 3. Remediation Summary Table

| Item ID | Severity | Description | Status | Verification Evidence |
|---|---|---|---|---|
| **P-01** | Critical | Remove unauthorized `globalThis` memory persistence fallbacks in `enquiryRepository.ts` & `siteVisitRepositoryPostgres.ts`; align `src/db/client.ts` with Preview/Prod guard | **RESOLVED** | `test-pp-10c-remediation.ts` (`P-01.1`–`P-01.4`: PASS) |
| **P-02** | Medium | Return sanitized HTTP `503` (`PERSISTENCE_UNAVAILABLE`) across all 12 secondary resale, rental, project, and discovery routes | **RESOLVED** | `test-pp-10c-remediation.ts` (`P-02.1`: all 22 handlers across 12 routes PASS) |
| **RL-01** | High | Gate `x-vercel-forwarded-for`, `cf-connecting-ip`, `x-forwarded-for`, and `x-real-ip` behind explicit verified proxy provenance | **RESOLVED** | `test-pp-10c-remediation.ts` (`RL-01`: PASS) |
| **RL-02** | High | Strict `TRUSTED_PROXY_COUNT` validation & right-to-left hop walking without pre-filtering invalid entries or clamping to index `0` | **RESOLVED** | `test-pp-10c-remediation.ts` (`RL-02`: PASS) |
| **RL-03** | Medium | Normalize all IPv4-mapped IPv6 forms (compressed/expanded dotted-quad and hex-word) to canonical IPv4 | **RESOLVED** | `test-pp-10c-remediation.ts` (`RL-03`: 8/8 forms normalize to `192.0.2.1`) |
| **RL-04** | Medium | Require explicit `ALLOW_DEV_MEMORY_RATE_LIMIT=true` for local dev memory rate limiting; forbid in Preview/Production | **RESOLVED** | `test-pp-10c-remediation.ts` (`RL-04`: PASS) |
| **I-01** | Blocker | Multi-process concurrency verification against an isolated PostgreSQL instance | **BLOCKED** | Container `DATABASE_URL` & `TEST_DATABASE_URL` point to `/greathomes-production`; blocked by safety gate (`exit code 2`) |
| **I-02** | High | Make standalone `POST /api/site-visits` atomic and idempotent in PostgreSQL with post-commit single audit emission | **RESOLVED** | `test-pp-10c-remediation.ts` (`I-02.1`–`I-02.3`: PASS) |
| **CRM-01** | Medium | Reconcile `NEW`/`RECEIVED` and `QUALIFIED`/`IN_REVIEW` status filtering with KPI metrics without mutating stored statuses | **RESOLVED** | `test-pp-10c-remediation.ts` (`CRM-01.1`: PASS) |
| **REG-01** | High | Resolve regressions in `test-phase-07.mjs` (`R204`, `R207`, `S215`, `S216`) and `test-visitor-customer-360.mjs` (`DB_INIT.1`) | **RESOLVED** | `test-phase-07.mjs` (`248/248 PASS`), `test-visitor-customer-360.mjs` (`63/63 PASS`) |

---

## 4. File-by-File Changes

### Core Persistence, Database Client & Repositories (`P-01`, `I-02`, `CRM-01`)
1. **`src/db/client.ts`**
   - Updated `isPostgresRequired()` to return `isPreviewOrProductionEnvironment() || process.env.PERSISTENCE_PROVIDER === 'postgres'`.
   - Updated `getDb()` to throw a fatal error when `PERSISTENCE_PROVIDER=memory` is set in Preview or Production.
   - Reset `globalForDb.__ghSchemaUpdatesPromise = null` and `globalForDb.__ghSchemaUpdated = false` inside `ensureSchemaUpdates()` catch block so subsequent callers retry schema initialization after transient failure (`DB_INIT.1`).
2. **`src/domain/enquiry/repositories/enquiryRepository.ts`**
   - Guarded `EnquiryRepositoryMemory` construction and methods with `assertEnquiryMemoryAllowed()`.
   - Replaced unconditional module-load `EnquiryRepositoryMemory` fallback with `GuardedEnquiryRepository` using `resolveGuardedPersistenceBackend` and `runWithPersistenceGuard`.
   - Added status alias expansion (`expandStatusFilter`) in `EnquiryRepositoryMemory.list()` so `NEW`/`RECEIVED` and `QUALIFIED`/`IN_REVIEW` filters match both legacy and canonical values.
3. **`src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts`**
   - Updated `list()` status filter to use `inArray(enquiries.status, ['NEW', 'RECEIVED'])` when filtering by `NEW` or `RECEIVED`, and `inArray(enquiries.status, ['QUALIFIED', 'IN_REVIEW'])` when filtering by `QUALIFIED` or `IN_REVIEW`.
4. **`src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts`**
   - Guarded `SiteVisitRepositoryMemory` with `assertSiteVisitMemoryAllowed()`.
   - Removed all silent `catch` fallbacks from `SiteVisitRepositoryPostgres` to `SiteVisitRepositoryMemory`; all database errors now propagate through `runWithPersistenceGuard` as sanitized `PersistenceUnavailableError` (HTTP `503`).
   - Added `createStandaloneTransactional()` executing parent enquiry lookup, deterministic site-visit idempotency check/insert (`deriveDeterministicSiteVisitId`), and parent enquiry update (`site_visit_id` + `status = 'SITE_VISIT_SCHEDULED'`) inside a single PostgreSQL `db.transaction(...)`.
   - Wrapped module export in `GuardedSiteVisitRepository`.
5. **`src/domain/siteVisit/services/siteVisitService.ts`** & **`app/api/site-visits/route.ts`**
   - Added `deriveSiteVisitIdempotencyKey()` and `createSiteVisitWithMeta()` delegating to `siteVisitRepository.createStandaloneTransactional()`.
   - Ensured `auditService.logAuditEvent({ action: 'CREATE_SITE_VISIT', ... })` runs only after transaction commit and only when `created === true`.
   - Updated `POST /api/site-visits` to return HTTP `201` on initial creation, HTTP `200` with `deduplicated: true` on idempotent replay, HTTP `404` (`ENQUIRY_NOT_FOUND`) when parent enquiry does not exist, and HTTP `503` (`PERSISTENCE_UNAVAILABLE`) when persistence is unavailable.
6. **`app/admin/enquiries/page.tsx`**
   - Updated CRM status filter dropdown labels to `New / Received` and `Qualified / In Review`.

### Proxy Provenance & Rate Limiting (`RL-01`..`RL-04`)
7. **`src/lib/requestContext.ts`**
   - Implemented `hasVerifiedVercelProvenance()`, `hasVerifiedCloudflareProvenance()`, `selectRightToLeftHop()`, strict `getTrustedProxyCount()`, and full IPv4-mapped IPv6 canonicalization (compressed/expanded dotted-quad + hex-word forms) in `normalizeAndValidateIp()`.
   - Required verified proxy provenance (`hasVerifiedVercelProvenance`, `hasVerifiedCloudflareProvenance`, or `TRUST_REVERSE_PROXY=true`) before trusting `x-forwarded-for` or `x-real-ip`.
8. **`src/lib/rateLimit.ts`** & **`.env.example`**
   - Removed unconditional development memory rate-limit fallback; added `isDevMemoryRateLimitAllowed()` requiring explicit `ALLOW_DEV_MEMORY_RATE_LIMIT=true` in local development (`NODE_ENV=development` outside Preview/Production).
   - Documented `TRUSTED_PROXY_COUNT`, `TRUST_VERCEL_PROXY`, `TRUST_CLOUDFLARE_PROXY`, and `ALLOW_DEV_MEMORY_RATE_LIMIT` in `.env.example`.

### Secondary API Route 503 Handling (`P-02`)
9. **`app/api/resale/[id]/status/route.ts`**
10. **`app/api/rent/[id]/status/route.ts`**
11. **`app/api/resale/[id]/media/route.ts`**
12. **`app/api/rent/[id]/media/route.ts`**
13. **`app/api/resale/[id]/amenities/route.ts`**
14. **`app/api/rent/[id]/amenities/route.ts`**
15. **`app/api/rent/[id]/lifecycle/route.ts`**
16. **`app/api/rent/[id]/verification/route.ts`**
17. **`app/api/projects/[id]/resale/route.ts`**
18. **`app/api/projects/[id]/rent/route.ts`**
19. **`app/api/discovery/buy/route.ts`**
20. **`app/api/discovery/rent/route.ts`**

### Verification & Regression Test Suites
21. **`scripts/test-pp-10c-remediation.ts`** (New comprehensive PP-10C test suite)
22. **`scripts/test-pp-10b-remediation.ts`** (Updated for explicit test memory opt-in and verified proxy provenance)
23. **`scripts/test-pp-10-enquiry-crm-integration.ts`** (Updated for explicit test memory opt-in)
24. **`scripts/test-visitor-customer-360.mjs`** (Updated `DB_INIT.1` mock query handler for schema init retry test)
25. **`scripts/test-phase-07.mjs`** (Configured in-process route execution in `NODE_ENV=test` memory mode with `initializeTestRunnerSecret()` and valid 12+ character staff passwords)

---

## 5. Persistence Verification Matrix (`P-01` & `P-02`)

| Environment | `PERSISTENCE_PROVIDER` | `DATABASE_URL` | Test Opt-In | Expected Behaviour | Verified Result |
|---|---|---|---|---|---|
| Production (`NODE_ENV=production`) | `memory` | Set or Unset | Any | Reject with `PersistenceUnavailableError` (HTTP 503); no memory fallback | **PASS** (`P-01.1`, `P-01.2`, `P-01.3`) |
| Production (`NODE_ENV=production`) | `postgres` | Unavailable / Null | Any | Sanitized HTTP 503 (`PERSISTENCE_UNAVAILABLE`); no credential leak | **PASS** (`P-01.3`, `P-01.4`) |
| Preview (`VERCEL_ENV=preview`) | `memory` | Set or Unset | Any | Reject with `PersistenceUnavailableError` (HTTP 503); no memory fallback | **PASS** (`P-01.1`, `P-01.2`, `P-01.3`) |
| Preview (`VERCEL_ENV=preview`) | `postgres` | Unavailable / Null | Any | Sanitized HTTP 503 across enquiry, site-visit, and all 12 secondary routes | **PASS** (`P-01.3`, `P-02.1`) |
| Test (`NODE_ENV=test`) | `memory` | Unset | `false` | Reject with `PersistenceUnavailableError` (HTTP 503) | **PASS** (`P-01.3`) |
| Test (`NODE_ENV=test`) | `memory` | Unset | `true` | Allowed (explicit test memory repository active) | **PASS** (`P-01.3`) |
| Development (`NODE_ENV=development`) | Unset / `memory` | Unset | `false` | Fail-closed HTTP 503 (`PERSISTENCE_UNAVAILABLE`) | **PASS** (`P-01.2`, `P-01.3`) |

---

## 6. Rate-Limiting and Proxy Extraction Matrix (`RL-01`..`RL-04`)

| Scenario | Headers / Environment | Expected Client IP / Outcome | Verified Result |
|---|---|---|---|
| Forged `X-Forwarded-For` without proxy provenance | `X-Forwarded-For: 203.0.113.10`, no `TRUST_*_PROXY` | `null` (ignored) | **PASS** (`RL-01`) |
| Forged `X-Real-IP` without Vercel provenance | `X-Real-IP: 198.51.100.10`, `TRUST_VERCEL_PROXY` unset | `null` (ignored) | **PASS** (`RL-01`) |
| Forged `CF-Connecting-IP` without Cloudflare provenance | `CF-Connecting-IP: 198.51.100.20`, `TRUST_CLOUDFLARE_PROXY` unset | `null` (ignored) | **PASS** (`RL-01`) |
| Verified Cloudflare provenance | `TRUST_CLOUDFLARE_PROXY=true`, valid `cf-ray`, valid `x-forwarded-for`, `cf-connecting-ip: 198.51.100.20` | `198.51.100.20` | **PASS** (`RL-01`) |
| Verified Vercel provenance | `TRUST_VERCEL_PROXY=true`, `VERCEL=1`, `VERCEL_ENV=preview`, `x-vercel-id`, `x-real-ip: 198.51.100.33` | `198.51.100.33` | **PASS** (`RL-01`) |
| Malformed `TRUSTED_PROXY_COUNT` | `""`, `"-1"`, `"0"`, `"abc"`, `"1.5"`, `"11"`, `"999"`, `"NaN"` | `getTrustedProxyCount() === 0` (`null` IP) | **PASS** (`RL-02`) |
| Two trusted proxies (`TRUSTED_PROXY_COUNT=2`) | `X-Forwarded-For: 1.1.1.1, 203.0.113.50, 70.41.3.18` | `203.0.113.50` (`rawParts[length - 2]`) | **PASS** (`RL-02`) |
| Fewer hops than `TRUSTED_PROXY_COUNT=2` | `X-Forwarded-For: 203.0.113.50` | `null` (never clamps to index `0`) | **PASS** (`RL-02`) |
| Invalid hop at target index (`TRUSTED_PROXY_COUNT=2`) | `X-Forwarded-For: 203.0.113.50, invalid-hop, 70.41.3.18` | `null` (never shifts left to `203.0.113.50`) | **PASS** (`RL-02`) |
| Invalid rightmost hop (`TRUSTED_PROXY_COUNT=1`) | `X-Forwarded-For: 203.0.113.50, not-an-ip` | `null` (rejected) | **PASS** (`RL-02`) |
| IPv4-mapped IPv6 normalization (`RL-03`) | `192.0.2.1`, `::ffff:192.0.2.1`, `::FFFF:192.0.2.1`, `0:0:0:0:0:ffff:192.0.2.1`, `0000:0000:0000:0000:0000:ffff:192.0.2.1`, `::ffff:c000:0201`, `::FFFF:C000:0201`, `0:0:0:0:0:ffff:c000:201` | All normalize to `192.0.2.1` and produce identical SHA-256 bucket key | **PASS** (`RL-03`) |
| Dev memory rate limit guard (`RL-04`) | `NODE_ENV=development` without DB: fails closed (503) unless `ALLOW_DEV_MEMORY_RATE_LIMIT=true`; always fails closed in Preview/Prod | Verified | **PASS** (`RL-04`) |

---

## 7. Site-Visit Atomicity and Idempotency Results (`I-02`)

- **Parent Enquiry Existence Check (`I-02.1`):** `POST /api/site-visits` with a non-existent `enquiryId` returns HTTP `404` (`{ code: 'ENQUIRY_NOT_FOUND' }`) and creates `0` orphan site-visit records (**PASS**).
- **Concurrent Duplicate Replay & Single Audit Emission (`I-02.2`):** Three concurrent `POST /api/site-visits` requests for the same enquiry and slot return `[200, 200, 201]`, produce a single `siteVisit.id`, mark two responses with `deduplicated: true`, update the parent enquiry's `siteVisitId` and `status = 'SITE_VISIT_SCHEDULED'`, and emit strictly `1` `CREATE_SITE_VISIT` audit log (**PASS**).
- **Transactional Rollback on Enquiry Update Failure (`I-02.3`):** When the `enquiries` update step fails inside `SiteVisitRepositoryPostgres.createStandaloneTransactional()`, the `site_visits` insert is rolled back within the database transaction (`0` committed rows), and a subsequent retry succeeds cleanly (**PASS**).

---

## 8. CRM Status Compatibility Results (`CRM-01`)

- Filtering `enquiryRepository.list({ status: 'NEW' })` and `enquiryRepository.list({ status: 'RECEIVED' })` both return all enquiries with status `'NEW'` or `'RECEIVED'`, matching `getMetrics().newCount` (**PASS**).
- Filtering `enquiryRepository.list({ status: 'QUALIFIED' })` and `enquiryRepository.list({ status: 'IN_REVIEW' })` both return all enquiries with status `'QUALIFIED'` or `'IN_REVIEW'`, matching `getMetrics().qualifiedCount` (**PASS**).
- Stored status values on historical `'RECEIVED'` and `'IN_REVIEW'` records remain completely unmutated (**PASS**).

---

## 9. Regression Test Results

| Test Suite | Command | Result |
|---|---|---|
| **PP-10C Remediation Suite** | `npx tsx scripts/test-pp-10c-remediation.ts` | **PASS** (`13 passed, 0 failed`) |
| **PP-10B Remediation Suite** | `npx tsx scripts/test-pp-10b-remediation.ts` | **PASS** (`24 passed, 0 failed`) |
| **PP-10 Enquiry & CRM Suite** | `npx tsx scripts/test-pp-10-enquiry-crm-integration.ts` | **PASS** (`15/15 scenarios passed 100%`) |
| **Visitor & Customer 360 Suite** | `npx tsx scripts/test-visitor-customer-360.mjs` | **PASS** (`63 passed, 0 failed`, including `DB_INIT.1`) |
| **Phase 07 Production Hardening** | `npx tsx scripts/test-phase-07.mjs` | **PASS** (`248 passed, 0 failed`, including `R204`, `R207`, `S215`, `S216`) |
| **PP-09 Approval & Publication** | `npx tsx scripts/test-pp-09-approval-publication.ts` | **PASS** (`100% PASS`) |
| **PP-04B Security Regression** | `npx tsx scripts/test-pp-04b-security-regression.ts` | **PASS** (`100% PASS`) |
| **DB Connection Safety Guard** | `node scripts/test-connection-validation.mjs` | **PASS** (`9 passed, 0 failed`) |

---

## 10. Live PostgreSQL Concurrency Results or Blocker Statement (`I-01`)

- **Status:** **`BLOCKED`**
- **Reason:**
  1. Both `DATABASE_URL` and `TEST_DATABASE_URL` in this container environment point to the production database `/greathomes-production` (`ep-bold-waterfall-a17636a4-pooler.ap-southeast-1.aws.neon.tech/greathomes-production`).
  2. No local PostgreSQL server binary (`postgres`, `pg_ctl`, `initdb`, or `docker`) is installed in the container image.
  3. Executing `TEST_DATABASE_URL="" npx tsx scripts/test-postgres-live.mjs` confirmed the safety gate exits with code `2` (`Blocked — isolated test database unavailable`).
- **Required External Verification Command (once an isolated disposable PostgreSQL database or disposable Neon branch is provisioned):**
  ```bash
  TEST_DATABASE_URL="postgres://<user>:<pass>@<isolated-non-prod-host>:5432/<disposable-db>" \
  ALLOW_DISPOSABLE_DB_TESTS=1 \
  npx tsx scripts/test-postgres-live.mjs
  ```

---

## 11. Build, Typecheck and Lint Results

| Check | Command | Result |
|---|---|---|
| **TypeScript Typecheck** | `node ./node_modules/typescript/bin/tsc --noEmit` | **PASS** (`0` errors) |
| **ESLint Verification** | `npx eslint app src --max-warnings 100` (`lint_applet`) | **PASS** (`0` errors, `82` pre-existing warnings) |
| **Production Build** | `NODE_ENV=production next build` (`compile_applet`) | **PASS** (`Compiled successfully`, all static/dynamic routes built) |

---

## 12. Remaining Risks or Blockers

1. **`I-01` (External Isolated PostgreSQL Concurrency Verification Pending):**
   - While all SQL transactions, partial unique index definitions (`uq_enquiries_idempotency_key_not_null`), atomic `INSERT ... ON CONFLICT DO NOTHING` / `ON CONFLICT (bucket_key) DO UPDATE` clauses, and transaction rollback paths are implemented and verified via deterministic unit/integration tests, two-process concurrency testing against a live isolated PostgreSQL database (`I-01`) remains **`BLOCKED`** until an isolated non-production PostgreSQL URI is supplied outside this container.

---

## 13. Final PP-10C Readiness Verdict

**`CONDITIONAL — implementation complete, external verification still required`**

All code-level remediations (`P-01`, `P-02`, `RL-01`, `RL-02`, `RL-03`, `RL-04`, `I-02`, `CRM-01`) and regression fixes (`test-phase-07.mjs` and `test-visitor-customer-360.mjs`) are complete and verified with `0` TypeScript errors, `0` ESLint errors, and a passing Next.js production build. Full sign-off is conditional solely on running the two-process live PostgreSQL concurrency verification (`I-01`) against an isolated non-production PostgreSQL instance.
