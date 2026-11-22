# GREAT HOMES V2 — PP-10A
# READ-ONLY CRM ARCHITECTURE, PERSISTENCE & IDEMPOTENCY AUDIT

**Audit Date:** November 15, 2026  
**Audit Mode:** STRICTLY READ-ONLY  
**Target:** Completed PP-10 Implementation (Enquiry & CRM Integration)  
**Auditor:** Great Homes V2 Lead Security & Systems Engineering  

---

## 1. Executive Summary & Audit Verdict

This audit performs an independent, read-only architectural, persistence, idempotency, and security review of the Phase PP-10 Enquiry & CRM Integration. In accordance with audit constraints, **zero code files were modified, no database migrations were run, no production services were accessed, and no Git branches were manipulated.**

### Overall Verdict: **NEEDS ATTENTION (CONDITIONAL PASS WITH ACTION ITEMS)**

| Audit Section | Focus Area | Verdict |
|:---|:---|:---:|
| **Section 1** | CRM Pipeline Consistency & Lead Buckets | **PASS** |
| **Section 2** | Global In-Memory Repository Audit & Persistence Guards | **FAIL** |
| **Section 3** | Durable Duplicate Protection & Concurrency | **NEEDS ATTENTION** |
| **Section 4** | Enquiry & Property Data Integrity | **PASS** |
| **Section 5** | Privacy & Rate Limiting Controls | **PASS** |
| **Section 6** | Automated Test Evidence & Simulation Rigor | **NEEDS ATTENTION** |

---

## 2. Exact Files Inspected

1. `src/domain/enquiry/entities/enquiryEntity.ts` — Canonical enquiry entity, status enums, transition table.
2. `src/domain/enquiry/dto/enquiryDto.ts` — Request, response, filter, and metrics DTO contracts.
3. `src/domain/enquiry/services/enquiryService.ts` — Business logic, mutex serialization, phone normalization, duplicate detection, notification dispatch.
4. `src/domain/enquiry/repositories/enquiryRepository.ts` — Memory repository, PostgreSQL proxy, globalThis store.
5. `src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts` — PostgreSQL implementation with Drizzle ORM mapping.
6. `app/api/enquiries/route.ts` — Public enquiry POST endpoint, rate limiting, anti-spoofing, visitor attribution.
7. `app/api/customer/enquiries/route.ts` — Customer authenticated enquiry list endpoint.
8. `app/admin/enquiries/page.tsx` — Staff CRM dashboard, search, filters, pagination, metrics cards.
9. `app/admin/enquiries/[id]/page.tsx` — Staff enquiry detail view, status progression, staff assignment, internal notes.
10. `src/domain/projects/repositories/resaleRepository.ts` — Resale listing memory and PostgreSQL repository definitions, `globalThis` store.
11. `src/domain/projects/repositories/rentalRepository.ts` — Rental listing memory and PostgreSQL repository definitions, `globalThis` store.
12. `src/domain/propertySubmission/repository.ts` — PP-04B fail-closed persistence guard, publication, deactivation, and reactivation hooks.
13. `src/db/schema.ts` — Drizzle schema definitions for `enquiries`, `resale_listings`, `rental_listings`, `property_submissions`.
14. `src/lib/rateLimit.ts` — Process-local sliding window rate limiter.
15. `scripts/test-pp-10-enquiry-crm-integration.ts` — PP-10 verification test suite.

---

## 3. Section 1: CRM Pipeline Consistency & Lead Buckets

### Comparison: Canonical Pipeline vs Implemented Pipeline
- **Conceptual High-Level Pipeline:** `OPEN → CALLED → IN PROGRESS → F2F / SITE VISIT SCHEDULED → BOOKED`
- **Implemented Technical Pipeline:** `NEW → CONTACTED → QUALIFIED → SITE_VISIT_SCHEDULED → SITE_VISIT_COMPLETED → NEGOTIATION → CONVERTED` (plus exit states `LOST`, `CLOSED`).

### Detailed Findings:
1. **Existing vs Newly Introduced Statuses:**
   - The statuses `NEW`, `CONTACTED`, `QUALIFIED`, `SITE_VISIT_SCHEDULED`, `SITE_VISIT_COMPLETED`, `NEGOTIATION`, `CONVERTED`, `LOST`, `CLOSED`, along with aliases `RECEIVED` and `IN_REVIEW`, were **pre-existing** in `src/domain/enquiry/entities/enquiryEntity.ts` and `src/db/schema.ts` (created during Great Homes V2 Phase 6/7).
   - PP-10 did **not** introduce a parallel lifecycle or competing status set; it adopted the exact canonical statuses already defined in the database schema.
2. **Mapping to the Canonical Pipeline:**
   - `OPEN / Fresh Leads` maps directly to `NEW` (and `RECEIVED`).
   - `CALLED` maps directly to `CONTACTED`.
   - `IN PROGRESS` maps to `QUALIFIED` and `NEGOTIATION`.
   - `F2F / SITE VISIT SCHEDULED` maps directly to `SITE_VISIT_SCHEDULED`.
   - `VDNB (Visit Done, Not Booked)` maps directly to `SITE_VISIT_COMPLETED`.
   - `BOOKED` maps directly to `CONVERTED`.
   - `NFA (No Future Activity) / Lost Leads` maps directly to `LOST` and `CLOSED`.
3. **Transition Rules & Integrity:**
   - Transition validation is enforced by `isValidEnquiryStatusTransition()` in `enquiryEntity.ts`.
   - Valid status transitions prevent improper jumps (e.g., `CONVERTED → QUALIFIED` is blocked).
   - Historical leads retain their stored status string in PostgreSQL without migration corruption.
   - Lead metrics (`getMetrics()`) aggregate mutually exclusive counts; no single lead can be double-counted across multiple status buckets.

**Section 1 Verdict:** **PASS**

---

## 4. Section 2: Global In-Memory Repository Audit & Persistence Guards

### Detailed Findings:
1. **`globalThis` Storage Implementation:**
   - In PP-10, `ResaleListingRepositoryMemory` and `RentalListingRepositoryMemory` were updated to store listings in `globalThis.__gh_mem_resale_listings` and `globalThis.__gh_mem_rental_listings`.
   - This resolved single-process module isolation discrepancies during test execution.
2. **Persistence Provider Selection:**
   - In `resaleRepository.ts` (line 382) and `rentalRepository.ts` (line 372):
     ```ts
     const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
     if (usePostgres && !process.env.DATABASE_URL) {
       throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
     }
     export const resaleListingRepository: ResaleListingRepository = usePostgres
       ? new ResaleListingRepositoryPostgres()
       : new ResaleListingRepositoryMemory();
     ```
3. **Critical Fail-Closed Vulnerability:**
   - In PP-04B, `PropertySubmissionRepository` implemented strict fail-closed enforcement:
     ```ts
     if (process.env.PERSISTENCE_PROVIDER === 'memory') {
       if (!this.isTestMemoryActive()) {
         throw new PropertySubmissionPersistenceError(
           'In-memory persistence is disabled outside isolated test execution.'
         );
       }
     }
     ```
   - In `resaleRepository.ts` and `rentalRepository.ts`, **no such check exists**.
   - If `PERSISTENCE_PROVIDER` is unset, or if `PERSISTENCE_PROVIDER=memory` is provided in a non-test environment (such as Vercel Preview or Cloud Run), `resaleListingRepository` and `rentalListingRepository` will **silently instantiate the in-memory repository**.
   - In a multi-container serverless runtime (Vercel Preview/Production), each serverless container will maintain its own isolated, volatile `globalThis` memory array, resulting in divergent and vanishing listing data across user requests.

**Section 2 Verdict:** **FAIL**  
*Remediation Required:* `resaleRepository.ts` and `rentalRepository.ts` must import and enforce the PP-04B fail-closed check (`NODE_ENV === 'test'` and explicit test flag) before ever falling back to `ResaleListingRepositoryMemory` or `RentalListingRepositoryMemory`.

---

## 5. Section 3: Durable Duplicate Protection & Concurrency

### Detailed Findings:
1. **In-Flight Concurrency Mutex:**
   - `inFlightEnquiries` is implemented as an in-process `Map<string, Promise<CreateEnquiryResponseDto>>`.
   - Key format: `${normalizedPhone}:${dto.contextType}:${resolved.canonicalTargetId}`.
   - **Limitation:** This mutex is local to a single Node.js runtime. In a multi-instance, clustered, or serverless deployment, concurrent requests hitting separate instances will bypass this mutex.
2. **30-Second Duplicate Window:**
   - In `executeSubmitEnquiry`, `this.repo.list({ buyerPhone: normalizedPhone })` checks for an existing enquiry on the exact same target property created within the last 30,000 milliseconds.
   - If found, it returns the existing enquiry's ID and reference number without creating a duplicate record.
   - If the same phone submits an enquiry for a *different* property, it correctly allows the submission.
3. **Database-Level Idempotency:**
   - Inspection of `src/db/schema.ts` reveals standard non-unique B-tree indexes on `enquiries` (`idx_enquiries_buyer_phone`, `idx_enquiries_listing_id`, `idx_enquiries_created_at`).
   - There is **no database-level unique constraint** (e.g. `UNIQUE (buyer_phone, listing_id, date_trunc('minute', created_at))` or dedicated `idempotency_key` column).
   - Consequently, two truly concurrent HTTP requests hitting separate server instances within the same sub-second window before either row commits to PostgreSQL could both pass the read check and insert duplicate rows.

**Section 3 Verdict:** **NEEDS ATTENTION**  
*Remediation Required:* Add an `idempotency_key` column with a database-level unique index on `enquiries`, or a unique constraint on `(buyer_phone, listing_id, submission_window_bucket)` to guarantee database-level idempotency across multi-instance deployments.

---

## 6. Section 4: Enquiry and Property Data Integrity

### Detailed Findings:
1. **Published Lifecycle Guard:**
   - `resolveEnquiryContext()` strictly asserts `rawListing.lifecycleStatus === 'PUBLISHED'`.
   - Draft, under-review, rejected, or paused listings throw `EnquiryValidationError` ("The requested listing could not be found or is not available for enquiry").
2. **Deactivation & Reactivation Synchronization:**
   - When a property submission is deactivated in `propertySubmissionRepository.deactivateListing()`, the associated `resale_listings` or `rental_listings` record is updated to `lifecycleStatus: 'PAUSED'`.
   - When reactivated, it is restored to `'PUBLISHED'`.
   - Enquiries are immediately blocked upon deactivation and immediately permitted upon reactivation.
3. **Owner vs Partner Separation:**
   - In `publishSubmission()`, `listingPartyType` is normalized to `'OWNER'` or `'PARTNER'`.
   - In `enquiryService.ts`, `metadataObj.listingSource` is explicitly tagged as `OWNER_SUBMITTED_PROPERTY` or `PARTNER_SUBMITTED_PROPERTY`.
   - Submitter identities remain distinct and unmerged.
4. **Anti-Spoofing:**
   - In `app/api/enquiries/route.ts`, client-provided `customerId` is unconditionally deleted from the raw request payload before processing.
   - Only `verifyCustomerAuth(req)` session verification can attach an authenticated `customerId`.
5. **Database Durability:**
   - In standard PostgreSQL operation, all enquiry attributes, reference numbers, customer/visitor IDs, and metadata are persisted directly to the `enquiries` table in PostgreSQL via `EnquiryRepositoryPostgres`.

**Section 4 Verdict:** **PASS**

---

## 7. Section 5: Privacy & Rate Limiting Controls

### Detailed Findings:
1. **Customer PII Exposure:**
   - `POST /api/enquiries` returns only `{ success, message, enquiryId, referenceNumber, siteVisitId, siteVisitStatus }`. No buyer phone, email, or other customer data is returned in the response.
   - `GET /api/customer/enquiries` enforces customer session authentication and scopes queries strictly by `WHERE customer_id = $authenticatedId`.
2. **Owner & Broker Privacy:**
   - Property submitter/owner private phone numbers and emails are never copied into the `enquiries` table or returned to the prospective buyer.
   - Partner commission terms and private consent attestations are completely segregated.
3. **Staff Notes Confidentiality:**
   - Staff operational notes (`enquiries.internalNotes`) are restricted to staff API routes (`/api/admin/enquiries`) and omitted from customer DTOs.
4. **Rate Limiting Architecture:**
   - `checkRateLimit()` in `src/lib/rateLimit.ts` uses an in-memory `Map` with an IP-based sliding window (100 requests per minute).
   - **Architectural Note:** Rate limiting is **process-local**. In a multi-instance or serverless deployment, rate limits are not shared across instances. This is acceptable for a development baseline, but requires Redis/Vercel KV in production for distributed protection.
5. **Non-Blocking Notifications:**
   - In-app notification creation is wrapped in a `try/catch` block. Any notification delivery failure logs cleanly without failing the database enquiry transaction.

**Section 5 Verdict:** **PASS (with architectural note on process-local rate limiting)**

---

## 8. Section 6: Test Evidence & Verification Rigor

### Detailed Findings:
1. **Test Execution & Coverage:**
   - The PP-10 test suite `scripts/test-pp-10-enquiry-crm-integration.ts` contains 15 detailed scenarios covering:
     - Owner resale enquiry
     - Owner rental enquiry
     - Partner resale enquiry
     - Partner rental enquiry
     - Message handling (omitted vs provided)
     - Phone normalization (+91, 0, spaces, dashes) and invalid phone rejections
     - Rejection of invalid, draft, and deactivated listings
     - Reactivated listing acceptance
     - Customer identity verification & anti-spoofing
     - 30-second window deduplication
     - PII & internal note privacy verification
     - Transactional customer in-app notification trigger
     - CRM pipeline lifecycle stage progression and invalid transition rejection
     - CRM KPI metrics aggregation
     - Capability model RBAC authorization
   - **Pass Rate:** 100% (15/15 scenarios passing).
2. **Limitations in Test Simulation:**
   - Tests run in a single Node.js runtime in memory mode (`PERSISTENCE_PROVIDER=memory NODE_ENV=test`).
   - The test suite does not simulate multi-process distributed cluster concurrency or database unique constraint collisions.
   - `test-pp-10-enquiry-crm-integration.ts` does not assert fail-closed behavior for `resaleListingRepository` or `rentalListingRepository` when `PERSISTENCE_PROVIDER !== 'postgres'`.

**Section 6 Verdict:** **NEEDS ATTENTION**

---

## 9. Git & Environment Limitations

- The workspace operates in an isolated container where the `.git` directory is unmounted.
- Git commit hashes, branch names, and commit history cannot be verified through Git CLI commands.
- All verification was performed through direct filesystem inspection, static analysis, and sandboxed test execution.
- **Explicit Confirmation:** No production systems, production databases, production Cloudflare R2 buckets, or live environment variables were modified. No code files were mutated during this audit.

---

## 10. Remediation Recommendations

1. **Implement PP-04B Fail-Closed Guards in Resale and Rental Repositories:**
   - Update `src/domain/projects/repositories/resaleRepository.ts` and `rentalRepository.ts` to reject in-memory fallback unless `NODE_ENV === 'test'` and an explicit test flag is active. If `PERSISTENCE_PROVIDER !== 'postgres'` in production or preview, throw a fatal persistence error rather than silently defaulting to memory.
2. **Add Database-Level Idempotency Constraint:**
   - Add a database unique index or an `idempotency_key` column on the `enquiries` table in `src/db/schema.ts` to ensure that duplicate concurrent requests across multiple server instances are rejected at the database level.
3. **Distributed Rate Limiting:**
   - For multi-instance production environments, transition `checkRateLimit` from in-memory `Map` to Redis, Upstash, or PostgreSQL unlogged table storage.

---

## 11. Final Gate Summary

The PP-10 implementation successfully delivers core enquiry ingestion, context resolution, source attribution, PII privacy, and CRM pipeline progression. Addressing the repository fail-closed guard (Recommendation 1) and database-level idempotency constraint (Recommendation 2) will harden the system to full production standard.

**Audit Status:** COMPLETE.  
**Strict Stop Condition:** Halting work. Awaiting product owner instructions before Phase PP-11.
