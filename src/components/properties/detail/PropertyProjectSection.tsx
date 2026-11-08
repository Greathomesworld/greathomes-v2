'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, ArrowRight, MapPin } from 'lucide-react';
import { PropertyDetailProjectViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyProjectSectionProps {
  project: PropertyDetailProjectViewModel;
}

export function PropertyProjectSection({ project }: PropertyProjectSectionProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(project.featuredImageUrl && !imgError);

  return (
    <section id="project" className="scroll-mt-32">
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-display uppercase tracking-wider text-[#E85D3F] font-semibold block">
              Parent Residential Enclave
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
              {`Explore ${project.name}`}
            </h2>
          </div>

          {project.reraVerified && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#218C5A]/10 text-[#218C5A] text-xs font-display font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>RERA Verified</span>
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch sm:items-center bg-[#FAFAF8] rounded-xl border border-[#E6E2DC] p-4">
          {/* Project Thumbnail */}
          <div className="w-full sm:w-44 h-36 sm:h-32 rounded-xl overflow-hidden bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E4DEC9] border border-[#DFD8CA] shrink-0 flex items-center justify-center">
            {showImage ? (
              <img
                src={project.featuredImageUrl!}
                alt={project.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-3 py-2 space-y-1">
                <div className="w-9 h-9 rounded-lg bg-white/80 border border-[#DFD8CA] flex items-center justify-center text-[#E85D3F]">
                  <Building2 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-[#111111]/65">
                  Project Enclave
                </span>
              </div>
            )}
          </div>

          {/* Project Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <h3 className="text-base font-display font-bold text-[#111111] truncate">
                {project.name}
              </h3>
              {project.developerName && (
                <p className="text-xs font-body text-[#111111]/65">
                  By {project.developerName}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-display font-semibold text-[#111111]/85">
              {project.bhkSummary && (
                <span className="px-2 py-0.5 rounded bg-white border border-[#E6E2DC]">
                  {project.bhkSummary}
                </span>
              )}
              {project.statusDisplay && (
                <span className="px-2 py-0.5 rounded bg-white border border-[#E6E2DC]">
                  {project.statusDisplay}
                </span>
              )}
              {project.locationName && (
                <span className="inline-flex items-center gap-1 text-[#111111]/65 font-body">
                  <MapPin className="w-3 h-3 text-[#E85D3F]" />
                  <span>{project.locationName}</span>
                </span>
              )}
            </div>

            {project.shortDescription && (
              <p className="text-xs text-[#111111]/70 font-body line-clamp-2 leading-relaxed">
                {project.shortDescription}
              </p>
            )}
          </div>

          {/* CTA Button */}
          <div className="shrink-0">
            <Link
              href={project.url}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white hover:bg-[#FFF5F0] text-[#E85D3F] border border-[#E85D3F]/50 text-xs font-display font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>Explore Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
