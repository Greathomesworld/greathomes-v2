'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Plus,
  Minus,
  RotateCcw,
  ArrowRight,
  Building2,
  Home,
  Key,
  Maximize2,
  Minimize2,
  X,
  Compass,
  Train,
  GraduationCap,
  TrendingUp,
  Layers,
} from 'lucide-react';
import {
  cartoMapProvider,
  projectLatLng,
  unprojectPixels,
  validateCartoCoordinates,
} from '@/src/infrastructure/maps/carto/cartoProvider';
import {
  DirectoryLocationCardDto,
  DirectoryMappableProjectDto,
  DirectoryIntelligenceSummaryDto,
} from '@/src/domain/marketIntelligence/services/marketIntelligenceService';
import { KOLKATA_CORRIDORS, KolkataCorridorId } from '@/src/domain/locations/locationRegionMapper';

interface LocationsMapExplorerProps {
  areas: DirectoryLocationCardDto[];
  neighbourhoods: DirectoryLocationCardDto[];
  mappableProjects?: DirectoryMappableProjectDto[];
  corridorCounts?: DirectoryIntelligenceSummaryDto['corridorCounts'];
  totals: {
    areasCount: number;
    neighbourhoodsCount: number;
    publishedProjectsCount: number;
    verifiedResaleCount: number;
    verifiedRentalCount: number;
    unverifiedResaleCount?: number;
    unverifiedRentalCount?: number;
  };
  activeRegion: KolkataCorridorId;
  selectedSlug: string | null;
  onSelectLocation: (slug: string | null) => void;
  fullWidthMode?: boolean;
  onToggleFullMap?: () => void;
}

const KOLKATA_DEFAULT_CENTER = { latitude: 22.568, longitude: 88.395, zoom: 11 };

// Primary pin slugs shown with persistent labels at overview zoom (matching Reference A)
const PROMINENT_MAP_SLUGS = new Set([
  'salt-lake',
  'rajarhat',
  'new-town',
  'em-bypass',
  'ballygunge',
  'alipore',
  'tollygunge',
  'dum-dum',
  'behala',
  'garia',
  'joka',
  'park-street-area',
]);

export function LocationsMapExplorer({
  areas,
  neighbourhoods,
  mappableProjects = [],
  corridorCounts,
  totals,
  activeRegion,
  selectedSlug,
  onSelectLocation,
  fullWidthMode = false,
  onToggleFullMap,
}: LocationsMapExplorerProps) {
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<HTMLDivElement>(null);
  const loadedTilesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [center, setCenter] = useState<{ latitude: number; longitude: number }>({
    latitude: KOLKATA_DEFAULT_CENTER.latitude,
    longitude: KOLKATA_DEFAULT_CENTER.longitude,
  });
  const [zoom, setZoom] = useState<number>(KOLKATA_DEFAULT_CENTER.zoom);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 760,
    height: 440,
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Layer Filter toggles matching Reference A & Priority 5
  const [layerAreas, setLayerAreas] = useState<boolean>(true);
  const [layerProjects, setLayerProjects] = useState<boolean>(false);
  const [layerResale, setLayerResale] = useState<boolean>(false);
  const [layerRental, setLayerRental] = useState<boolean>(false);

  // Dragging refs
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; centerPx: { x: number; y: number } }>({
    x: 0,
    y: 0,
    centerPx: { x: 0, y: 0 },
  });

  // Dynamic layer counts synchronized with activeRegion filter (Priority 5)
  const activeLayerCounts = useMemo(() => {
    if (activeRegion === 'ALL' || !corridorCounts || !corridorCounts[activeRegion]) {
      return {
        areasCount: totals.areasCount,
        projectsCount: totals.publishedProjectsCount,
        resaleCount: totals.verifiedResaleCount,
        rentalCount: totals.verifiedRentalCount,
      };
    }
    const c = corridorCounts[activeRegion];
    return {
      areasCount: c.areaCount,
      projectsCount: c.projectCount,
      resaleCount: c.resaleCount,
      rentalCount: c.rentalCount,
    };
  }, [activeRegion, corridorCounts, totals]);

  // Combine valid coordinate locations
  const allMappableLocations = useMemo(() => {
    const base = zoom >= 13 ? [...areas, ...neighbourhoods] : areas;
    return base.filter(loc => {
      if (
        loc.latitude === null ||
        loc.longitude === null ||
        !validateCartoCoordinates({ latitude: loc.latitude, longitude: loc.longitude })
      ) {
        return false;
      }
      if (activeRegion !== 'ALL' && loc.corridorId !== activeRegion) {
        return false;
      }
      // Apply layer checkbox filtering when specific inventory filters are toggled on
      if (!layerAreas && !layerProjects && !layerResale && !layerRental) {
        return true;
      }
      if (layerProjects && !layerAreas && !layerResale && !layerRental) {
        return loc.projectCount > 0;
      }
      if (layerResale && !layerAreas && !layerProjects && !layerRental) {
        return loc.resaleCount > 0;
      }
      if (layerRental && !layerAreas && !layerProjects && !layerResale) {
        return loc.rentalCount > 0;
      }
      if (layerProjects || layerResale || layerRental) {
        const matchesProj = layerProjects && loc.projectCount > 0;
        const matchesResale = layerResale && loc.resaleCount > 0;
        const matchesRental = layerRental && loc.rentalCount > 0;
        if (!layerAreas) {
          return matchesProj || matchesResale || matchesRental;
        }
      }
      return true;
    });
  }, [areas, neighbourhoods, zoom, activeRegion, layerAreas, layerProjects, layerResale, layerRental]);

  const selectedLocation = useMemo(() => {
    if (!selectedSlug) return null;
    return (
      areas.find(a => a.slug === selectedSlug) ||
      neighbourhoods.find(n => n.slug === selectedSlug) ||
      null
    );
  }, [areas, neighbourhoods, selectedSlug]);

  // Adjust map center when activeRegion changes
  useEffect(() => {
    if (activeRegion === 'ALL') {
      setCenter({
        latitude: KOLKATA_DEFAULT_CENTER.latitude,
        longitude: KOLKATA_DEFAULT_CENTER.longitude,
      });
      setZoom(KOLKATA_DEFAULT_CENTER.zoom);
    } else {
      const corridor = KOLKATA_CORRIDORS.find(c => c.id === activeRegion);
      if (corridor) {
        setCenter({
          latitude: corridor.center.latitude,
          longitude: corridor.center.longitude,
        });
        setZoom(corridor.center.zoom);
      }
    }
  }, [activeRegion]);

  // Center on selectedLocation when clicked
  useEffect(() => {
    if (
      selectedLocation &&
      selectedLocation.latitude !== null &&
      selectedLocation.longitude !== null
    ) {
      setCenter({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });
    }
  }, [selectedLocation]);

  // Observe container resize
  useEffect(() => {
    const el = mapViewportRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerSize({
        width: el.clientWidth || 760,
        height: el.clientHeight || 440,
      });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExpanded, fullWidthMode]);

  // Render CARTO basemap tiles whenever center, zoom, or containerSize changes
  useEffect(() => {
    const tileContainer = tileLayerRef.current;
    if (!tileContainer) return;

    const { width, height } = containerSize;
    const centerPixels = projectLatLng(center.latitude, center.longitude, zoom);
    const minX = centerPixels.x - width / 2;
    const maxX = centerPixels.x + width / 2;
    const minY = centerPixels.y - height / 2;
    const maxY = centerPixels.y + height / 2;

    const minTileX = Math.floor(minX / 256);
    const maxTileX = Math.floor(maxX / 256);
    const minTileY = Math.max(0, Math.floor(minY / 256));
    const maxTileY = Math.min(Math.pow(2, zoom) - 1, Math.floor(maxY / 256));

    const visibleKeys = new Set<string>();
    const loadedTiles = loadedTilesRef.current;

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const key = `${zoom}/${tx}/${ty}`;
        visibleKeys.add(key);

        const left = tx * 256 - minX;
        const top = ty * 256 - minY;

        let img = loadedTiles.get(key);
        if (!img) {
          img = new Image();
          img.decoding = 'async';
          img.alt = '';
          img.style.position = 'absolute';
          img.style.width = '256px';
          img.style.height = '256px';
          img.style.pointerEvents = 'none';
          img.style.userSelect = 'none';
          img.src = cartoMapProvider.getTileUrl(tx, ty, zoom, { theme: 'light', retina: true });
          loadedTiles.set(key, img);
          tileContainer.appendChild(img);
        }

        img.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      }
    }

    for (const [key, img] of loadedTiles.entries()) {
      if (!visibleKeys.has(key)) {
        img.remove();
        loadedTiles.delete(key);
      }
    }
  }, [center, zoom, containerSize]);

  // Clean up tiles on unmount
  useEffect(() => {
    const loadedTiles = loadedTilesRef.current;
    return () => {
      loadedTiles.forEach(img => img.remove());
      loadedTiles.clear();
    };
  }, []);

  // Pointer drag handlers for smooth map panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Do not start drag if clicking a button/link/label
    if ((e.target as HTMLElement).closest('button, a, label, input')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      centerPx: projectLatLng(center.latitude, center.longitude, zoom),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextCenter = unprojectPixels(
      dragStartRef.current.centerPx.x - dx,
      dragStartRef.current.centerPx.y - dy,
      zoom
    );
    if (validateCartoCoordinates(nextCenter)) {
      setCenter(nextCenter);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(16, z + 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(10, z - 1));
  }, []);

  const handleResetView = useCallback(() => {
    setCenter({
      latitude: KOLKATA_DEFAULT_CENTER.latitude,
      longitude: KOLKATA_DEFAULT_CENTER.longitude,
    });
    setZoom(KOLKATA_DEFAULT_CENTER.zoom);
    onSelectLocation(null);
  }, [onSelectLocation]);

  // Project markers to current viewport coordinates
  const projectedMarkers = useMemo(() => {
    const { width, height } = containerSize;
    const centerPx = projectLatLng(center.latitude, center.longitude, zoom);
    const minX = centerPx.x - width / 2;
    const minY = centerPx.y - height / 2;

    return allMappableLocations
      .map(loc => {
        const px = projectLatLng(loc.latitude!, loc.longitude!, zoom);
        const left = px.x - minX;
        const top = px.y - minY;
        const inBounds = left >= -40 && left <= width + 40 && top >= -40 && top <= height + 40;
        const isProminent =
          PROMINENT_MAP_SLUGS.has(loc.slug) ||
          selectedSlug === loc.slug ||
          activeRegion !== 'ALL' ||
          zoom >= 12;

        return {
          loc,
          left,
          top,
          inBounds,
          isProminent,
          isSelected: selectedSlug === loc.slug,
        };
      })
      .filter(m => m.inBounds);
  }, [allMappableLocations, center, zoom, containerSize, selectedSlug, activeRegion]);

  // Project real-coordinate project pins when layerProjects is enabled
  const projectedProjectPins = useMemo(() => {
    if (!layerProjects || mappableProjects.length === 0) return [];
    const { width, height } = containerSize;
    const centerPx = projectLatLng(center.latitude, center.longitude, zoom);
    const minX = centerPx.x - width / 2;
    const minY = centerPx.y - height / 2;

    return mappableProjects
      .filter(proj => {
        if (!validateCartoCoordinates({ latitude: proj.latitude, longitude: proj.longitude })) {
          return false;
        }
        if (activeRegion !== 'ALL' && proj.corridorId !== activeRegion) {
          return false;
        }
        return true;
      })
      .map(proj => {
        const px = projectLatLng(proj.latitude, proj.longitude, zoom);
        const left = px.x - minX;
        const top = px.y - minY;
        const inBounds = left >= -40 && left <= width + 40 && top >= -40 && top <= height + 40;
        return { proj, left, top, inBounds };
      })
      .filter(p => p.inBounds);
  }, [layerProjects, mappableProjects, center, zoom, containerSize, activeRegion]);

  return (
    <section
      id="kolkata-map-explorer"
      aria-label="Explore Kolkata on the Map and Location Intelligence"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
    >
      {/* Left Column: Interactive Map Explorer (8 cols in default split, 12 cols when expanded) */}
      <div
        className={`${
          fullWidthMode || isExpanded ? 'lg:col-span-12' : 'lg:col-span-8'
        } bg-[#F6F2EC] border border-[rgba(17,17,17,0.08)] rounded-2xl p-4 sm:p-6 flex flex-col justify-between shadow-2xs`}
      >
        {/* Map Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0 mt-0.5">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-display font-bold text-[#111111] tracking-tight">
                Explore Kolkata on the Map
              </h2>
              <p className="text-xs sm:text-sm font-body text-[#111111]/65">
                Discover residential areas, published projects and verified inventory across Kolkata.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => {
                if (onToggleFullMap) {
                  onToggleFullMap();
                } else {
                  setIsExpanded(prev => !prev);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[rgba(17,17,17,0.12)] text-xs font-display font-semibold text-[#111111] hover:border-[#E85D3F] hover:text-[#E85D3F] transition-all shadow-2xs cursor-pointer"
            >
              <span>{fullWidthMode || isExpanded ? 'Compact Map' : 'View Full Map'}</span>
              {fullWidthMode || isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5 text-[#E85D3F]" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-[#E85D3F]" />
              )}
            </button>
          </div>
        </div>

        {/* Interactive Map Canvas */}
        <div
          ref={mapViewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          data-testid="locations-interactive-map"
          className={`relative w-full ${
            fullWidthMode || isExpanded ? 'h-[480px] sm:h-[560px]' : 'h-[360px] sm:h-[420px]'
          } rounded-xl overflow-hidden border border-[rgba(17,17,17,0.1)] bg-[#E8EEF1] cursor-grab active:cursor-grabbing select-none touch-none`}
        >
          {/* CARTO Basemap Tile Layer */}
          <div ref={tileLayerRef} className="absolute inset-0 pointer-events-none" />

          {/* Subtle Kolkata City Center Watermark Label */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="text-center opacity-75 bg-white/60 backdrop-blur-[2px] px-3 py-1 rounded-lg border border-black/5">
              <span className="block text-sm sm:text-base font-display font-bold text-[#111111] tracking-tight">
                Kolkata
              </span>
              <span className="block text-[11px] font-body text-[#111111]/70">কলকাতা</span>
            </div>
          </div>

          {/* Interactive Location & Project Markers */}
          <div className="absolute inset-0 pointer-events-none">
            {projectedMarkers.map(({ loc, left, top, isProminent, isSelected }) => {
              return (
                <div
                  key={loc.id}
                  style={{
                    transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`,
                  }}
                  className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 pointer-events-auto ${
                    isSelected ? 'z-30' : isProminent ? 'z-20' : 'z-10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectLocation(isSelected ? null : loc.slug)}
                    aria-label={`Select ${loc.name} on map (${loc.projectCount} projects)`}
                    className={`group flex items-center gap-1.5 transition-all cursor-pointer focus:outline-hidden ${
                      isProminent
                        ? `px-2.5 py-1 rounded-full shadow-md border ${
                            isSelected
                              ? 'bg-[#111111] text-white border-[#111111] scale-105'
                              : 'bg-white/95 text-[#111111] border-[rgba(17,17,17,0.14)] hover:border-[#E85D3F] hover:scale-105'
                          }`
                        : 'p-1'
                    }`}
                  >
                    {isProminent ? (
                      <>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#E85D3F] text-white'
                              : 'bg-[#E85D3F] text-white group-hover:bg-[#d44d31]'
                          }`}
                        >
                          <MapPin className="w-2.5 h-2.5" />
                        </span>
                        <span className="text-[11px] font-display font-bold whitespace-nowrap">
                          {loc.name}
                        </span>
                        {(layerProjects || isSelected) && loc.projectCount > 0 && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-[#E85D3F]/10 text-[#E85D3F] font-semibold'
                            }`}
                          >
                            {loc.projectCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <span className="w-3.5 h-3.5 rounded-full bg-[#E85D3F] border-2 border-white shadow-sm group-hover:scale-125 transition-transform" />
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1.5 px-2 py-0.5 rounded-md bg-[#111111] text-white text-[10px] font-display font-semibold whitespace-nowrap shadow-sm pointer-events-none">
                          {loc.name}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}

            {/* Direct Project Coordinate Pins when Published Projects Layer is Active */}
            {projectedProjectPins.map(({ proj, left, top }) => (
              <div
                key={`proj-pin-${proj.id}`}
                style={{
                  transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`,
                }}
                className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-25"
              >
                <Link
                  href={`/projects/${proj.slug}`}
                  aria-label={`View project ${proj.name}`}
                  className="group flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#111111]/90 text-white border border-white/20 shadow-md hover:bg-[#E85D3F] transition-all"
                >
                  <Building2 className="w-3 h-3 text-[#E85D3F] group-hover:text-white shrink-0" />
                  <span className="text-[10px] font-display font-semibold whitespace-nowrap">
                    {proj.name}
                  </span>
                </Link>
              </div>
            ))}
          </div>

          {/* Left Floating Layer Filter Panel (Matching Reference A & Priority 5) */}
          <div className="absolute top-3 left-3 z-20 bg-white/95 backdrop-blur-md border border-[rgba(17,17,17,0.1)] rounded-xl p-3 sm:p-3.5 shadow-sm max-w-[235px] pointer-events-auto space-y-2">
            <label className="flex items-center gap-2.5 text-xs font-display font-semibold text-[#111111] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={layerAreas}
                onChange={e => setLayerAreas(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E85D3F] cursor-pointer"
              />
              <span>Residential Areas ({activeLayerCounts.areasCount})</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-display font-medium text-[#111111]/85 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={layerProjects}
                onChange={e => setLayerProjects(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E85D3F] cursor-pointer"
              />
              <span>Published Projects ({activeLayerCounts.projectsCount})</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-display font-medium text-[#111111]/85 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={layerResale}
                onChange={e => setLayerResale(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E85D3F] cursor-pointer"
              />
              <span>Verified Resale Homes ({activeLayerCounts.resaleCount})</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-display font-medium text-[#111111]/85 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={layerRental}
                onChange={e => setLayerRental(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E85D3F] cursor-pointer"
              />
              <span>Verified Rental Homes ({activeLayerCounts.rentalCount})</span>
            </label>
          </div>

          {/* Bottom-Right Zoom & Reset Controls */}
          <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5 pointer-events-auto">
            <div className="flex flex-col rounded-lg bg-white/95 backdrop-blur-sm border border-[rgba(17,17,17,0.12)] shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in map"
                className="w-9 h-9 flex items-center justify-center text-[#111111] hover:bg-neutral-100 transition-colors border-b border-[rgba(17,17,17,0.08)] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out map"
                className="w-9 h-9 flex items-center justify-center text-[#111111] hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleResetView}
              aria-label="Reset map view"
              title="Reset Kolkata view"
              className="w-9 h-9 rounded-lg bg-white/95 backdrop-blur-sm border border-[rgba(17,17,17,0.12)] shadow-sm flex items-center justify-center text-[#111111]/80 hover:text-[#E85D3F] hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Selected Location Preview Card Overlay */}
          {selectedLocation && (
            <div
              data-testid="map-selected-location-card"
              className="absolute bottom-3 left-3 right-14 sm:right-auto sm:w-[340px] z-30 bg-white/98 backdrop-blur-md border border-[rgba(17,17,17,0.14)] rounded-xl p-3.5 shadow-lg pointer-events-auto space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#E85D3F]">
                    {selectedLocation.corridorLabel || selectedLocation.type}
                  </span>
                  <h3 className="text-base font-display font-bold text-[#111111] leading-snug">
                    {selectedLocation.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectLocation(null)}
                  aria-label="Close location preview"
                  className="p-1 rounded-lg text-[#111111]/50 hover:text-[#111111] hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs font-body text-[#111111]/70 line-clamp-2">
                {selectedLocation.shortDescription}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[rgba(17,17,17,0.08)] text-center">
                <div className="bg-[#FAFAF8] rounded-lg py-1.5 px-2">
                  <span className="block text-xs font-display font-bold text-[#111111]">
                    {selectedLocation.projectCount}
                  </span>
                  <span className="block text-[10px] text-[#111111]/60">Projects</span>
                </div>
                <div className="bg-[#FAFAF8] rounded-lg py-1.5 px-2">
                  <span className="block text-xs font-display font-bold text-[#111111]">
                    {selectedLocation.resaleCount > 0 ? selectedLocation.resaleCount : '–'}
                  </span>
                  <span className="block text-[10px] text-[#111111]/60">Resale</span>
                </div>
                <div className="bg-[#FAFAF8] rounded-lg py-1.5 px-2">
                  <span className="block text-xs font-display font-bold text-[#111111]">
                    {selectedLocation.rentalCount > 0 ? selectedLocation.rentalCount : '–'}
                  </span>
                  <span className="block text-[10px] text-[#111111]/60">Rental</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Link
                  href={`/locations/${selectedLocation.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#E85D3F] hover:underline"
                >
                  <span>Explore location intelligence</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {selectedLocation.projectCount > 0 && (
                  <Link
                    href={`/projects?location=${selectedLocation.slug}`}
                    className="text-[11px] font-display font-semibold px-2.5 py-1 rounded-lg bg-[#111111] text-white hover:bg-[#222222] transition-colors"
                  >
                    View Projects
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* CARTO Attribution */}
          <div className="absolute bottom-1 left-3 z-10 text-[9px] text-[#111111]/45 bg-white/70 px-1.5 py-0.5 rounded pointer-events-none">
            {cartoMapProvider.getAttribution()}
          </div>
        </div>
      </div>

      {/* Right Column: Location Intelligence Overview Card (Matching Reference A) */}
      {!fullWidthMode && !isExpanded && (
        <div className="lg:col-span-4 bg-[#F6F2EC] border border-[rgba(17,17,17,0.08)] rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-2xs space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-display font-bold text-[#111111] tracking-tight">
                Location Intelligence
              </h2>
            </div>
            <p className="text-xs sm:text-sm font-body text-[#111111]/65 leading-relaxed pl-10">
              Make informed decisions with verified, location-specific insights across Kolkata.
            </p>
          </div>

          <div className="space-y-3.5 my-auto">
            {/* Pillar 1: Connectivity & Commute */}
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/80 border border-[rgba(17,17,17,0.06)]">
              <div className="w-9 h-9 rounded-full bg-[#E85D3F]/10 flex items-center justify-center text-[#E85D3F] shrink-0">
                <Train className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-[#111111]">
                  Connectivity &amp; Commute
                </h3>
                <p className="text-xs font-body text-[#111111]/65 mt-0.5">
                  Metro corridors, arterial roads &amp; airport proximity metrics
                </p>
              </div>
            </div>

            {/* Pillar 2: Social Infrastructure */}
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/80 border border-[rgba(17,17,17,0.06)]">
              <div className="w-9 h-9 rounded-full bg-[#E85D3F]/10 flex items-center justify-center text-[#E85D3F] shrink-0">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-[#111111]">
                  Social Infrastructure
                </h3>
                <p className="text-xs font-body text-[#111111]/65 mt-0.5">
                  Leading schools, multispecialty hospitals, malls &amp; business parks
                </p>
              </div>
            </div>

            {/* Pillar 3: Price Trends */}
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/80 border border-[rgba(17,17,17,0.06)]">
              <div className="w-9 h-9 rounded-full bg-[#E85D3F]/10 flex items-center justify-center text-[#E85D3F] shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-[#111111]">
                  Price Benchmarks
                </h3>
                <p className="text-xs font-body text-[#111111]/65 mt-0.5">
                  Carpet, Built-Up &amp; Super Built-Up sq.ft. rates separated clearly
                </p>
              </div>
            </div>

            {/* Pillar 4: Upcoming Developments */}
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/80 border border-[rgba(17,17,17,0.06)]">
              <div className="w-9 h-9 rounded-full bg-[#E85D3F]/10 flex items-center justify-center text-[#E85D3F] shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-[#111111]">
                  Upcoming Developments
                </h3>
                <p className="text-xs font-body text-[#111111]/65 mt-0.5">
                  New launches, RERA registrations &amp; sub-market supply depth
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[rgba(17,17,17,0.08)] flex items-center justify-between text-xs font-display font-semibold text-[#111111]/75">
            <span>Compare any two corridors</span>
            <Link
              href="/compare/locations?locations=new-town,rajarhat"
              className="inline-flex items-center gap-1 text-[#E85D3F] hover:underline"
            >
              <span>Compare Locations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
