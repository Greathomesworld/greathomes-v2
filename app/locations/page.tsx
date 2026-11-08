import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { marketIntelligenceService } from '@/src/domain/marketIntelligence/services/marketIntelligenceService';
import { Breadcrumbs } from '@/src/components/navigation/Breadcrumbs';
import { LocationsDirectoryClient } from '@/src/components/locations/LocationsDirectoryClient';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Residential Areas in Kolkata | Locality Guide – Great Homes',
  description:
    'Explore Kolkata residential areas, neighbourhoods and localities. Discover New Town, Rajarhat, Salt Lake, Ballygunge and property opportunities with Great Homes.',
  alternates: {
    canonical: 'https://greathomes.co.in/locations',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Residential Areas in Kolkata | Locality Guide – Great Homes',
    description:
      'Explore Kolkata residential areas, neighbourhoods and localities. Discover New Town, Rajarhat, Salt Lake, Ballygunge and property opportunities with Great Homes.',
    url: 'https://greathomes.co.in/locations',
    siteName: 'Great Homes',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Residential Areas in Kolkata | Locality Guide – Great Homes',
    description:
      'Explore Kolkata residential areas, neighbourhoods and localities. Discover New Town, Rajarhat, Salt Lake, Ballygunge and property opportunities with Great Homes.',
  },
};

export default async function LocationsDirectoryPage() {
  const summary = await marketIntelligenceService.getDirectoryIntelligenceSummary();

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Locations', current: true },
  ];

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Residential Areas in Kolkata | Locality Guide – Great Homes',
        description:
          'Explore Kolkata residential areas, neighbourhoods and localities. Discover New Town, Rajarhat, Salt Lake, Ballygunge and property opportunities with Great Homes.',
        url: 'https://greathomes.co.in/locations',
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: summary.areas.length,
          itemListElement: summary.areas.map((area, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: area.name,
            url: `https://greathomes.co.in/locations/${area.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://greathomes.co.in',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Locations',
            item: 'https://greathomes.co.in/locations',
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111] w-full min-w-0 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="bg-white border-b border-[rgba(17,17,17,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 w-full min-w-0">
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm font-body text-[#111111]/60">
              Loading Kolkata residential locations directory…
            </div>
          }
        >
          <LocationsDirectoryClient summary={summary} />
        </Suspense>
      </main>
    </div>
  );
}
