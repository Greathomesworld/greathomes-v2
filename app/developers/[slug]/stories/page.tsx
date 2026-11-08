import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { ArticleDetailView } from '@/src/components/editorial/ArticleDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const stories = await editorialService.getDeveloperStories(slug);
  const story = stories[0];
  if (!story) return { title: 'Developer Stories Not Found | Great Homes' };

  return {
    title: `${story.seoTitle || story.title} | Great Homes`,
    description: story.seoDescription || story.excerpt,
    alternates: {
      canonical: story.canonicalUrl,
    },
  };
}

export default async function DeveloperStoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stories = await editorialService.getDeveloperStories(slug);

  if (stories.length === 0) {
    notFound();
  }

  return <ArticleDetailView article={stories[0]} />;
}
