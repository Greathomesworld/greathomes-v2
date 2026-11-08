'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { AdminPageSkeleton } from './AdminPageSkeleton';

interface AdminLoadingStateProps {
  message?: string;
  skeletonType?: 'list' | 'detail';
}

export function AdminLoadingState({ message = 'Loading workspace data...', skeletonType }: AdminLoadingStateProps) {
  if (skeletonType) {
    return <AdminPageSkeleton type={skeletonType} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-neutral-200/80 rounded-xl shadow-xs my-4">
      <Loader2 className="h-8 w-8 text-neutral-800 animate-spin mb-3" />
      <p className="text-sm font-medium text-neutral-600 font-display">{message}</p>
    </div>
  );
}
