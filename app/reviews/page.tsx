import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ReviewsDirectoryView } from '@/src/components/editorial/ReviewsDirectoryView';
import { buildPageMetadata } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

export const metadata: Metadata = buildPageMetadata({
  title: 'Independent Kolkata Project Reviews & Assessments',
  description:
    'Independent editorial assessments of Kolkata residential projects covering floor plans, pricing, WBRERA verification, and locality connectivity.',
  canonicalPath: '/reviews',
});

export default async function ReviewsPage() {
  const { items, total } = await editorialService
    .getPublicArticles({ type: 'PROJECT_REVIEW', limit: 50 })
    .catch(() => ({ items: [], total: 0 }));

  return (
    <Suspense fallback={<div className="p-12 text-center font-display text-stone-500">Loading project reviews...</div>}>
      <ReviewsDirectoryView initialReviews={items} totalReviews={total} />
    </Suspense>
  );
}
