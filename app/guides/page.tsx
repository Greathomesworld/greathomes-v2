import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { GuidesDirectoryView } from '@/src/components/editorial/GuidesDirectoryView';
import { buildPageMetadata } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

export const metadata: Metadata = buildPageMetadata({
  title: 'Kolkata Homebuyer Guides & Property Advisory',
  description:
    'Factual, independent property guides, locality explanations, WBRERA legal checks, and residential market intelligence for Kolkata homebuyers.',
  canonicalPath: '/guides',
});

export default async function GuidesPage() {
  const { items, total } = await editorialService
    .getPublicArticles({ limit: 50 })
    .catch(() => ({ items: [], total: 0 }));

  return (
    <Suspense fallback={<div className="p-12 text-center font-display text-stone-500">Loading guides...</div>}>
      <GuidesDirectoryView initialArticles={items} totalArticles={total} />
    </Suspense>
  );
}
