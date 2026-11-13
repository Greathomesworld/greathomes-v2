import Link from 'next/link';
import { ShieldCheck, CheckCircle, ArrowRight } from 'lucide-react';
import { 
  ProjectDiscoveryCardDto, 
  PropertyDiscoveryCardDto, 
  NewBookingDiscoveryCardDto, 
  ResaleDiscoveryCardDto, 
  RentDiscoveryCardDto 
} from '@/src/domain/projects/dto/discoveryDto';
import { formatIndianPrice, formatArea, formatFurnishing, formatFloorCategory, formatPropertyType, formatProjectStatus } from './formatters';
import { ListingImage } from './ListingImage';
import { formatProjectLocationShortLabel } from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { AddToCompareButton } from '@/src/components/comparison/AddToCompareButton';

interface PropertyCardProps {
  item: PropertyDiscoveryCardDto | RentDiscoveryCardDto | ProjectDiscoveryCardDto;
  id?: string;
}

export function PropertyCard({ item, id }: PropertyCardProps) {
  if (item.type === 'NEW_BOOKING') {
    return <NewBookingCard item={item as NewBookingDiscoveryCardDto} id={id} />;
  }
  if (item.type === 'RESALE') {
    return <ResaleCard item={item as ResaleDiscoveryCardDto} id={id} />;
  }
  if (item.type === 'RENT') {
    return <RentCard item={item as RentDiscoveryCardDto} id={id} />;
  }
  if (item.type === 'PROJECT') {
    return <ProjectCard item={item as ProjectDiscoveryCardDto} id={id} />;
  }
  return null;
}

function NewBookingCard({ item, id }: { item: NewBookingDiscoveryCardDto; id?: string }) {
  const projectSlug = item.project?.slug || '#';
  const targetUrl = `/projects/${projectSlug}`;
  const locationLabel = formatProjectLocationShortLabel(item.project?.location);
  const devName = item.project?.developer?.name;
  const bhkLabel = typeof item.bedroomCount === 'number' && item.bedroomCount > 0 ? `${item.bedroomCount} BHK` : null;
  const configSummary = [bhkLabel, item.configurationName].filter(Boolean).join(' · ');
  const areaSummary = formatArea(item.carpetArea);
  const isPor = Boolean(item.priceOnRequest) || !(item.price > 0);

  return (
    <Link
      href={targetUrl}
      id={id || `card-nb-${item.id}`}
      aria-label={`${bhkLabel ? `${bhkLabel} ` : ''}New Booking at ${item.project?.name || item.configurationName}`}
      className="group flex flex-col h-full bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden hover:border-[rgba(17,17,17,0.2)] hover:shadow-md transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
    >
      <article className="flex flex-col flex-grow">
        {/* Media Header (Unchanged original aspect-[16/10]) */}
        <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
          <ListingImage
            src={item.featuredImageUrl}
            alt={item.configurationName}
            fallbackType="project"
          />
          
          {/* Top Badges */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            <span className="bg-[#111111] text-white text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs">
              NEW BOOKING
            </span>
          </div>

          <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            {item.reraVerified && (
              <span className="bg-[#218C5A] text-white text-[11px] font-medium px-2 py-1 rounded-md flex items-center gap-1 shadow-xs">
                <ShieldCheck className="w-3 h-3" />
                RERA Verified
              </span>
            )}
            {(item.availabilityStatus === 'LIMITED' || item.availabilityStatus === 'FEW_UNITS_LEFT') && (
              <span className="bg-[#E85D3F] text-white text-[11px] font-medium px-2 py-1 rounded-md shadow-xs">
                Limited Availability
              </span>
            )}
            {item.availabilityStatus === 'ON_REQUEST' && (
              <span className="bg-amber-600 text-white text-[11px] font-medium px-2 py-1 rounded-md shadow-xs">
                On Request
              </span>
            )}
          </div>
        </div>

        {/* Compact Details Body Below Image */}
        <div className="px-4 pt-3 pb-3.5 flex flex-col flex-grow justify-between gap-2.5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold text-base text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug">
                  {item.project?.name || item.configurationName}
                </h3>
                <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5 leading-tight">
                  {[devName ? `by ${devName}` : null, locationLabel].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {/* Configuration & Area */}
            <div className="py-2 px-2.5 bg-[#FAFAF8] rounded-lg border border-[rgba(17,17,17,0.06)] text-xs text-neutral-700 flex items-center justify-between gap-2">
              <span className="font-medium text-neutral-900 truncate">{configSummary}</span>
              {areaSummary && <span className="text-neutral-500 shrink-0">{areaSummary}</span>}
            </div>
          </div>

          {/* Pricing & CTA */}
          <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex items-end justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 block leading-none">
                {!isPor ? 'Starting Price' : 'Pricing'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-display font-bold text-lg sm:text-xl text-[#111111] leading-tight">
                  {!isPor ? formatIndianPrice(item.price) : 'Price on Request'}
                </span>
                {!isPor && (
                  <span className="text-xs text-neutral-500">onwards</span>
                )}
              </div>
              {!isPor && item.effectivePricePerSqft > 0 && (
                <span className="text-[10.5px] text-neutral-500 block leading-tight">
                  ₹{Math.round(item.effectivePricePerSqft).toLocaleString('en-IN')}/sq.ft.
                </span>
              )}
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111111] group-hover:text-[#E85D3F] transition-colors h-9 px-3 rounded-lg border border-[rgba(17,17,17,0.12)] group-hover:border-[#E85D3F] shrink-0">
              <span>{item.availabilityStatus === 'ON_REQUEST' ? 'Contact for Details' : 'View Project'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function ResaleCard({ item, id }: { item: ResaleDiscoveryCardDto; id?: string }) {
  const targetUrl = item.slug && item.slug.trim().length > 0
    ? `/buy/${item.slug}`
    : `/buy/${item.id}`;
  const locationLabel = formatProjectLocationShortLabel(item.location || item.project?.location);
  const areaSummary = formatArea(item.carpetArea);
  const floorLabel = formatFloorCategory(item.floorCategory);
  const furnishLabel = formatFurnishing(item.furnishing);
  const isVerified = item.verificationStatus === 'VERIFIED';

  return (
    <Link
      href={targetUrl}
      id={id || `card-resale-${item.id}`}
      aria-label={`${item.bedroomCount} BHK Resale Home at ${item.project?.name || item.configuration}`}
      className="group flex flex-col h-full bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden hover:border-[rgba(17,17,17,0.2)] hover:shadow-md transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
    >
      <article className="flex flex-col flex-grow">
        {/* Media Header (Unchanged original aspect-[16/10]) */}
        <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
          <ListingImage
            src={item.featuredImageUrl}
            alt={item.configuration}
            fallbackType="resale"
            isVerified={isVerified}
          />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            <span className="bg-white/95 text-[#111111] border border-[rgba(17,17,17,0.12)] text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs font-display">
              RESALE
            </span>
            {item.formattedDistance && (
              <span className="bg-[#111111]/85 text-white text-[10px] font-mono font-semibold px-2 py-1 rounded-md shadow-xs backdrop-blur-xs">
                {item.formattedDistance} away
              </span>
            )}
          </div>

          <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            {isVerified ? (
              <span className="bg-[#218C5A] text-white text-[11px] font-display font-medium px-2 py-1 rounded-md flex items-center gap-1 shadow-xs">
                <CheckCircle className="w-3 h-3" />
                Verified
              </span>
            ) : (
              <span className="bg-white/95 text-[#111111]/70 border border-[rgba(17,17,17,0.14)] text-[11px] font-display font-medium px-2 py-1 rounded-md shadow-xs backdrop-blur-xs">
                Unverified
              </span>
            )}
          </div>
        </div>

        {/* Compact Details Body Below Image */}
        <div className="px-4 pt-3 pb-3.5 flex flex-col flex-grow justify-between gap-2.5">
          <div className="space-y-2">
            <div>
              <h3 className="font-display font-semibold text-base text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug">
                {item.bedroomCount} BHK {formatPropertyType(item.propertyType)}
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5 line-clamp-1 leading-tight">
                {[item.project?.name || item.configuration, locationLabel].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Highlights */}
            <div className="py-2 px-2.5 bg-[#FAFAF8] rounded-lg border border-[rgba(17,17,17,0.06)] text-xs text-neutral-700 flex flex-wrap items-center justify-between gap-1">
              <span className="font-medium text-neutral-800">
                {[floorLabel, furnishLabel].filter(Boolean).join(' · ')}
              </span>
              {areaSummary && <span className="text-neutral-500">{areaSummary}</span>}
            </div>
          </div>

          {/* Pricing & CTA - Strict rule: NO price/sq.ft. displayed */}
          <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex items-end justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 block leading-none">Asking Price</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-display font-bold text-lg sm:text-xl text-[#111111] leading-tight">
                  {formatIndianPrice(item.askingPrice)}
                </span>
              </div>
              <span className="text-[10.5px] text-neutral-500 block leading-tight">
                {item.listingPartyLabel || 'Verified Listing'}
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#111111] group-hover:text-[#E85D3F] transition-colors h-9 px-3 rounded-lg border border-[rgba(17,17,17,0.12)] group-hover:border-[#E85D3F]">
              <span>View Property</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function RentCard({ item, id }: { item: RentDiscoveryCardDto; id?: string }) {
  const targetUrl = item.slug && item.slug.trim().length > 0
    ? `/rent/${item.slug}`
    : `/rent/${item.id}`;
  const locationLabel = formatProjectLocationShortLabel(item.location || item.project?.location);
  const areaSummary = formatArea(item.carpetArea);
  const floorLabel = formatFloorCategory(item.floorCategory);
  const furnishLabel = formatFurnishing(item.furnishing);
  const isVerified = item.verificationStatus === 'VERIFIED';

  return (
    <Link
      href={targetUrl}
      id={id || `card-rent-${item.id}`}
      aria-label={`${item.bedroomCount} BHK Rental Home at ${item.project?.name || item.configuration}`}
      className="group flex flex-col h-full bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden hover:border-[rgba(17,17,17,0.2)] hover:shadow-md transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
    >
      <article className="flex flex-col flex-grow">
        {/* Media Header (Unchanged original aspect-[16/10]) */}
        <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
          <ListingImage
            src={item.featuredImageUrl}
            alt={item.configuration}
            fallbackType="rent"
            isVerified={isVerified}
          />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            <span className="bg-white/95 text-[#111111] border border-[rgba(17,17,17,0.12)] text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs font-display">
              FOR RENT
            </span>
            {item.formattedDistance && (
              <span className="bg-[#111111]/85 text-white text-[10px] font-mono font-semibold px-2 py-1 rounded-md shadow-xs backdrop-blur-xs">
                {item.formattedDistance} away
              </span>
            )}
          </div>

          <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
            {isVerified ? (
              <span className="bg-[#218C5A] text-white text-[11px] font-display font-medium px-2 py-1 rounded-md flex items-center gap-1 shadow-xs">
                <CheckCircle className="w-3 h-3" />
                Verified Lease
              </span>
            ) : (
              <span className="bg-white/95 text-[#111111]/70 border border-[rgba(17,17,17,0.14)] text-[11px] font-display font-medium px-2 py-1 rounded-md shadow-xs backdrop-blur-xs">
                Unverified
              </span>
            )}
          </div>
        </div>

        {/* Compact Details Body Below Image */}
        <div className="px-4 pt-3 pb-3.5 flex flex-col flex-grow justify-between gap-2.5">
          <div className="space-y-2">
            <div>
              <h3 className="font-display font-semibold text-base text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug">
                {item.bedroomCount} BHK {formatPropertyType(item.propertyType)}
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5 line-clamp-1 leading-tight">
                {[item.project?.name || item.configuration, locationLabel].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Highlights */}
            <div className="py-2 px-2.5 bg-[#FAFAF8] rounded-lg border border-[rgba(17,17,17,0.06)] text-xs text-neutral-700 flex flex-wrap items-center justify-between gap-1">
              <span className="font-medium text-neutral-800">
                {[floorLabel, furnishLabel].filter(Boolean).join(' · ')}
              </span>
              {areaSummary && <span className="text-neutral-500">{areaSummary}</span>}
            </div>
          </div>

          {/* Pricing & CTA - Strict rule: NO rent/sq.ft. displayed */}
          <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex items-end justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 block leading-none">Monthly Rent</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-display font-bold text-lg sm:text-xl text-[#111111] leading-tight">
                  ₹{item.monthlyRent.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-neutral-500">/ mo</span>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] text-neutral-500 leading-tight">
                {item.maintenance ? <span>+ ₹{item.maintenance.toLocaleString('en-IN')} maint.</span> : null}
                {item.securityDeposit ? <span>Deposit: ₹{item.securityDeposit.toLocaleString('en-IN')}</span> : null}
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111111] group-hover:text-[#E85D3F] transition-colors h-9 px-3 rounded-lg border border-[rgba(17,17,17,0.12)] group-hover:border-[#E85D3F]">
              <span>View Property</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function ProjectCard({ item, id }: { item: ProjectDiscoveryCardDto; id?: string }) {
  const targetUrl = `/projects/${item.slug}`;
  const locationLabel = formatProjectLocationShortLabel(item.location);
  const devName = item.developer?.name;
  const configText = item.bhkSummary?.length > 0 ? `${item.bhkSummary.join(', ')} BHK` : 'Configurations Available';
  const hasStartingPrice = Boolean(!item.priceOnRequest && item.startingPrice && item.startingPrice > 0);

  return (
    <Link
      href={targetUrl}
      id={id || `card-proj-${item.id}`}
      aria-label={`${item.name} development in ${locationLabel}`}
      className="group flex flex-col h-full bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden hover:border-[rgba(17,17,17,0.2)] hover:shadow-md transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
    >
      <article className="flex flex-col flex-grow">
        {/* Media Header (Unchanged original aspect-[16/10]) */}
        <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
          <ListingImage
            src={item.featuredImageUrl}
            alt={item.name}
            fallbackType="project"
          />
          
          {/* Badges */}
          {item.status && (
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/95 text-[#111111] border border-[rgba(17,17,17,0.12)] text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs z-10 pointer-events-none font-display">
              {formatProjectStatus(item.status)}
            </div>
          )}

          {item.reraVerified && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-[#218C5A] text-white text-[11px] font-medium px-2 py-1 rounded-md shadow-xs z-10 pointer-events-none">
              <ShieldCheck className="w-3 h-3" />
              RERA Verified
            </div>
          )}

          {item.recommendationReason && (
            <div className="absolute bottom-2.5 left-3 flex items-center gap-1 bg-black/75 text-white text-[10px] font-display font-medium px-2 py-0.5 rounded backdrop-blur-xs z-10 pointer-events-none">
              {item.recommendationReason}
            </div>
          )}
        </div>

        {/* Compact Details Body Below Image */}
        <div className="px-4 pt-3 pb-3.5 flex flex-col flex-grow justify-between gap-2.5">
          <div className="space-y-2">
            <div>
              <h3 className="font-display font-semibold text-base text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug">
                {item.name}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1 leading-tight">
                {[devName ? `by ${devName}` : null, locationLabel].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="py-2 px-2.5 bg-[#FAFAF8] rounded-lg border border-[rgba(17,17,17,0.06)] text-xs text-neutral-700 flex items-center justify-between">
              <span className="font-medium text-neutral-900">{configText}</span>
              <span className="text-neutral-500">
                {item.propertyTypes?.map(formatPropertyType).join(', ') || 'Residences'}
              </span>
            </div>
          </div>

          {/* Pricing & CTA */}
          <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex flex-col gap-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 block leading-none">Starting Price</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-display font-bold text-lg sm:text-xl text-[#111111] leading-tight">
                    {hasStartingPrice ? formatIndianPrice(item.startingPrice!) : 'Price on Request'}
                  </span>
                  {hasStartingPrice && (
                    <span className="text-xs text-neutral-500">onwards</span>
                  )}
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111111] group-hover:text-[#E85D3F] transition-colors h-9 px-3 rounded-lg border border-[rgba(17,17,17,0.12)] group-hover:border-[#E85D3F] shrink-0">
                <span>View Project</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-[rgba(17,17,17,0.05)]">
              <AddToCompareButton mode="PROJECTS" id={item.id} name={item.name} />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

