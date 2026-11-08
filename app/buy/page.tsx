import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { DiscoveryHeader } from '@/src/components/discovery/DiscoveryHeader';
import { DiscoveryFilterBar } from '@/src/components/discovery/DiscoveryFilterBar';
import { PropertyCard } from '@/src/components/discovery/PropertyCard';
import { DiscoveryPagination } from '@/src/components/discovery/DiscoveryPagination';
import { DiscoveryEmptyState } from '@/src/components/discovery/DiscoveryEmptyState';

export const revalidate = 60;

export const metadata = {
  title: 'Buy Properties - Great Homes',
  description: 'Explore curated residential homes across verified new bookings and verified resale inventory.',
};

export default async function BuyPage({
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
  const inventoryType = typeof params.inventoryType === 'string' ? params.inventoryType : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
  const pageSize = 12;

  const filters = {
    location,
    bedroomCount,
    propertyType,
    minPrice,
    maxPrice,
    inventoryType,
    sort,
    query: qParam,
  };

  const [filterOptions, discoveryResult] = await Promise.all([
    propertyDiscoveryService.getFilterOptions(),
    propertyDiscoveryService.discoverBuy(filters, page, pageSize),
  ]);

  const { data: properties, pagination } = discoveryResult;

  // Compute breakdown if viewing all inventory
  const breakdown =
    !inventoryType || inventoryType === 'ALL'
      ? {
          newBookingCount: properties.filter((p) => p.type === 'NEW_BOOKING').length,
          resaleCount: properties.filter((p) => p.type === 'RESALE').length,
        }
      : undefined;

  let pageTitle = 'Homes for Sale';
  let pageSubtitle = 'Discover meticulously curated homes, from verified new developer releases to private resale residences.';

  if (inventoryType === 'NEW_BOOKING') {
    pageTitle = 'New Booking Residences';
    pageSubtitle = 'Direct builder releases with verified floor plans, transparent pricing, and RERA compliance.';
  } else if (inventoryType === 'RESALE') {
    pageTitle = 'Verified Resale Homes';
    pageSubtitle = 'Pre-owned homes inspected for legal clarity, authentic pricing, and immediate or near-term possession.';
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Editorial Header */}
        <DiscoveryHeader
          title={pageTitle}
          subtitle={pageSubtitle}
          totalCount={pagination.totalCount}
          itemTypeLabel="homes"
          breakdown={breakdown}
        />

        {/* Unified Filter Controls */}
        <DiscoveryFilterBar mode="buy" availableLocations={filterOptions.locations} />

        {/* Results Grid or Empty State */}
        {properties.length === 0 ? (
          <DiscoveryEmptyState
            title="No homes found"
            description="No homes matched your current search filters. Try clearing or expanding your budget, location, or bedroom configuration."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {properties.map((item) => (
              <PropertyCard key={`${item.type}-${item.id}`} item={item} />
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
