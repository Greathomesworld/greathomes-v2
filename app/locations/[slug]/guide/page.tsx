import React, { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';
import { buildNoIndexMetadata, buildPageMetadata } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

const getCachedLocationGuide = cache(async (slug: string) => {
  return editorialService.getLocationGuide(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getCachedLocationGuide(slug);
  if (!guide) {
    return buildNoIndexMetadata(
      'Location Guide Not Found',
      'The requested Kolkata locality guide is not available on Great Homes.'
    );
  }

  // Canonical editorial article lives at /guides/[slug]; prevent duplicate indexation of alias wrapper
  return buildPageMetadata({
    title: guide.seoTitle || guide.title,
    description: guide.seoDescription || guide.excerpt || guide.title,
    canonicalPath: `/guides/${guide.slug}`,
    canonicalUrl: guide.canonicalUrl,
    index: false,
    follow: true,
    ogType: 'article',
    ogImage: guide.featuredImage,
    ogImageAlt: guide.title,
    publishedTime: guide.publishedAt || undefined,
    modifiedTime: guide.updatedAt,
    authors: guide.authorName ? [guide.authorName] : undefined,
  });
}

export default async function LocationGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getCachedLocationGuide(slug);

  if (!guide) {
    notFound();
  }

  return <ArticleDetailView article={guide} />;
}
