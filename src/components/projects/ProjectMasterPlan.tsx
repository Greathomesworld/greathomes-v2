'use client';

import { useState } from 'react';
import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';
import { Layers, Maximize2 } from 'lucide-react';
import { ProjectLightbox } from './ProjectLightbox';

interface ProjectMasterPlanProps {
  mediaList: PublicProjectMediaDto[];
  projectName: string;
}

export function ProjectMasterPlan({ mediaList, projectName }: ProjectMasterPlanProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const masterPlanMedia = (mediaList || []).filter(m => m.category === 'MASTER_PLAN');

  if (masterPlanMedia.length === 0) return null;

  const primaryMasterPlan = masterPlanMedia[0];

  return (
    <section aria-labelledby="master-plan-heading" className="space-y-4 pt-6 border-t border-[var(--color-border)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="master-plan-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
            Master Plan
          </h2>
          <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
            Overall site layout, zoning, and architectural master plan architecture.
          </p>
        </div>
        <button
          onClick={() => setLightboxOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[var(--color-foreground)]/10 hover:bg-[var(--color-foreground)]/20 text-[var(--color-foreground)] transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Expand View</span>
        </button>
      </div>

      <div
        onClick={() => setLightboxOpen(true)}
        className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white aspect-[16/9] md:aspect-[21/10] relative cursor-pointer group flex items-center justify-center p-4 shadow-sm"
      >
        <img
          src={primaryMasterPlan.url}
          alt={primaryMasterPlan.altText || `Master Plan for ${projectName}`}
          className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {primaryMasterPlan.caption && (
        <p className="text-xs text-[var(--color-foreground)]/65 italic text-center">
          {primaryMasterPlan.caption}
        </p>
      )}

      <ProjectLightbox
        mediaList={masterPlanMedia}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </section>
  );
}
