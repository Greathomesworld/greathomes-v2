import React, { cache } from 'react';
import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ReviewDetailView } from '@/src/components/editorial/ReviewDetailView';
import { buildPageMetadata } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

const getCachedReviewArticle = cache(async (slug: string) => {
  return editorialService.getPublicArticleBySlug(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const review = await getCachedReviewArticle(slug);
  if (!review) {
    notFound();
  }

  const canonicalPath =
    review.type === 'PROJECT_REVIEW'
      ? `/reviews/${review.slug}`
      : `/guides/${review.slug}`;

  return buildPageMetadata({
    title: review.seoTitle || review.title,
    description: review.seoDescription || review.excerpt || review.title,
    canonicalPath,
    canonicalUrl: review.canonicalUrl,
    ogType: 'article',
    ogImage: review.featuredImage,
    ogImageAlt: review.title,
    publishedTime: review.publishedAt || undefined,
    modifiedTime: review.updatedAt,
    authors: review.authorName ? [review.authorName] : undefined,
  });
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const review = await getCachedReviewArticle(slug);

  if (!review) {
    notFound();
  }

  // Consolidate cross-route duplicates: non-review guides live canonically under /guides/[slug]
  if (review.type !== 'PROJECT_REVIEW') {
    permanentRedirect(`/guides/${review.slug}`);
  }

  return <ReviewDetailView review={review} />;
}
