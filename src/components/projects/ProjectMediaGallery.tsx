'use client';

import { useState } from 'react';
import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';
import { ProjectLightbox } from './ProjectLightbox';
import { Maximize2 } from 'lucide-react';
import { parseVideoUrl } from '@/src/lib/videoUtils';

interface ProjectMediaGalleryProps {
  mediaList: PublicProjectMediaDto[];
  projectName: string;
}

import { getEligibleGalleryMedia } from '@/src/domain/projects/viewModels/projectSectionEligibility';
export { getEligibleGalleryMedia };

export function ProjectMediaGallery({ mediaList, projectName }: ProjectMediaGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const eligibleMedia = getEligibleGalleryMedia(mediaList);
  if (eligibleMedia.length === 0) return null;

  // Extract unique categories present in the eligible media list
  const availableCategories = Array.from(new Set(eligibleMedia.map(m => m.category)));
  const activeCategory =
    selectedCategory === 'ALL' || availableCategories.includes(selectedCategory)
      ? selectedCategory
      : 'ALL';

  const filteredMedia = activeCategory === 'ALL'
    ? eligibleMedia
    : eligibleMedia.filter(m => m.category === activeCategory);

  const openLightboxForIndex = (mediaId: string) => {
    const globalIdx = eligibleMedia.findIndex(m => m.id === mediaId);
    if (globalIdx !== -1) {
      setLightboxIndex(globalIdx);
      setLightboxOpen(true);
    }
  };

  return (
    <section id="gallery" aria-labelledby="media-gallery-heading" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div>
          <h2 id="media-gallery-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
            Project Media & Gallery
          </h2>
          <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
            Curated visual presentation categorized by architectural spaces and progress.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Media Categories">
          <button
            role="tab"
            aria-selected={activeCategory === 'ALL'}
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeCategory === 'ALL'
                ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                : 'bg-[var(--color-foreground)]/5 text-[var(--color-foreground)]/75 hover:bg-[var(--color-foreground)]/10'
            }`}
          >
            All ({eligibleMedia.length})
          </button>
          {availableCategories.map(cat => {
            const count = eligibleMedia.filter(m => m.category === cat).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeCategory === cat
                    ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                    : 'bg-[var(--color-foreground)]/5 text-[var(--color-foreground)]/75 hover:bg-[var(--color-foreground)]/10'
                }`}
              >
                {cat.replace(/_/g, ' ')} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Editorial Grid Composition */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMedia.map((media, index) => (
          <div
            key={media.id || index}
            onClick={() => openLightboxForIndex(media.id)}
            className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-foreground)]/5 aspect-[4/3] cursor-pointer transition-transform duration-300 hover:shadow-lg"
          >
            <img
              src={media.url}
              alt={media.altText || `${projectName} - ${media.category}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 text-white">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 backdrop-blur-sm">
                  {media.category.replace(/_/g, ' ')}
                </span>
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
              {media.caption && (
                <p className="text-xs text-white/90 mt-1 line-clamp-1 italic">
                  {media.caption}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      <ProjectLightbox
        mediaList={eligibleMedia}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </section>
  );
}
