'use client';

import React, { useState } from 'react';
import Image from 'next/image';

export function getDeveloperInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'GH';
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'GH';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

interface DeveloperLogoBadgeProps {
  name: string;
  logoUrl?: string | null;
  variant?: 'hero' | 'compact';
  priority?: boolean;
}

export function DeveloperLogoBadge({
  name,
  logoUrl,
  variant = 'hero',
  priority = false,
}: DeveloperLogoBadgeProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const trimmedUrl = logoUrl && typeof logoUrl === 'string' ? logoUrl.trim() : '';
  const showImage = Boolean(trimmedUrl) && !imageFailed;
  const initials = getDeveloperInitials(name);

  if (variant === 'compact') {
    return (
      <div
        data-developer-logo-badge="compact"
        className="relative w-20 h-12 bg-neutral-50 rounded-lg border border-neutral-200/70 p-1 flex items-center justify-center shrink-0 overflow-hidden"
      >
        {showImage ? (
          <Image
            src={trimmedUrl}
            alt={`${name} logo`}
            fill
            className="object-contain p-1"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            aria-label={`${name} initials`}
            className="w-full h-full rounded-md bg-gradient-to-br from-orange-50 to-amber-50/70 border border-orange-200/60 flex items-center justify-center select-none"
          >
            <span className="text-xs font-display font-bold tracking-wider uppercase text-orange-800">
              {initials}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-developer-logo-badge="hero"
      className="relative w-40 sm:w-48 h-20 sm:h-24 bg-white rounded-2xl border border-neutral-200/80 p-3 shadow-xs flex items-center justify-center overflow-hidden"
    >
      {showImage ? (
        <Image
          src={trimmedUrl}
          alt={`${name} logo`}
          fill
          className="object-contain p-2"
          referrerPolicy="no-referrer"
          priority={priority}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          aria-label={`${name} initials`}
          className="w-full h-full rounded-xl bg-gradient-to-br from-orange-50/90 via-amber-50/50 to-neutral-50 border border-orange-200/70 flex items-center justify-center gap-3 px-4 select-none"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-600/10 border border-orange-500/20 flex items-center justify-center shrink-0">
            <span className="text-base sm:text-lg font-display font-bold tracking-wider uppercase text-orange-700">
              {initials}
            </span>
          </div>
          <div className="flex flex-col text-left min-w-0">
            <span className="text-xs font-display font-bold text-neutral-900 truncate">
              {name}
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-neutral-500">
              Verified Builder
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
