# GREAT HOMES V2 — PP-10B
## PERSISTENCE, IDEMPOTENCY & DISTRIBUTED RATE-LIMITING REMEDIATION REPORT

**Phase:** PP-10B (Remediation of PP-10A Critical & High Findings)  
**Operating Mode:** Isolated Development Workspace (`/app/applet`)  
**Previous Audited Baseline:** `PP_10A_READ_ONLY_CRM_PERSISTENCE_IDEMPOTENCY_AUDIT.md` (Preserved Untouched)  
**Git Metadata Verification:** Unavailable (`.git` directory is absent in this workspace; branch/commit isolation cannot be independently verified via Git)  
**Production / Live Migration Safety:** Zero changes to production Vercel environment variables, production Cloudflare R2, or production Neon PostgreSQL; forward-only SQL migration `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql` was **NOT** executed against live/production databases.

---

## 1. Executive Summary

Phase **PP-10B** remediates all three findings identified in the **PP-10A Read-Only Audit** without altering existing CRM pipeline statuses (`NEW / RECEIVED → CONTACTED → QUALIFIED / IN_REVIEW → SITE_VISIT_SCHEDULED → SITE_VISIT_COMPLETED → NEGOTIATION → CONVERTED`, plus `LOST` and `CLOSED`), customer authentication, staff RBAC, or PP-01 through PP-10 product workflows:

| PP-10A Finding | Severity | Remediation Implemented | Status |
|---|---|---|---|
| Resale & Rental repositories silently fall back to process-local memory | Critical | Enforced PP-04B fail-closed persistence (`PersistenceUnavailableError`, HTTP `503`), strict `NODE_ENV=test` + explicit opt-in memory restriction, Preview/Production rejection | **Remediated & Verified** |
| Enquiry deduplication relies on process-local mutex and 30s in-memory window | High | Added durable partial unique index `uq_enquiries_idempotency_key`, server-derived SHA-256 idempotency key, atomic PostgreSQL `ON CONFLICT DO NOTHING` + SQLSTATE `23505` recovery, transactional `site_visits` linkage, and actor-scoped fallback check | **Remediated & Verified** |
| Rate limiter uses process-local `Map` and trusts spoofable leftmost `X-Forwarded-For` | High | Replaced with distributed PostgreSQL `rate_limit_buckets` token-window storage, SHA-256 hashed bucket keys, `TRUSTED_PROXY_COUNT` right-to-left IP extraction, and fail-closed HTTP `503` | **Remediated & Verified** |

In addition, the container startup/OOM issue where the development server failed to start or crashed during unconstrained parallel/TypeScript builds was diagnosed and verified resolved (`next-server v15.5.28` running cleanly on port `3000`).

---

## 2. Remediation Details & Files Changed

### Remediation A — Fail-Closed Persistence Guards (`resale` & `rental` Repositories)

**Root Cause:** Under missing `DATABASE_URL` or transient PostgreSQL unavailability, resale and rental listing repositories could silently activate in-memory storage across non-test runtimes, risking split-brain state across serverless instances and masking database outages.

**Implemented Controls:**
- **`src/lib/persistenceGuard.ts`** (created):
  - `PersistenceUnavailableError` (HTTP `503`, `code: 'PERSISTENCE_UNAVAILABLE'`) and `isPersistenceUnavailableError()`.
  - `isPreviewOrProductionEnvironment()` and `isStrictTestEnvironment()` checks.
  - `resolveGuardedPersistenceBackend()` and `runWithPersistenceGuard()` enforcing fail-closed PostgreSQL selection outside strict opt-in `NODE_ENV=test` runs and sanitizing credentialed connection strings from error outputs.
- **`src/domain/propertySubmission/repository.ts`** (updated):
  - Aligned `PropertySubmissionPersistenceError` as a subclass of `PersistenceUnavailableError` for uniform HTTP `503` handling.
- **`src/domain/projects/repositories/resaleRepository.ts` & `src/domain/projects/repositories/rentalRepository.ts`** (updated):
  - Restricted `ResaleListingRepositoryMemory` and `RentalListingRepositoryMemory` constructors so direct instantiation outside `NODE_ENV=test` or when `PERSISTENCE_PROVIDER=postgres` throws `PersistenceUnavailableError` (`503`).
  - Exported `GuardedResaleListingRepository` and `GuardedRentalListingRepository` with `static createForTesting`, `enableTestMemoryPersistence(true)`, and `clearMemoryForTesting()` strictly gated to `NODE_ENV=test`.
- **`src/infrastructure/repositories/postgres/resaleRepositoryPostgres.ts` & `src/infrastructure/repositories/postgres/rentalRepositoryPostgres.ts`** (updated):
  - Added `dbResolver` dependency injection support, `requireDb()`, `runWithPersistenceGuard()`, and `NotFoundError` passthrough on `update()`.
- **Public Inventory API Routes** (updated to return HTTP `503` on `isPersistenceUnavailableError`):
  - `app/api/resale/route.ts`
  - `app/api/resale/[id]/route.ts`
  - `app/api/rent/route.ts`
  - `app/api/rent/[id]/route.ts`

---

### Remediation B — Durable Database-Level Enquiry Idempotency

**Root Cause:** Process-local mutexes and a rolling 30-second memory/list scan do not prevent duplicate enquiry rows or orphaned side effects across serverless instances or race conditions.

**Implemented Controls:**
- **Forward-Only Migration & Schema:**
  - `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql` (created)
  - `src/db/schema.ts` and `src/db/client.ts` (`ensureSchemaUpdates`) (updated)
  - Added nullable `enquiries.idempotency_key` column and partial unique index `uq_enquiries_idempotency_key` (`WHERE "idempotency_key" IS NOT NULL`) so historical enquiries remain valid with `NULL` without migration rewrites.
- **Repository & Transactional Atomicity:**
  - `src/domain/enquiry/entities/enquiryEntity.ts`, `src/domain/enquiry/dto/enquiryDto.ts`, `src/domain/enquiry/repositories/enquiryRepository.ts`, `src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts` (updated):
  - Added `idempotencyKey`, `findByIdempotencyKey()`, and atomic transactional `createIdempotent(data, { siteVisit })` using `ON CONFLICT DO NOTHING` + SQLSTATE `23505` recovery and co-transactional `site_visits` insert/link (rolling back cleanly on failure so retries succeed without orphaned keys).
- **Service-Layer Idempotency & Actor Isolation:**
  - `src/domain/enquiry/services/enquiryService.ts` (updated):
  - Computes server-derived SHA-256 `deriveServerIdempotencyKey()` scoped across actor identity (`customerId`), normalized phone, target listing/project, and 30-second time window (or caller-supplied key).
  - Scoped the rolling 30-second fallback check by `(e.customerId ?? null) === (dto.customerId ?? null)` so authenticated customer enquiries never falsely match unauthenticated historical seeded enquiries.
  - Emits `CREATE_SITE_VISIT` audit log and `notificationService.createNotification()` strictly post-commit when `created === true`.

---

### Remediation C — Distributed Rate Limiting & Hardened Client IP Extraction

**Root Cause:** Process-local `Map` buckets are ineffective across scaled server instances and trusting leftmost `X-Forwarded-For` headers allows trivial client IP spoofing.

**Implemented Controls:**
- **Distributed Bucket Storage:**
  - `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql`, `src/db/schema.ts` (`rateLimitBuckets`), `src/db/client.ts` (updated):
  - Added `rate_limit_buckets` table (`id`, `window_start`, `request_count`, `expires_at`, `updated_at`) and `idx_rate_limit_buckets_expires_at`.
- **Trusted Proxy IP Extraction:**
  - `.env.example` (updated with `TRUSTED_PROXY_COUNT="1"`).
  - `src/lib/requestContext.ts` (updated): Implemented `getTrustedProxyCount()`, `normalizeAndValidateIp()` (via `net.isIP`, strips `::ffff:` IPv4-mapped prefix, rejects malformed headers), and `extractTrustedClientIp()` (returns `null` when `TRUSTED_PROXY_COUNT=0`, supports `x-vercel-forwarded-for` / `cf-connecting-ip`, and walks `X-Forwarded-For` right-to-left).
- **Distributed Rate Limiter (`src/lib/rateLimit.ts`):**
  - Replaced process-local `Map` with atomic PostgreSQL `consumePostgresBucket()`.
  - Hashes raw keys via SHA-256 (`rl_<hex>`) so raw client IP addresses are never stored directly in bucket IDs.
  - Added `RateLimitUnavailableError` (HTTP `503`, `code: 'RATE_LIMIT_UNAVAILABLE'`), `isRateLimitUnavailableError()`, and `createRateLimitUnavailableResponse()`.
  - Fails closed with HTTP `503` in Preview, Production, explicit `PERSISTENCE_PROVIDER=postgres`, or on PostgreSQL outage (never silently degrades to `Map`).
  - Provided explicit `enableTestMemoryRateLimit(true)` opt-in restricted strictly to `NODE_ENV=test`.
- **Route Handler Updates (Async `await checkRateLimit(...)` + HTTP `503` on Limiter Failure):**
  - `app/api/enquiries/route.ts` (also gates telemetry emission on `!optedOut && !result.deduplicated`)
  - `app/api/projects/[id]/brochure/request/route.ts` (removed process-local `recentBrochureRequests` `Map`; gates telemetry on `!optedOut && !result.deduplicated`)
  - `app/api/projects/slug/[slug]/nearby/route.ts`
  - `app/api/telemetry/events/route.ts`
  - `app/api/search/route.ts`
  - `app/api/places/nearby/route.ts`
  - `app/api/site-visits/route.ts`

---

## 3. Forward-Only SQL Migration DDL (`0010`)

The following DDL in `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql` is ready for controlled deployment review (**NOT executed against live/production Neon PostgreSQL**):

```sql
-- Forward-only migration for Great Homes V2 PP-10B
-- Adds durable database-level idempotency on enquiries and distributed PostgreSQL rate-limit buckets.
-- Historical enquiries preserve NULL idempotency_key and remain unaffected.

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"
  ON "enquiries" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "id" text PRIMARY KEY,
  "window_start" timestamptz NOT NULL DEFAULT now(),
  "request_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_buckets_expires_at"
  ON "rate_limit_buckets" ("expires_at");
```

---

## 4. Development Server Startup & Container Memory Analysis

- **Observed Cause of Startup Failures:** The runtime container is provisioned with **4096 MB RAM and 0 MB swap**. Running `next-server v15.5.28` consumes ~1.0 GB RAM; launching unconstrained `tsc --noEmit` or concurrent `next build` workers without heap caps exhausted memory, triggered OOM container resets, and forced cold `bun install` (~2–3 minutes) before port `3000` could bind.
- **Resolution & Live Verification:** Dependencies were cleanly restored, `next.config.mjs` separates dev (`.next-dev`) and production (`.next`) build artifacts, and memory-capped builds (`NODE_OPTIONS="--max-old-space-size=1280"`) completed without OOM. After `restart_dev_server`, port `3000` was directly verified healthy:
  - `GET /api/health` → **HTTP `200`** (`{"status":"ok","service":"Great Homes V2","env":"development"}`)
  - `GET /` → **HTTP `200`**
  - `GET /api/resale` → **HTTP `200`**

---

## 5. Verification Results (Observed After Final Code Edits)

| Check / Test Suite | Command | Result |
|---|---|---|
| TypeScript & ESLint | `NODE_OPTIONS="--max-old-space-size=1280" npm run lint` | **Passed** (`tsc --noEmit`: 0 errors; `eslint`: 0 errors, 82 warnings ≤ 100 max) |
| Production Next.js Build | `NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=1280" npm run build` | **Passed** (Next.js `15.5.28` compiled & generated all routes cleanly, exit `0`) |
| PP-10B Remediation Suite | `npx tsx scripts/test-pp-10b-remediation.ts` | **24 passed, 0 failed** (`MIG.1–2`, `A.1–9`, `B.1–5`, `C.1–8`) |
| PP-10 Enquiry & CRM Integration | `npx tsx scripts/test-pp-10-enquiry-crm-integration.ts` | **15 / 15 scenarios passed (100%)** |
| PP-09 Approval & Publication | `npx tsx scripts/test-pp-09-approval-publication.ts` | **Passed** |
| PP-08 Admin Workspace | `npx tsx scripts/test-pp-08-admin-verification-workspace.ts` | **Passed** (2 suites) |
| PP-07 Draft, Resume & My Listings | `npx tsx scripts/test-pp-07-my-properties-resume.ts` | **Passed** (9 suites) |
| PP-06 Image Management | `npx tsx scripts/test-pp-06-image-management.ts` | **Passed** (6 suites) |
| PP-05 Property Info Engine | `npx tsx scripts/test-pp-05-property-engine.ts` | **Passed** (6 suites) |
| PP-04B Security Regression | `npx tsx scripts/test-pp-04b-security-regression.ts` | **Passed** (4 suites) |
| Resale Service Unit Tests | `npx tsx src/domain/projects/tests/resaleService.test.ts` | **7 / 7 passed** |
| Rental Service Unit Tests | `npx tsx src/domain/projects/tests/rentalService.test.ts` | **7 / 7 passed** |
| Project Inventory Pagination | `npx tsx src/domain/projects/tests/projectInventoryPagination.test.ts` | **Passed** |
| DB Connection Safety Validation | `node scripts/test-connection-validation.mjs` | **9 passed, 0 failed** |
| Phase 4I–O SEO Governance | `npx tsx scripts/test-seo-governance.ts` | **10 / 10 passed** |
| Visitor & Customer 360 Suite | `ENABLE_SEEDING=true npx tsx scripts/test-visitor-customer-360.mjs` | **62 passed, 1 pre-existing failure** (`DB_INIT.1` — intentional pre-existing Neon safety gate returning `allowed: false` instead of rethrowing mock DB error; all `ENQ.*`, `SPOOF.*`, `PRIVACY.*`, `ENQ_FK.*` assertions passed) |

---

## 6. Operational Notes & Boundary Disclosures

1. **`PP_10A_READ_ONLY_CRM_PERSISTENCE_IDEMPOTENCY_AUDIT.md`** remains completely unmodified.
2. **Test Harness Updates:** `scripts/test-visitor-customer-360.mjs` was updated to call `enableTestMemoryRateLimit(true)` in `NODE_ENV=test` (matching PP-10B fail-closed test requirements), and `scripts/test-pp-10b-remediation.ts` fixed strict TypeScript assignments (`NODE_ENV` cast and `'PHONE'` contact method literal). Legacy HTTP tests in `scripts/test-phase-07.mjs` still reference deprecated `x-staff-role` headers replaced by Phase 06.2 HMAC staff cookies and were not relaxed to weaken auth.
3. **Git Status Disclosure:** `.git` is unavailable in `/app/applet`; Git branch and commit state cannot be independently verified.
4. **Database Deployment Action Required Before Production Rollout:** Apply `drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql` to target Neon PostgreSQL databases through your controlled migration pipeline before enabling PP-10B code in Preview or Production, and confirm `TRUSTED_PROXY_COUNT` matches your edge/proxy hop topology (default `1` for Vercel).
