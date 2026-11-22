# GREAT HOMES V2 — PP-10 ENQUIRY & CRM INTEGRATION REPORT
## Formal Verification, Lead Lifecycle & Architectural Audit

**Phase:** PP-10 — Enquiry & CRM Integration  
**Status:** COMPLETED & VERIFIED (100% Passing Automated Tests)  
**Operating Mode:** Isolated Development Workspace Only (`/app/applet`)  
**Previous Baselines:** PP-01 through PP-09 Accepted Baselines Preserved Intact  

---

## 1. Executive Summary & Authorization

Phase PP-10 integrates verified, published customer- and partner-submitted residential properties into the canonical Great Homes enquiry, lead management, and CRM infrastructure.

In compliance with the project's safety rules:
- **No parallel CRM or duplicate lead tables** were created; the canonical `enquiries` table, `EnquiryService`, `EnquiryRepository`, visitor attribution intelligence, and staff operational interfaces were directly leveraged.
- **Zero production modifications**: No live migrations, no external secret exposure, and no changes outside the isolated development workspace.
- **Strict Stop Condition**: Work on Phase PP-11 will not begin until explicit product-owner authorization.

---

## 2. Architectural Blueprint & Data Flow

```
                      +---------------------------------------+
                      |   Published Property Listing Page     |
                      |  (Resale / Rental - Owner or Partner) |
                      +---------------------------------------+
                                          |
                                          | POST /api/enquiries
                                          v
                      +---------------------------------------+
                      |       app/api/enquiries/route.ts      |
                      |  - IP Rate Limiting (100 req/min)     |
                      |  - Strip PII & Client-forged IDs      |
                      |  - Server-side verifyCustomerAuth()   |
                      |  - Visitor Attribution Safe Resolution|
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |  src/domain/enquiry/services/         |
                      |          enquiryService.ts            |
                      |  - Indian Phone Normalization (+91)   |
                      |  - Resolve Canonical Listing & State  |
                      |  - Lifecycle Guard (Must be PUBLISHED)|
                      |  - In-flight Mutex Serialization      |
                      |  - 30-Second Duplicate Window Check   |
                      |  - Source Attribution Tagging         |
                      |    (OWNER_ / PARTNER_SUBMITTED)       |
                      |  - Non-blocking In-App Notification   |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |     Canonical 'enquiries' Table       |
                      |      (PostgreSQL / Memory Repo)       |
                      |  Status: NEW / SITE_VISIT_SCHEDULED   |
                      |  Priority: NORMAL                     |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      Admin CRM Workspace & API        |
                      |       /admin/enquiries/[id]           |
                      |  - Staff Assignment & Role RBAC       |
                      |  - Lifecycle Pipeline Transitions     |
                      |  - Customer 360 Attribution Strip     |
                      |  - Strictly Internal Staff Notes      |
                      +---------------------------------------+
```

---

## 3. Security, Privacy & Compliance Audit

| Requirement | Implementation & Audit Result | Status |
|:---|:---|:---:|
| **Owner Contact Privacy** | Submitter mobile and email are stored exclusively on `property_submissions` and internal listing records. They are stripped from public responses and never written to `enquiries` table metadata. | **PASSED** |
| **Partner Privacy** | Partner commission rates, business documents, and consent attestations are completely inaccessible to prospective buyers/enquirers. | **PASSED** |
| **Internal Notes Secrecy** | Verification workspace notes (`property_submission_reviews.internalNote`) and CRM staff notes (`enquiries.internalNotes`) are restricted to staff roles (`ADMIN`, `PROPERTY_MANAGER`, `SALES_EXECUTIVE`). Customer endpoints never return them. | **PASSED** |
| **Anti-Spoofing** | Client-submitted `customerId`, `ownerPhone`, `ownerEmail`, `crmId`, `internalNotes`, and `assignedTo` are stripped in `app/api/enquiries/route.ts`. Only server-verified session tokens establish customer linkage. | **PASSED** |
| **Rate Limiting** | Strict IP-based sliding window rate limiter protects `/api/enquiries` against automated lead flooding (100 requests per minute). | **PASSED** |
| **Deactivated Listing Protection** | Deactivated or paused properties (`PAUSED` / `DEACTIVATED`) immediately reject inbound enquiries with `EnquiryValidationError` (HTTP 400). | **PASSED** |

---

## 4. CRM Pipeline & Operational Lifecycle

The existing Great Homes sales pipeline is preserved without modification:

1. **`NEW`**: Initial default state for inbound property enquiries without immediate site visit requirements.
2. **`CONTACTED`**: Staff member has initiated contact with the prospective buyer via phone, WhatsApp, or email.
3. **`QUALIFIED`**: Buyer budget, purchase timeline, and financing feasibility confirmed.
4. **`SITE_VISIT_SCHEDULED`**: Inspection appointment scheduled with property keyholder or owner. (Automatically set if buyer requests site visit at submission).
5. **`SITE_VISIT_COMPLETED`**: Physical or virtual property inspection concluded.
6. **`NEGOTIATION`**: Price and commercial term discussions between buyer and owner/partner.
7. **`CONVERTED`**: Booking token received, sale deed executed, or tenancy agreement signed.
8. **`LOST` / `CLOSED`**: Buyer discontinued interest or property acquired by another party.

Status transitions are strictly validated by `isValidEnquiryStatusTransition()`; invalid or backward jumps (such as `CONVERTED → QUALIFIED`) are blocked with validation errors.

---

## 5. Automated Verification Results

The automated test suite `scripts/test-pp-10-enquiry-crm-integration.ts` passed 100%:

```
=============================================================
=== GREAT HOMES V2 — PP-10 ENQUIRY & CRM INTEGRATION TEST ===
=============================================================

[Scenario 1] Setting up published test listings for PP-10...
✓ Published Owner Resale Listing: list_60dc0f18-c326-4014-9955-947e654d2b4f
✓ Published Owner Rental Listing: list_7a24d970-46f4-4bbc-a03d-c9341ff465f8
✓ Published Partner Resale Listing: list_02be8ac3-7bba-432b-a6ba-5ecf36e21d0d
✓ Published Partner Rental Listing: list_a56dfd65-5b43-47de-98ea-b033d17f0168

[Scenario 2] Testing public enquiry on published Owner Resale property...
✓ Owner Resale Enquiry created: enq_1794728814219_fuc73p (Ref: GH-ENQ-760131)

[Scenario 3] Testing public enquiry on published Owner Rental property...
✓ Owner Rental Enquiry created: enq_1794728814239_dhrnbb with monthly pricing

[Scenario 4] Testing public enquiry on published Partner Resale property...
✓ Partner Resale Enquiry created: enq_1794728814240_21oi2x with PARTNER attribution

[Scenario 5] Testing public enquiry on published Partner Rental property...
✓ Partner Rental Enquiry created: enq_1794728814240_9vzg6b with PARTNER attribution

[Scenario 6] Testing optional buyer message handling...
✓ Omitted message successfully handled as null.

[Scenario 7] Testing phone normalization & validation...
✓ Phone normalization and rejection of invalid numbers passed.

[Scenario 8] Testing rejection of enquiry on invalid / unavailable properties...
Deactivating Owner Resale listing...
✓ Enquiries on unpublished and deactivated listings are strictly rejected.
Reactivating Owner Resale listing...
✓ Enquiry succeeds immediately after reactivation.

[Scenario 9] Testing customer identity verification...
✓ Customer identity verification and scoped self-service confirmed.

[Scenario 10] Testing deduplication within 30-second window...
✓ Duplicate submission prevented for same property; separate property enquiry allowed.

[Scenario 11] Testing privacy controls (Zero PII leakage)...
✓ Submitter/Owner private contact details and internal notes strictly protected.

[Scenario 12] Testing non-blocking transactional notification hook...
✓ Customer in-app notification successfully triggered: notif_1794728814246_hb451h

[Scenario 13] Testing CRM lead pipeline progression...
✓ CRM lead pipeline states and transition guards verified successfully.

[Scenario 14] Testing CRM KPI metric aggregation...
✓ Total enquiries: 10, Converted: 1, New: 9

[Scenario 15] Testing RBAC authorization capabilities...
✓ Capability model enforces strict staff role boundaries.

=============================================================
=== ALL PP-10 ENQUIRY & CRM INTEGRATION TESTS PASSED 100% ===
=============================================================
```

### Complete Regression Verification Matrix (PP-02 through PP-09)
All historical test suites were run sequentially to verify zero backward regressions:
- `scripts/test-property-submission-foundation.ts` (PP-02): **PASSED (100%)**
- `scripts/test-post-property-entry.ts` (PP-03): **PASSED (100%)**
- `scripts/test-pp-04-wizard.ts` (PP-04): **PASSED (100%)**
- `scripts/test-pp-04b-security-regression.ts` (PP-04B): **PASSED (100%)**
- `scripts/test-pp-05-property-engine.ts` (PP-05): **PASSED (100%)**
- `scripts/test-pp-06-image-management.ts` (PP-06): **PASSED (100%)**
- `scripts/test-pp-07-my-properties-resume.ts` (PP-07): **PASSED (100%)**
- `scripts/test-pp-08-admin-verification-workspace.ts` (PP-08): **PASSED (100%)**
- `scripts/test-pp-09-approval-publication.ts` (PP-09): **PASSED (100%)**
- TypeScript Compilation (`tsc --noEmit`): **PASSED (0 Errors)**

---

## 6. Manifest of Modified Files

1. `src/domain/enquiry/services/enquiryService.ts`
   - Added support for customer- and partner-submitted property resolution.
   - Set `listingPartyType` and `listingSource` attribution in resolved enquiry context.
   - Integrated non-blocking in-app notification trigger for authenticated customers.
2. `src/domain/propertySubmission/repository.ts`
   - Synchronized `publishSubmission` with `resaleListingRepository` and `rentalListingRepository` with normalized `listingPartyType: 'OWNER' | 'PARTNER'` and `lifecycleStatus: 'PUBLISHED'`.
   - Updated `deactivateListing` to pause listings (`lifecycleStatus: 'PAUSED'`) and `reactivateListing` to republish listings (`lifecycleStatus: 'PUBLISHED'`).
3. `src/domain/projects/repositories/resaleRepository.ts`
   - Backed in-memory store with `globalThis` to guarantee cross-module state sharing.
   - Preserved caller-provided canonical IDs in `create()`.
4. `src/domain/projects/repositories/rentalRepository.ts`
   - Backed in-memory store with `globalThis` to guarantee cross-module state sharing.
   - Preserved caller-provided canonical IDs in `create()`.
5. `app/admin/enquiries/[id]/page.tsx`
   - Enhanced interest & context card to display listing channel origin (`Owner-Submitted Property` vs `Partner-Submitted Property`).
6. `scripts/test-pp-10-enquiry-crm-integration.ts`
   - Comprehensive 15-scenario automated verification test suite.

---

## 7. Gate Handoff

Phase PP-10 is complete, fully tested, and verified against all safety and product requirements. Awaiting product-owner review and authorization before beginning Phase PP-11.
