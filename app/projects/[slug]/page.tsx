import { Suspense } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 60;

import { ChevronRight } from 'lucide-react';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { newBookingService } from '@/src/domain/projects/services/newBookingService';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { developerService } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { formatProjectLocationShortLabel } from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { formatIndianPrice } from '@/src/components/discovery/formatters';

import { ProjectHero } from '@/src/components/projects/ProjectHero';
import { GreatHomesAdvisoryCard } from '@/src/components/projects/GreatHomesAdvisoryCard';
import { ProjectSectionNavigation, NavItem } from '@/src/components/projects/ProjectSectionNavigation';
import { ProjectSnapshot } from '@/src/components/projects/ProjectSnapshot';
import { ProjectConsiderations } from '@/src/components/projects/ProjectConsiderations';
import { ProjectConfigurationsSection } from '@/src/components/projects/ProjectConfigurationsSection';
import { mergeConfigurationAvailabilityOverrides } from '@/src/components/projects/typologies/typologyModel';
import { ResaleSection } from '@/src/components/projects/ResaleSection';
import { RentalSection } from '@/src/components/projects/RentalSection';
import { NearbyListingsSection } from '@/src/components/projects/NearbyListingsSection';
import { ProjectMediaGallery } from '@/src/components/projects/ProjectMediaGallery';
import { ProjectMasterPlan } from '@/src/components/projects/ProjectMasterPlan';
import { ProjectConstructionGallery } from '@/src/components/projects/ProjectConstructionGallery';
import { ProjectWalkthrough } from '@/src/components/projects/ProjectWalkthrough';
import { ProjectAmenities } from '@/src/components/projects/ProjectAmenities';
import {
  getEligibleResaleListings,
  getEligibleRentalListings,
  getEligibleGalleryMedia,
  getEligibleAmenities,
} from '@/src/domain/projects/viewModels/projectSectionEligibility';
import { ProjectLocationSection } from '@/src/components/projects/ProjectLocationSection';
import {
  buildProjectLocationViewModel,
  ProjectLocationViewModel,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { nearbyPlaceService } from '@/src/domain/places/services/nearbyPlaceService';
import { NearbyPlaceDto } from '@/src/domain/places/entities';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { ProjectDeveloperSection } from '@/src/components/projects/ProjectDeveloperSection';
import { ProjectsYouMayAlsoLike } from '@/src/components/projects/ProjectsYouMayAlsoLike';
import { ProjectFaqAccordion } from '@/src/components/projects/ProjectFaqAccordion';
import { ProjectFinalCta } from '@/src/components/projects/ProjectFinalCta';
import { MobileStickyCta } from '@/src/components/projects/MobileStickyCta';
import { ProjectStructuredData } from '@/src/components/projects/ProjectStructuredData';
import { ProjectFloorPlanViewer } from '@/src/components/projects/ProjectFloorPlanViewer';
import { ProjectBrochureModal } from '@/src/components/projects/ProjectBrochureModal';
import { ProjectInteractionProvider } from '@/src/components/projects/ProjectInteractionContext';
import { Breadcrumbs, BreadcrumbItem } from '@/src/components/navigation/Breadcrumbs';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { SaveButton } from '@/src/components/customer/SaveButton';
import { AddToCompareButton } from '@/src/components/comparison/AddToCompareButton';
import { parseVideoUrl } from '@/src/lib/videoUtils';

export async function generateMetadata(
  props: any
): Promise<Metadata> {
  await ensureSeedData();
  const { slug } = await props.params;
  const project = await projectIntelligenceService.getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const locationLabel = formatProjectLocationShortLabel(project.location);
  const devName = project.developer?.name ? ` by ${project.developer.name}` : '';
  const bhkSummary = project.configurationsSummary || (project.configurations?.length ? project.configurations.map(c => c.name).join(', ') : 'Luxury Flats');

  // Compact title formula (aiming <= 62 chars)
  let title = `${project.name} — ${bhkSummary} in ${locationLabel}, Kolkata | Great Homes`;
  if (title.length > 65) {
    title = `${project.name} in ${locationLabel}, Kolkata | Great Homes`;
  }

  // Price on Request complete boundary check: never leak price if priceOnRequest is true or price <= 0
  const hasPublicPrice = !project.pricing?.priceOnRequest && Boolean(project.pricing?.startingPrice && project.pricing.startingPrice > 0);
  const priceStr = hasPublicPrice ? ` starting from ${formatIndianPrice(project.pricing.startingPrice!)}` : '';
  const reraStr = project.rera?.registrationNumber ? ` (RERA: ${project.rera.registrationNumber})` : '';

  // Use shortDescription only if substantial (>= 100 chars), else synthetic fallback
  const hasSubstantialShortDesc = Boolean(project.shortDescription && project.shortDescription.trim().length >= 100);
  const description = hasSubstantialShortDesc
    ? project.shortDescription!.trim()
    : `Explore ${project.name}${devName} in ${locationLabel}, Kolkata${priceStr}. Discover verified configurations${bhkSummary ? ` (${bhkSummary})` : ''}, floor plans, amenities, pricing intelligence, and location details${reraStr} on Great Homes.`;

  const canonicalUrl = `https://www.greathomes.co.in/projects/${project.slug}`;
  const heroMedia = project.media?.find(m => m.isFeatured) || project.media?.[0];

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'website',
      images: heroMedia?.url ? [{ url: heroMedia.url, alt: heroMedia.altText || `${project.name} Flagship View` }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: heroMedia?.url ? [heroMedia.url] : undefined,
    },
  };
}

export default async function ProjectDetailPage(
  props: any
) {
  await ensureSeedData();
  const { slug } = await props.params;
  const project = await projectIntelligenceService.getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const [availabilityRecords, resaleListings, rentalListings, developerDto] = await Promise.all([
    newBookingService.getProjectConfigurationAvailabilityRecords(project.id),
    resaleListingService.getPublicListingsForProject(project.id),
    rentalListingService.getPublicListingsForProject(project.id),
    developerService.getDeveloperProfileForProject(project.developer.id).catch(() => null),
  ]);

  const mergedConfigurations = mergeConfigurationAvailabilityOverrides(
    project.configurations,
    availabilityRecords
  );

  const eligibleResaleListings = getEligibleResaleListings(resaleListings, project.id);
  const eligibleRentalListings = getEligibleRentalListings(rentalListings, project.id);
  const eligibleGalleryMedia = getEligibleGalleryMedia(project.media);
  const eligibleAmenities = getEligibleAmenities(project.amenities);
  const eligibleFaqs = (project.faqs || []).filter(
    f => f && f.isPublished !== false && f.question && f.question.trim().length > 0 && f.answer && f.answer.trim().length > 0
  );

  const locationVm = buildProjectLocationViewModel(
    project.location,
    null,
    project
  );

  const [discoveryBundle, fallbackGeodesicConnectivity] = await Promise.all([
    propertyDiscoveryService.getProjectDetailDiscoveryBundle(project, {
      excludeResaleIds: eligibleResaleListings.map(r => r.id),
      excludeRentalIds: eligibleRentalListings.map(r => r.id),
      maxDistanceKm: 15,
      limit: 6,
    }),
    // Resolve instant local straight-line geodesic places (0 external network calls)
    // so the Suspense fallback renders the complete map and verified geodesic places immediately
    nearbyPlaceService.getProjectNearbyConnectivity(
      {
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        projectLatitude: project.projectLatitude,
        projectLongitude: project.projectLongitude,
        latitude: project.latitude,
        longitude: project.longitude,
        locationStatus: locationVm.locationStatus,
        coordinateSource: locationVm.coordinateSource,
        hasVerifiedProjectCoordinates: locationVm.hasVerifiedProjectCoordinates,
        location: project.location,
      },
      { radiusKm: 15, limit: 20, allowRoadRouting: false }
    ),
  ]);

  const overviewText = (project.description || project.shortDescription || '').trim();

  const hasValidVideoMedia = (project.media || []).some((m) => {
    const parsed = parseVideoUrl(m.url);
    return (
      parsed.isValid ||
      (m.category || '').toUpperCase() === 'WALKTHROUGH' ||
      (m.mediaType || '').toUpperCase() === 'VIDEO'
    );
  });

  const hasConsiderations = Boolean(
    project.developer?.name ||
    project.location?.name ||
    (project.considerations && project.considerations.length > 0)
  );

  const navItems: NavItem[] = [];
  if (overviewText) {
    navItems.push({ id: 'overview', label: 'Overview' });
  }
  navItems.push({ id: 'snapshot', label: 'Snapshot' });
  if (hasValidVideoMedia) {
    navItems.push({ id: 'walkthrough', label: 'Walkthrough' });
  }
  if (hasConsiderations) {
    navItems.push({ id: 'considerations', label: 'Why Consider' });
  }
  if (mergedConfigurations && mergedConfigurations.length > 0) {
    navItems.push({ id: 'configurations', label: 'Configurations' });
  }
  if (eligibleResaleListings.length > 0) {
    navItems.push({ id: 'resale', label: `Resale (${eligibleResaleListings.length})` });
  }
  if (eligibleRentalListings.length > 0) {
    navItems.push({ id: 'rent', label: `For Rent (${eligibleRentalListings.length})` });
  }
  if (eligibleGalleryMedia.length > 0) {
    navItems.push({ id: 'gallery', label: 'Gallery' });
  }
  if (eligibleAmenities.length > 0) {
    navItems.push({ id: 'amenities', label: 'Amenities' });
  }
  navItems.push({ id: 'location', label: 'Location & Connectivity' });
  navItems.push({ id: 'developer', label: 'Developer' });
  if (eligibleFaqs.length > 0) {
    navItems.push({ id: 'faq', label: 'FAQs' });
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Projects', href: '/projects' },
    { label: project.location.name, href: `/locations/${project.location.slug}` },
    { label: project.name },
  ];

  return (
    <ProjectInteractionProvider>
      <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* JSON-LD Structured Data */}
      <ProjectStructuredData project={project} />

      {/* Editorial Breadcrumbs, Compare & Save Actions */}
      <div className="bg-[var(--color-background)] border-b border-[var(--color-border)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex items-center gap-2 shrink-0">
            <AddToCompareButton mode="PROJECTS" id={project.id} name={project.name} />
            <SaveButton resourceType="PROJECT" resourceId={project.id} showLabel />
          </div>
        </div>
      </div>

      <RecentlyViewedTracker resourceType="PROJECT" resourceId={project.id} />

      {/* Flagship Desktop & Mobile Layout Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-36 md:pb-24 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 xl:gap-4 items-start">
          {/* Main Left Column: Hero (6-col image + 3-col teasers on lg) + Sticky Nav + Content Sections */}
          <div className="col-span-1 lg:col-span-9 space-y-6 min-w-0 self-stretch">
            {/* Flagship Editorial Hero with Bento Grid & Mobile Layout */}
            <ProjectHero project={project} />

            {/* Sticky Section Navigation */}
            <ProjectSectionNavigation items={navItems} />

            {/* Main Content Sections with Balanced Visual Density */}
            <main className="space-y-12 pt-2 [&_section[id]]:scroll-mt-[132px]">
              {/* Project Description & Editorial Overview (Matches #overview navItem order) */}
              {overviewText && (
                <section id="overview" aria-labelledby="project-overview-heading" className="space-y-4">
                  <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1">
                    Project Architecture
                  </div>
                  <h2 id="project-overview-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
                    Editorial Project Overview
                  </h2>
                  <p className="text-base md:text-lg font-body text-[var(--color-foreground)]/85 leading-relaxed">
                    {overviewText}
                  </p>
                </section>
              )}

              {/* Project Snapshot */}
              <ProjectSnapshot project={project} />

              {/* Walkthrough (only if valid video media exists) */}
              <ProjectWalkthrough mediaList={project.media} projectName={project.name} />

              {/* Why Consider & Things to Keep in Mind */}
              <ProjectConsiderations project={project} />

              {/* Configurations Section */}
              <ProjectConfigurationsSection
                configurations={mergedConfigurations}
                mediaList={project.media}
                projectName={project.name}
                projectSlug={project.slug}
                locationName={project.location.name}
              />

              {/* Resale Intelligence Section (published current-project listings only) */}
              <ResaleSection
                listings={eligibleResaleListings}
                projectSlug={project.slug}
                projectId={project.id}
                projectName={project.name}
                totalCount={eligibleResaleListings.length}
              />

              {/* Rental Intelligence Section (published current-project listings only) */}
              <RentalSection
                listings={eligibleRentalListings}
                projectSlug={project.slug}
                projectId={project.id}
                projectName={project.name}
                totalCount={eligibleRentalListings.length}
              />

              {/* Nearby Resale & Rental Properties Discovery (separate from current project) */}
              <NearbyListingsSection
                nearbyResale={discoveryBundle.nearbyResale}
                nearbyRental={discoveryBundle.nearbyRental}
                projectName={project.name}
                locationName={locationVm.name}
                locationSlug={locationVm.slug}
                currentProjectId={project.id}
                excludeResaleIds={eligibleResaleListings.map(r => r.id)}
                excludeRentalIds={eligibleRentalListings.map(r => r.id)}
                hasValidCoordinates={locationVm.hasVerifiedProjectCoordinates}
              />

              {/* Rich Media Gallery */}
              <ProjectMediaGallery mediaList={eligibleGalleryMedia} projectName={project.name} />

              {/* Master Plan Section */}
              <ProjectMasterPlan mediaList={project.media} projectName={project.name} />

              {/* Construction Progress Section */}
              <ProjectConstructionGallery mediaList={project.media} projectName={project.name} />

              {/* Curated Amenities Section */}
              <ProjectAmenities amenities={eligibleAmenities} />

              {/* Location & Connectivity Section (Isolated in Suspense with instant geodesic fallback so slow routing never blocks critical project rendering) */}
              <Suspense
                fallback={
                  <ProjectLocationSection
                    location={locationVm}
                    projectName={project.name}
                    nearbyPlaces={fallbackGeodesicConnectivity.places}
                    routingAttribution={null}
                    connectivityDisclosure={fallbackGeodesicConnectivity.disclosureMessage}
                  />
                }
              >
                <ProjectLocationConnectivityBoundary
                  project={project}
                  locationVm={locationVm}
                  fallbackPlaces={fallbackGeodesicConnectivity.places}
                  fallbackDisclosure={fallbackGeodesicConnectivity.disclosureMessage}
                />
              </Suspense>

              {/* Developer Profile Section + More Projects by This Developer Carousel */}
              <ProjectDeveloperSection
                developer={project.developer}
                developerLogoUrl={developerDto?.logoUrl ?? project.developer.logoUrl}
                developerBio={
                  developerDto?.shortDescription ||
                  developerDto?.description ||
                  project.developer.shortDescription ||
                  project.developer.description
                }
                developerProjectCount={developerDto?.projectCount}
                developerLocationsCount={developerDto?.locations?.length}
                moreProjects={discoveryBundle.developerProjects}
                currentProjectId={project.id}
                currentProjectSlug={project.slug}
              />

              {/* Projects You May Also Like Cross-Developer Discovery Carousel */}
              <ProjectsYouMayAlsoLike
                projects={discoveryBundle.relatedProjects}
                currentProjectId={project.id}
                currentProjectSlug={project.slug}
                excludeProjectIds={discoveryBundle.developerProjects.map(p => p.id)}
              />

              {/* FAQs Section */}
              <ProjectFaqAccordion faqs={eligibleFaqs} />

              {/* Project Final CTA / Assisted Buying Anchor */}
              <ProjectFinalCta projectName={project.name} projectSlug={project.slug} />
            </main>
          </div>

          {/* Right Column: Desktop Sticky Great Homes Advisory Card */}
          <aside
            aria-label="Great Homes Advisory Sidebar"
            className="hidden lg:block lg:col-span-3 min-w-0 self-stretch"
          >
            <div className="sticky top-22 z-20">
              <GreatHomesAdvisoryCard project={project} />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile Sticky Conversion CTA Bar */}
      <MobileStickyCta project={project} />

      {/* Official Project Brochure Lead-Gated Modal */}
      <ProjectBrochureModal project={project} />

      {/* Canonical Floor Plan Viewer Modal */}
      <ProjectFloorPlanViewer
        configurations={mergedConfigurations}
        mediaList={project.media}
        projectName={project.name}
        projectSlug={project.slug}
        locationName={project.location.name}
      />
      </div>
    </ProjectInteractionProvider>
  );
}

async function ProjectLocationConnectivityBoundary({
  project,
  locationVm,
  fallbackPlaces,
  fallbackDisclosure,
}: {
  project: PublicProjectDto;
  locationVm: ProjectLocationViewModel;
  fallbackPlaces: NearbyPlaceDto[];
  fallbackDisclosure: string | null;
}) {
  try {
    const nearbyConnectivity = await nearbyPlaceService.getProjectNearbyConnectivity(
      {
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        projectLatitude: project.projectLatitude,
        projectLongitude: project.projectLongitude,
        latitude: project.latitude,
        longitude: project.longitude,
        locationStatus: locationVm.locationStatus,
        coordinateSource: locationVm.coordinateSource,
        hasVerifiedProjectCoordinates: locationVm.hasVerifiedProjectCoordinates,
        location: project.location,
      },
      {
        radiusKm: 15,
        limit: 20,
        maxRoutedPlaces: 9,
        overallDeadlineMs: 2500,
      }
    );

    return (
      <ProjectLocationSection
        location={locationVm}
        projectName={project.name}
        nearbyPlaces={nearbyConnectivity.places}
        routingAttribution={nearbyConnectivity.attribution}
        connectivityDisclosure={nearbyConnectivity.disclosureMessage}
      />
    );
  } catch {
    return (
      <ProjectLocationSection
        location={locationVm}
        projectName={project.name}
        nearbyPlaces={fallbackPlaces}
        routingAttribution={null}
        connectivityDisclosure={fallbackDisclosure}
      />
    );
  }
}

