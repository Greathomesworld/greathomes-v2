import {
  MapProvider,
  MapCoordinates,
  MapViewport,
  MapMarker,
  StaticMapOptions,
  InteractiveMapConfig,
  MapInstance,
} from '@/src/domain/locations/map/types';

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];

/**
 * Validates geographic coordinate boundaries.
 * Latitude must be within [-90, +90].
 * Longitude must be within [-180, +180].
 */
export function validateCartoCoordinates(coords?: MapCoordinates | null): boolean {
  if (
    !coords ||
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number' ||
    isNaN(coords.latitude) ||
    isNaN(coords.longitude)
  ) {
    return false;
  }
  return (
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180
  );
}

/**
 * Projects latitude/longitude to Web Mercator pixel coordinates at a given zoom level.
 */
export function projectLatLng(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSinLat = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y = (0.5 - Math.log((1 + clampedSinLat) / (1 - clampedSinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Unprojects Web Mercator pixel coordinates to latitude/longitude at a given zoom level.
 */
export function unprojectPixels(x: number, y: number, zoom: number): { latitude: number; longitude: number } {
  const scale = 256 * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude: lat, longitude: lng };
}

/**
 * CARTO Map Provider Implementation
 *
 * Implements the provider-neutral MapProvider domain interface.
 * Connects to CARTO Basemap services (Voyager / Positron / Dark Matter)
 * using standard, verified CDN infrastructure with zero bloat.
 */
export class CartoMapProvider implements MapProvider {
  readonly id = 'carto';
  readonly providerType = 'CARTO' as const;

  /**
   * Safely retrieves public CARTO environment configuration.
   * Never exposes private keys or server credentials.
   */
  private getApiKey(): string {
    if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CARTO_API_KEY) {
      return process.env.NEXT_PUBLIC_CARTO_API_KEY;
    }
    return '';
  }

  /**
   * Validates coordinate bounds against WGS84 standards.
   */
  validateCoordinates(coords: MapCoordinates): boolean {
    return validateCartoCoordinates(coords);
  }

  /**
   * Resolves CARTO tile URL for given tile coordinates and zoom.
   */
  getTileUrl(
    x: number,
    y: number,
    z: number,
    options?: { theme?: 'light' | 'dark'; retina?: boolean }
  ): string {
    const maxTile = Math.pow(2, z);
    const normalizedX = ((x % maxTile) + maxTile) % maxTile;
    if (y < 0 || y >= maxTile) {
      return '';
    }

    // Deterministic subdomain selection for optimal HTTP caching
    const sub = CARTO_SUBDOMAINS[Math.abs(normalizedX + y) % CARTO_SUBDOMAINS.length];
    const isDark = options?.theme === 'dark';
    const style = isDark ? 'dark_all' : 'rastertiles/voyager';
    const retinaSuffix = options?.retina ? '@2x' : '';
    const apiKey = this.getApiKey();
    const query = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';

    return `https://${sub}.basemaps.cartocdn.com/${style}/${z}/${normalizedX}/${y}${retinaSuffix}.png${query}`;
  }

  /**
   * Returns CARTO legal attribution string.
   */
  getAttribution(): string {
    return '© OpenStreetMap contributors, © CARTO';
  }

  /**
   * Generates a static map image URL fallback if needed.
   */
  getStaticMapUrl(options: StaticMapOptions): string {
    if (!this.validateCoordinates(options.center)) {
      return '';
    }
    const centerTile = projectLatLng(options.center.latitude, options.center.longitude, options.zoom);
    const tileX = Math.floor(centerTile.x / 256);
    const tileY = Math.floor(centerTile.y / 256);
    return this.getTileUrl(tileX, tileY, options.zoom, { retina: options.retina });
  }

  /**
   * Mounts and initializes an interactive CARTO map instance.
   */
  createInteractiveMap(config: InteractiveMapConfig): MapInstance {
    let currentCenter = { ...config.initialViewport.center };
    let currentZoom = Math.max(config.minZoom ?? 11, Math.min(config.maxZoom ?? 18, config.initialViewport.zoom));
    let currentMarker: MapMarker | null = config.marker ? { ...config.marker } : null;
    let destroyed = false;
    let isDragging = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startCenterPixels = { x: 0, y: 0 };

    const container = config.container;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.userSelect = 'none';

    // Tile Layer container
    const tileContainer = document.createElement('div');
    tileContainer.className = 'carto-tile-container absolute inset-0 pointer-events-none';
    tileContainer.style.position = 'absolute';
    tileContainer.style.inset = '0';
    container.appendChild(tileContainer);

    // Marker Layer container
    const markerContainer = document.createElement('div');
    markerContainer.className = 'carto-marker-container absolute inset-0 pointer-events-none';
    markerContainer.style.position = 'absolute';
    markerContainer.style.inset = '0';
    container.appendChild(markerContainer);

    // Attribution
    const attrEl = document.createElement('div');
    attrEl.className = 'carto-attribution absolute bottom-1.5 left-2 z-10 text-[10px] text-[#111111]/40 bg-white/70 px-1.5 py-0.5 rounded backdrop-blur-xs pointer-events-none select-none';
    attrEl.innerText = this.getAttribution();
    container.appendChild(attrEl);

    // Active loaded tiles map: key -> HTMLImageElement
    const loadedTiles = new Map<string, HTMLImageElement>();

    const render = () => {
      if (destroyed) return;
      const width = container.clientWidth || 600;
      const height = container.clientHeight || 340;
      const centerPixels = projectLatLng(currentCenter.latitude, currentCenter.longitude, currentZoom);

      const minX = centerPixels.x - width / 2;
      const maxX = centerPixels.x + width / 2;
      const minY = centerPixels.y - height / 2;
      const maxY = centerPixels.y + height / 2;

      const minTileX = Math.floor(minX / 256);
      const maxTileX = Math.floor(maxX / 256);
      const minTileY = Math.max(0, Math.floor(minY / 256));
      const maxTileY = Math.min(Math.pow(2, currentZoom) - 1, Math.floor(maxY / 256));

      const visibleKeys = new Set<string>();

      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          const key = `${currentZoom}/${tx}/${ty}`;
          visibleKeys.add(key);

          const left = tx * 256 - minX;
          const top = ty * 256 - minY;

          let img = loadedTiles.get(key);
          if (!img) {
            img = new Image();
            img.decoding = 'async';
            img.alt = 'Map tile';
            img.style.position = 'absolute';
            img.style.width = '256px';
            img.style.height = '256px';
            img.style.pointerEvents = 'none';
            img.src = this.getTileUrl(tx, ty, currentZoom, { theme: config.theme });
            
            img.onerror = () => {
              if (config.onError && !destroyed) {
                config.onError(new Error(`Failed to load tile: ${key}`));
              }
            };

            loadedTiles.set(key, img);
            tileContainer.appendChild(img);
          }

          img.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        }
      }

      // Cleanup tiles that are no longer visible
      for (const [key, img] of loadedTiles.entries()) {
        if (!visibleKeys.has(key)) {
          if (img.parentElement) {
            img.parentElement.removeChild(img);
          }
          loadedTiles.delete(key);
        }
      }

      // Update Marker position
      if (currentMarker) {
        const markerPixels = projectLatLng(currentMarker.coordinates.latitude, currentMarker.coordinates.longitude, currentZoom);
        const markerLeft = markerPixels.x - minX;
        const markerTop = markerPixels.y - minY;

        let markerEl = markerContainer.querySelector('.carto-project-marker') as HTMLElement;
        if (!markerEl) {
          markerEl = document.createElement('div');
          markerEl.className = 'carto-project-marker absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-full pointer-events-auto';
          markerContainer.appendChild(markerEl);
        }
        markerEl.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-9 h-9 rounded-full bg-white shadow-md border border-[#E85D3F]/40 flex items-center justify-center text-[#E85D3F]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
              </svg>
            </div>
          </div>
          ${currentMarker.title ? `<div class="mt-1 px-2.5 py-0.5 rounded bg-white/95 text-[11px] font-semibold text-[#111111] shadow-xs border border-gray-200 whitespace-nowrap">${currentMarker.title}</div>` : ''}
        `;
        markerEl.style.transform = `translate3d(${Math.round(markerLeft)}px, ${Math.round(markerTop)}px, 0) translate(-50%, -100%)`;
      } else {
        const markerEl = markerContainer.querySelector('.carto-project-marker') as HTMLElement;
        if (markerEl) markerEl.remove();
      }

      // Update Nearby Markers position
      if (config.nearbyMarkers && config.nearbyMarkers.length > 0) {
        let nearbyContainer = markerContainer.querySelector('.carto-nearby-markers-group') as HTMLElement;
        if (!nearbyContainer) {
          nearbyContainer = document.createElement('div');
          nearbyContainer.className = 'carto-nearby-markers-group absolute inset-0 pointer-events-none';
          markerContainer.appendChild(nearbyContainer);

          for (let i = 0; i < config.nearbyMarkers.length; i++) {
            const m = config.nearbyMarkers[i];
            const el = document.createElement('div');
            el.id = `nearby-marker-${m.id || i}`;
            el.className = 'carto-nearby-marker absolute z-15 flex flex-col items-center -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group';
            el.innerHTML = `
              <div class="w-6 h-6 rounded-full bg-white shadow-xs border border-neutral-300 group-hover:border-[#E85D3F] flex items-center justify-center text-neutral-700 group-hover:text-[#E85D3F] transition-all">
                <span class="w-2 h-2 rounded-full bg-[#111111] group-hover:bg-[#E85D3F]"></span>
              </div>
              ${m.title ? `<div class="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 px-2 py-0.5 rounded bg-black/85 text-[10px] text-white whitespace-nowrap pointer-events-none">${m.title}</div>` : ''}
            `;
            nearbyContainer.appendChild(el);
          }
        }

        const markerEls = nearbyContainer.children;
        for (let i = 0; i < config.nearbyMarkers.length; i++) {
          const m = config.nearbyMarkers[i];
          const el = markerEls[i] as HTMLElement;
          if (el) {
            const p = projectLatLng(m.coordinates.latitude, m.coordinates.longitude, currentZoom);
            const left = p.x - minX;
            const top = p.y - minY;
            el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0) translate(-50%, -50%)`;
          }
        }
      }
    };

    // Pointer events for panning
    const onPointerDown = (e: PointerEvent) => {
      if (destroyed || e.button !== 0) return;
      isDragging = true;
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      startCenterPixels = projectLatLng(currentCenter.latitude, currentCenter.longitude, currentZoom);
      container.setPointerCapture(e.pointerId);
      container.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || destroyed) return;
      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;
      const newCenterPixels = {
        x: startCenterPixels.x - dx,
        y: startCenterPixels.y - dy,
      };
      currentCenter = unprojectPixels(newCenterPixels.x, newCenterPixels.y, currentZoom);
      render();
      if (config.onViewportChange) {
        config.onViewportChange({ center: currentCenter, zoom: currentZoom });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
      container.style.cursor = 'grab';

      // Click / tap detection (minimal pointer displacement)
      if (Math.hypot(e.clientX - startPointerX, e.clientY - startPointerY) < 6 && config.onClick) {
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const width = container.clientWidth || 600;
        const height = container.clientHeight || 340;
        const centerPixels = projectLatLng(currentCenter.latitude, currentCenter.longitude, currentZoom);
        const minX = centerPixels.x - width / 2;
        const minY = centerPixels.y - height / 2;
        const clickedPixels = { x: minX + clickX, y: minY + clickY };
        const clickedCoords = unprojectPixels(clickedPixels.x, clickedPixels.y, currentZoom);
        config.onClick(clickedCoords);
      }
    };

    container.style.cursor = 'grab';
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!destroyed) render();
    });
    resizeObserver.observe(container);

    // Initial render
    requestAnimationFrame(() => {
      if (!destroyed) {
        render();
        if (config.onLoad) config.onLoad();
      }
    });

    return {
      setCenter: (coords: MapCoordinates, zoom?: number) => {
        if (!validateCartoCoordinates(coords)) return;
        currentCenter = { ...coords };
        if (typeof zoom === 'number') {
          currentZoom = Math.max(config.minZoom ?? 11, Math.min(config.maxZoom ?? 18, zoom));
        }
        render();
      },
      setZoom: (zoom: number) => {
        currentZoom = Math.max(config.minZoom ?? 11, Math.min(config.maxZoom ?? 18, zoom));
        render();
      },
      getZoom: () => currentZoom,
      getCenter: () => ({ ...currentCenter }),
      setMarker: (marker: MapMarker | null) => {
        currentMarker = marker ? { ...marker } : null;
        render();
      },
      resize: () => {
        if (!destroyed) render();
      },
      destroy: () => {
        destroyed = true;
        resizeObserver.disconnect();
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerUp);
        tileContainer.innerHTML = '';
        markerContainer.innerHTML = '';
        attrEl.remove();
        tileContainer.remove();
        markerContainer.remove();
        loadedTiles.clear();
      },
    };
  }
}

export const cartoMapProvider = new CartoMapProvider();
