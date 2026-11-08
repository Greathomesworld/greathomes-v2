import React from 'react';
import Link from 'next/link';
import { BoundedLocationDto } from '@/src/domain/projects/dto/projectDto';
import {
  ProjectLocationViewModel,
  buildProjectLocationViewModel,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { NearbyPlaceDto } from '@/src/domain/places/entities';
import { ProjectLocationMap } from './ProjectLocationMap';
import { ProjectNearbyPlaces } from './ProjectNearbyPlaces';

export interface ProjectLocationSectionProps {
  location: ProjectLocationViewModel | BoundedLocationDto;
  projectName: string;
  nearbyPlaces?: NearbyPlaceDto[];
  routingAttribution?: string | null;
  connectivityDisclosure?: string | null;
  projectCoordinates?: { latitude?: number | null; longitude?: number | null } | null;
}

export function ProjectLocationSection({
  location,
  projectName,
  nearbyPlaces = [],
  routingAttribution,
  connectivityDisclosure,
  projectCoordinates,
}: ProjectLocationSectionProps) {
  // Normalize into canonical ProjectLocationViewModel
  const locationVm: ProjectLocationViewModel =
    'breadcrumb' in location && 'hasValidCoordinates' in location
      ? (location as ProjectLocationViewModel)
      : buildProjectLocationViewModel(location as BoundedLocationDto, null, projectCoordinates);

  const coordinates =
    locationVm.hasValidCoordinates &&
    locationVm.latitude !== null &&
    locationVm.longitude !== null
      ? { latitude: locationVm.latitude, longitude: locationVm.longitude }
      : null;

  const nearbyMarkers = locationVm.hasVerifiedProjectCoordinates
    ? nearbyPlaces.map(p => {
        const isRoad =
          p.isRoadRouteAvailable === true &&
          p.distanceMetric === 'ROAD_ROUTE' &&
          Boolean(p.formattedRouteDistance);
        const distLabel = isRoad
          ? `${p.formattedRouteDistance}${p.formattedDuration ? ` · ~${p.formattedDuration}` : ''}`
          : `${p.formattedGeodesicDistance || p.formattedDistance} (straight-line)`;
        return {
          id: p.id,
          coordinates: { latitude: p.latitude, longitude: p.longitude },
          title: `${p.name} (${distLabel})`,
        };
      })
    : [];

  return (
    <section
      id="location"
      aria-labelledby="location-heading"
      className="space-y-6 pt-8 border-t border-[var(--color-border)]"
    >
      {/* Section Header */}
      <div className="space-y-1.5">
        <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] font-display">
          Location &amp; Connectivity
        </div>
        <h2
          id="location-heading"
          className="text-2xl sm:text-3xl font-display font-semibold text-[var(--color-foreground)] tracking-tight"
        >
          Location &amp; Connectivity
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 font-body leading-relaxed">
          Canonical location intelligence and positioning context for {projectName}.
        </p>
      </div>

      {/* Verified Location Description (Only rendered if verified data exists) */}
      {locationVm.description && locationVm.description.trim().length > 0 && (
        <p className="text-xs sm:text-sm md:text-base font-body text-[var(--color-foreground)]/80 leading-relaxed max-w-3xl">
          {locationVm.description}
        </p>
      )}

      {/* Map Container */}
      <ProjectLocationMap
        coordinates={coordinates}
        projectName={projectName}
        locationName={locationVm.name}
        locationStatus={locationVm.locationStatus}
        coordinateSource={locationVm.coordinateSource}
        nearbyMarkers={nearbyMarkers}
      />

      {/* Spatial Intelligence: Verified Nearby Places & Road Connectivity */}
      <ProjectNearbyPlaces
        places={locationVm.hasVerifiedProjectCoordinates ? nearbyPlaces : []}
        hasCoordinates={locationVm.hasVerifiedProjectCoordinates}
        locationStatus={locationVm.locationStatus}
        coordinateSource={locationVm.coordinateSource}
        locationName={locationVm.name}
        projectName={projectName}
        attribution={routingAttribution}
        disclosureMessage={connectivityDisclosure}
      />

      {/* Factual Contextual Hierarchy Breakdown */}
      {locationVm.breadcrumb && locationVm.breadcrumb.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs uppercase font-semibold tracking-wider text-[var(--color-foreground)]/50 font-display">
            Administrative Hierarchy
          </h3>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {locationVm.breadcrumb.map((node, index) => (
              <Link
                key={`${node.slug}-card-${index}`}
                href={node.href || `/locations/${node.slug}`}
                className="p-3.5 sm:p-4 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] flex flex-col justify-between hover:border-[var(--color-foreground)]/25 transition-all group shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
              >
                <span className="text-[10px] sm:text-[11px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block mb-1">
                  {node.levelDisplay}
                </span>
                <span className="text-xs sm:text-sm font-display font-medium text-[var(--color-foreground)] group-hover:text-[#E85D3F] transition-colors truncate">
                  {node.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
