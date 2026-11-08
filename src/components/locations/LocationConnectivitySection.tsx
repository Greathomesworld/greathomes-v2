'use client';

import React, { useState, useMemo } from 'react';
import {
  Navigation,
  MapPin,
  Bus,
  Train,
  GraduationCap,
  Hospital,
  ShoppingBag,
  Landmark,
  Building2,
  Trees,
} from 'lucide-react';
import { ConnectivityIntelligenceDto } from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';
import { ProjectLocationMap } from '@/src/components/projects/ProjectLocationMap';
import { MapMarker } from '@/src/domain/locations/map/types';

interface LocationConnectivitySectionProps {
  locationName: string;
  coordinates: { latitude: number; longitude: number } | null;
  connectivity: ConnectivityIntelligenceDto;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  METRO: <Train className="w-4 h-4" />,
  AIRPORT: <Navigation className="w-4 h-4" />,
  TRANSIT: <Bus className="w-4 h-4" />,
  EDUCATION: <GraduationCap className="w-4 h-4" />,
  HEALTHCARE: <Hospital className="w-4 h-4" />,
  RETAIL: <ShoppingBag className="w-4 h-4" />,
  SHOPPING: <ShoppingBag className="w-4 h-4" />,
  COMMERCIAL: <Building2 className="w-4 h-4" />,
  RECREATION: <Trees className="w-4 h-4" />,
  LANDMARK: <Landmark className="w-4 h-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  METRO: 'Metro',
  AIRPORT: 'Airport',
  TRANSIT: 'Transit',
  EDUCATION: 'Education',
  HEALTHCARE: 'Healthcare',
  RETAIL: 'Shopping & Retail',
  SHOPPING: 'Shopping & Retail',
  COMMERCIAL: 'Commercial & IT',
  RECREATION: 'Recreation',
  LANDMARK: 'Landmarks',
};

function formatCategoryLabel(category: string): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return category
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function LocationConnectivitySection({
  locationName,
  coordinates,
  connectivity,
}: LocationConnectivitySectionProps) {
  const categories = Object.keys(connectivity.placesByCategory || {});
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || '');

  const hasValidCoords = Boolean(
    coordinates &&
      coordinates.latitude !== null &&
      coordinates.longitude !== null
  );

  const placesToDisplay =
    connectivity.placesByCategory && activeCategory
      ? connectivity.placesByCategory[activeCategory] || []
      : [];

  const nearbyMarkers = useMemo<MapMarker[]>(() => {
    const markers: MapMarker[] = [];
    const seen = new Set<string>();
    const byCat = connectivity.placesByCategory || {};

    for (const [cat, list] of Object.entries(byCat)) {
      for (const place of list || []) {
        if (
          place.latitude !== undefined &&
          place.latitude !== null &&
          place.longitude !== undefined &&
          place.longitude !== null &&
          !seen.has(place.id)
        ) {
          seen.add(place.id);
          markers.push({
            id: `place-${place.id}`,
            coordinates: { latitude: place.latitude, longitude: place.longitude },
            title: `${place.name} (${place.distanceDisplay})`,
            category: cat as any,
          });
        }
      }
    }
    return markers.slice(0, 15);
  }, [connectivity.placesByCategory]);

  return (
    <section id="connectivity" className="space-y-5 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="connectivity-heading">
      <div>
        <h2
          id="connectivity-heading"
          className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
        >
          Location & Connectivity
        </h2>
        <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
          Cartographic coordinates and nearby transit, education, healthcare and key landmarks for {locationName}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Map Container */}
        <div className="lg:col-span-7">
          {hasValidCoords && coordinates ? (
            <div className="rounded-2xl overflow-hidden border border-[rgba(17,17,17,0.08)] shadow-xs min-h-[280px] sm:min-h-[360px] h-[320px] sm:h-[400px]">
              <ProjectLocationMap
                coordinates={coordinates}
                projectName={locationName}
                locationName={locationName}
                coordinateSource="LOCATION"
                nearbyMarkers={nearbyMarkers}
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] text-center text-xs text-[#111111]/60 font-body">
              Exact cartographic coordinates for {locationName} are currently being verified.
            </div>
          )}
        </div>

        {/* Nearby Places List */}
        <div className="lg:col-span-5 space-y-4">
          {categories.length > 0 ? (
            <>
              {/* Category selector pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {categories.map((cat) => {
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-medium transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-[#111111] text-white font-semibold shadow-xs'
                          : 'bg-[#FAFAF8] text-[#111111]/70 border border-[rgba(17,17,17,0.08)] hover:bg-neutral-100 hover:text-[#111111]'
                      }`}
                    >
                      {CATEGORY_ICONS[cat] || <MapPin className="w-3.5 h-3.5" />}
                      <span>{formatCategoryLabel(cat)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Places List */}
              <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl divide-y divide-[rgba(17,17,17,0.06)] overflow-hidden shadow-2xs">
                {placesToDisplay.length === 0 ? (
                  <div className="p-4 text-xs text-[#111111]/50 text-center font-body">
                    No verified places listed under this category.
                  </div>
                ) : (
                  placesToDisplay.map((place) => (
                    <div
                      key={place.id}
                      className="p-3.5 flex items-center justify-between text-xs sm:text-sm font-body hover:bg-[#FAFAF8] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[rgba(17,17,17,0.04)] text-[#111111]/70">
                          {CATEGORY_ICONS[activeCategory] || <MapPin className="w-4 h-4" />}
                        </div>
                        <span className="font-medium text-[#111111]">{place.name}</span>
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#111111]/70 bg-[#FAFAF8] px-2 py-1 rounded border border-[rgba(17,17,17,0.06)] shrink-0">
                        {place.distanceDisplay}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="p-6 rounded-xl bg-white border border-[rgba(17,17,17,0.08)] text-center text-xs text-[#111111]/60 font-body">
              Nearby landmark connectivity intelligence is currently being compiled for {locationName}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
