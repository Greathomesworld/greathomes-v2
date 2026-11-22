# GREAT HOMES V2 — PP-08 ARCHITECTURE INSPECTION REPORT
## Admin Verification Workspace

**Phase:** PP-08  
**Operating Mode:** Isolated development workspace (`br-autumn-voice-b3ci16wp`, unverified due to unmounted `.git`).  
**Production Policy Compliance:** Zero production database changes, zero production environment modifications, zero R2 operations, zero branch merges, zero Vercel production deployments.

---

## 1. Executive Summary

This architecture inspection report analyzes the existing Great Homes V2 infrastructure (PP-02 through PP-07) to prepare for the secure implementation of **PP-08 (Admin Verification Workspace)**. PP-08 establishes an enterprise-grade staff verification workspace at `/admin/property-submissions` backed by robust server-side RBAC, strict separation between customer-visible correction feedback (`submitterFeedback`) and private internal notes (`internalNote`), interactive review checklists, PP-06 media inspection, and comprehensive audit logging.

---

## 2. Inspected Architecture Components

### A. Staff Authentication & Authorization Boundary
- **Session & Cookies:** Internal staff sessions are authenticated via `verifyInternalStaff(req)` checking secure HTTP-only cookies (`gh_staff_session` or equivalent staff tokens).
- **RBAC & Capabilities:** Role-based access control is governed by `src/domain/auth/capabilityModel.ts` and `src/domain/auth/capabilities.ts`. Standard roles include `SUPER_ADMIN`, `ADMIN`, `CONTENT_MANAGER`, `PROPERTY_MANAGER`, `SALES_MANAGER`, `SALES_EXECUTIVE`, etc.
- **Middleware Guard:** Admin API routes protect endpoints by verifying staff authorization and asserting required capabilities (e.g., `verifyStaffCapability(req, 'submission.read')` or `submission.review`).

### B. Property Submission & Review Schema (`src/db/schema.ts`)
- **`property_submissions` Table:** Stores complete submission payloads (`payload` JSONB), listing type (`RESALE` / `RENTAL`), listing source (`OWNER` / `PARTNER`), customer ID (`customer_id`), submission status (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`), reference ID (`reference_id`), assigned reviewer ID (`assigned_reviewer_id`), and timestamps (`submitted_at`, `updated_at`, etc.).
- **`property_submission_reviews` Table:** Records review events and audit trail entries with strict separation:
  - `submitter_feedback`: Customer-visible instructions when changes are requested.
  - `internal_note`: Confidential staff-only notes strictly excluded from all customer APIs.
  - `staff_user_id`: Acting staff reviewer ID.
  - `event_type`: `DRAFT_CREATED`, `SUBMITTED`, `RESUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`.
- **`partner_submission_attestations` Table:** Stores partner profiles, eligibility, and owner-consent attestation metadata for `PARTNER` submissions.
- **`media_assets` Table:** PP-06 media persistence storing storage provider, storage keys, optimized WebP URLs, watermarked URLs, dimensions, and file sizes.

### C. Audit Logging (`audit_logs`)
- Centralized audit logging infrastructure records staff actions, actor staff IDs, action types, entity types, entity IDs, and metadata JSON.

---

## 3. PP-08 Design Decisions & Security Controls

1. **New Capabilities Added:** Add `submission.read`, `submission.review`, `submission.requestChanges`, `submission.assign`, and `submission.manageNotes` to `capabilityModel.ts`, mapped automatically to `SUPER_ADMIN`, `ADMIN`, and `PROPERTY_MANAGER`.
2. **Staff Repository & Service Extensions:** Implement staff-facing query methods in `PropertySubmissionRepository` and `PropertySubmissionService` supporting pagination, filtering by status/source/type/search/assignee, review action execution, and checklist persistence.
3. **Zero Data Leakage:** Ensure `internalNote` and `staffUserId` are never serialized into customer responses (`sanitizeReviewForCustomer`), while staff review APIs provide full internal transparency.
4. **Isolated Test Safety:** Maintain zero dependencies on external production systems, using isolated memory/test repository bindings for automated test execution.
