import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { rentalService } from '@/src/domain/projects/services/rentalService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { PropertyDetailLayout } from '@/src/components/properties/detail/PropertyDetailLayout';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getRentalDetailCached = cache(async (slugOrId: string) => {
  await ensureSeedData();
  return rentalService.getPublicListingDetailBySlugOrId(slugOrId);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getRentalDetailCached(slug);

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

  const title = `${listing.configuration} For Rent${locationContext} · ${listing.formattedMonthlyRent} | Great Homes`;
  const description = listing.description
    ? listing.description.slice(0, 155)
    : `Explore this verified ${listing.configuration} rental ${listing.propertyTypeDisplay.toLowerCase()}${locationContext}. Monthly rent: ${listing.formattedMonthlyRent}.`;

  const canonicalUrl = `https://www.greathomes.co.in/rent/${listing.slug}`;

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

export default async function RentalListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await getRentalDetailCached(slug);

  if (!listing || !listing.slug) {
    notFound();
  }

  const discovery = await propertyDiscoveryService.getListingDetailDiscoveryBundle({
    mode: 'RENTAL',
    listingId: listing.id,
    listingSlug: listing.slug,
    projectId: listing.project?.id ?? null,
    locationId: listing.location?.id ?? null,
    bedroomCount: listing.bedroomCount,
    propertyType: listing.propertyType,
    priceOrRent: listing.monthlyRent,
    limit: 6,
  });

  const canonicalUrl = `https://www.greathomes.co.in/rent/${listing.slug}`;

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://www.greathomes.co.in',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Rent',
      item: 'https://www.greathomes.co.in/rent',
    },
    ...(listing.location
      ? [
          {
            '@type': 'ListItem',
            position: 3,
            name: listing.location.name,
            item: `https://www.greathomes.co.in${listing.location.url}`,
          },
        ]
      : []),
    ...(listing.project
      ? [
          {
            '@type': 'ListItem',
            position: listing.location ? 4 : 3,
            name: listing.project.name,
            item: `https://www.greathomes.co.in${listing.project.url}`,
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
        `${listing.configuration} rental ${listing.propertyTypeDisplay.toLowerCase()} in ${listing.locationDisplay}`,
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
        price: listing.monthlyRent,
        priceCurrency: 'INR',
        businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
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
      <RecentlyViewedTracker resourceType="RENTAL_LISTING" resourceId={listing.id} />
      <PropertyDetailLayout listing={listing} discovery={discovery} />
    </>
  );
}
