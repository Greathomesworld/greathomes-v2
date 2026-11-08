import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { GuidesDirectoryView } from '@/src/components/editorial/GuidesDirectoryView';

export const metadata: Metadata = {
  title: 'Buyer Guides & Editorial Intelligence | Great Homes',
  description: 'Factual, independent property guides, area explanations, legal checks, and residential market intelligence for homebuyers in Kolkata.',
  alternates: {
    canonical: 'https://greathomes.co.in/guides',
  },
  openGraph: {
    title: 'Buyer Guides & Editorial Intelligence | Great Homes',
    description: 'Factual property guides, area explanations, legal checks, and market intelligence for homebuyers in Kolkata.',
    url: 'https://greathomes.co.in/guides',
    siteName: 'Great Homes',
    type: 'website',
  },
};

export default async function GuidesPage() {
  const { items, total } = await editorialService.getPublicArticles({ limit: 50 });

  return (
    <Suspense fallback={<div className="p-12 text-center font-display text-stone-500">Loading guides...</div>}>
      <GuidesDirectoryView initialArticles={items} totalArticles={total} />
    </Suspense>
  );
}
