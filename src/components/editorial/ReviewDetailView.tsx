'use client';

import React from 'react';
import Link from 'next/link';
import { PublicEditorialArticleDTO } from '@/src/domain/editorial/entities';
import { ShieldCheck, Calendar, Clock, ChevronRight, Building2, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import { SafeEditorialBody } from './SafeEditorialBody';
import {
  DEFAULT_OG_IMAGE,
  normalizeCanonicalUrl,
  resolveEditorialSeoImage,
  SITE_NAME,
  SITE_ORIGIN,
  stripBrandSuffix,
} from '@/src/domain/seo/metadataBuilder';

interface ReviewDetailViewProps {
  review: PublicEditorialArticleDTO;
}

export function ReviewDetailView({ review }: ReviewDetailViewProps) {
  const canonicalUrl = normalizeCanonicalUrl(
    review.canonicalUrl,
    `/reviews/${review.slug}`,
    { allowedPathPrefix: '/reviews/' }
  );
  const reviewImage = resolveEditorialSeoImage(review.featuredImage);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: stripBrandSuffix(review.seoTitle || review.title),
        description: review.seoDescription || review.excerpt,
        image: reviewImage,
        ...(review.publishedAt ? { datePublished: review.publishedAt } : {}),
        ...(review.updatedAt ? { dateModified: review.updatedAt } : {}),
        author: {
          '@type': 'Organization',
          name: review.authorName || SITE_NAME,
        },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          url: SITE_ORIGIN,
          logo: {
            '@type': 'ImageObject',
            url: DEFAULT_OG_IMAGE,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
        ...(review.project
          ? {
              about: {
                '@type': 'ApartmentComplex',
                name: review.project.name,
                url: `${SITE_ORIGIN}/projects/${review.project.slug}`,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: SITE_ORIGIN,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Project Reviews',
            item: `${SITE_ORIGIN}/reviews`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: review.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {/* Header */}
      <header className="border-b border-stone-200 bg-white py-8 md:py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <nav className="mb-6 flex items-center gap-2 font-display text-xs text-stone-500">
            <Link href="/" className="hover:text-[#E85D3F]">Home</Link>
            <ChevronRight className="h-3 w-3 text-stone-400" />
            <Link href="/reviews" className="hover:text-[#E85D3F]">Project Reviews</Link>
            <ChevronRight className="h-3 w-3 text-stone-400" />
            <span className="font-semibold text-stone-800 line-clamp-1">{review.title}</span>
          </nav>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#E85D3F] font-display">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Factual Project Assessment</span>
          </div>

          <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#111111] sm:text-4xl md:text-5xl leading-tight">
            {review.title}
          </h1>

          <p className="mt-4 font-body text-base text-stone-600 sm:text-lg leading-relaxed">
            {review.excerpt}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-stone-100 pt-6 font-display text-xs text-stone-500">
            <span>By {review.authorName}</span>
            {review.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                <span>Reviewed {new Date(review.publishedAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-stone-400" />
              <span>{review.readingTimeMinutes} min read</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Review Section */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Linked Authoritative Project Header */}
        {review.project && (
          <div className="mb-10 rounded-xl border border-stone-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-wider text-stone-500">
                Authoritative Project Entity
              </span>
              <h2 className="font-editorial text-2xl font-bold text-[#111111]">{review.project.name}</h2>
              <p className="font-body text-xs text-stone-500 mt-1">
                Status: {review.project.status} {review.project.startingPrice ? `• Starting ₹${review.project.startingPrice}` : ''}
              </p>
            </div>
            <Link
              href={`/projects/${review.project.slug}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 font-display text-xs font-semibold text-white transition-colors hover:bg-stone-800"
            >
              <Building2 className="h-4 w-4" />
              <span>View Live Project Details</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Content Body */}
        <article className="prose prose-stone max-w-none bg-white p-8 sm:p-12 rounded-xl border border-stone-200 shadow-xs font-body text-base leading-relaxed text-[#111111]">
          <SafeEditorialBody body={review.body} />
        </article>

        {/* Notice box */}
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/60 p-5 flex items-start gap-3 text-xs font-body text-amber-900">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-display font-bold">Factual Editorial Boundary:</span> Real-time project facts (pricing, RERA verification status, availability) are updated automatically from the canonical project service. Editorial text provides neutral context without predictive financial claims.
          </div>
        </div>
      </main>
    </div>
  );
}
