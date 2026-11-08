import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await editorialService.getLocationGuide(slug);
  if (!guide) return { title: 'Location Guide Not Found | Great Homes' };

  return {
    title: `${guide.seoTitle || guide.title} | Great Homes Location Guide`,
    description: guide.seoDescription || guide.excerpt,
    alternates: {
      canonical: guide.canonicalUrl,
    },
  };
}

export default async function LocationGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await editorialService.getLocationGuide(slug);

  if (!guide) {
    notFound();
  }

  return <ArticleDetailView article={guide} />;
}
