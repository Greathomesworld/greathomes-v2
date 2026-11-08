'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PublicEditorialArticleDTO } from '@/src/domain/editorial/entities';
import { Building2, Search, Clock, ShieldCheck, ChevronRight, FileCheck } from 'lucide-react';

interface ReviewsDirectoryViewProps {
  initialReviews: PublicEditorialArticleDTO[];
  totalReviews: number;
}

export function ReviewsDirectoryView({ initialReviews }: ReviewsDirectoryViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredReviews = initialReviews.filter((art) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        art.title.toLowerCase().includes(q) ||
        art.excerpt.toLowerCase().includes(q) ||
        art.slug.toLowerCase().includes(q) ||
        (art.project?.name.toLowerCase().includes(q) ?? false) ||
        (art.location?.name.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      {/* Hero Header */}
      <section className="border-b border-stone-200 bg-white py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#E85D3F] font-display">
              <Building2 className="h-3.5 w-3.5" />
              <span>Independent Editorial Reviews</span>
            </div>
            <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#111111] sm:text-4xl md:text-5xl">
              Great Homes Project Reviews
            </h1>
            <p className="mt-4 font-body text-base text-stone-600 sm:text-lg">
              Factual, independent editorial assessments of residential projects across Kolkata. Review configurations, RERA verification status, location connectivity, and buyer considerations.
            </p>
          </div>

          {/* Search Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-stone-100 pt-6">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search project reviews by project name or location..."
                className="w-full rounded-lg border border-stone-300 bg-stone-50 py-2.5 pl-9 pr-4 text-sm font-body text-[#111111] focus:border-[#E85D3F] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#E85D3F]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Grid of Reviews */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {filteredReviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <FileCheck className="mx-auto h-12 w-12 text-stone-400" />
            <h3 className="mt-4 font-display text-lg font-semibold text-[#111111]">
              No project reviews found
            </h3>
            <p className="mt-1 font-body text-sm text-stone-500">
              Try searching for a different project name or location.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReviews.map((review) => (
              <article
                key={review.id}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs transition-all hover:border-stone-300 hover:shadow-md"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-5 py-3 text-xs font-display font-medium">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#218C5A]" />
                      Fact Checked Editorial
                    </span>
                    <span className="inline-flex items-center gap-1 text-stone-500">
                      <Clock className="h-3 w-3" />
                      {review.readingTimeMinutes} min
                    </span>
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    {review.project && (
                      <span className="mb-2 inline-block font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
                        {review.project.name}
                      </span>
                    )}
                    <h2 className="font-editorial text-xl font-bold tracking-tight text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-2">
                      <Link href={`/reviews/${review.slug}`}>{review.title}</Link>
                    </h2>
                    <p className="mt-3 font-body text-sm leading-relaxed text-stone-600 line-clamp-3">
                      {review.excerpt}
                    </p>
                  </div>
                </div>

                {/* Footer Link */}
                <div className="border-t border-stone-100 bg-stone-50 px-5 py-3.5 flex items-center justify-between">
                  <span className="font-body text-xs text-stone-500">
                    {review.location?.name ? `Location: ${review.location.name}` : 'Kolkata Residential'}
                  </span>
                  <Link
                    href={`/reviews/${review.slug}`}
                    className="inline-flex items-center gap-1 font-display text-xs font-semibold text-[#E85D3F] hover:underline"
                  >
                    Read Full Review <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
