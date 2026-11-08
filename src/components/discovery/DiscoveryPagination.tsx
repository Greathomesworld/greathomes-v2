'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DiscoveryPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export function DiscoveryPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
}: DiscoveryPaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (pageNumber <= 1) {
      params.delete('page');
    } else {
      params.set('page', pageNumber.toString());
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers array
  const pages: number[] = [];
  const maxDisplayedPages = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxDisplayedPages - 1);
  if (endPage - startPage < maxDisplayedPages - 1) {
    startPage = Math.max(1, endPage - maxDisplayedPages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="mt-10 pt-6 border-t border-[rgba(17,17,17,0.08)] flex flex-col sm:flex-row items-center justify-between gap-4">
      {/* Page Info */}
      <span className="text-xs font-body text-neutral-500">
        Showing <strong className="font-display font-semibold text-neutral-800">{startItem}</strong> to{' '}
        <strong className="font-display font-semibold text-neutral-800">{endItem}</strong> of{' '}
        <strong className="font-display font-semibold text-neutral-800">{totalCount}</strong> results
      </span>

      {/* Navigation Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
        {/* Previous */}
        {currentPage > 1 ? (
          <Link
            href={createPageUrl(currentPage - 1)}
            className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl border border-[rgba(17,17,17,0.12)] bg-white text-neutral-700 font-display text-xs font-semibold hover:bg-neutral-50 hover:text-[#111111] transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : (
          <span
            className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl border border-[rgba(17,17,17,0.06)] bg-neutral-50 text-neutral-300 font-display text-xs cursor-not-allowed"
            aria-disabled="true"
          >
            <ChevronLeft className="w-4 h-4" />
          </span>
        )}

        {/* Numeric Pages */}
        {pages.map(p => {
          const isCurrent = p === currentPage;
          return isCurrent ? (
            <span
              key={p}
              aria-current="page"
              className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl bg-[#111111] text-white font-display text-xs font-semibold shadow-2xs"
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={createPageUrl(p)}
              className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl border border-[rgba(17,17,17,0.12)] bg-white text-neutral-700 font-display text-xs font-medium hover:bg-neutral-50 hover:text-[#111111] transition-colors"
            >
              {p}
            </Link>
          );
        })}

        {/* Next */}
        {currentPage < totalPages ? (
          <Link
            href={createPageUrl(currentPage + 1)}
            className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl border border-[rgba(17,17,17,0.12)] bg-white text-neutral-700 font-display text-xs font-semibold hover:bg-neutral-50 hover:text-[#111111] transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <span
            className="inline-flex items-center justify-center min-w-[40px] h-10 px-2.5 rounded-xl border border-[rgba(17,17,17,0.06)] bg-neutral-50 text-neutral-300 font-display text-xs cursor-not-allowed"
            aria-disabled="true"
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </div>
    </div>
  );
}
