'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  CheckCircle2,
  MapPin,
  Building2,
  Image as ImageIcon,
} from 'lucide-react';
import { PropertyDetailMediaViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyDetailGalleryProps {
  media: PropertyDetailMediaViewModel[];
  title: string;
  mode: 'RESALE' | 'RENTAL';
  isVerified: boolean;
  listingPartyLabel: string;
  projectName?: string | null;
  locationDisplay: string;
}

export function PropertyDetailGallery({
  media,
  title,
  mode,
  isVerified,
  listingPartyLabel,
  projectName,
  locationDisplay,
}: PropertyDetailGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);

  const validMedia = media.filter(m => m.url && !failedUrls[m.url]);
  const totalPhotos = validMedia.length;
  const safeActiveIndex = totalPhotos > 0 ? Math.min(activeIndex, totalPhotos - 1) : 0;

  const handleImageError = useCallback((url: string) => {
    setFailedUrls(prev => ({ ...prev, [url]: true }));
  }, []);

  const handlePrev = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (totalPhotos <= 1) return;
      setActiveIndex(prev => (prev - 1 + totalPhotos) % totalPhotos);
    },
    [totalPhotos]
  );

  const handleNext = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (totalPhotos <= 1) return;
      setActiveIndex(prev => (prev + 1) % totalPhotos);
    },
    [totalPhotos]
  );

  const openLightboxAt = useCallback((index: number) => {
    setActiveIndex(index);
    setLightboxOpen(true);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, handleNext, handlePrev]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
  };

  const modeBadgeLabel = mode === 'RESALE' ? 'RESALE' : 'FOR RENT';
  const modeBadgeClass =
    mode === 'RESALE'
      ? 'bg-[#E85D3F] text-white'
      : 'bg-[#218C5A] text-white';

  // 0-Image Neutral Branded Placeholder
  if (totalPhotos === 0) {
    return (
      <div className="relative w-full h-[260px] sm:h-[360px] lg:h-[420px] rounded-2xl bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E3DDD0] border border-[#DFD8CA] overflow-hidden flex flex-col justify-between p-5 sm:p-7 text-[#111111]">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-2 z-10">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-display font-bold tracking-wider uppercase shadow-xs ${modeBadgeClass}`}
          >
            {modeBadgeLabel}
          </span>
          {isVerified && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-display font-semibold bg-[#1E8E5A] text-white shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Listing</span>
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-[11px] font-display font-semibold bg-white/90 text-[#111111] border border-[#DFD8CA] shadow-2xs">
            {listingPartyLabel}
          </span>
        </div>

        {/* Center Architectural Illustration */}
        <div className="my-auto flex flex-col items-center justify-center text-center space-y-2.5 py-6">
          <div className="w-14 h-14 rounded-2xl bg-white/90 border border-[#DFD8CA] shadow-2xs flex items-center justify-center text-[#E85D3F]">
            <Building2 className="w-7 h-7" />
          </div>
          <p className="text-base sm:text-lg font-serif font-bold text-[#111111] max-w-md">
            {title}
          </p>
          <p className="text-xs text-[#111111]/70 font-body flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-[#E85D3F]" />
            <span>Property photography available during assisted inspection</span>
          </p>
        </div>

        {/* Bottom Location Line */}
        <div className="flex items-center gap-1.5 text-xs text-[#111111]/75 font-body">
          <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
          <span>{projectName ? `${projectName} · ${locationDisplay}` : locationDisplay}</span>
        </div>
      </div>
    );
  }

  const currentPhoto = validMedia[safeActiveIndex];

  // For desktop right column thumbnails, show up to 3 thumbnails (either indices 1..3 when >3, or all remaining)
  const desktopSideThumbnails =
    totalPhotos > 1
      ? validMedia
          .map((item, idx) => ({ item, idx }))
          .filter(({ idx }) => idx !== safeActiveIndex)
          .slice(0, 3)
      : [];

  const remainingDesktopCount = Math.max(0, totalPhotos - 1 - desktopSideThumbnails.length);

  // For mobile horizontal strip below main image, show up to 4 thumbnails
  const mobileStripThumbnails = validMedia.slice(0, 4);
  const remainingMobileCount = Math.max(0, totalPhotos - 4);

  return (
    <>
      {/* DESKTOP GALLERY (md and up) */}
      <div className="hidden md:grid md:grid-cols-12 gap-3.5">
        {/* Main Hero Image */}
        <div
          className={`${
            totalPhotos === 1 ? 'md:col-span-12' : 'md:col-span-9'
          } relative h-[390px] lg:h-[430px] rounded-2xl overflow-hidden bg-[#EFECE6] border border-[#E6E2DC] group cursor-pointer`}
          onClick={() => openLightboxAt(safeActiveIndex)}
        >
          <img
            src={currentPhoto.url}
            alt={currentPhoto.altText || title}
            referrerPolicy="no-referrer"
            onError={() => handleImageError(currentPhoto.url)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />

          {/* Subtle top & bottom gradient for badge legibility */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 via-black/15 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none" />

          {/* Top-Left Overlay Badges */}
          <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 z-10">
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-display font-bold tracking-wider uppercase shadow-sm ${modeBadgeClass}`}
            >
              {modeBadgeLabel}
            </span>
            {isVerified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-display font-semibold bg-[#1E8E5A] text-white shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified Listing</span>
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-[11px] font-display font-semibold bg-[#111111]/80 backdrop-blur-md text-white border border-white/15 shadow-sm">
              {listingPartyLabel}
            </span>
          </div>

          {/* Left / Right Inline Prev / Next Controls */}
          {totalPhotos > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous property photo"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-[#111111] shadow-md flex items-center justify-center transition-transform hover:scale-105 cursor-pointer z-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next property photo"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-[#111111] shadow-md flex items-center justify-center transition-transform hover:scale-105 cursor-pointer z-10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Bottom-Left Photo Counter Pill */}
          <div className="absolute bottom-4 left-4 z-10">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#111111]/85 backdrop-blur-md text-white text-xs font-display font-semibold shadow-sm">
              <span>
                {safeActiveIndex + 1} / {totalPhotos}
              </span>
              <span>{totalPhotos === 1 ? 'Photo' : 'Photos'}</span>
            </span>
          </div>

          {/* Bottom-Right Fullscreen Expand Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              openLightboxAt(safeActiveIndex);
            }}
            aria-label="Open fullscreen gallery"
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-[#111111]/80 hover:bg-[#111111] backdrop-blur-md text-white flex items-center justify-center transition-colors shadow-sm cursor-pointer z-10"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right Thumbnail Column (when totalPhotos > 1) */}
        {totalPhotos > 1 && (
          <div className="md:col-span-3 flex flex-col gap-3.5 h-[390px] lg:h-[430px]">
            {desktopSideThumbnails.map(({ item, idx }, stackPos) => {
              const isLastSlot = stackPos === desktopSideThumbnails.length - 1;
              const showMoreOverlay = isLastSlot && remainingDesktopCount > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (showMoreOverlay) {
                      openLightboxAt(idx);
                    } else {
                      setActiveIndex(idx);
                    }
                  }}
                  aria-label={
                    showMoreOverlay
                      ? `View all ${totalPhotos} property photos`
                      : `Select property photo ${idx + 1}`
                  }
                  className="relative flex-1 w-full rounded-2xl overflow-hidden bg-[#EFECE6] border border-[#E6E2DC] group cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
                >
                  <img
                    src={item.url}
                    alt={item.altText || `${title} thumbnail ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    onError={() => handleImageError(item.url)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {showMoreOverlay ? (
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center transition-colors group-hover:bg-black/65">
                      <span className="text-xl lg:text-2xl font-display font-bold text-white tracking-tight">
                        +{remainingDesktopCount}
                      </span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MOBILE GALLERY (below md) */}
      <div className="md:hidden space-y-2.5">
        <div
          className="relative w-full aspect-[16/11] rounded-2xl overflow-hidden bg-[#EFECE6] border border-[#E6E2DC]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={() => openLightboxAt(safeActiveIndex)}
        >
          <img
            src={currentPhoto.url}
            alt={currentPhoto.altText || title}
            referrerPolicy="no-referrer"
            onError={() => handleImageError(currentPhoto.url)}
            className="w-full h-full object-cover"
          />

          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 via-black/20 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

          {/* Top-Left Badges */}
          <div className="absolute top-3 left-3 right-16 flex flex-wrap items-center gap-1.5 z-10">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-display font-bold tracking-wider uppercase shadow-xs ${modeBadgeClass}`}
            >
              {modeBadgeLabel}
            </span>
            {isVerified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-display font-semibold bg-[#1E8E5A] text-white shadow-xs">
                <CheckCircle2 className="w-3 h-3" />
                <span>Verified Listing</span>
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-display font-semibold bg-white/95 text-[#111111] shadow-xs">
              {listingPartyLabel}
            </span>
          </div>

          {/* Top-Right Counter Pill */}
          <div className="absolute top-3 right-3 z-10">
            <span className="px-2.5 py-1 rounded-full bg-[#111111]/80 backdrop-blur-md text-white text-[11px] font-display font-semibold">
              {safeActiveIndex + 1} / {totalPhotos}
            </span>
          </div>

          {/* Bottom-Left Project & Locality Caption Overlay */}
          <div className="absolute bottom-3 left-3 right-14 z-10 text-white">
            {projectName && (
              <div className="flex items-center gap-1 text-sm font-display font-bold leading-snug drop-shadow-xs">
                <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
                <span className="truncate">{projectName}</span>
              </div>
            )}
            <p className="text-[11px] text-white/85 font-body truncate pl-4">
              {locationDisplay}
            </p>
          </div>

          {/* Bottom-Right Fullscreen Trigger */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              openLightboxAt(safeActiveIndex);
            }}
            aria-label="Open fullscreen gallery"
            className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-[#111111]/80 backdrop-blur-md text-white flex items-center justify-center z-10"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile 4-Thumbnail Horizontal Strip */}
        {totalPhotos > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {mobileStripThumbnails.map((item, idx) => {
              const isSelected = idx === safeActiveIndex;
              const isFourthWithOverflow = idx === 3 && remainingMobileCount > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (isFourthWithOverflow) {
                      openLightboxAt(idx);
                    } else {
                      setActiveIndex(idx);
                    }
                  }}
                  aria-label={
                    isFourthWithOverflow
                      ? `View all ${totalPhotos} photos`
                      : `View photo ${idx + 1}`
                  }
                  className={`relative aspect-[16/11] rounded-xl overflow-hidden bg-[#EFECE6] transition-all ${
                    isSelected
                      ? 'ring-2 ring-[#E85D3F] ring-offset-1'
                      : 'opacity-85 hover:opacity-100 border border-[#E6E2DC]'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.altText || `${title} thumbnail ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    onError={() => handleImageError(item.url)}
                    className="w-full h-full object-cover"
                  />
                  {isFourthWithOverflow && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-xs font-display font-bold text-white">
                        +{remainingMobileCount}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photo gallery`}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-150"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Top Bar */}
          <div
            className="flex items-center justify-between text-white max-w-7xl w-full mx-auto z-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15 font-display text-xs font-semibold shrink-0">
                {safeActiveIndex + 1} / {totalPhotos}
              </span>
              <span className="text-sm font-body text-white/80 truncate hidden sm:inline">
                {currentPhoto.caption || currentPhoto.altText || title}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close fullscreen gallery"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Center Image Stage */}
          <div
            className="relative flex-1 flex items-center justify-center my-4 max-w-6xl w-full mx-auto overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {totalPhotos > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous photo"
                className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={currentPhoto.url}
              alt={currentPhoto.altText || title}
              onError={() => handleImageError(currentPhoto.url)}
              className="max-h-[72vh] max-w-full object-contain rounded-lg shadow-2xl"
            />

            {totalPhotos > 1 && (
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next photo"
                className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Bottom Thumbnail Strip */}
          {totalPhotos > 1 && (
            <div
              className="max-w-4xl w-full mx-auto overflow-x-auto py-2 flex items-center justify-start sm:justify-center gap-2"
              onClick={e => e.stopPropagation()}
            >
              {validMedia.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`relative w-16 h-12 sm:w-20 sm:h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    idx === safeActiveIndex
                      ? 'border-[#E85D3F] scale-105 opacity-100'
                      : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.altText || `Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
