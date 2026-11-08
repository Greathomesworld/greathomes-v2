import React, { Suspense, cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Building2, RotateCcw } from 'lucide-react';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import {
  buildProjectInventorySeoMetadata,
  parseProjectResaleSearchParams,
  PROJECT_INVENTORY_PAGE_SIZE,
} from '@/src/domain/projects/viewModels/projectInventoryViewModel';
import { Breadcrumbs, BreadcrumbItem } from '@/src/components/navigation/Breadcrumbs';
import { ProjectInventoryHeader } from '@/src/components/projects/ProjectInventoryHeader';
import { ProjectInventoryFilterBar } from '@/src/components/projects/ProjectInventoryFilterBar';
import { ProjectInventoryStructuredData } from '@/src/components/projects/ProjectInventoryStructuredData';
import { ProjectInventoryListingCard } from '@/src/components/projects/ProjectInventoryListingCard';
import { ProjectInventoryListingCarousel } from '@/src/components/projects/ProjectInventoryListingCarousel';
import { ProjectInventoryAlertForm } from '@/src/components/projects/ProjectInventoryAlertForm';
import { ProjectInventoryMobileCta } from '@/src/components/projects/ProjectInventoryMobileCta';
import { DiscoveryPagination } from '@/src/components/discovery/DiscoveryPagination';
import { NearbyListingsSection } from '@/src/components/projects/NearbyListingsSection';
import { ProjectsYouMayAlsoLike } from '@/src/components/projects/ProjectsYouMayAlsoLike';
import { GreatHomesAdvisoryCard } from '@/src/components/projects/GreatHomesAdvisoryCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getCachedProjectBySlug = cache(async (slug: string) => {
  await ensureSeedData();
  return projectIntelligenceService.getProjectBySlug(slug, false);
});

const getCachedResalePageData = cache(async (projectId: string, filterJson: string, page: number) => {
  const filter = JSON.parse(filterJson);
  return resaleListingService.getPaginatedPublicListingsForProject(projectId, {
    filter,
    page,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
  });
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearch = await searchParams;

  const project = await getCachedProjectBySlug(slug);
  if (!project || project.lifecycleStatus !== 'PUBLISHED') {
    notFound();
  }

  const parsed = parseProjectResaleSearchParams(resolvedSearch);
  const { facets } = await getCachedResalePageData(
    project.id,
    JSON.stringify(parsed.filter),
    parsed.page
  );

  return buildProjectInventorySeoMetadata({
    project,
    mode: 'RESALE',
    totalEligibleCount: facets.totalEligibleCount,
    verifiedCount: facets.verifiedCount,
    hasActiveFilters: parsed.hasActiveFilters,
    hasExplicitSort: parsed.hasExplicitSort,
    page: parsed.page,
  });
}

export default async function ProjectResaleInventoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearch = await searchParams;

  const project = await getCachedProjectBySlug(slug);
  if (!project || project.lifecycleStatus !== 'PUBLISHED') {
    notFound();
  }

  const parsed = parseProjectResaleSearchParams(resolvedSearch);

  // In parallel: primary paginated inventory (deduplicated via cache), sibling rentals, and discovery bundle
  const [paginated, siblingRentalSummary, discoveryBundle] = await Promise.all([
    getCachedResalePageData(project.id, JSON.stringify(parsed.filter), parsed.page),
    rentalListingService.getPaginatedPublicListingsForProject(project.id, {
      page: 1,
      pageSize: 6,
    }),
    propertyDiscoveryService.getBatch2DiscoveryForProject(project, {
      maxDistanceKm: 15,
      limit: 6,
    }),
  ]);

  const { items: listings, facets, page, pageSize, totalPages } = paginated;
  const siblingEligibleRentalCount = siblingRentalSummary.facets.totalEligibleCount;

  // Relevance-rank sibling rental listings by matching active BHK/furnishing and verification status
  const activeBhk = parsed.filter.bedroomCount;
  const activeFurnishing = parsed.filter.furnishing;
  const siblingRentalListings = [...siblingRentalSummary.items].sort((a, b) => {
    const aBhkMatch = activeBhk && a.bedroomCount === activeBhk ? 1 : 0;
    const bBhkMatch = activeBhk && b.bedroomCount === activeBhk ? 1 : 0;
    if (aBhkMatch !== bBhkMatch) return bBhkMatch - aBhkMatch;

    const aFurnMatch = activeFurnishing && a.furnishing === activeFurnishing ? 1 : 0;
    const bFurnMatch = activeFurnishing && b.furnishing === activeFurnishing ? 1 : 0;
    if (aFurnMatch !== bFurnMatch) return bFurnMatch - aFurnMatch;

    const aVer = a.isVerified ? 1 : 0;
    const bVer = b.isVerified ? 1 : 0;
    return bVer - aVer;
  });

  const activeFilterCount = [
    parsed.filter.bedroomCount !== undefined,
    parsed.filter.minPrice !== undefined || parsed.filter.maxPrice !== undefined,
    Boolean(parsed.filter.furnishing),
    Boolean(parsed.filter.floorCategory),
    Boolean(parsed.filter.possession),
    parsed.filter.verificationStatus === 'VERIFIED',
  ].filter(Boolean).length;

  const localityName = project.location?.name?.trim() || 'Kolkata';

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Projects', href: '/projects' },
    ...(project.location?.name && project.location?.slug
      ? [{ label: project.location.name, href: `/locations/${project.location.slug}` }]
      : []),
    { label: project.name, href: `/projects/${project.slug}` },
    { label: 'Resale Apartments' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] pb-32 md:pb-24 lg:pb-0">
      {/* Structured Data (BreadcrumbList + CollectionPage + conditional ItemList) */}
      <ProjectInventoryStructuredData
        project={project}
        mode="RESALE"
        resaleListings={listings}
      />

      {/* Breadcrumbs Bar */}
      <div className="bg-[var(--color-background)] border-b border-[var(--color-border)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>

      {/* Project Identity & Inventory KPI Header */}
      <ProjectInventoryHeader
        project={project}
        mode="RESALE"
        totalEligibleCount={facets.totalEligibleCount}
        siblingEligibleCount={siblingEligibleRentalCount}
        verifiedCount={facets.verifiedCount}
        minValue={facets.minPrice}
        maxValue={facets.maxPrice}
        availableBhkCounts={facets.availableBhkCounts}
      />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Filter & Sort Controls (Rendered when project has eligible resale units) */}
        {facets.totalEligibleCount > 0 && (
          <Suspense fallback={null}>
            <ProjectInventoryFilterBar
              mode="RESALE"
              availableBhkCounts={facets.availableBhkCounts}
              availableFurnishings={facets.availableFurnishings}
              availableFloorCategories={facets.availableFloorCategories}
              availablePossessions={facets.availablePossessions}
              verifiedCount={facets.verifiedCount}
              minAvailableValue={facets.minPrice}
              maxAvailableValue={facets.maxPrice}
              totalEligibleCount={facets.totalEligibleCount}
              filteredCount={facets.filteredCount}
              hasActiveFilters={parsed.hasActiveFilters}
            />
          </Suspense>
        )}

        {/* Primary Inventory Section or Informational Alert Form */}
        {facets.totalEligibleCount === 0 ? (
          <section aria-labelledby="zero-inventory-heading" className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015] p-6 sm:p-8 text-center max-w-3xl mx-auto space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-foreground)]/[0.05] border border-[var(--color-border)] flex items-center justify-center mx-auto text-[var(--color-foreground)]/70">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 id="zero-inventory-heading" className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)]">
                  No Resale Apartments Currently Listed in {project.name}
                </h2>
                <p className="text-xs sm:text-sm font-body text-[var(--color-foreground)]/75 leading-relaxed">
                  Looking to buy an apartment in <strong>{project.name}</strong>? There are currently no resale apartments listed in this project. Register your requirement below and we&apos;ll help you explore suitable options.
                </p>
              </div>
            </div>

            {/* Interactive Availability Alert Card */}
            <ProjectInventoryAlertForm project={project} mode="RESALE" />
          </section>
        ) : listings.length === 0 ? (
          <section aria-labelledby="filter-empty-heading" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015] p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-5 my-6">
            <div className="space-y-2">
              <h2 id="filter-empty-heading" className="text-xl font-display font-semibold text-[var(--color-foreground)]">
                No Resale Apartments Match Your Selected Filters
              </h2>
              <p className="text-sm font-body text-[var(--color-foreground)]/70">
                Try clearing one or more filters to view all {facets.totalEligibleCount}{' '}
                {facets.totalEligibleCount === 1 ? 'resale apartment' : 'resale apartments'} in {project.name}.
              </p>
            </div>
            <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/projects/${project.slug}/resale`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] text-xs font-display font-semibold hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </Link>
            </div>
          </section>
        ) : (
          <section aria-label="Available Resale Listings" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing, idx) => (
                <ProjectInventoryListingCard
                  key={listing.id}
                  listing={listing}
                  mode="RESALE"
                  projectName={project.name}
                  projectSlug={project.slug}
                  locationName={localityName}
                  priority={idx < 3}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            <DiscoveryPagination
              currentPage={page}
              totalPages={totalPages}
              totalCount={facets.filteredCount}
              pageSize={pageSize}
            />
          </section>
        )}

        {/* Sibling Category Discovery: Also Available for Rent in {Project Name} */}
        {siblingEligibleRentalCount > 0 && siblingRentalListings.length > 0 && (
          <section aria-labelledby="sibling-rental-heading" className="space-y-5 pt-8 border-t border-[var(--color-border)]">
            <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-foreground)]/[0.015] p-5 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
                <div>
                  <h2 id="sibling-rental-heading" className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)] tracking-tight">
                    Also Available for Rent in {project.name} ({siblingEligibleRentalCount})
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
                    Prefer renting instead? Explore {siblingEligibleRentalCount}{' '}
                    {siblingEligibleRentalCount === 1 ? 'apartment' : 'apartments'} currently available for rent in this project.
                  </p>
                </div>

                <Link
                  href={`/projects/${project.slug}/rent`}
                  className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[var(--color-accent)] hover:underline shrink-0"
                >
                  <span>View All Rental Apartments ({siblingEligibleRentalCount})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <ProjectInventoryListingCarousel
                listings={siblingRentalListings}
                mode="RENTAL"
                projectName={project.name}
                projectSlug={project.slug}
                locationName={localityName}
                ariaLabel={`Apartments available for rent in ${project.name}`}
              />
            </div>
          </section>
        )}

        {/* Nearby Secondary Resale Properties in Locality / Corridor */}
        {discoveryBundle.nearbyResale.length > 0 && (
          <NearbyListingsSection
            nearbyResale={discoveryBundle.nearbyResale}
            nearbyRental={[]}
            projectName={project.name}
            locationName={localityName}
            locationSlug={project.location?.slug}
            currentProjectId={project.id}
            excludeResaleIds={listings.map(l => l.id)}
            hasValidCoordinates={Boolean(project.latitude && project.longitude)}
          />
        )}

        {/* Curated Related Projects You May Also Like */}
        {discoveryBundle.relatedProjects.length > 0 && (
          <ProjectsYouMayAlsoLike
            projects={discoveryBundle.relatedProjects}
            currentProjectId={project.id}
            currentProjectSlug={project.slug}
          />
        )}

        {/* Advisory Guidance Card (shown on populated resale pages; zero-inventory pages use the primary availability alert form) */}
        {facets.totalEligibleCount > 0 && (
          <section aria-label="Great Homes Advisory Guidance" className="pt-8 border-t border-[var(--color-border)]">
            <GreatHomesAdvisoryCard project={project} mode="RESALE" />
          </section>
        )}

        {/* Crawlable Internal Discovery Links Footer */}
        <section
          aria-label="Related property discovery links"
          className="pt-8 border-t border-[var(--color-border)] space-y-4"
        >
          <h2 className="text-sm font-display font-semibold uppercase tracking-wider text-[var(--color-foreground)]/65">
            Explore Related Discovery in {localityName} & Kolkata
          </h2>
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-display font-semibold">
            <Link
              href={`/projects/${project.slug}`}
              className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
            >
              {project.name} Overview
            </Link>
            <Link
              href={`/projects/${project.slug}/rent`}
              className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
            >
              Apartments for Rent in {project.name}
            </Link>
            {project.location?.slug && (
              <Link
                href={`/locations/${project.location.slug}`}
                className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
              >
                Projects & Homes in {localityName}
              </Link>
            )}
            {project.developer?.slug && project.developer?.name && (
              <Link
                href={`/developers/${project.developer.slug}`}
                className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
              >
                Projects by {project.developer.name}
              </Link>
            )}
            <Link
              href="/buy"
              className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
            >
              All Resale Apartments in Kolkata
            </Link>
            <Link
              href="/rent"
              className="px-3.5 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
            >
              All Apartments for Rent in Kolkata
            </Link>
          </div>
        </section>
      </main>

      {/* Mobile Sticky CTA Bar */}
      <ProjectInventoryMobileCta
        project={project}
        mode="RESALE"
        totalEligibleCount={facets.totalEligibleCount}
        activeFilterCount={activeFilterCount}
      />
    </div>
  );
}
