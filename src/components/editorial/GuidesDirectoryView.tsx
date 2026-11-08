'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PublicEditorialArticleDTO } from '@/src/domain/editorial/entities';
import { BookOpen, Search, Clock, Tag, ChevronRight, FileText } from 'lucide-react';

interface GuidesDirectoryViewProps {
  initialArticles: PublicEditorialArticleDTO[];
  totalArticles: number;
}

export function GuidesDirectoryView({ initialArticles, totalArticles }: GuidesDirectoryViewProps) {
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredArticles = initialArticles.filter((art) => {
    if (selectedType !== 'ALL' && art.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        art.title.toLowerCase().includes(q) ||
        art.excerpt.toLowerCase().includes(q) ||
        art.slug.toLowerCase().includes(q)
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
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#218C5A] font-display">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Great Homes Editorial</span>
            </div>
            <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#111111] sm:text-4xl md:text-5xl">
              Buyer Guides & Editorial Intelligence
            </h1>
            <p className="mt-4 font-body text-base text-stone-600 sm:text-lg">
              Factual, independent property guides, area explanations, legal checks, and residential market intelligence for homebuyers in Kolkata.
            </p>
          </div>

          {/* Controls Bar */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-stone-100 pt-6">
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 font-display text-sm">
              {[
                { id: 'ALL', label: 'All Guides' },
                { id: 'BUYING_GUIDE', label: 'Buying Guides' },
                { id: 'LOCATION_GUIDE', label: 'Location Guides' },
                { id: 'MARKET_GUIDE', label: 'Market Guides' },
                { id: 'DEVELOPER_STORY', label: 'Developer Stories' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedType(tab.id)}
                  className={`rounded-lg px-3.5 py-1.5 font-medium transition-all ${
                    selectedType === tab.id
                      ? 'bg-[#111111] text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guides..."
                className="w-full rounded-lg border border-stone-300 bg-stone-50 py-2 pl-9 pr-4 text-sm font-body text-[#111111] focus:border-[#E85D3F] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#E85D3F]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {filteredArticles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-stone-400" />
            <h3 className="mt-4 font-display text-lg font-semibold text-[#111111]">
              No editorial guides found
            </h3>
            <p className="mt-1 font-body text-sm text-stone-500">
              Try adjusting your filter or search query.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {filteredArticles.map((article) => (
              <article
                key={article.id}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs transition-all hover:border-stone-300 hover:shadow-md"
              >
                <div>
                  {/* Card Header Tag */}
                  <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 text-xs font-display font-medium text-stone-500">
                    <span className="inline-flex items-center gap-1 text-[#218C5A] font-semibold">
                      <Tag className="h-3 w-3" />
                      {article.typeDisplay}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {article.readingTimeMinutes} min read
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="p-5">
                    <h2 className="font-editorial text-xl font-bold tracking-tight text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-2">
                      <Link href={`/guides/${article.slug}`}>{article.title}</Link>
                    </h2>
                    <p className="mt-3 font-body text-sm leading-relaxed text-stone-600 line-clamp-3">
                      {article.excerpt}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="border-t border-stone-100 bg-stone-50 px-5 py-3.5 flex items-center justify-between">
                  <span className="font-body text-xs text-stone-500">
                    By {article.authorName}
                  </span>
                  <Link
                    href={`/guides/${article.slug}`}
                    className="inline-flex items-center gap-1 font-display text-xs font-semibold text-[#E85D3F] hover:underline"
                  >
                    Read Guide <ChevronRight className="h-3.5 w-3.5" />
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
