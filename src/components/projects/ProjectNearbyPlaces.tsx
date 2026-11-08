'use client';

import React, { useState, useMemo, useEffect, useId } from 'react';
import {
  Train,
  Plane,
  Bus,
  GraduationCap,
  Cross,
  Building2,
  ShoppingBag,
  Trees,
  Landmark,
  Compass,
  ShieldCheck,
  Clock,
  Route,
  ChevronDown,
} from 'lucide-react';
import {
  NearbyPlaceDto,
  PlaceCategory,
  PLACE_CATEGORY_REGISTRY,
} from '@/src/domain/places/entities';
import {
  CoordinateSource,
  ProjectLocationStatus,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';

export interface ProjectNearbyPlacesProps {
  places: NearbyPlaceDto[];
  hasCoordinates: boolean;
  locationStatus?: ProjectLocationStatus;
  coordinateSource?: CoordinateSource;
  locationName?: string;
  projectName: string;
  attribution?: string | null;
  disclosureMessage?: string | null;
  className?: string;
  /**
   * Optional override for deterministic testing of mobile vs desktop rendering
   * in environments without window.matchMedia.
   */
  defaultMobileView?: boolean;
}

type FilterCategory = 'ALL' | PlaceCategory;

const MOBILE_VIEWPORT_QUERY = '(max-width: 639.98px)';

const CATEGORY_ICONS: Record<PlaceCategory, React.ElementType> = {
  METRO: Train,
  AIRPORT: Plane,
  TRANSIT: Bus,
  EDUCATION: GraduationCap,
  HEALTHCARE: Cross,
  COMMERCIAL: Building2,
  RETAIL: ShoppingBag,
  RECREATION: Trees,
  LANDMARK: Landmark,
};

export function ProjectNearbyPlaces({
  places,
  hasCoordinates,
  locationStatus,
  coordinateSource,
  locationName,
  projectName,
  attribution,
  disclosureMessage,
  className = '',
  defaultMobileView = false,
}: ProjectNearbyPlacesProps) {
  const instanceId = useId();

  // Desktop category tab filter state
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('ALL');

  // Responsive viewport detection (< 640px mobile vs >= 640px tablet/desktop)
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    }
    return defaultMobileView;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    setIsMobileViewport(mql.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    mql.addEventListener('change', handleChange);
    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }, []);

  // Main Nearby Places & Connectivity section: expanded by default on mobile
  const [isMobileSectionOpen, setIsMobileSectionOpen] = useState<boolean>(true);

  // Individual categories: collapsed by default on mobile
  const [expandedCategories, setExpandedCategories] = useState<Set<PlaceCategory>>(
    () => new Set<PlaceCategory>()
  );

  // Group places by category & compute counts using only categories actually present in data
  const { categoryCounts, activeCategories, placesByCategory } = useMemo(() => {
    const counts: Partial<Record<PlaceCategory, number>> = {};
    const grouped: Partial<Record<PlaceCategory, NearbyPlaceDto[]>> = {};
    const order: PlaceCategory[] = [];

    for (const p of places) {
      if (!grouped[p.category]) {
        grouped[p.category] = [];
        order.push(p.category);
      }
      grouped[p.category]!.push(p);
      counts[p.category] = (counts[p.category] || 0) + 1;
    }

    return {
      categoryCounts: counts,
      activeCategories: order,
      placesByCategory: grouped,
    };
  }, [places]);

  const toggleMobileCategory = (category: PlaceCategory, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Filtered places for desktop view
  const filteredPlaces = useMemo(() => {
    if (selectedCategory === 'ALL') {
      return places;
    }
    return places.filter(p => p.category === selectedCategory);
  }, [places, selectedCategory]);

  const { routedCount, geodesicCount, hasAnyRoadRoute, hasMixedDistanceMetrics } = useMemo(() => {
    let routed = 0;
    for (const p of places) {
      if (
        p.isRoadRouteAvailable === true &&
        p.distanceMetric === 'ROAD_ROUTE' &&
        p.routeDistanceKm !== null &&
        p.routeDistanceKm !== undefined &&
        Boolean(p.formattedRouteDistance)
      ) {
        routed += 1;
      }
    }
    const geodesic = Math.max(0, places.length - routed);
    return {
      routedCount: routed,
      geodesicCount: geodesic,
      hasAnyRoadRoute: routed > 0,
      hasMixedDistanceMetrics: routed > 0 && geodesic > 0,
    };
  }, [places]);

  const resolvedAttribution = useMemo(() => {
    if (!hasAnyRoadRoute) return null;
    if (attribution && attribution.trim().length > 0) {
      return attribution.trim();
    }
    const placeWithAttr = places.find(
      p => p.isRoadRouteAvailable && p.attribution && p.attribution.trim().length > 0
    );
    return placeWithAttr?.attribution?.trim() || null;
  }, [hasAnyRoadRoute, attribution, places]);

  const isApproximate =
    locationStatus === 'APPROXIMATE_LOCATION' || coordinateSource === 'LOCATION';

  if (!hasCoordinates || isApproximate || locationStatus === 'LOCATION_UNAVAILABLE') {
    const effectiveStatus: ProjectLocationStatus = isApproximate
      ? 'APPROXIMATE_LOCATION'
      : 'LOCATION_UNAVAILABLE';

    return (
      <div
        data-location-status={effectiveStatus}
        className={`p-6 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] text-center ${className}`}
      >
        <div className="w-10 h-10 rounded-full bg-[var(--color-foreground)]/[0.04] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-2 text-[var(--color-foreground)]/40">
          <Compass className="w-4 h-4" />
        </div>
        <h4 className="font-display font-medium text-xs text-[var(--color-foreground)] uppercase tracking-wider">
          {isApproximate
            ? 'Approximate Locality Coordinates Only — Exact Distances Pending'
            : 'Nearby Connectivity Pending'}
        </h4>
        <p className="text-xs text-[var(--color-foreground)]/60 max-w-md mx-auto mt-1 leading-relaxed">
          {disclosureMessage && disclosureMessage.trim().length > 0
            ? disclosureMessage
            : isApproximate
              ? `Only approximate locality coordinates${locationName ? ` for ${locationName}` : ''} are currently on file. Precise project distances and driving times for ${projectName} are unavailable until the project location is verified.`
              : `Exact project coordinates are currently unavailable. Nearby distances and driving-time estimates for ${projectName} will appear once the project location is verified.`}
        </p>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div
        data-location-status="VERIFIED_PROJECT_LOCATION"
        className={`p-6 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] text-center ${className}`}
      >
        <p className="text-xs text-[var(--color-foreground)]/60">
          No verified places within the current spatial radius for {projectName}.
        </p>
      </div>
    );
  }

  const distanceDescriptionText = hasMixedDistanceMetrics
    ? `Showing verified road-route distances and driving times for ${routedCount} primary destinations, and straight-line geodesic distances for ${geodesicCount} additional locations from ${projectName} pinpoint coordinates. Each card is labeled by distance type.`
    : hasAnyRoadRoute
      ? `Verified road-route distances and estimated driving times from ${projectName} pinpoint coordinates.`
      : `Verified straight-line geodesic distance from ${projectName} pinpoint coordinates.`;

  const renderPlaceCard = (place: NearbyPlaceDto) => {
    const Icon = CATEGORY_ICONS[place.category] || Compass;
    const isRoadRoute =
      place.isRoadRouteAvailable === true &&
      place.distanceMetric === 'ROAD_ROUTE' &&
      Boolean(place.formattedRouteDistance);

    const primaryDistanceLabel = isRoadRoute
      ? place.formattedRouteDistance!
      : place.formattedGeodesicDistance || place.formattedDistance;

    const drivingDurationLabel =
      isRoadRoute && place.formattedDuration ? place.formattedDuration : null;

    return (
      <div
        key={place.id}
        data-place-id={place.id}
        data-distance-metric={isRoadRoute ? 'ROAD_ROUTE' : 'GEODESIC_STRAIGHT_LINE'}
        data-route-status={
          place.routeStatus || (isRoadRoute ? 'ROUTE_AVAILABLE' : 'PROVIDER_UNCONFIGURED')
        }
        className="p-3 sm:p-3.5 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] hover:border-[var(--color-foreground)]/20 transition-all flex flex-col justify-between group shadow-2xs min-w-0"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-white border border-[var(--color-border)] flex items-center justify-center text-[var(--color-foreground)]/70 shrink-0 mt-0.5 group-hover:text-[#E85D3F] group-hover:border-[#E85D3F]/30 transition-colors">
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-display font-medium text-[var(--color-foreground)] leading-snug line-clamp-2">
                {place.name}
              </h4>
              {place.locality && (
                <p className="text-[11px] text-[var(--color-foreground)]/50 truncate mt-0.5">
                  {place.locality}
                </p>
              )}
            </div>
          </div>

          {/* Primary Distance & Optional Driving Time */}
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <div className="px-2 py-0.5 sm:py-1 rounded-md bg-white border border-[var(--color-border)] shadow-2xs font-mono tabular-nums font-semibold text-xs text-[var(--color-foreground)] whitespace-nowrap">
              {primaryDistanceLabel}
            </div>
            {drivingDurationLabel && (
              <span
                data-driving-duration={drivingDurationLabel}
                className="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-[var(--color-foreground)]/65 whitespace-nowrap"
              >
                <Clock className="w-2.5 h-2.5 text-[#218C5A]" aria-hidden="true" />
                <span>~{drivingDurationLabel} drive</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-[var(--color-border)]/40 flex items-center justify-between text-[10px] text-[var(--color-foreground)]/50">
          <span className="uppercase tracking-wider font-display font-medium text-[var(--color-accent)]">
            {place.categoryDisplay}
          </span>
          <span className="inline-flex items-center gap-1 font-mono">
            {isRoadRoute ? (
              <>
                <Route className="w-3 h-3 text-[#218C5A]" aria-hidden="true" />
                <span className="text-[var(--color-foreground)]/70">Road Route</span>
              </>
            ) : (
              <span>Straight-Line (Geodesic)</span>
            )}
          </span>
        </div>
      </div>
    );
  };

  const mainMobileButtonId = `${instanceId}-nearby-mobile-trigger`;
  const mainMobilePanelId = `${instanceId}-nearby-mobile-panel`;

  return (
    <div
      data-location-status="VERIFIED_PROJECT_LOCATION"
      data-distance-mode={
        hasMixedDistanceMetrics
          ? 'MIXED_ROAD_AND_GEODESIC'
          : hasAnyRoadRoute
            ? 'ROAD_ROUTE'
            : 'GEODESIC_STRAIGHT_LINE'
      }
      className={`space-y-4 pt-2 ${className}`}
    >
      {isMobileViewport ? (
        /* =====================================================================
         * MOBILE-ONLY ACCORDION EXPERIENCE (< 640px)
         * Main section expanded by default + independent collapsible category accordions
         * ===================================================================== */
        <div data-mobile-nearby-accordion="true" className="w-full">
          {/* Main Mobile Header (Expanded by default, accessible tap target) */}
          <button
            id={mainMobileButtonId}
            type="button"
            aria-expanded={isMobileSectionOpen}
            aria-controls={mainMobilePanelId}
            data-mobile-section-trigger="true"
            onClick={() => setIsMobileSectionOpen(prev => !prev)}
            className="w-full min-h-[56px] p-3.5 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] hover:border-[var(--color-foreground)]/25 active:bg-[var(--color-foreground)]/[0.03] transition-colors flex items-center justify-between gap-3 text-left shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                  isMobileSectionOpen
                    ? 'bg-[#E85D3F]/10 border-[#E85D3F]/30 text-[#E85D3F]'
                    : 'bg-white border-[var(--color-border)] text-[var(--color-foreground)]/70'
                }`}
              >
                <Compass className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-base font-display font-semibold text-[var(--color-foreground)] leading-snug">
                  Nearby Places &amp; Connectivity
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-[var(--color-foreground)]/60">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#218C5A] shrink-0" aria-hidden="true" />
                    <span>{places.length} Verified Locations</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activeCategories.length}{' '}
                    {activeCategories.length === 1 ? 'Category' : 'Categories'}
                  </span>
                </span>
              </div>
            </div>

            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                isMobileSectionOpen
                  ? 'bg-[#E85D3F]/10 border-[#E85D3F]/30 text-[#E85D3F]'
                  : 'bg-white border-[var(--color-border)] text-[var(--color-foreground)]/60'
              }`}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 motion-reduce:transition-none ${
                  isMobileSectionOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </div>
          </button>

          {/* Main Mobile Region (Open by default) */}
          <div
            id={mainMobilePanelId}
            role="region"
            aria-labelledby={mainMobileButtonId}
            aria-hidden={!isMobileSectionOpen}
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
              isMobileSectionOpen
                ? 'grid-rows-[1fr] opacity-100 visible mt-2.5'
                : 'grid-rows-[0fr] opacity-0 invisible mt-0 pointer-events-none'
            }`}
          >
            <div className="overflow-hidden space-y-2.5">
              {/* Preserved Connectivity Summary (Prominently displayed above category list) */}
              <div
                data-mobile-connectivity-summary="true"
                className="px-3.5 py-3 rounded-xl border border-[var(--color-border)]/70 bg-[#FAFAF8] space-y-1.5"
              >
                <p className="text-xs text-[var(--color-foreground)]/70 leading-relaxed font-body">
                  {distanceDescriptionText}
                </p>
                {hasMixedDistanceMetrics && (
                  <div className="pt-0.5">
                    <span
                      data-mixed-distance-summary="true"
                      className="inline-block px-2 py-0.5 rounded-md bg-white border border-[var(--color-border)] font-mono tabular-nums text-[10px] text-[var(--color-foreground)]/70"
                    >
                      {routedCount} Road Route · {geodesicCount} Straight-Line
                    </span>
                  </div>
                )}
              </div>

              {/* Individual Category Accordions (Collapsed by default, independently expandable) */}
              <div className="space-y-2" data-mobile-category-accordions="true">
                {activeCategories.map(cat => {
                  const categoryPlaces = placesByCategory[cat] || [];
                  if (categoryPlaces.length === 0) return null;

                  const isCategoryExpanded = expandedCategories.has(cat);
                  const CatIcon = CATEGORY_ICONS[cat] || Compass;
                  const categoryMeta = PLACE_CATEGORY_REGISTRY[cat];
                  const categoryTitle =
                    categoryMeta?.label || categoryPlaces[0]?.categoryDisplay || cat;
                  const catButtonId = `${instanceId}-cat-btn-${cat.toLowerCase()}`;
                  const catPanelId = `${instanceId}-cat-panel-${cat.toLowerCase()}`;

                  return (
                    <div
                      key={cat}
                      data-mobile-category={cat}
                      className="rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] overflow-hidden shadow-2xs"
                    >
                      <button
                        id={catButtonId}
                        type="button"
                        aria-expanded={isCategoryExpanded}
                        aria-controls={catPanelId}
                        data-mobile-category-trigger={cat}
                        onClick={e => toggleMobileCategory(cat, e)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-[var(--color-foreground)]/[0.02] active:bg-[var(--color-foreground)]/[0.04] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E85D3F]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                              isCategoryExpanded
                                ? 'bg-[#E85D3F]/10 border-[#E85D3F]/30 text-[#E85D3F]'
                                : 'bg-white border-[var(--color-border)] text-[var(--color-foreground)]/70'
                            }`}
                          >
                            <CatIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          </div>
                          <span className="text-xs font-display font-semibold text-[var(--color-foreground)] truncate">
                            {categoryTitle}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-[var(--color-foreground)]/60">
                            {categoryPlaces.length}{' '}
                            {categoryPlaces.length === 1 ? 'place' : 'places'}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 motion-reduce:transition-none ${
                              isCategoryExpanded
                                ? 'rotate-180 text-[#E85D3F]'
                                : 'text-[var(--color-foreground)]/50'
                            }`}
                            aria-hidden="true"
                          />
                        </div>
                      </button>

                      <div
                        id={catPanelId}
                        role="region"
                        aria-labelledby={catButtonId}
                        aria-hidden={!isCategoryExpanded}
                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
                          isCategoryExpanded
                            ? 'grid-rows-[1fr] opacity-100 visible'
                            : 'grid-rows-[0fr] opacity-0 invisible pointer-events-none'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="p-2.5 pt-2 space-y-2 border-t border-[var(--color-border)]/50 bg-white/60">
                            {categoryPlaces.map(place => renderPlaceCard(place))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Required Routing Provider Attribution (only rendered when route data from provider is displayed) */}
              {resolvedAttribution && (
                <div
                  data-routing-attribution="true"
                  className="pt-1 px-1 flex items-center justify-end text-[11px] font-body text-[var(--color-foreground)]/50"
                >
                  <span>{resolvedAttribution}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
         * DESKTOP & TABLET LAYOUT (>= 640px)
         * Preserves existing header, category tab bar, multi-column grid, and attribution
         * ===================================================================== */
        <>
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 border-b border-[var(--color-border)]/60 pb-3">
            <div>
              <h3 className="text-base sm:text-lg font-display font-semibold text-[var(--color-foreground)]">
                Nearby Places &amp; Connectivity
              </h3>
              <p className="text-xs text-[var(--color-foreground)]/60 mt-0.5">
                {distanceDescriptionText}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-foreground)]/50 font-mono tabular-nums shrink-0">
              {hasMixedDistanceMetrics && (
                <span
                  data-mixed-distance-summary="true"
                  className="px-2 py-0.5 rounded-md bg-[var(--color-foreground)]/[0.04] border border-[var(--color-border)] text-[10px] text-[var(--color-foreground)]/65"
                >
                  {routedCount} Road Route · {geodesicCount} Straight-Line
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A]" />
                <span>{places.length} Verified Locations</span>
              </span>
            </div>
          </div>

          {/* Category Filter Row */}
          <div
            role="tablist"
            aria-label="Filter nearby places by category"
            className="hidden sm:flex items-center gap-1.5 py-1 sm:flex-wrap"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'ALL'}
              onClick={() => setSelectedCategory('ALL')}
              className={`shrink-0 min-h-[32px] px-3.5 py-1.5 rounded-lg text-xs font-display font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] ${
                selectedCategory === 'ALL'
                  ? 'bg-[#111111] text-white shadow-2xs'
                  : 'bg-[var(--color-foreground)]/[0.05] text-[var(--color-foreground)]/75 hover:bg-[var(--color-foreground)]/[0.1] active:bg-[var(--color-foreground)]/[0.15]'
              }`}
            >
              All ({places.length})
            </button>

            {activeCategories.map(cat => {
              const count = categoryCounts[cat] || 0;
              const Icon = CATEGORY_ICONS[cat] || Compass;
              const isSelected = selectedCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 min-h-[32px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-display font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] ${
                    isSelected
                      ? 'bg-[#111111] text-white shadow-2xs'
                      : 'bg-[var(--color-foreground)]/[0.05] text-[var(--color-foreground)]/75 hover:bg-[var(--color-foreground)]/[0.1] active:bg-[var(--color-foreground)]/[0.15]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{cat}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      isSelected ? 'text-white/70' : 'text-[var(--color-foreground)]/50'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Places Grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {filteredPlaces.map(place => renderPlaceCard(place))}
          </div>

          {/* Required Routing Provider Attribution (only rendered when route data from provider is displayed) */}
          {resolvedAttribution && (
            <div
              data-routing-attribution="true"
              className="hidden sm:flex pt-1 items-center justify-end text-[11px] font-body text-[var(--color-foreground)]/50"
            >
              <span>{resolvedAttribution}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
