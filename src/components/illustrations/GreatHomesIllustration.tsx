'use client';

import React, { useId } from 'react';
import { GreatHomesIllustrationProps, IllustrationId, IllustrationSizeTier } from './illustrationTypes';
import { ILLUSTRATION_REGISTRY } from './illustrationRegistry';
import {
  SvgNewLaunch,
  SvgBuyResale,
  SvgRent,
  SvgLocationDiscovery,
  SvgReraVerified,
  SvgAdvisor,
  SvgSavedHome,
  SvgEmptySaved,
  SvgEmptySearch,
  SvgEmptyRecent,
  SvgSiteVisit,
  SvgDeveloperAssistance,
  SvgPropertyIntelligence,
  SvgAccount,
} from './illustrationComponents';

export const SVG_RENDER_MAP: Partial<Record<IllustrationId, React.ComponentType<any>>> = {
  NEW_LAUNCH: SvgNewLaunch,
  BUY_RESALE: SvgBuyResale,
  RENT: SvgRent,
  LOCATION_DISCOVERY: SvgLocationDiscovery,
  RERA_VERIFIED: SvgReraVerified,
  GREAT_HOMES_ADVISOR: SvgAdvisor,
  SAVED_HOME: SvgSavedHome,
  EMPTY_SAVED: SvgEmptySaved,
  EMPTY_SEARCH: SvgEmptySearch,
  EMPTY_RECENT: SvgEmptyRecent,
  SITE_VISIT: SvgSiteVisit,
  DEVELOPER_ASSISTANCE: SvgDeveloperAssistance,
  PROPERTY_INTELLIGENCE: SvgPropertyIntelligence,
  ACCOUNT: SvgAccount,
};

const SIZE_TIER_CLASSES: Record<IllustrationSizeTier, string> = {
  ICON: 'w-7 h-7 sm:w-8 sm:h-8 max-w-full',
  SMALL: 'w-14 h-14 sm:w-18 sm:h-18 max-w-full',
  CARD: 'w-24 h-24 sm:w-32 sm:h-28 max-w-full',
  EMPTY: 'w-40 h-32 sm:w-56 sm:h-42 max-w-full',
  FEATURE: 'w-64 h-48 sm:w-80 sm:h-60 max-w-full',
  RESPONSIVE: 'w-full h-auto aspect-4/3',
};

export function GreatHomesIllustration({
  id,
  size = 'CARD',
  className = '',
  alt,
  decorative = true,
  priority = false,
  onClick,
}: GreatHomesIllustrationProps) {
  const titleId = useId();
  const descId = useId();

  const def = ILLUSTRATION_REGISTRY[id];
  if (!def) {
    console.warn(`GreatHomesIllustration: Unknown illustration ID '${id}'`);
    return null;
  }

  const effectiveAlt = alt || def.defaultAlt;
  const sizeClasses = typeof size === 'string' ? SIZE_TIER_CLASSES[size] : '';
  const inlineSizeStyle =
    typeof size === 'number'
      ? { width: `${size}px`, height: 'auto', aspectRatio: '4/3' }
      : undefined;

  const SvgComponent = SVG_RENDER_MAP[id];

  if (SvgComponent) {
    return (
      <div
        data-illustration-id={id}
        className={`inline-flex items-center justify-center shrink-0 select-none gh-illustration-${id.toLowerCase().replace(/_/g, '-')} ${sizeClasses} ${className}`}
        style={inlineSizeStyle}
        onClick={onClick}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative ? 'true' : undefined}
      >
        <SvgComponent
          className="w-full h-full object-contain"
          titleId={decorative ? undefined : titleId}
          descId={decorative ? undefined : descId}
          title={decorative ? undefined : effectiveAlt}
          desc={decorative ? undefined : def.description}
        />
      </div>
    );
  }

  // Fallback to optimized SVG asset from public folder
  return (
    <div
      data-illustration-id={id}
      className={`relative inline-flex items-center justify-center shrink-0 select-none gh-illustration-${id.toLowerCase().replace(/_/g, '-')} ${sizeClasses} ${className}`}
      style={inlineSizeStyle}
      onClick={onClick}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
    >
      <img
        src={def.svgPath}
        alt={decorative ? '' : effectiveAlt}
        aria-hidden={decorative ? 'true' : undefined}
        className="w-full h-full object-contain pointer-events-none"
        loading={priority ? 'eager' : 'lazy'}
      />
    </div>
  );
}
