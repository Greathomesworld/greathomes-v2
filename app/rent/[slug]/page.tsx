import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { rentalService } from '@/src/domain/projects/services/rentalService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { PropertyDetailLayout } from '@/src/components/properties/detail/PropertyDetailLayout';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import {
  buildNoIndexMetadata,
  buildPageMetadata,
  formatLocationWithCity,
  normalizePublicSeoImageUrl,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

export const revalidate = 120;

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
    return buildNoIndexMetadata(
      'Property Not Found',
      'The requested rental property listing is no longer available on Great Homes.'
    );
  }

  const localityName = listing.location?.name || listing.customLocalityDisplay || 'Kolkata';
  const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
  const locationContext = listing.project?.name
    ? ` at ${listing.project.name}, ${locationWithCity}`
    : listing.customProjectDisplay
    ? ` at ${listing.customProjectDisplay}, ${locationWithCity}`
    : ` in ${locationWithCity}`;

  const alreadyHasRentPhrase = /\bfor\s+rent\b|\brental\b/i.test(listing.title);
  const titleCore = alreadyHasRentPhrase ? listing.title : `${listing.title} for Rent`;
  const withRentTitle = listing.formattedMonthlyRent
    ? `${titleCore} – ${listing.formattedMonthlyRent}`
    : titleCore;
  // Avoid clamping off currency/period units (e.g. "/mo") when title + rent exceeds 51 chars (+14 brand = 65)
  const rawTitle =
    withRentTitle.length <= 51
      ? withRentTitle
      : titleCore.length <= 51
        ? titleCore
        : listing.title;

  const fallbackDescription = `Explore this ${listing.isVerified ? 'verified ' : ''}${
    listing.propertyType === 'PLOT'
      ? 'residential plot'
      : `${listing.configuration || listing.propertyTypeDisplay} rental ${listing.propertyTypeDisplay.toLowerCase()}`
  }${locationContext}. Monthly rent: ${listing.formattedMonthlyRent}. View photos, furnishing & lease details on Great Homes.`;

  const description = sanitizeMetaDescription(listing.description, fallbackDescription, {
    minLength: 45,
    maxLength: 158,
  });

  const primaryImage = listing.media.length > 0 ? listing.media[0].url : null;

  return buildPageMetadata({
    title: rawTitle,
    description,
    canonicalPath: `/rent/${listing.slug}`,
    index: Boolean(listing.isVerified),
    follow: true,
    ogType: 'website',
    ogImage: primaryImage,
    ogImageAlt: listing.title,
  });
}

export default async function RentalListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await getRentalDetailCached(slug);

  if (!listing || !listing.slug) {
    notFound();
  }

  // Permanent redirect non-canonical UUID or case-mismatched URLs to canonical slug URL
  if (slug !== listing.slug) {
    permanentRedirect(`/rent/${listing.slug}`);
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

  const canonicalUrl = `${SITE_ORIGIN}/rent/${listing.slug}`;

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: SITE_ORIGIN,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Rent',
      item: `${SITE_ORIGIN}/rent`,
    },
    ...(listing.location
      ? [
          {
            '@type': 'ListItem',
            position: 3,
            name: listing.location.name,
            item: `${SITE_ORIGIN}${listing.location.url}`,
          },
        ]
      : []),
    ...(listing.project
      ? [
          {
            '@type': 'ListItem',
            position: listing.location ? 4 : 3,
            name: listing.project.name,
            item: `${SITE_ORIGIN}${listing.project.url}`,
          },
        ]
      : []),
    {
      '@type': 'ListItem',
      position: 3 + (listing.location ? 1 : 0) + (listing.project ? 1 : 0),
      name: listing.title,
      item: canonicalUrl,
    },
  ];

  const isPlot = listing.propertyType === 'PLOT';
  const areaNumeric = isPlot
    ? listing.plotArea
    : listing.carpetArea || listing.builtUpArea || listing.superBuiltUpArea || listing.plotArea;

  const schemaType = isPlot
    ? 'Place'
    : listing.propertyType === 'INDEPENDENT_HOUSE'
    ? 'SingleFamilyResidence'
    : 'Apartment';

  const listingImages = listing.media
    .map((m) => normalizePublicSeoImageUrl(m.url))
    .filter((u): u is string => Boolean(u));

  const fallbackSchemaDesc = `${listing.title} for rent in ${formatLocationWithCity(
    listing.location?.name || listing.customLocalityDisplay,
    'Kolkata'
  )}`;
  const cleanSchemaDesc = sanitizeMetaDescription(listing.description, fallbackSchemaDesc, {
    minLength: 40,
    maxLength: 260,
  });

  const propertyEntity: Record<string, any> = {
    '@type': schemaType,
    '@id': `${canonicalUrl}#property`,
    name: listing.title,
    description: cleanSchemaDesc,
    url: canonicalUrl,
    ...(listingImages.length > 0 ? { image: listingImages } : {}),
    ...(!isPlot && listing.bedroomCount && listing.bedroomCount > 0
      ? {
          numberOfRooms: listing.bedroomCount,
          numberOfBedrooms: listing.bedroomCount,
        }
      : {}),
    ...(!isPlot && areaNumeric && areaNumeric > 0
      ? {
          floorSize: {
            '@type': 'QuantitativeValue',
            value: areaNumeric,
            unitCode: 'FTK',
          },
        }
      : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: listing.location?.name || listing.customLocalityDisplay || 'Kolkata',
      addressRegion: 'West Bengal',
      addressCountry: 'IN',
    },
  };

  const realEstateListingNode: Record<string, any> = {
    '@type': 'RealEstateListing',
    '@id': `${canonicalUrl}#listing`,
    name: listing.title,
    description: cleanSchemaDesc,
    url: canonicalUrl,
    ...(listingImages.length > 0 ? { image: listingImages[0] } : {}),
    about: { '@id': `${canonicalUrl}#property` },
    ...(listing.monthlyRent && listing.monthlyRent > 0
      ? {
          offers: {
            '@type': 'Offer',
            price: listing.monthlyRent,
            priceCurrency: 'INR',
            businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
            availability: 'https://schema.org/InStock',
            url: canonicalUrl,
          },
        }
      : {}),
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      realEstateListingNode,
      propertyEntity,
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumbs`,
        itemListElement: breadcrumbItems,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />
      <RecentlyViewedTracker resourceType="RENTAL_LISTING" resourceId={listing.id} />
      <PropertyDetailLayout listing={listing} discovery={discovery} />
    </>
  );
}
