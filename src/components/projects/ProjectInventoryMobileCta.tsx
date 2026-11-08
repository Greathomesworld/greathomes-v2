'use client';

import React from 'react';
import Link from 'next/link';
import { SlidersHorizontal, Sparkles, BellRing, ArrowLeft } from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

interface ProjectInventoryMobileCtaProps {
  project: PublicProjectDto;
  mode: 'RESALE' | 'RENTAL';
  totalEligibleCount: number;
  activeFilterCount?: number;
}

export function ProjectInventoryMobileCta({
  project,
  mode,
  totalEligibleCount,
  activeFilterCount = 0,
}: ProjectInventoryMobileCtaProps) {
  const { openEnquiry } = useEnquiry();
  const isResale = mode === 'RESALE';

  const handleOpenEnquiry = () => {
    openEnquiry({
      contextType: mode,
      projectSlug: project.slug,
      projectName: project.name,
      locationName: project.location?.name,
      title: `${project.name} — ${isResale ? 'Resale Requirement' : 'Rental Concierge'}`,
      subtitle: `${isResale ? 'Resale availability & advisory' : 'Rental availability & viewing'} in ${project.name}`,
    });
  };

  const handleScrollToFilters = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gh:open-inventory-filters'));
    }
    const el = document.getElementById('inventory-filters');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleZeroInventoryAlert = () => {
    const alertEl = document.getElementById('priority-availability-alert');
    if (alertEl) {
      alertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const nameInput = alertEl.querySelector('input') as HTMLInputElement | null;
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 350);
      }
      return;
    }
    handleOpenEnquiry();
  };

  return (
    <div
      aria-label="Mobile sticky actions"
      className="lg:hidden fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-[var(--color-background)]/95 backdrop-blur-md border-t border-[var(--color-border)] py-2.5 px-4 shadow-lg"
    >
      <div className="max-w-md mx-auto flex items-center gap-2.5">
        {totalEligibleCount > 0 ? (
          <>
            <button
              type="button"
              onClick={handleScrollToFilters}
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.03] text-xs font-display font-semibold text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#E85D3F] text-white text-[10px] font-display font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenEnquiry}
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] text-xs font-display font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>{isResale ? 'Resale Advisory' : 'Rental Concierge'}</span>
            </button>
          </>
        ) : (
          <>
            <Link
              href={`/projects/${project.slug}`}
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-[var(--color-border)] text-xs font-display font-semibold text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Overview</span>
            </Link>

            <button
              type="button"
              onClick={handleZeroInventoryAlert}
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] text-xs font-display font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <BellRing className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>Register Alert</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
