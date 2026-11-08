'use client';

import React from 'react';
import { FolderOpen } from 'lucide-react';

interface AdminEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function AdminEmptyState({
  title = 'No entries found',
  description = 'There are no records matching your request or filter criteria.',
  icon = <FolderOpen className="h-8 w-8 text-neutral-400" />,
  actionLabel,
  onAction,
}: AdminEmptyStateProps) {
  return (
    <div className="bg-white border border-neutral-200/80 rounded-xl p-12 text-center max-w-xl mx-auto shadow-xs my-6">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-neutral-900 font-display">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500 font-body leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-6 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer min-h-[44px]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
