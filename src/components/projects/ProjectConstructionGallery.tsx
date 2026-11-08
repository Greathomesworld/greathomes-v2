'use client';

import { useState } from 'react';
import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';
import { Layers, Maximize2 } from 'lucide-react';
import { ProjectLightbox } from './ProjectLightbox';

interface ProjectConstructionGalleryProps {
  mediaList: PublicProjectMediaDto[];
  projectName: string;
}

export function ProjectConstructionGallery({ mediaList, projectName }: ProjectConstructionGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const constructionMedia = (mediaList || []).filter(m => m.category === 'CONSTRUCTION');

  if (constructionMedia.length === 0) return null;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <section aria-labelledby="construction-heading" className="space-y-6 pt-6 border-t border-[var(--color-border)]">
      <div>
        <h2 id="construction-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
          Construction Progress
        </h2>
        <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
          Verified on-site progress updates and milestone imagery.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {constructionMedia.map((media, idx) => (
          <div
            key={media.id || idx}
            onClick={() => openLightbox(idx)}
            className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-foreground)]/5 aspect-[4/3] cursor-pointer transition-transform hover:shadow-lg"
          >
            <img
              src={media.url}
              alt={media.altText || `${projectName} construction progress`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 text-white">
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Construction Milestone
              </span>
              {media.caption && (
                <p className="text-xs text-white/90 mt-1 line-clamp-1 italic">
                  {media.caption}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <ProjectLightbox
        mediaList={constructionMedia}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </section>
  );
}
