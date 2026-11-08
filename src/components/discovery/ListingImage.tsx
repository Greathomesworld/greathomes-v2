'use client';

import { useState } from 'react';
import { Home, Building2, Camera } from 'lucide-react';

interface ListingImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  aspectRatio?: string;
  fallbackType?: 'resale' | 'rent' | 'project' | 'general';
  isVerified?: boolean;
  priority?: boolean;
}

export function ListingImage({
  src,
  alt,
  className = '',
  aspectRatio = 'aspect-[16/10]',
  fallbackType = 'general',
  isVerified = false,
  priority = false,
}: ListingImageProps) {
  const [hasError, setHasError] = useState(false);

  const showFallback = !src || hasError;

  if (showFallback) {
    const Icon = fallbackType === 'project' ? Building2 : Home;
    const label =
      fallbackType === 'resale'
        ? isVerified
          ? 'Verified Resale Residence'
          : 'Resale Residence'
        : fallbackType === 'rent'
        ? isVerified
          ? 'Verified Rental Residence'
          : 'Rental Residence'
        : fallbackType === 'project'
        ? 'Landmark Development'
        : 'Residential Property';

    const sublabel =
      fallbackType === 'project'
        ? 'Architectural Preview'
        : isVerified
        ? 'Great Homes Verified · Photo Pending'
        : 'Photography Pending Inspection';

    return (
      <div
        className={`relative w-full ${aspectRatio} bg-gradient-to-br from-[#F7F6F2] via-[#EFECE6] to-[#E5E0D5] flex flex-col items-center justify-center text-center p-4 overflow-hidden border-b border-[rgba(17,17,17,0.06)] select-none ${className}`}
        role="img"
        aria-label={alt || label}
      >
        {/* Subtle architectural blueprint grid & radial texture */}
        <div className="absolute inset-0 opacity-[0.035] bg-[linear-gradient(to_right,#111111_1px,transparent_1px),linear-gradient(to_bottom,#111111_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,rgba(239,236,230,0.6)_100%)] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-11 h-11 rounded-2xl bg-white/90 border border-[rgba(17,17,17,0.08)] flex items-center justify-center text-[#111111]/60 mb-2.5 shadow-2xs">
            <Icon className="w-5 h-5 text-[#111111]/65" />
          </div>
          <span className="text-[11px] font-display font-semibold tracking-wider uppercase text-[#111111]/75">
            {label}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-body text-[#111111]/50 mt-0.5">
            <Camera className="w-3 h-3 opacity-60" />
            <span>{sublabel}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${aspectRatio} bg-[#F2F0EC] overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        width={640}
        height={400}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

