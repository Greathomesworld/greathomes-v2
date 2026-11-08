# GREAT HOMES V2 — PART 4 FORENSIC AUDIT REPORT
## Resale, Rental and Location Discovery

---

### A. Exact Component and File Inventory
- **Homepage Page File**: `/app/page.tsx`
- **Resale & Rental Discovery Component**: `/src/components/home/HomeResaleRentalDiscovery.tsx`
- **Location Discovery Component**: `/src/components/home/HomeExploreLocations.tsx`
- **Resale Domain Services & Repositories**: `/src/domain/projects/services/resaleService.ts`, `/src/domain/projects/repositories/resaleRepository.ts`
- **Rental Domain Services & Repositories**: `/src/domain/projects/services/rentalService.ts`, `/src/domain/projects/repositories/rentalRepository.ts`
- **Location Repositories**: `/src/infrastructure/repositories/locationProvider.ts`, `/src/infrastructure/repositories/memory/locationRepositoryMemory.ts`
- **Illustrations**: `/src/components/illustrations/GreatHomesIllustration.tsx`

---

### B. Resale Discovery: Existing Behavior, Available Data and Gaps
- **Selection**: Resale listings are fetched via `resaleListingService.listPublicListings({ limit: 4 })`, filtering strictly for published (`lifecycleStatus === 'PUBLISHED'`) listings.
- **Data Available**: ID, title, slug, BHK count, location name, project name, expected price (`pricing.expectedPrice`), cover image (`media[0].url`), and verification badge (`isVerified`).
- **Privacy & Compliance**: Owner phone numbers, direct email addresses, and private KYC documents remain protected on the server side and are never exposed in public DTOs or homepage cards. Price per square foot is correctly omitted per domain rules.
- **Gaps**: Homepage currently shows a 3-item mini-list within a split editorial card. Enhancing visual card prominence and adding quick filter tags will improve engagement.

---

### C. Rental Discovery: Existing Behavior, Available Data and Gaps
- **Selection**: Rental listings are fetched via `rentalListingService.listPublicListings({ limit: 4 })`, restricting results to published rental inventory.
- **Data Available**: ID, title, slug, BHK count, location name, project name, monthly rent (`pricing.monthlyRent`), cover image, and verification badge.
- **Formatting**: Prices are clearly formatted with `/mo` suffix to distinguish rentals from resale properties.
- **Privacy & Compliance**: Landlord contact details remain secure. Rental yields and rent per square foot are omitted per domain guidelines.

---

### D. Location Discovery: Existing Behavior, Canonical Data and Gaps
- **Selection**: `HomeExploreLocations` processes all published locations, prioritizing key Kolkata growth corridors (`new-town`, `rajarhat`, `salt-lake`, `action-area-1`, `action-area-2`, `action-area-3`) and supplementing with locations having active project counts.
- **Canonical Data**: Uses canonical location IDs, slugs, and names mapped directly from the location repository.
- **Terminology**: The consumer-facing term "micro-market" is strictly avoided in favor of "Neighborhood Intelligence" and "Corridors".
- **Visuals**: Integrates the official vector illustration `LOCATION_DISCOVERY` alongside clean neighborhood list rows with live project counts.

---

### E. Current Homepage Section Order & Duplication Risks
1. `HomeHero` (Universal search & modes)
2. `HomeExplorePillars` (Pillars overview)
3. `HomeProjectSpotlight` (Featured project spotlight)
4. `HomeProjectStages` (Timeline & construction stages)
5. `HomeExploreProjects` (Curated master developments)
6. `HomeExploreLocations` (Neighborhood intelligence)
7. `HomePersonalizedSection` (Preferences & account awareness)
8. `HomeResaleRentalDiscovery` (Immediate availability: Resale & Rent)
9. `HomeWhyGreatHomes` (Assistance & advisory)
10. `HomeIntelligenceGuides` (Market intelligence guides)
11. `HomeAssistanceCta` (Final talk to advisor CTA)

*Conclusion*: No content duplication exists across these sections. Each serves a distinct visitor intent (master plans vs neighborhoods vs ready-to-move resale/rentals).

---

### F. Visual and Responsive Assessment
- **Desktop**: Clean 2-column split layouts for Resale/Rent and Neighborhood Intelligence with generous spacing, warm-white backgrounds (`#FAFAF8`), and high-contrast typography.
- **Tablet & Mobile**: Gracefully stacks into single-column responsive cards with touch-friendly targets and zero horizontal page overflow.

---

### G. Performance Findings
- **CONFIRMED**: All master data (`projects`, `locations`, `developers`) and listing queries are fetched concurrently via `Promise.all` in `app/page.tsx`, eliminating blocking sequential roundtrips.
- **CONFIRMED**: Resale and rental listing queries are bounded (`limit: 4`) and wrapped in robust graceful fallback blocks.
- **CONFIRMED**: Images utilize optimized URLs and lazy loading.

---

### H. Recommended Part 4 Design Specification
- Polish visual hierarchy and typography in `HomeResaleRentalDiscovery` and `HomeExploreLocations` to match the exact polish of Parts 1–3.
- Ensure strict adherence to typography tokens (`font-display` for headings/CTAs, `font-body` for copy).
- Verify all interactive links (`/buy`, `/rent`, `/locations/[slug]`, `/buy/[slug]`, `/rent/[slug]`) resolve correctly.

---

### I. Exact Files Likely to Change
- `/src/components/home/HomeResaleRentalDiscovery.tsx`
- `/src/components/home/HomeExploreLocations.tsx`
- `/app/page.tsx` (if minor layout or data prop adjustments are required)

---

### J. Functional, Data-Integrity and Risk Assessment
- **Privacy**: Owner/landlord PII remains 100% protected.
- **Data Integrity**: Zero fabrication of inventory counts, prices, or locations.
- **Schema**: No database migrations or schema modifications required.

---

### K. Verification Statement
Findings are based on static code analysis of the TypeScript domain services, repositories, and React components, combined with live endpoint verification (`HTTP 200 OK`) and automated test suites.
