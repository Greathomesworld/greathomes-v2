import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { bhkLandingService } from '@/src/domain/projects/services/bhkLandingService';
import { BhkLandingPageRenderer } from '@/src/components/discovery/BhkLandingPageRenderer';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { PropertyDetailLayout } from '@/src/components/properties/detail/PropertyDetailLayout';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import {
  buildNoIndexMetadata,
  buildPageMetadata,
  formatLocationWithCity,
  normalizeAbsoluteImageUrl,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

export const revalidate = 120;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getResaleDetailCached = cache(async (slugOrId: string) => {
  await ensureSeedData();
  return resaleListingService.getPublicListingDetailBySlugOrId(slugOrId);
});

const getBhkLandingBundleCached = cache(async (bedroomCount: number, localitySlug: string) => {
  await ensureSeedData();
  return bhkLandingService.resolveBhkLandingBundle(bedroomCount, localitySlug);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  // Stage 1: Detect BHK Landing Page route pattern
  const bhkMatch = slug.match(/^(\d+)-bhk-flats-in-([a-z0-9-]+)$/);
  if (bhkMatch) {
    const bedroomCount = parseInt(bhkMatch[1], 10);
    const localitySlug = bhkMatch[2];
    const bundle = await getBhkLandingBundleCached(bedroomCount, localitySlug);
    if (!bundle) {
      notFound();
    }
    return bhkLandingService.generateSeoMetadata(bundle.data);
  }

  // Stage 2: Fall through to verified Resale Listing Detail
  const listing = await getResaleDetailCached(slug);

  if (!listing || !listing.slug) {
    return buildNoIndexMetadata(
      'Property Not Found',
      'The requested resale property listing is no longer available on Great Homes.'
    );
  }

  const localityName = listing.location?.name || listing.customLocalityDisplay || 'Kolkata';
  const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
  const locationContext = listing.project?.name
    ? ` at ${listing.project.name}, ${locationWithCity}`
    : listing.customProjectDisplay
    ? ` at ${listing.customProjectDisplay}, ${locationWithCity}`
    : ` in ${locationWithCity}`;

  const rawTitle = listing.formattedAskingPrice
    ? `${listing.title} – ${listing.formattedAskingPrice}`
    : listing.title;

  const fallbackDescription = `Explore this ${listing.isVerified ? 'verified ' : ''}${
    listing.propertyType === 'PLOT'
      ? 'residential plot'
      : `${listing.configuration || listing.propertyTypeDisplay} resale ${listing.propertyTypeDisplay.toLowerCase()}`
  }${locationContext}. Asking price: ${listing.formattedAskingPrice}. View carpet area, photos & verified details on Great Homes.`;

  const description = sanitizeMetaDescription(listing.description, fallbackDescription, {
    minLength: 45,
    maxLength: 158,
  });

  const primaryImage = listing.media.length > 0 ? listing.media[0].url : null;

  return buildPageMetadata({
    title: rawTitle,
    description,
    canonicalPath: `/buy/${listing.slug}`,
    index: Boolean(listing.isVerified),
    follow: true,
    ogType: 'website',
    ogImage: primaryImage,
    ogImageAlt: listing.title,
  });
}

export default async function ResaleListingDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Stage 1: Handle BHK Landing Page route
  const bhkMatch = slug.match(/^(\d+)-bhk-flats-in-([a-z0-9-]+)$/);
  if (bhkMatch) {
    const bedroomCount = parseInt(bhkMatch[1], 10);
    const localitySlug = bhkMatch[2];
    const bundle = await getBhkLandingBundleCached(bedroomCount, localitySlug);
    if (!bundle) {
      notFound();
    }
    const { data, relatedBhkLinks } = bundle;
    const jsonLd = bhkLandingService.generateJsonLd(data);
    return (
      <BhkLandingPageRenderer
        data={data}
        jsonLd={jsonLd}
        relatedBhkLinks={relatedBhkLinks}
      />
    );
  }

  // Stage 2: Fall through to verified Resale Listing Detail
  const listing = await getResaleDetailCached(slug);

  if (!listing || !listing.slug) {
    notFound();
  }

  // Permanent redirect non-canonical UUID or case-mismatched URLs to canonical slug URL
  if (slug !== listing.slug) {
    permanentRedirect(`/buy/${listing.slug}`);
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

  const canonicalUrl = `${SITE_ORIGIN}/buy/${listing.slug}`;

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
      name: 'Buy',
      item: `${SITE_ORIGIN}/buy`,
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
    .map((m) => normalizeAbsoluteImageUrl(m.url))
    .filter((u): u is string => Boolean(u));

  const fallbackSchemaDesc = `${listing.title} in ${formatLocationWithCity(
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
    ...(listing.askingPrice && listing.askingPrice > 0
      ? {
          offers: {
            '@type': 'Offer',
            price: listing.askingPrice,
            priceCurrency: 'INR',
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
      <RecentlyViewedTracker resourceType="RESALE_LISTING" resourceId={listing.id} />
      <PropertyDetailLayout listing={listing} discovery={discovery} />
    </>
  );
}
