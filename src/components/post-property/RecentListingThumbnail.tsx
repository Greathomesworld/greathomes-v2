'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Building2 } from 'lucide-react';

interface RecentListingThumbnailProps {
  imageUrl: string | null;
  title: string;
}

export function RecentListingThumbnail({ imageUrl, title }: RecentListingThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#8D8881]">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={title}
      fill
      sizes="96px"
      className="object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
