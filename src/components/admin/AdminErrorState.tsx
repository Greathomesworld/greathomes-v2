'use client';

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface AdminErrorStateProps {
  title?: string;
  error?: string;
  onRetry?: () => void;
}

export function AdminErrorState({
  title = 'Failed to load administrative data',
  error = 'An unexpected server error occurred while retrieving operational data.',
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-6 my-4 text-rose-900 shadow-xs">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-bold font-display">{title}</h4>
          <p className="mt-1 text-xs text-rose-700 font-body">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-white border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer min-h-[38px]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Request</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
