import React, { cache } from 'react';
import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';
import { buildPageMetadata, resolveEditorialSeoImage } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

const getCachedGuideArticle = cache(async (slug: string) => {
  return editorialService.getPublicArticleBySlug(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getCachedGuideArticle(slug);
  if (!article) {
    notFound();
  }

  const canonicalPath =
    article.type === 'PROJECT_REVIEW'
      ? `/reviews/${article.slug}`
      : `/guides/${article.slug}`;
  const allowedCanonicalPrefix =
    article.type === 'PROJECT_REVIEW' ? '/reviews/' : '/guides/';

  return buildPageMetadata({
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt || article.title,
    canonicalPath,
    canonicalUrl: article.canonicalUrl,
    allowedCanonicalPrefix,
    ogType: 'article',
    ogImage: resolveEditorialSeoImage(article.featuredImage),
    ogImageAlt: article.title,
    publishedTime: article.publishedAt || undefined,
    modifiedTime: article.updatedAt,
    authors: article.authorName ? [article.authorName] : undefined,
  });
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getCachedGuideArticle(slug);

  if (!article) {
    notFound();
  }

  // Consolidate cross-route duplicates: project reviews live canonically under /reviews/[slug]
  if (article.type === 'PROJECT_REVIEW') {
    permanentRedirect(`/reviews/${article.slug}`);
  }

  return <ArticleDetailView article={article} />;
}
