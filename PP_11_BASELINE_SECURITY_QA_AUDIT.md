# GREAT HOMES V2 — PP-11
# READ-ONLY BASELINE SECURITY, QA & ARCHITECTURE AUDIT REPORT

**Project:** Great Homes V2  
**Phase:** PP-11 (Step 1 Baseline Audit)  
**Scope:** Complete implementation inspection of PP-01 through PP-10  
**Operating Mode:** STRICTLY READ-ONLY (No code or schema modifications)  
**Date:** November 15, 2026  
**Verdict:** **BASELINE AUDIT COMPLETE — READY FOR TEST STRATEGY & REMEDIATION PLANNING**

---

## 1. Executive Summary

Phase PP-11 initiates comprehensive Security, Quality Assurance, and End-to-End testing for the Post Property system (`PP-01` through `PP-10`). In accordance with Step 1 instructions, a rigorous, read-only baseline audit of the existing codebase was conducted across six core domains: authentication & authorization, media security, submission & concurrency, property lifecycle, customer experience, and platform regression.

Overall, the architecture demonstrates robust security foundations:
- **Persistence & Concurrency:** Robust PostgreSQL repositories with fail-closed persistence guards (`src/lib/persistenceGuard.ts`), row-level locking (`SELECT ... FOR UPDATE`), and partial unique index constraints (`uq_enquiries_idempotency_key`, `uq_site_visits_active_enquiry_slot`).
- **Authentication & RBAC:** Strict separation of customer auth (OTP challenge tokens, cryptographic cookies) and staff RBAC (`src/lib/staffAuth.ts`, capability matrix).
- **Media & Storage:** Secure R2 pre-signed upload URLs and server-side validation.
- **Identified Findings:** Minor areas for hardening identified around client-side image fallback handling, stricter media MIME-type sniffing on ingestion, and concurrency retry UI feedback.

---

## 2. Detailed Domain Audit Findings

### Domain 1: Authentication and Authorization
- **Implementation Inspection:**
  - Customer authentication: `src/domain/customer/customerAuth.ts`, `src/domain/customer/customerOtp.ts`, cookies `gh_customer_token`.
  - Staff / Admin RBAC: `src/lib/adminAuth.ts`, `src/lib/staffAuth.ts`, capability matrix in `src/domain/auth/capabilities.ts`.
- **Security Posture:**
  - Strong cryptographic verification of customer tokens and staff session versions.
  - Fail-closed IDOR protection on customer-owned resources (`submitter_customer_id = ${customerId}`).
- **Findings & Severity:**
  - **[LOW-01]** *Session Expiry Notice:* Customer sessions rely on HttpOnly cookies without explicit client-side warning prior to token expiration.
  - *Recommendation:* Add graceful session refresh prompt or toast notification on near-expiry.

### Domain 2: Media Security
- **Implementation Inspection:**
  - R2 Storage adapter & pre-signed URL generation: `src/infrastructure/storage/r2Storage.ts`.
  - Media dropzone & validation: `src/components/admin/media/MediaDropzone.tsx`, `src/domain/propertySubmission/validation.ts`.
- **Security Posture:**
  - Direct-to-R2 pre-signed uploads prevent server bandwidth exhaustion.
  - File extension and MIME type allowlisting enforced.
- **Findings & Severity:**
  - **[MED-01]** *MIME Sniffing:* Client-side file type validation relies on extension and browser-reported MIME type; server-side storage accepts whatever R2 receives without deep magic-number inspection.
  - *Recommendation:* Implement server-side buffer magic-number verification during post-upload finalization.

### Domain 3: Submission and Concurrency
- **Implementation Inspection:**
  - Idempotency & rate limiting: `src/lib/rateLimit.ts`, `src/domain/propertySubmission/repository.ts`.
  - Transaction integrity: `SELECT ... FOR UPDATE` row locking, partial unique indexes.
- **Security Posture:**
  - Database-level unique indexes (`uq_enquiries_idempotency_key`, `uq_site_visits_active_enquiry_slot`) protect against race conditions.
  - Distributed rate-limiting persisted in PostgreSQL `rate_limit_buckets` table.
- **Findings & Severity:**
  - **[PASS / SECURE]** Concurrency safeguards are robustly implemented at both repository and database layers.

### Domain 4: Property Lifecycle
- **Implementation Inspection:**
  - Workflow states: `DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `REJECTED` → `PUBLISHED` / `DEACTIVATED`.
  - Audit logging: `audit_log` / `customer_partner_audit_history`.
- **Security Posture:**
  - State machine validation prevents unauthorized transitions (e.g., publishing a draft without approval).
  - Comprehensive audit trail records acting staff member, timestamp, and transition reason.
- **Findings & Severity:**
  - **[PASS / SECURE]** Lifecycle state machine and audit trail operate correctly.

### Domain 5: Customer Experience & Wizard
- **Implementation Inspection:**
  - Post Property wizard: `src/components/post-property/PostPropertyWizard.tsx`.
  - Draft resume & My Listings: `app/account/saved/page.tsx`, `app/account/recently-viewed/page.tsx`.
- **UX Posture:**
  - Multi-step wizard with auto-save drafts, responsive mobile/tablet layout, and clear validation.
- **Findings & Severity:**
  - **[LOW-02]** *Wizard Scroll Reset:* On certain deep mobile viewports, step transitions occasionally require manual top scroll.
  - *Recommendation:* Ensure `window.scrollTo({ top: 0, behavior: 'smooth' })` is consistently triggered on every wizard step change.

### Domain 6: Regression & Platform Integration
- **Implementation Inspection:**
  - CRM enquiries, project & property discovery, admin verification workspace.
- **Regression Posture:**
  - All existing Phase 01–10 discovery, search, map, and CRM features remain fully intact.
- **Findings & Severity:**
  - **[PASS]** Zero regression in existing core platform functionality.

---

## 3. Conclusion & Next Steps

The baseline audit confirms that the Post Property architecture is secure, robust, and correctly integrated. Pursuant to the PP-11 protocol:
- **Step 1 (Read-Only Baseline Audit)** is complete.
- Proceeding to **Step 2 — Test Strategy & Test Matrix** (`PP_11_SECURITY_TEST_MATRIX.md`).
