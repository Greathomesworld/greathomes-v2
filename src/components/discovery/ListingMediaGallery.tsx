'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Eye, ImageIcon } from 'lucide-react';

export interface ListingGalleryMediaItem {
  id: string;
  url: string;
  altText: string;
  caption: string | null;
  isFeatured: boolean;
}

export interface ListingMediaGalleryProps {
  media: ListingGalleryMediaItem[];
  title: string;
  category?: 'resale' | 'rental';
}

export function ListingMediaGallery({ media, title, category = 'rental' }: ListingMediaGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const primaryImage = media.find(m => m.isFeatured) || media[0];
  const secondaryImages = media.filter(m => m.id !== primaryImage?.id);
  const totalCount = media.length;

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
  };

  const closeLightbox = () => {
    setIsOpen(false);
  };

  const nextImage = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % media.length);
  }, [media.length]);

  const prevImage = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + media.length) % media.length);
  }, [media.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, nextImage, prevImage]);

  if (!media || media.length === 0) {
    return (
      <div className="relative aspect-[16/9] md:aspect-[21/9] w-full rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 flex flex-col items-center justify-center text-white/50 space-y-2">
        <ImageIcon className="w-10 h-10 stroke-[1.5] text-white/30" />
        <span className="text-sm font-display">Verified property photographs coming soon</span>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Main Hero Photo */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`View photo 1: ${primaryImage.altText}`}
          onClick={() => openLightbox(0)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openLightbox(0); }}
          className="md:col-span-2 relative aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
        >
          <Image
            src={primaryImage.url}
            alt={primaryImage.altText || `${title} property photo`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 66vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 opacity-70 group-hover:opacity-90 transition-opacity" />

          {/* Overlay Tag */}
          <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-display font-medium border border-white/15">
              <Eye className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>Click to expand ({totalCount} {totalCount === 1 ? 'photo' : 'photos'})</span>
            </span>
          </div>
        </div>

        {/* Secondary Side Photos */}
        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 sm:gap-4">
          {secondaryImages.slice(0, 2).map((item, idx) => {
            const actualIndex = idx + 1;
            const isLastSlot = idx === 1;
            const remainingCount = totalCount - 3;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`View photo ${actualIndex + 1}: ${item.altText}`}
                onClick={() => openLightbox(actualIndex)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openLightbox(actualIndex); }}
                className="relative aspect-[16/10] rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
              >
                <Image
                  src={item.url}
                  alt={item.altText || `${title} photo ${actualIndex + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />

                {isLastSlot && remainingCount > 0 && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                    <span className="text-sm sm:text-base font-display font-semibold tracking-wider">
                      +{remainingCount} More Photos
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Graceful filler if only 1 secondary photo exists */}
          {secondaryImages.length === 1 && (
            <div className="relative aspect-[16/10] rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center p-4 text-center">
              <span className="text-xs font-display text-white/70">Verified Property Gallery</span>
              <span className="text-[11px] text-white/40 font-body mt-1">
                Authentic, untouched photos taken during property verification.
              </span>
            </div>
          )}

          {/* Graceful filler if 0 secondary photos exist */}
          {secondaryImages.length === 0 && (
            <>
              <div className="relative aspect-[16/10] rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs font-display text-white/70">Verified Interior Views</span>
                <span className="text-[11px] text-white/40 font-body mt-1">
                  Schedule an in-person site visit to inspect room dimensions and finishes.
                </span>
              </div>
              <div className="relative aspect-[16/10] rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs font-display text-white/70">Lease Terms Ready</span>
                <span className="text-[11px] text-white/40 font-body mt-1">
                  Verified owner credentials and lease documentation.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Accessible Fullscreen Lightbox Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Property photo lightbox"
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 text-white">
            <div className="flex items-center gap-3">
              <span className="text-sm font-display font-medium text-white/80">
                Photo {currentIndex + 1} of {totalCount}
              </span>
              <span className="text-white/20">|</span>
              <span className="text-xs sm:text-sm font-serif text-white/90 truncate max-w-[200px] sm:max-w-md">
                {title}
              </span>
            </div>

            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close photo viewer"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Photo Viewport */}
          <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 select-none">
            {totalCount > 1 && (
              <button
                type="button"
                onClick={prevImage}
                aria-label="Previous photo"
                className="absolute left-4 sm:left-6 z-10 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="relative w-full h-full max-w-5xl max-h-[80vh] flex items-center justify-center">
              <Image
                src={media[currentIndex].url}
                alt={media[currentIndex].altText || `${title} photo ${currentIndex + 1}`}
                fill
                className="object-contain"
                priority
                referrerPolicy="no-referrer"
              />
            </div>

            {totalCount > 1 && (
              <button
                type="button"
                onClick={nextImage}
                aria-label="Next photo"
                className="absolute right-4 sm:right-6 z-10 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Caption Footer */}
          {media[currentIndex].caption && (
            <div className="px-4 py-3 bg-black/70 border-t border-white/10 text-center">
              <p className="text-xs sm:text-sm text-white/80 font-body">
                {media[currentIndex].caption}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
