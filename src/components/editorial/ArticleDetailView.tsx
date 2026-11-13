'use client';

import React from 'react';
import Link from 'next/link';
import { PublicEditorialArticleDTO } from '@/src/domain/editorial/entities';
import { BookOpen, Calendar, Clock, ChevronRight, Building2, MapPin, UserCheck, Share2, Tag } from 'lucide-react';

interface ArticleDetailViewProps {
  article: PublicEditorialArticleDTO;
}

export function ArticleDetailView({ article }: ArticleDetailViewProps) {
  const canonicalUrl = article.canonicalUrl?.startsWith('http')
    ? article.canonicalUrl
    : `https://www.greathomes.co.in/guides/${article.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: {
      '@type': 'Organization',
      name: article.authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Great Homes',
      url: 'https://www.greathomes.co.in',
    },
    mainEntityOfPage: canonicalUrl,
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header Breadcrumbs & Banner */}
      <header className="border-b border-stone-200 bg-white py-8 md:py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav className="mb-6 flex items-center gap-2 font-display text-xs text-stone-500">
            <Link href="/" className="hover:text-[#E85D3F]">Home</Link>
            <ChevronRight className="h-3 w-3 text-stone-400" />
            <Link href="/guides" className="hover:text-[#E85D3F]">Guides</Link>
            <ChevronRight className="h-3 w-3 text-stone-400" />
            <span className="font-semibold text-stone-800 line-clamp-1">{article.title}</span>
          </nav>

          {/* Type Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#218C5A] font-display">
            <Tag className="h-3.5 w-3.5" />
            <span>{article.typeDisplay}</span>
          </div>

          {/* Title */}
          <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#111111] sm:text-4xl md:text-5xl leading-tight">
            {article.title}
          </h1>

          {/* Excerpt */}
          <p className="mt-4 font-body text-base text-stone-600 sm:text-lg leading-relaxed">
            {article.excerpt}
          </p>

          {/* Metadata Row */}
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-stone-100 pt-6 font-display text-xs text-stone-500">
            <div className="flex items-center gap-1.5 font-medium text-stone-700">
              <UserCheck className="h-4 w-4 text-[#218C5A]" />
              <span>{article.authorName} ({article.authorRole})</span>
            </div>
            {article.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                <span>Published {new Date(article.publishedAt).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-stone-400" />
              <span>{article.readingTimeMinutes} min read</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Canonical Entity Badges */}
        {(article.project || article.location || article.developer) && (
          <section className="mb-10 rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-stone-500">
              Referenced Real Estate Entities
            </h2>
            <div className="flex flex-wrap gap-3">
              {article.project && (
                <Link
                  href={`/projects/${article.project.slug}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2 font-display text-xs font-semibold text-[#111111] hover:border-[#E85D3F] hover:bg-orange-50/50"
                >
                  <Building2 className="h-4 w-4 text-[#E85D3F]" />
                  <span>Project: {article.project.name}</span>
                  <ChevronRight className="h-3 w-3 text-stone-400" />
                </Link>
              )}
              {article.location && (
                <Link
                  href={`/locations/${article.location.slug}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2 font-display text-xs font-semibold text-[#111111] hover:border-[#218C5A] hover:bg-emerald-50/50"
                >
                  <MapPin className="h-4 w-4 text-[#218C5A]" />
                  <span>Location: {article.location.name}</span>
                  <ChevronRight className="h-3 w-3 text-stone-400" />
                </Link>
              )}
              {article.developer && (
                <Link
                  href={`/developers/${article.developer.slug}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2 font-display text-xs font-semibold text-[#111111] hover:border-stone-400"
                >
                  <Building2 className="h-4 w-4 text-stone-600" />
                  <span>Developer: {article.developer.name}</span>
                  <ChevronRight className="h-3 w-3 text-stone-400" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Article Body */}
        <article className="prose prose-stone max-w-none bg-white p-8 sm:p-12 rounded-xl border border-stone-200 shadow-xs font-body text-base leading-relaxed text-[#111111]">
          <div dangerouslySetInnerHTML={{ __html: article.body.replace(/\n\n/g, '<br/><br/>').replace(/## (.*?)\n/g, '<h2 class="font-editorial text-2xl font-bold text-[#111111] mt-8 mb-4">$1</h2>').replace(/### (.*?)\n/g, '<h3 class="font-editorial text-xl font-bold text-[#111111] mt-6 mb-3">$1</h3>') }} />
        </article>

        {/* Structured Sections */}
        {article.structuredSections && article.structuredSections.length > 0 && (
          <section className="mt-12 space-y-6">
            <h2 className="font-editorial text-2xl font-bold text-[#111111]">
              Structured Editorial Topics
            </h2>
            <div className="grid gap-4">
              {article.structuredSections.map((sec) => (
                <div key={sec.id} className="rounded-xl border border-stone-200 bg-white p-6">
                  <h3 className="font-display text-lg font-bold text-[#111111]">{sec.title}</h3>
                  <p className="mt-2 font-body text-sm text-stone-600 leading-relaxed">{sec.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Content */}
        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <section className="mt-16 border-t border-stone-200 pt-10">
            <h2 className="font-editorial text-2xl font-bold text-[#111111] mb-6">
              Related Buyer Guides & Stories
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {article.relatedArticles.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/guides/${rel.slug}`}
                  className="group rounded-xl border border-stone-200 bg-white p-5 transition-all hover:border-[#E85D3F]"
                >
                  <span className="font-display text-xs font-semibold text-[#218C5A] uppercase tracking-wider">{rel.typeDisplay}</span>
                  <h3 className="mt-2 font-editorial text-base font-bold text-[#111111] group-hover:text-[#E85D3F] line-clamp-2">{rel.title}</h3>
                  <p className="mt-2 font-body text-xs text-stone-500 line-clamp-2">{rel.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
