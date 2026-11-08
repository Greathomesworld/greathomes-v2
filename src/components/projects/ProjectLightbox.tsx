'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';

interface ProjectLightboxProps {
  mediaList: PublicProjectMediaDto[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectLightbox({
  mediaList,
  initialIndex = 0,
  isOpen,
  onClose,
}: ProjectLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? mediaList.length - 1 : prev - 1));
  }, [mediaList.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === mediaList.length - 1 ? 0 : prev + 1));
  }, [mediaList.length]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || mediaList.length === 0) return null;

  const currentMedia = mediaList[currentIndex] || mediaList[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image Lightbox Viewer"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 md:p-8"
    >
      {/* Top Bar */}
      <div className="w-full max-w-7xl flex items-center justify-between text-white/80 text-sm">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded bg-white/10 text-white">
            {currentMedia.category.replace(/_/g, ' ')}
          </span>
          <span className="font-mono text-xs text-white/60">
            {currentIndex + 1} of {mediaList.length}
          </span>
        </div>

        <button
          onClick={onClose}
          aria-label="Close lightbox"
          className="p-2 rounded-full hover:bg-white/10 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Center Image & Nav */}
      <div className="relative flex-1 w-full max-w-6xl flex items-center justify-center my-4">
        {mediaList.length > 1 && (
          <button
            onClick={handlePrev}
            aria-label="Previous image"
            className="absolute left-2 md:left-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div className="relative max-h-[75vh] max-w-full flex flex-col items-center justify-center">
          <img
            src={currentMedia.url}
            alt={currentMedia.altText || 'Project media'}
            className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl"
          />
          {currentMedia.caption && (
            <p className="text-xs md:text-sm text-white/80 mt-3 text-center max-w-xl italic">
              {currentMedia.caption}
            </p>
          )}
        </div>

        {mediaList.length > 1 && (
          <button
            onClick={handleNext}
            aria-label="Next image"
            className="absolute right-2 md:right-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnail Strip */}
      {mediaList.length > 1 && (
        <div className="w-full max-w-4xl overflow-x-auto py-2 flex items-center justify-center gap-2">
          {mediaList.map((m, idx) => (
            <button
              key={m.id || idx}
              onClick={() => setCurrentIndex(idx)}
              className={`relative w-14 h-10 rounded overflow-hidden shrink-0 transition-all focus:outline-none ${
                idx === currentIndex ? 'ring-2 ring-[var(--color-accent)] opacity-100 scale-105' : 'opacity-50 hover:opacity-80'
              }`}
            >
              <img src={m.url} alt={m.altText || 'Thumbnail'} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
