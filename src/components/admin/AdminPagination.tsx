'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = totalItems ? Math.min(currentPage * pageSize, totalItems) : currentPage * pageSize;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 text-xs text-neutral-600 font-body">
      <div>
        {totalItems !== undefined ? (
          <span>
            Showing <strong className="text-neutral-900 font-semibold">{start}</strong> to{' '}
            <strong className="text-neutral-900 font-semibold">{end}</strong> of{' '}
            <strong className="text-neutral-900 font-semibold">{totalItems}</strong> entries
          </span>
        ) : (
          <span>
            Page <strong className="text-neutral-900 font-semibold">{currentPage}</strong> of{' '}
            <strong className="text-neutral-900 font-semibold">{totalPages}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 border border-neutral-300 bg-white text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[38px] font-medium"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Previous</span>
        </button>
        <span className="px-3 text-xs font-semibold text-neutral-800">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 border border-neutral-300 bg-white text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[38px] font-medium"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
