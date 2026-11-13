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
    title: 'Rental Residences in Kolkata – Verified Apartments | Great Homes',
    description:
      'Explore verified rental homes and apartments in Kolkata with clear terms, transparent security deposits, and vetted landlords.',
    alternates: {
      canonical: 'https://www.greathomes.co.in/rent',
    },
    robots: {
      index: isCleanPage1,
      follow: true,
    },
    openGraph: {
      title: 'Rental Residences in Kolkata | Great Homes',
      description:
        'Explore verified rental homes and apartments in Kolkata with clear terms and vetted landlords.',
      url: 'https://www.greathomes.co.in/rent',
      siteName: 'Great Homes',
      type: 'website',
    },
  };
}

export default async function RentPage({
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
  const furnishing = typeof params.furnishing === 'string' ? params.furnishing : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
  const pageSize = 12;

  const filters = {
    location,
    bedroomCount,
    propertyType,
    minPrice,
    maxPrice,
    furnishing,
    sort,
    query: qParam,
  };

  const [filterOptions, discoveryResult] = await Promise.all([
    propertyDiscoveryService.getFilterOptions(),
    propertyDiscoveryService.discoverRent(filters, page, pageSize),
  ]);

  const { data: properties, pagination } = discoveryResult;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Editorial Header */}
        <DiscoveryHeader
          title="Rental Residences"
          subtitle="Carefully inspected homes available for long-term and executive lease, complete with verified terms."
          totalCount={pagination.totalCount}
          itemTypeLabel="rental homes"
        />

        {/* Unified Filter Controls */}
        <DiscoveryFilterBar mode="rent" availableLocations={filterOptions.locations} />

        {/* Results Grid or Empty State */}
        {properties.length === 0 ? (
          <DiscoveryEmptyState
            title="No rental homes found"
            description="We could not find rental residences matching your current criteria. Try expanding your rent budget, removing furnishing filters, or choosing all locations."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {properties.map((item) => (
              <PropertyCard key={`rent-${item.id}`} item={item} />
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
