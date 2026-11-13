'use client';

import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface PropertyDetailShareButtonProps {
  title: string;
  canonicalPath: string;
  className?: string;
  showLabel?: boolean;
}

export function PropertyDetailShareButton({
  title,
  canonicalPath,
  className = '',
  showLabel = true,
}: PropertyDetailShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${canonicalPath}`
        : `https://www.greathomes.co.in${canonicalPath}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${title} | Great Homes`,
          text: `Explore ${title} on Great Homes`,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        // Fallback ignore
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? 'Property link copied' : 'Share property'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all cursor-pointer border ${
        copied
          ? 'bg-[#218C5A]/10 text-[#218C5A] border-[#218C5A]/30'
          : 'bg-white hover:bg-[#FAFAF8] text-[#111111] border-[#E5E2DC] hover:border-[#111111]/30 shadow-2xs'
      } ${className}`}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[#218C5A]" />
      ) : (
        <Share2 className="w-3.5 h-3.5 text-[#111111]/75" />
      )}
      {showLabel && <span>{copied ? 'Copied' : 'Share'}</span>}
    </button>
  );
}
