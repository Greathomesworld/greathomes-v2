import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ReviewDetailView } from '@/src/components/editorial/ReviewDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const review = await editorialService.getPublicArticleBySlug(slug);
  if (!review) {
    notFound();
  }

  const canonicalUrl = review.canonicalUrl?.startsWith('http')
    ? review.canonicalUrl
    : `https://greathomes.co.in/reviews/${review.slug}`;

  return {
    title: `${review.seoTitle || review.title} | Great Homes Review`,
    description: review.seoDescription || review.excerpt,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: review.seoTitle || review.title,
      description: review.seoDescription || review.excerpt,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'article',
      images: review.featuredImage ? [{ url: review.featuredImage }] : undefined,
    },
  };
}

export default async function ReviewDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const review = await editorialService.getPublicArticleBySlug(slug);

  if (!review) {
    notFound();
  }

  return <ReviewDetailView review={review} />;
}
