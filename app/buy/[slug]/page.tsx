import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { PropertyDetailLayout } from '@/src/components/properties/detail/PropertyDetailLayout';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getResaleDetailCached = cache(async (slugOrId: string) => {
  await ensureSeedData();
  return resaleListingService.getPublicListingDetailBySlugOrId(slugOrId);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getResaleDetailCached(slug);

  if (!listing || !listing.slug) {
    return {
      title: 'Property Not Found | Great Homes',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const locationContext = listing.project?.name
    ? ` at ${listing.project.name}`
    : listing.location?.name
    ? ` in ${listing.location.name}`
    : '';

  const title = `${listing.configuration} Resale${locationContext} · ${listing.formattedAskingPrice} | Great Homes`;
  const description = listing.description
    ? listing.description.slice(0, 155)
    : `Explore this verified ${listing.configuration} resale ${listing.propertyTypeDisplay.toLowerCase()}${locationContext}. Asking price: ${listing.formattedAskingPrice}.`;

  const canonicalUrl = `https://greathomes.co.in/buy/${listing.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: Boolean(listing.isVerified),
      follow: Boolean(listing.isVerified),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'website',
      images: listing.media.length > 0 ? [{ url: listing.media[0].url }] : undefined,
    },
  };
}

export default async function ResaleListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await getResaleDetailCached(slug);

  if (!listing || !listing.slug) {
    notFound();
  }

  const discovery = await propertyDiscoveryService.getListingDetailDiscoveryBundle({
    mode: 'RESALE',
    listingId: listing.id,
    listingSlug: listing.slug,
    projectId: listing.project?.id ?? null,
    locationId: listing.location?.id ?? null,
    bedroomCount: listing.bedroomCount,
    propertyType: listing.propertyType,
    priceOrRent: listing.askingPrice,
    limit: 6,
  });

  const canonicalUrl = `https://greathomes.co.in/buy/${listing.slug}`;

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://greathomes.co.in',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Buy',
      item: 'https://greathomes.co.in/buy',
    },
    ...(listing.location
      ? [
          {
            '@type': 'ListItem',
            position: 3,
            name: listing.location.name,
            item: `https://greathomes.co.in${listing.location.url}`,
          },
        ]
      : []),
    ...(listing.project
      ? [
          {
            '@type': 'ListItem',
            position: listing.location ? 4 : 3,
            name: listing.project.name,
            item: `https://greathomes.co.in${listing.project.url}`,
          },
        ]
      : []),
    {
      '@type': 'ListItem',
      position:
        3 + (listing.location ? 1 : 0) + (listing.project ? 1 : 0),
      name: listing.title,
      item: canonicalUrl,
    },
  ];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      name: listing.title,
      description:
        listing.description ||
        `${listing.configuration} resale ${listing.propertyTypeDisplay.toLowerCase()} in ${listing.locationDisplay}`,
      url: canonicalUrl,
      numberOfRooms: listing.bedroomCount,
      numberOfBedrooms: listing.bedroomCount,
      floorSize: listing.carpetArea
        ? {
            '@type': 'QuantitativeValue',
            value: listing.carpetArea,
            unitCode: 'FTK',
          }
        : undefined,
      address: {
        '@type': 'PostalAddress',
        addressLocality: listing.location?.name || 'Kolkata',
        addressRegion: 'West Bengal',
        addressCountry: 'IN',
      },
      offers: {
        '@type': 'Offer',
        price: listing.askingPrice,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <RecentlyViewedTracker resourceType="RESALE_LISTING" resourceId={listing.id} />
      <PropertyDetailLayout listing={listing} discovery={discovery} />
    </>
  );
}
