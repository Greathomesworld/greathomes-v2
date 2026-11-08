import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { marketIntelligenceDashboardService } from '@/src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService';
import { MarketDashboardView } from '@/src/components/market/MarketDashboardView';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Kolkata Residential Market Intelligence | Great Homes',
  description: 'Explore residential projects, pricing, configurations, RERA coverage and market activity across Kolkata with Great Homes.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://greathomes.co.in/market',
  },
  openGraph: {
    title: 'Kolkata Residential Market Intelligence | Great Homes',
    description: 'Explore residential projects, pricing, configurations, RERA coverage and market activity across Kolkata with Great Homes.',
    url: 'https://greathomes.co.in/market',
    siteName: 'Great Homes',
    type: 'website',
  },
};

interface MarketPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function MarketPageContent({ searchParams }: MarketPageProps) {
  const resolvedParams = await searchParams;
  const locationSlug = typeof resolvedParams.location === 'string' ? resolvedParams.location : undefined;
  const scope = resolvedParams.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';
  const basisParam = resolvedParams.basis;
  const basis = (basisParam === 'BUILT_UP_AREA' || basisParam === 'SUPER_BUILT_UP_AREA') ? basisParam : 'CARPET_AREA';

  try {
    const data = await marketIntelligenceDashboardService.getDashboardData({
      locationSlug,
      scope,
      basis,
    });

    return <MarketDashboardView initialData={data} />;
  } catch (error: any) {
    console.error('Failed to load market intelligence dashboard:', error);
    return (
      <div className="max-w-2xl mx-auto py-24 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100">
          Market Intelligence Temporarily Unavailable
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 font-body mt-2">
          {error.message || 'Unable to load residential market intelligence data.'}
        </p>
        <div className="mt-6">
          <Link
            href="/market"
            className="inline-flex items-center gap-1.5 text-xs font-display font-medium py-2.5 px-4 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900"
          >
            <span>Reload Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }
}

export default function MarketPage(props: MarketPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8] dark:bg-stone-950 text-[#111111] dark:text-stone-100">
      <div className="flex-1">
        <Suspense fallback={
          <div className="max-w-7xl mx-auto px-4 py-24 text-center text-stone-400 font-mono text-xs">
            Loading Kolkata Residential Market Intelligence...
          </div>
        }>
          <MarketPageContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}
