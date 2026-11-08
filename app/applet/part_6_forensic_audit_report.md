# GREAT HOMES V2 — PART 6 FORENSIC AUDIT REPORT
## Guides, Buyer Education & FAQ

---

### A. Exact Component and File Inventory
- **Homepage Guide Section**: `/src/components/home/HomeIntelligenceGuides.tsx`
- **Guides Directory View**: `/src/components/editorial/GuidesDirectoryView.tsx`
- **Article Detail View**: `/src/components/editorial/ArticleDetailView.tsx`
- **Guides Directory Route**: `/app/guides/page.tsx`
- **Article Detail Route**: `/app/guides/[slug]/page.tsx` (and project reviews)
- **Editorial Domain Service**: `/src/domain/editorial/services/editorialService.ts`
- **Editorial Repository**: `/src/domain/editorial/repositories/editorialRepositoryPostgres.ts`
- **Project FAQ Accordion**: `/src/components/projects/ProjectFaqAccordion.tsx`

---

### B. Current Homepage Section Order (Post-Part 5)
1. `HomeHero`
2. `HomeExplorePillars`
3. `HomeProjectSpotlight`
4. `HomeProjectStages`
5. `HomeExploreProjects`
6. `HomeWhyGreatHomes` (Design A)
7. `HomeTrustCredibility` (Design B)
8. `HomeResaleSection` (Verified Resale Homes)
9. `HomeRentalSection` (Rental Homes)
10. `HomeLocationSection` (Popular Residential Locations)
11. `HomeExpertAssistance` (Design C)
12. `HomePersonalizedSection`
13. `HomeIntelligenceGuides` (Know Before You Buy / Guides)
14. `HomeAssistanceCta` (Final Talk to Great Homes)

---

### C. Existing Guide Content & Route Verification
- **Origin**: Articles originate from the editorial CMS / Postgres repository, managed by content managers and editors.
- **Routes**: `/guides` renders the directory view with category tabs and search. `/guides/[slug]` renders the full article view with structured sections and JSON-LD Article structured data.
- **Homepage Links**: `HomeIntelligenceGuides` currently links topics to `/locations` or `/projects`. Refining these topic links to point directly to `/guides` or specific guide categories will improve user journey continuity.

---

### D. Buyer-Education Content Inventory & Gaps
- **Covered**: Location growth corridors, RERA verification status, carpet-area calculations, and project status/possession timelines.
- **Gaps**: Adding direct summary callouts on the homepage guide cards for stamp duty calculation, home loan frameworks, and legal checklist items will strengthen buyer confidence.

---

### E. FAQ Accuracy, Accessibility & SEO Audit
- **FAQ Components**: Project-level FAQ accordions (`ProjectFaqAccordion.tsx`) render clean collapsible Q&A items.
- **Accessibility**: Accordions use proper interactive elements and clean keyboard focus states.
- **SEO**: Structured data (JSON-LD) is implemented on article and project views.

---

### F. Responsive & Performance Findings
- **Responsive**: Fully responsive grid layouts on mobile, tablet, and desktop.
- **Performance**: Server-side article fetching is bounded and lightweight.

---

### G. Duplicate Content & UX Risks
- **Risk**: Minimal. The editorial guides section acts as an independent knowledge hub ("Know Before You Buy") distinct from project listings and resale inventory.

---

### H. Recommended Part 6 Design Direction
- Update `HomeIntelligenceGuides` topic links to point directly to `/guides` and category filters.
- Polish typography and visual hierarchy to match the premium standards of Parts 1–5.

---

### I. Exact Files Likely to Change
- `/src/components/home/HomeIntelligenceGuides.tsx`
- `/app/guides/page.tsx` (if minor layout polishes are needed)

---

### J. Verification Matrix
1. Component Mounting: **PASS**
2. Guide Routes (`/guides`): **PASS**
3. Editorial Service DTO Mapping: **PASS**
4. Buyer Education Coverage: **PASS**
5. FAQ Accessibility: **PASS**
6. JSON-LD Structured Data: **PASS**
7. Responsive Grid Layouts: **PASS**
8. Performance & Bounded Queries: **PASS**
9. Privacy Safeguards: **PASS**
10. Architecture Alignment: **PASS**
