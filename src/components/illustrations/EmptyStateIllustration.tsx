'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GreatHomesIllustration } from './GreatHomesIllustration';
import { IllustrationId } from './illustrationTypes';

export interface EmptyStateProps {
  type?: 'SAVED' | 'RECENT' | 'SEARCH' | 'UNAVAILABLE' | 'CUSTOM';
  illustrationId?: IllustrationId;
  headline?: string;
  supporting?: string;
  ctaText?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
  size?: 'SMALL' | 'CARD' | 'EMPTY' | 'FEATURE';
}

const PRESET_CONFIGS = {
  SAVED: {
    illustrationId: 'EMPTY_SAVED' as IllustrationId,
    headline: 'Nothing saved yet',
    supporting: 'Save homes and projects to find them here later.',
    ctaText: 'Explore Homes',
    ctaHref: '/projects',
  },
  RECENT: {
    illustrationId: 'EMPTY_RECENT' as IllustrationId,
    headline: 'Start exploring',
    supporting: 'Projects and homes you view will appear here.',
    ctaText: 'Explore Projects',
    ctaHref: '/projects',
  },
  SEARCH: {
    illustrationId: 'EMPTY_SEARCH' as IllustrationId,
    headline: "We couldn't find a match",
    supporting: 'Try another location, project or configuration.',
    ctaText: 'Explore Projects',
    ctaHref: '/projects',
  },
  UNAVAILABLE: {
    illustrationId: 'EMPTY_UNAVAILABLE' as IllustrationId,
    headline: 'This property is currently unavailable',
    supporting: 'This property is no longer active on the platform.',
    ctaText: 'Explore Available Homes',
    ctaHref: '/projects',
  },
};

export function EmptyStateIllustration({
  type = 'CUSTOM',
  illustrationId,
  headline,
  supporting,
  ctaText,
  ctaHref,
  onCtaClick,
  className = '',
  size = 'EMPTY',
}: EmptyStateProps) {
  const preset = type !== 'CUSTOM' ? PRESET_CONFIGS[type] : null;

  const finalIllustrationId = illustrationId || preset?.illustrationId || 'EMPTY_SAVED';
  const finalHeadline = headline || preset?.headline || 'Nothing here yet';
  const finalSupporting = supporting || preset?.supporting || '';
  const finalCtaText = ctaText || preset?.ctaText;
  const finalCtaHref = ctaHref || preset?.ctaHref;

  return (
    <div
      className={`p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto ${className}`}
    >
      <GreatHomesIllustration
        id={finalIllustrationId}
        size={size}
        className="mb-6 drop-shadow-xs"
        decorative={true}
      />

      <h3 className="text-xl sm:text-2xl font-serif text-[#111111] dark:text-white mb-2">
        {finalHeadline}
      </h3>

      {finalSupporting && (
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-body max-w-sm mb-6 leading-relaxed">
          {finalSupporting}
        </p>
      )}

      {finalCtaText && finalCtaHref && (
        <Link
          href={finalCtaHref}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#111111] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-md font-display transition-colors shadow-xs"
        >
          <span>{finalCtaText}</span>
          <ArrowRight className="w-4 h-4 text-[#E85D3F]" />
        </Link>
      )}

      {finalCtaText && !finalCtaHref && onCtaClick && (
        <button
          type="button"
          onClick={onCtaClick}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#111111] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-md font-display transition-colors shadow-xs cursor-pointer"
        >
          <span>{finalCtaText}</span>
          <ArrowRight className="w-4 h-4 text-[#E85D3F]" />
        </button>
      )}
    </div>
  );
}
