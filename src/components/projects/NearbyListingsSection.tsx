import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  ResaleDiscoveryCardDto,
  RentDiscoveryCardDto,
} from '@/src/domain/projects/dto/discoveryDto';
import { ProjectHorizontalCarousel } from './ProjectHorizontalCarousel';

export interface NearbyListingsSectionProps {
  nearbyResale: ResaleDiscoveryCardDto[];
  nearbyRental: RentDiscoveryCardDto[];
  projectName: string;
  locationName: string;
  locationSlug?: string;
  currentProjectId: string;
  excludeResaleIds?: string[];
  excludeRentalIds?: string[];
  hasValidCoordinates: boolean;
}

export function filterEligibleNearbyListings<
  T extends ResaleDiscoveryCardDto | RentDiscoveryCardDto
>(
  listings?: T[] | null,
  currentProjectId?: string,
  excludeListingIds: string[] = []
): T[] {
  if (!listings || !Array.isArray(listings)) return [];
  const seenIds = new Set<string>(excludeListingIds);
  const eligible: T[] = [];

  for (const item of listings) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    // Never include listings belonging to the current project in Nearby sections
    if (currentProjectId && item.project?.id === currentProjectId) continue;
    if (item.type === 'RESALE' && (!item.askingPrice || item.askingPrice <= 0)) continue;
    if (item.type === 'RENT' && (!item.monthlyRent || item.monthlyRent <= 0)) continue;
    seenIds.add(item.id);
    eligible.push(item);
  }

  return eligible;
}

export function NearbyListingsSection({
  nearbyResale,
  nearbyRental,
  projectName,
  locationName,
  locationSlug,
  currentProjectId,
  excludeResaleIds = [],
  excludeRentalIds = [],
  hasValidCoordinates,
}: NearbyListingsSectionProps) {
  if (!hasValidCoordinates) {
    return null;
  }

  const eligibleNearbyResale = filterEligibleNearbyListings(
    nearbyResale,
    currentProjectId,
    excludeResaleIds
  );

  const eligibleNearbyRental = filterEligibleNearbyListings(
    nearbyRental,
    currentProjectId,
    excludeRentalIds
  );

  if (eligibleNearbyResale.length === 0 && eligibleNearbyRental.length === 0) {
    return null;
  }

  return (
    <>
      {eligibleNearbyResale.length > 0 && (
        <section
          id="nearby-resale"
          aria-labelledby="nearby-resale-heading"
          className="space-y-5 pt-8 border-t border-[var(--color-border)]"
        >
          <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-foreground)]/[0.015] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1 font-display">
                  Nearby Options
                </div>
                <h2
                  id="nearby-resale-heading"
                  className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)] tracking-tight"
                >
                  Resale Apartments Nearby ({eligibleNearbyResale.length})
                </h2>
                <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
                  Explore resale apartments available in residential developments near {projectName} in {locationName}.
                </p>
              </div>

              <Link
                href={locationSlug ? `/buy?location=${locationSlug}&inventoryType=RESALE` : '/buy?inventoryType=RESALE'}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[var(--color-accent)] hover:underline shrink-0"
              >
                <span>Explore All Resale Homes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <ProjectHorizontalCarousel
              items={eligibleNearbyResale}
              ariaLabel={`Resale apartments near ${projectName}`}
              cardIdPrefix="nearby-resale"
            />
          </div>
        </section>
      )}

      {eligibleNearbyRental.length > 0 && (
        <section
          id="nearby-rent"
          aria-labelledby="nearby-rent-heading"
          className="space-y-5 pt-8 border-t border-[var(--color-border)]"
        >
          <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-foreground)]/[0.015] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1 font-display">
                  Nearby Options
                </div>
                <h2
                  id="nearby-rent-heading"
                  className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)] tracking-tight"
                >
                  Rental Apartments Nearby ({eligibleNearbyRental.length})
                </h2>
                <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
                  Explore rental homes available in residential developments near {projectName} in {locationName}.
                </p>
              </div>

              <Link
                href={locationSlug ? `/rent?location=${locationSlug}` : '/rent'}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[var(--color-accent)] hover:underline shrink-0"
              >
                <span>Explore All Rental Homes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <ProjectHorizontalCarousel
              items={eligibleNearbyRental}
              ariaLabel={`Rental apartments near ${projectName}`}
              cardIdPrefix="nearby-rent"
            />
          </div>
        </section>
      )}
    </>
  );
}
