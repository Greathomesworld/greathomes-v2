import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await editorialService.getPublicArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  const canonicalUrl = article.canonicalUrl?.startsWith('http')
    ? article.canonicalUrl
    : `https://www.greathomes.co.in/guides/${article.slug}`;

  return {
    title: `${article.seoTitle || article.title} | Great Homes`,
    description: article.seoDescription || article.excerpt,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.excerpt,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'article',
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article.updatedAt,
      authors: [article.authorName],
      images: article.featuredImage ? [{ url: article.featuredImage }] : undefined,
    },
  };
}

export default async function GuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await editorialService.getPublicArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return <ArticleDetailView article={article} />;
}
