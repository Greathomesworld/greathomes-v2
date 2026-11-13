import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { DiscoveryHeader } from '@/src/components/discovery/DiscoveryHeader';
import { DiscoveryFilterBar } from '@/src/components/discovery/DiscoveryFilterBar';
import { PropertyCard } from '@/src/components/discovery/PropertyCard';
import { DiscoveryPagination } from '@/src/components/discovery/DiscoveryPagination';
import { DiscoveryEmptyState } from '@/src/components/discovery/DiscoveryEmptyState';

import { Metadata } from 'next';

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const activeParams = Object.keys(params).filter(
    k => params[k] !== undefined && params[k] !== '' && (k !== 'page' || params[k] !== '1')
  );
  const isCleanPage1 = activeParams.length === 0;

  return {
    title: 'Discover Projects in Kolkata | Luxury Residential Developments – Great Homes',
    description:
      'Explore premier residential developments, master plans, and landmark communities across Kolkata with verified floor plans, amenities, and pricing intelligence.',
    alternates: {
      canonical: 'https://www.greathomes.co.in/projects',
    },
    robots: {
      index: isCleanPage1,
      follow: true,
    },
    openGraph: {
      title: 'Discover Projects in Kolkata | Great Homes',
      description:
        'Explore premier residential developments across Kolkata with verified floor plans and pricing.',
      url: 'https://www.greathomes.co.in/projects',
      siteName: 'Great Homes',
      type: 'website',
    },
  };
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await ensureSeedData();

  const params = await searchParams;
  const qParam = typeof params.q === 'string' ? params.q : typeof params.query === 'string' ? params.query : undefined;
  const location = typeof params.location === 'string' ? params.location : undefined;
  const bhkParam = typeof params.bedroomCount === 'string' ? params.bedroomCount : typeof params.bhk === 'string' ? params.bhk : undefined;
  const bedroomCount = bhkParam ? parseInt(bhkParam, 10) : undefined;
  const propertyType = typeof params.propertyType === 'string' ? params.propertyType : undefined;
  const minPrice = typeof params.minPrice === 'string' ? parseInt(params.minPrice, 10) : undefined;
  const maxPrice = typeof params.maxPrice === 'string' ? parseInt(params.maxPrice, 10) : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const stageParam = typeof params.stage === 'string' ? params.stage : typeof params.status === 'string' ? params.status : undefined;
  const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
  const pageSize = 12;

  const filters = {
    location,
    bedroomCount,
    propertyType,
    minPrice,
    maxPrice,
    sort,
    stage: stageParam,
    query: qParam,
  };

  const [filterOptions, discoveryResult] = await Promise.all([
    propertyDiscoveryService.getFilterOptions(),
    propertyDiscoveryService.discoverProjects(filters, page, pageSize),
  ]);

  const { data: projects, pagination } = discoveryResult;

  const stageFormatMap: Record<string, string> = {
    UPCOMING: 'Upcoming',
    NEW_LAUNCH: 'New Launch',
    UNDER_CONSTRUCTION: 'Under Construction',
    READY_TO_MOVE: 'Ready to Move',
    COMPLETED: 'Completed',
    SOLD_OUT: 'Sold Out',
  };
  const activeStageLabel = stageParam ? (stageFormatMap[stageParam.toUpperCase()] || stageParam.replace(/_/g, ' ')) : undefined;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Editorial Header */}
        <DiscoveryHeader
          title={activeStageLabel ? `${activeStageLabel} Developments` : "Master Developments"}
          subtitle={
            activeStageLabel
              ? `Exploring curated master plans and residential communities currently at the ${activeStageLabel.toLowerCase()} stage.`
              : "Explore landmark residential communities and curated developments by certified master builders."
          }
          totalCount={pagination.totalCount}
          itemTypeLabel="projects"
        />

        {/* Unified Filter Controls */}
        <DiscoveryFilterBar mode="projects" availableLocations={filterOptions.locations} />

        {/* Results Grid or Empty State */}
        {projects.length === 0 ? (
          <DiscoveryEmptyState
            title="No projects found"
            description={
              activeStageLabel
                ? `We currently have 0 published developments matching the "${activeStageLabel}" stage in our verified portfolio. Check other stages or clear your filters.`
                : "We could not find developments matching your current search parameters. Try choosing all locations, adjusting your budget range, or clearing filters."
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {projects.map((project) => (
              <PropertyCard
                key={`project-${project.id}`}
                item={{
                  type: 'PROJECT',
                  ...project,
                }}
              />
            ))}
          </div>
        )}

        {/* Server-Side Pagination */}
        <DiscoveryPagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
        />
      </div>
    </div>
  );
}
