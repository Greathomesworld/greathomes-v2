import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ReviewsDirectoryView } from '@/src/components/editorial/ReviewsDirectoryView';

export const metadata: Metadata = {
  title: 'Independent Project Reviews & Assessments | Great Homes',
  description: 'Independent, factual editorial assessments of residential projects across Kolkata. Factual breakdown of configurations, pricing, RERA verification, and location connectivity.',
  alternates: {
    canonical: 'https://greathomes.co.in/reviews',
  },
  openGraph: {
    title: 'Independent Project Reviews | Great Homes',
    description: 'Factual project reviews for Kolkata residential developments.',
    url: 'https://greathomes.co.in/reviews',
    siteName: 'Great Homes',
    type: 'website',
  },
};

export default async function ReviewsPage() {
  const { items, total } = await editorialService.getPublicArticles({ type: 'PROJECT_REVIEW', limit: 50 });

  return (
    <Suspense fallback={<div className="p-12 text-center font-display text-stone-500">Loading project reviews...</div>}>
      <ReviewsDirectoryView initialReviews={items} totalReviews={total} />
    </Suspense>
  );
}
