import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { locationComparisonService } from '@/src/domain/locationComparison';
import { LocationComparisonView } from '@/src/components/location-comparison/LocationComparisonView';
import { LocationComparisonEmpty } from '@/src/components/location-comparison/LocationComparisonEmpty';
import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Compare Locations | Great Homes Kolkata',
  description: 'Factual side-by-side benchmark of residential locations in Kolkata. Evaluates supply, isolated pricing, and RERA compliance without predictive bias.',
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: '/compare/locations',
  },
};

interface CompareLocationsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function CompareLocationsContent({ searchParams }: CompareLocationsPageProps) {
  const resolvedParams = await searchParams;
  const locationsParam = typeof resolvedParams.locations === 'string'
    ? resolvedParams.locations
    : Array.isArray(resolvedParams.locations)
    ? resolvedParams.locations.join(',')
    : undefined;

  if (!locationsParam) {
    return <LocationComparisonEmpty />;
  }

  const result = await locationComparisonService.compareLocations(locationsParam, {
    scope: resolvedParams.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT',
  });

  if (!result.success || !result.data) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100">
          Unable to Compare Selected Locations
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 font-body mt-2">
          {result.error || 'Please select between 2 and 4 valid published locations.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <Link
            href="/compare/locations"
            className="inline-flex items-center gap-1.5 text-xs font-display font-medium py-2.5 px-4 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900"
          >
            <span>Choose Valid Locations</span>
          </Link>
          <Link
            href="/locations"
            className="inline-flex items-center gap-1.5 text-xs font-display font-medium py-2.5 px-4 rounded border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Discovery</span>
          </Link>
        </div>
      </div>
    );
  }

  return <LocationComparisonView initialData={result.data} />;
}

export default function CompareLocationsPage(props: CompareLocationsPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8] dark:bg-stone-950 text-[#111111] dark:text-stone-100">
      <div className="flex-1">
        <Suspense fallback={
          <div className="max-w-7xl mx-auto px-4 py-16 text-center text-stone-400 font-mono text-xs">
            Loading comparative intelligence...
          </div>
        }>
          <CompareLocationsContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}
