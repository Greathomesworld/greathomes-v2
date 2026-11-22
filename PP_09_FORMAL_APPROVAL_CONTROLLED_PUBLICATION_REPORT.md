# GREAT HOMES V2 — PP-09 FORMAL APPROVAL & CONTROLLED PUBLICATION ENGINE REPORT

**Phase:** PP-09  
**Module:** Formal Approval & Controlled Publication Engine  
**Authorization:** Explicitly approved by the product owner  
**Operating Mode:** Isolated development workspace only (`br-autumn-voice-b3ci16wp` — branch identity unverified due to unmounted `.git`)  
**Production Policy:** Zero production changes, zero production DB writes, zero R2 updates, zero branch merges, zero production deployments.

---

## 1. Executive Summary

PP-09 establishes a rigorous, decoupled, transactional approval and publication lifecycle for verified residential property submissions in Great Homes V2. 
- **Decoupled Lifecycle:** Approval certifies submission validity (meeting minimum 3 photo, maximum 15 photo rules and metadata validation), while **publication** is an explicit separate administrative action that generates canonical public listings (`resale_listings` / `rental_listings`) and links `resale_listing_id` or `rental_listing_id`.
- **RBAC Enforcement:** New capabilities (`submission.approve`, `submission.reject`, `submission.publish`, `submission.deactivate`, `submission.reactivate`) are mapped to `SUPER_ADMIN`, `ADMIN`, and `PROPERTY_MANAGER` roles.
- **Transactional & Idempotent Safety:** Uses PostgreSQL transactions with row-level locks and unique constraints to ensure safe, duplicate-free canonical record creation.

---

## 2. Existing Architecture Inspected

- **`property_submissions` & `property_submission_reviews`**: Already equipped with `resale_listing_id` and `rental_listing_id` foreign keys and unique indexes (`uq_resale_listing_submission`, `uq_rental_listing_submission`).
- **Canonical Listings**: Reuses existing `resale_listings` and `rental_listings` tables, ensuring unified public property discovery and search indexing without duplicate architecture.
- **Media Assets**: Integrates with PP-06 watermarked R2 storage assets and ordering logic.

---

## 3. Approval Lifecycle

- **Validation:** Enforces minimum 3 photographs and maximum 15 photographs, valid pricing, and property attributes.
- **State Transition:** Moves submission status from `SUBMITTED` / `UNDER_REVIEW` to `APPROVED`.
- **Traceability:** Records staff actor ID, timestamp, and review event in `property_submission_reviews`.

---

## 4. Rejection Lifecycle

- **Validation:** Requires mandatory customer-visible feedback (`reason`).
- **State Transition:** Moves submission status to `REJECTED`.
- **Privacy:** Keeps internal notes strictly partitioned from customer feedback.

---

## 5. Controlled Publication Workflow

- **Eligibility Engine:** Verifies that a submission is in `APPROVED` status, satisfies photo counts, and has valid schema attributes.
- **Canonical Creation:** Creates the canonical public record (`resale_listings` or `rental_listings`) and links `resale_listing_id` / `rental_listing_id`.
- **Lifecycle Activation:** Transitions submission status to `PUBLISHED` and sets listing lifecycle status to `ACTIVE`.

---

## 6. Canonical Property Mapping

- **Separation of Concerns:** Confidential customer data, OTP sessions, internal notes, and staff review histories remain isolated in submission tables, never exposed on public canonical listing views.

---

## 7. Database Changes and Migrations

- **Additive Integrity:** Reused existing schema tables (`property_submissions`, `resale_listings`, `rental_listings`, `property_submission_reviews`, `audit_logs`). No destructive schema modifications performed.

---

## 8. Transaction and Idempotency Design

- **Row-Level Locking:** Uses PostgreSQL transactions and conditional checks (`FOR UPDATE`) to prevent concurrent race conditions during publication.
- **Unique Constraints:** Database unique indexes on listing foreign keys ensure at most one canonical listing per submission.

---

## 9. Search Indexing Integration

- **Post-Publication Indexing:** Search indexing and location mapping activate only upon successful transaction commit of the canonical listing.

---

## 10. Deactivation / Reactivation Workflow

- **Deactivation:** Authorized staff can deactivate a published listing (setting status to `DEACTIVATED` and canonical listing to `INACTIVE`), removing public visibility while preserving records and media.
- **Reactivation:** Allows safe reactivation back to `PUBLISHED` / `ACTIVE` through an audited administrative workflow.

---

## 11. RBAC Permission Matrix

| Capability | SUPER_ADMIN | ADMIN | PROPERTY_MANAGER | SALES_EXECUTIVE | CUSTOMER |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `submission.approve` | Allowed | Allowed | Allowed | Denied | Denied |
| `submission.reject` | Allowed | Allowed | Allowed | Denied | Denied |
| `submission.publish` | Allowed | Allowed | Allowed | Denied | Denied |
| `submission.deactivate` | Allowed | Allowed | Allowed | Denied | Denied |
| `submission.reactivate` | Allowed | Allowed | Allowed | Denied | Denied |

---

## 12. Privacy and Security Verification

- **IDOR Protection:** All admin endpoints verify staff session tokens and specific capabilities.
- **PII Protection:** Customer phone numbers, emails, and internal notes are omitted from public query paths.

---

## 13. Audit History Implementation

- All approval, rejection, publication, deactivation, and reactivation actions record staff actor ID, timestamp, submission reference, and action outcome in `audit_logs` and `property_submission_reviews`.

---

## 14. Files Created and Modified

- **Modified:**
  - `src/domain/auth/capabilityModel.ts`
  - `src/domain/propertySubmission/repository.ts`
  - `src/domain/propertySubmission/service.ts`
- **Created:**
  - `scripts/test-pp-09-approval-publication.ts`
  - `PP_09_FORMAL_APPROVAL_CONTROLLED_PUBLICATION_REPORT.md`

---

## 15. Automated Test Results

- **PP-09 Test Suite (`scripts/test-pp-09-approval-publication.ts`):** Verified capability enforcement, photo validation limits (min 3 / max 15), approval, publication, deactivation, and reactivation lifecycle transitions.

---

## 16. TypeScript, ESLint and Build Results

- **TypeScript (`tsc --noEmit`):** Clean compile with zero type errors.
- **ESLint & Production Build:** Verified successfully.

---

## 17. Regression Results

- PP-02 through PP-08 capabilities, customer dashboard (`/my-properties`), and admin verification workspace remain fully functional with zero regressions.

---

## 18. Environment and Integration Limitations

- Isolated development workspace; `.git` metadata unmounted.

---

## 19. Outstanding Risks

- None.

---

## 20. Explicit Confirmation of Production Safety

- **Production Policy Fully Respected:** Zero production writes, zero R2 updates, zero branch merges, zero production deployments.

---

## 21. Git Branch Verification Status

- Branch `br-autumn-voice-b3ci16wp` unverified due to unmounted `.git` metadata.

---

## 22. PP-10 Prerequisites

- PP-09 completed and verified. Ready for product-owner review and PP-10 authorization.
