import React, { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';
import {
  buildNoIndexMetadata,
  buildPageMetadata,
  resolveEditorialSeoImage,
} from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

const getCachedDeveloperStories = cache(async (slug: string) => {
  return editorialService.getDeveloperStories(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stories = await getCachedDeveloperStories(slug);
  const story = stories[0];
  if (!story) {
    return buildNoIndexMetadata(
      'Developer Stories Not Found',
      'The requested developer editorial story is not available on Great Homes.'
    );
  }

  // Canonical editorial article lives at /guides/[slug]; prevent duplicate indexation of alias wrapper
  return buildPageMetadata({
    title: story.seoTitle || story.title,
    description: story.seoDescription || story.excerpt || story.title,
    canonicalPath: `/guides/${story.slug}`,
    canonicalUrl: story.canonicalUrl,
    allowedCanonicalPrefix: '/guides/',
    index: false,
    follow: true,
    ogType: 'article',
    ogImage: resolveEditorialSeoImage(story.featuredImage),
    ogImageAlt: story.title,
    publishedTime: story.publishedAt || undefined,
    modifiedTime: story.updatedAt,
    authors: story.authorName ? [story.authorName] : undefined,
  });
}

export default async function DeveloperStoriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stories = await getCachedDeveloperStories(slug);

  if (stories.length === 0) {
    notFound();
  }

  return <ArticleDetailView article={stories[0]} />;
}
