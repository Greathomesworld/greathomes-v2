# Great Homes V2 — Master Architectural & Operational Handover Report (For ChatGPT)

This document is the authoritative technical blueprint for **Great Homes V2** (Kolkata Residential Real Estate Discovery, Market Intelligence & Assisted Advisory Platform). Use this specification whenever planning, modifying, or extending any feature, route, domain service, or database schema in future iterations.

---

## 1. Platform Overview & Core Principles

1. **Factual, Non-Speculative Real Estate Intelligence**
   - Every public page, market metric, and comparison view is strictly factual.
   - **Forbidden Content**: Speculative ROI claims, price appreciation guarantees, "AI scores", or combining incompatible area bases.
   - **Strict Price Basis Isolation**: Rates per sq.ft. are strictly segregated by `CARPET_AREA`, `BUILT_UP_AREA`, and `SUPER_BUILT_UP_AREA`—never averaged across different bases.
2. **Three Residential Discovery Modes**
   - **New Projects (`/projects`, `/projects/[slug]`)**: Primary developer projects with RERA verification, configuration matrices, floor plans, "Know Before You Buy" considerations, and nearby spatial connectivity.
   - **Resale Homes (`/buy`, `/buy/[slug]`)**: Verified secondary-market listings linked to canonical projects or standalone locations.
   - **Rental Homes (`/rent`, `/rent/[slug]`)**: Verified residential lease listings with monthly rent, deposit, maintenance, and furnishing metadata.
3. **Dual-Mode Persistence (`postgres` vs `memory`)**
   - **Production / Cloud SQL (`PERSISTENCE_PROVIDER=postgres` + `DATABASE_URL`)**: Uses Drizzle ORM (`src/db/schema.ts`, `src/db/client.ts`) against PostgreSQL + PostGIS.
   - **AI Studio Preview / Memory Mode (when `DATABASE_URL` is unset)**: `getDb()` returns `null` and the application automatically falls back to `globalThis`-backed in-memory repositories seeded by `ensureSeedData()` (`src/infrastructure/seed.ts`).
   - **Rule for Future Changes**: Whenever adding or modifying a service or repository, **always support both paths** (`if (db)` Drizzle query AND `else` in-memory repository fallback after `await ensureSeedData()`).

---

## 2. Canonical Design & Typography Lock (`AGENTS.md` — MANDATORY)

The typography system is locked across the entire codebase (`app/layout.tsx`, `app/globals.css`, `src/index.css`). Never introduce competing font families or violate token roles:

| Tailwind Token | Font Family | Allowed Usage | Forbidden Usage |
| :--- | :--- | :--- | :--- |
| `font-editorial` / `font-serif` | **Fjalla One** (`--font-fjalla`) | Project Hero titles, major editorial headlines, "Know Before You Buy", featured project spotlights | Body text, navigation, buttons, badges, metadata, forms, dense tables |
| `font-display` | **Plus Jakarta Sans** (`--font-plus-jakarta`) | Section headings, UI headings, navigation, buttons, CTAs, badges, filters, tabs, pricing numbers, card titles, form controls | Long-form reading paragraphs |
| `font-body` / `font-sans` | **Inter** (`--font-inter`) | Body copy, project descriptions, metadata, location breadcrumbs, FAQs, utility text, form inputs | Hero display headlines |

### Visual & Layout Rules
- **Color Tokens**: Warm off-white background (`#FAFAF8`), primary ink (`#111111`), brand coral accent (`#E85D3F`), verified emerald (`#218C5A`).
- **Global Layout Shell**: `app/layout.tsx` renders the global `<Header />`, `<ComparisonTray />`, `<Footer />`, and `<GreatHomesEnquiryDialog />` inside `<CustomerAuthProvider>` and `<EnquiryProvider>`.
- **CRITICAL**: Individual pages under `app/**` must **NEVER** import or render `<Header />` or `<Footer />` directly (to prevent duplicate headers/footers).

---

## 3. Complete Directory & Module Map

```text
/
├── AGENTS.md                                 # Canonical Typography & System Lock
├── package.json                              # Next.js 15.1.7, React 19, Drizzle ORM, Tailwind v4
├── app/                                      # Next.js App Router (Pages & API Routes)
│   ├── layout.tsx                            # RootLayout (Fonts, Providers, global Header/Footer)
│   ├── page.tsx                              # Homepage (Hero, Featured Projects, Market Snapshot)
│   ├── projects/                             # New Projects Discovery (/projects, /projects/[slug])
│   ├── buy/                                  # Resale Discovery (/buy, /buy/[slug])
│   ├── rent/                                 # Rental Discovery (/rent, /rent/[slug])
│   ├── locations/                            # Location Hub (/locations, /locations/[slug], /guide, /activity)
│   ├── developers/                           # Developer Profiles (/developers, /developers/[slug], /stories)
│   ├── market/                               # City & Locality Market Intelligence Dashboard (/market)
│   ├── compare/                              # Side-by-Side Comparison (/projects, /locations, /resale, /rent)
│   ├── guides/ & reviews/                    # Editorial Guides (/guides/[slug]) & Project Reviews (/reviews/[slug])
│   ├── account/                              # Customer Portal (Saved, Watchlist, Site Visits, Enquiries, Profile)
│   ├── admin/                                # Staff Back-Office CRM & Intelligence Console
│   └── api/                                  # REST API Routes (Public, Customer, Admin)
├── src/
│   ├── db/
│   │   ├── client.ts                         # getDb() Drizzle PG pool + ensureSchemaUpdates()
│   │   └── schema.ts                         # Full PostgreSQL + PostGIS schema definitions
│   ├── domain/                               # Domain-Driven Business Logic
│   │   ├── projects/                         # Projects, Configurations, RERA, Resale, Rental, NewBooking
│   │   ├── locations/                        # Hierarchical Locations (State -> District -> City -> Area)
│   │   ├── developers/                       # Developer profiles & media
│   │   ├── discovery/                        # Unified Search & Faceted Discovery Engine
│   │   ├── marketIntelligence/               # Supply, Price-per-Basis, RERA Coverage, Connectivity, Events
│   │   ├── comparison/ & locationComparison/ # Side-by-side Project, Resale, Rental & Location Comparison
│   │   ├── editorial/                        # Editorial Articles, Reviews, Buyer Guides, Location Guides
│   │   ├── enquiry/ & siteVisit/             # Lead capture, CRM assignment, follow-ups, site visit scheduling
│   │   ├── customer/                         # Customer OTP Auth, Watchlists, Saved Items, Notifications
│   │   └── staff/ & audit/                   # Staff RBAC Authentication, Capabilities, Audit Logging
│   ├── infrastructure/
│   │   ├── seed.ts                           # Idempotent ensureSeedData() for preview/memory & initial DB
│   │   └── repositories/
│   │       ├── locationProvider.ts           # Re-exports globalThis locationRepository singleton
│   │       ├── projectProvider.ts            # Re-exports globalThis project/config/rera/media singletons
│   │       ├── developerProvider.ts          # Re-exports globalThis developerRepository singleton
│   │       ├── memory/                       # In-memory repository implementations (globalThis-backed)
│   │       └── postgres/                     # PostgreSQL Drizzle repository implementations
│   └── components/                           # Reusable UI Components (Header, Footer, Cards, Charts, Modals)
└── drizzle/                                  # SQL migrations (0000_adorable_unus.sql, etc.)
```

---

## 4. Domain Subsystems & Data Flow

### 4.1 Locations & Spatial Hierarchy (`src/domain/locations`)
- **Hierarchy Tiers**: `STATE` → `DISTRICT` → `CITY` → `DISCOVERY_REGION` → `AREA` → `NEIGHBOURHOOD`.
- **Service**: `locationService` (`src/domain/locations/services/locationService.ts`) validates parent-child rules, circular hierarchy prevention, alias resolution (`newtown` → `new-town`), and ancestor breadcrumbs (`getLocationPath`).
- **Scope Resolution**: `marketIntelligenceService.resolveLocationScopeIds(locationIdOrSlug, scope)` resolves either `'DIRECT'` (exact location only) or `'DESCENDANT'` (the location plus all published child/descendant locations, e.g., `kolkata` includes `rajarhat`, `new-town`, `salt-lake`, `em-bypass`, etc.).

### 4.2 Projects, Resale & Rental (`src/domain/projects`)
- **New Projects (`projectIntelligenceService`)**:
  - Aggregates `Project`, `Developer`, `Location`, `ProjectConfiguration[]`, `ProjectRera`, `Amenity[]`, `ProjectMedia[]`, `ProjectFaq[]`, and `ProjectConsideration[]` ("Know Before You Buy").
  - Enforces publication visibility (`lifecycleStatus === 'PUBLISHED'` for public routes).
- **Resale (`resaleListingService`) & Rental (`rentalService`)**:
  - Supports both project-linked listings (`projectId` set, inherits project location/coordinates) and standalone listings (`locationId` + optional `latitude`/`longitude`).
  - Enforces state machine transitions: `DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` → `PUBLISHED` → `PAUSED` / `SOLD_RENTED` / `ARCHIVED`.

### 4.3 Market & Location Intelligence (`src/domain/marketIntelligence`)
- **`MarketIntelligenceService`**:
  - `getSupplyMetrics(locationId, scope)`: Counts published projects by stage (`NEW_LAUNCH`, `UNDER_CONSTRUCTION`, `READY_TO_MOVE`, `COMPLETED`, `SOLD_OUT`), configuration mix (`1 BHK`–`5+ BHK`), and published resale/rental counts.
  - `getPriceMetrics(locationId, scope)`: Computes min, max, median, and mean ₹/sq.ft. strictly isolated per `priceBasis` (`CARPET_AREA`, `BUILT_UP_AREA`, `SUPER_BUILT_UP_AREA`).
  - `getReraCoverage(locationId, scope)`: Computes `VERIFIED`, `PROVIDED`, and `NOT_PROVIDED` project counts and verified percentage.
  - `getConnectivityMetrics(locationId)`: Computes geodesic Haversine distances (in km) from the location to verified transit, healthcare, education, retail, and commercial landmarks (`placeRepository`).
- **`LocationIntelligenceService`**:
  - Assembles the full `LocationIntelligenceDTO` for `/locations/[slug]` and `/compare/locations`.
- **`MarketIntelligenceDashboardService`**:
  - Powers `/market` and `/api/market` with city/area overview cards, supply & price trend series, configuration distribution, RERA breakdown, location breakdown table, and recent factual market activity events.

### 4.4 Editorial & Content Engine (`src/domain/editorial`)
- **Article Types**: `PROJECT_REVIEW`, `BUYER_GUIDE`, `LOCATION_GUIDE`, `DEVELOPER_STORY`, `MARKET_EXPLAINER`.
- **Safety Validation**: `editorialService.validateContentSafety()` blocks promotional hype phrases (`best investment`, `guaranteed return`, `skyrocketing`, etc.).
- **Dual Persistence**: `editorialRepositoryPostgres.ts` queries PostgreSQL when `getDb()` is active and falls back to 5 canonical seeded articles in memory when `getDb()` is `null`.

### 4.5 Comparison Engine (`src/domain/comparison` & `src/domain/locationComparison`)
- **Project / Resale / Rental Comparison (`comparisonService`)**: Compares up to 4 items side-by-side (`/compare/projects`, `/compare/resale`, `/compare/rent`), resolving full DTOs by either UUID or slug.
- **Location Comparison (`locationComparisonService`)**: Compares 2 to 4 published locations side-by-side (`/compare/locations?locations=rajarhat,new-town`), enforcing hierarchy compatibility and isolated price-basis benchmarks.

### 4.6 Customer Auth, Watchlists & Assisted CRM (`src/domain/customer`, `src/domain/enquiry`, `src/domain/siteVisit`)
- **Customer Auth**: Mobile OTP login (`POST /api/customer/auth/otp/send`, `POST /api/customer/auth/otp/verify`), session cookie management, saved homes/projects, location watchlists, and alert preferences.
- **Enquiries & Site Visits**: Public submission via `POST /api/enquiries` and `POST /api/site-visits`, with staff assignment, status workflows, internal notes, and follow-up tracking in `/admin/enquiries` and `/admin/site-visits`.

### 4.7 Admin Back-Office & Staff RBAC (`src/domain/staff`, `app/admin`)
- **Roles**: `SUPER_ADMIN`, `ADMIN`, `CONTENT_MANAGER`, `LISTING_MANAGER`, `CRM_EXECUTIVE`.
- **Capabilities**: Fine-grained capability checks (`projects:write`, `rera:verify`, `content:publish`, `enquiries:manage`, `staff:manage`) enforced in API routes and logged to the immutable audit trail (`src/domain/audit`).

---

## 5. Summary of Recent Stabilizations & Fixes

1. **Dependency & Lockfile Fix (`package.json` & `bun.lock`)**:
   - Fixed invalid version ranges in `package.json` (`@google/genai` and `@types/uuid`) that caused `bun install` to fail with exit code 1, and regenerated a clean lockfile.
2. **Duplicate Header/Footer Removal**:
   - Removed redundant `<Header />` and `<Footer />` renders from 12 App Router pages (`/locations/[slug]`, `/locations/[slug]/guide`, `/market`, `/guides`, `/guides/[slug]`, `/reviews`, `/reviews/[slug]`, `/developers/[slug]/stories`, `/compare/projects`, `/compare/locations`, `/compare/resale`, `/compare/rent`) since `app/layout.tsx` provides them globally.
3. **Global Singleton Unification for In-Memory Repositories**:
   - Previously, `locationProvider.ts`, `projectProvider.ts`, and `developerProvider.ts` instantiated separate `new *RepositoryMemory()` objects from `memory/*RepositoryMemory.ts`. They now share singletons attached to `globalThis` (`__ghLocationRepo`, `__ghProjectRepo`, `__ghDeveloperRepo`, etc.) so `ensureSeedData()` populates the exact instances used by all services and API routes across Next.js route workers.
4. **Full In-Memory Fallbacks for Preview Environment**:
   - Added complete in-memory fallback logic (when `getDb()` is `null`) to `MarketIntelligenceService`, `LocationIntelligenceService`, `MarketIntelligenceDashboardService`, `MarketEventRepositoryPostgres`, `EditorialRepositoryPostgres`, `EditorialService`, `ComparisonService`, and `LocationComparisonService`.

---

## 6. Playbook & Rules for Future Changes by ChatGPT

When generating code or planning new features for Great Homes V2, follow this checklist:

1. **Check Persistence Mode Compatibility**:
   - Never assume `getDb()` is non-null. Always handle both `const db = getDb(); if (db) { ... } else { await ensureSeedData(); ... }` so features work seamlessly in both AI Studio Preview (memory mode) and Production PostgreSQL.
2. **Import Repositories from Canonical Providers**:
   - Import `locationRepository` from `@/src/infrastructure/repositories/locationProvider`.
   - Import `projectRepository`, `projectConfigurationRepository`, `projectReraRepository`, `projectMediaRepository`, `amenityRepository`, `projectFaqRepository`, `projectSeoRepository`, `projectConsiderationRepository` from `@/src/infrastructure/repositories/projectProvider`.
   - Import `developerRepository`, `developerMediaRepository` from `@/src/infrastructure/repositories/developerProvider`.
3. **Respect the Layout & Typography Lock**:
   - Do not add `<Header />` or `<Footer />` inside `app/**/page.tsx` (except `app/admin` which uses its own admin shell).
   - Use `font-editorial` (`Fjalla One`) only for high-impact hero/editorial titles, `font-display` (`Plus Jakarta Sans`) for UI/section headings/badges/controls/numbers, and `font-body` (`Inter`) for body copy.
4. **Maintain Factual & Price-Basis Integrity**:
   - Never mix `CARPET_AREA`, `BUILT_UP_AREA`, and `SUPER_BUILT_UP_AREA` rates.
   - Never introduce speculative investment claims, ROI calculators, or unverified badges.
5. **Verification Commands**:
   - Typecheck: `npm run lint` (`tsc --noEmit`)
   - Production build: `npm run build` (`next build`)
   - Dev server: `npm run dev` (`next dev -H 0.0.0.0 -p 3000`)
