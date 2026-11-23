import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { isKnownTestDeveloperSlug } from '@/src/domain/developers/services/developerService';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import {
  normalizeAbsoluteImageUrl,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

interface ProjectStructuredDataProps {
  project: PublicProjectDto;
}

export function ProjectStructuredData({ project }: ProjectStructuredDataProps) {
  const BASE_URL = SITE_ORIGIN;
  const projectUrl = `${BASE_URL}/projects/${project.slug}`;

  const hasPublicPrice = Boolean(
    !project.pricing.priceOnRequest &&
      project.pricing.startingPrice &&
      project.pricing.startingPrice > 0
  );
  const pricedConfigCount = project.configurations.filter(
    (c) => !c.priceOnRequest && typeof c.price === 'number' && c.price > 0
  ).length;

  const lat = project.location?.latitude;
  const lng = project.location?.longitude;
  const geoCoordinates =
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)
      ? {
          '@type': 'GeoCoordinates',
          latitude: lat,
          longitude: lng,
        }
      : undefined;

  const amenityFeatures = (project.amenities || []).map((a) => ({
    '@type': 'LocationFeatureSpecification',
    name: a.name,
    value: true,
  }));

  const normalizedImages = (project.media || [])
    .map((m) => normalizeAbsoluteImageUrl(m.url))
    .filter((u): u is string => Boolean(u));

  const cleanDesc = sanitizeMetaDescription(
    project.shortDescription || project.description,
    `${project.name} residential project in ${project.location.name}, Kolkata.`,
    { minLength: 30, maxLength: 300 }
  );

  // Schema-valid residence entity (no invalid `developer` or `offers` directly on ApartmentComplex/SingleFamilyResidence)
  const residenceSchema: Record<string, unknown> = {
    '@type': project.propertyType === 'VILLA' ? 'SingleFamilyResidence' : 'ApartmentComplex',
    '@id': `${projectUrl}#residence`,
    name: project.name,
    description: cleanDesc,
    url: projectUrl,
    address: {
      '@type': 'PostalAddress',
      addressLocality: project.location.name,
      addressRegion: 'West Bengal',
      addressCountry: 'IN',
    },
    ...(geoCoordinates ? { geo: geoCoordinates } : {}),
    ...(amenityFeatures.length > 0 ? { amenityFeature: amenityFeatures } : {}),
    ...(normalizedImages.length > 0 ? { image: normalizedImages } : {}),
  };

  const hasCanonicalDeveloperUrl =
    Boolean(project.developer?.slug) && !isKnownTestDeveloperSlug(project.developer?.slug);

  const developerOrgNode = project.developer?.name
    ? {
        '@type': 'Organization',
        name: project.developer.name,
        ...(hasCanonicalDeveloperUrl
          ? { url: `${BASE_URL}/developers/${project.developer.slug}` }
          : {}),
      }
    : undefined;

  // RealEstateListing carries commercial offers and links to the residence entity via `about`
  const realEstateListingSchema: Record<string, unknown> = {
    '@type': 'RealEstateListing',
    '@id': `${projectUrl}#listing`,
    name: `${project.name} – Residential Offerings`,
    url: projectUrl,
    description: cleanDesc,
    about: { '@id': `${projectUrl}#residence` },
    ...(normalizedImages.length > 0 ? { image: normalizedImages[0] } : {}),
    ...(developerOrgNode ? { provider: developerOrgNode } : {}),
    ...(hasPublicPrice
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'INR',
            lowPrice: project.pricing.startingPrice,
            highPrice: project.pricing.maximumPrice || project.pricing.startingPrice,
            ...(pricedConfigCount > 0 || project.configurations.length > 0
              ? { offerCount: pricedConfigCount || project.configurations.length }
              : {}),
            url: projectUrl,
          },
        }
      : {}),
  };

  // Build canonical BreadcrumbList JSON-LD
  const breadcrumbElements = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: BASE_URL,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Projects',
      item: `${BASE_URL}/projects`,
    },
  ];

  let currentPos = 3;
  if (project.location.path && project.location.path.length > 0) {
    for (const node of project.location.path) {
      breadcrumbElements.push({
        '@type': 'ListItem',
        position: currentPos++,
        name: node.name,
        item: `${BASE_URL}/locations/${node.slug}`,
      });
    }
  } else {
    breadcrumbElements.push({
      '@type': 'ListItem',
      position: currentPos++,
      name: project.location.name,
      item: `${BASE_URL}/locations/${project.location.slug}`,
    });
  }

  breadcrumbElements.push({
    '@type': 'ListItem',
    position: currentPos,
    name: project.name,
    item: projectUrl,
  });

  const breadcrumbListSchema = {
    '@type': 'BreadcrumbList',
    '@id': `${projectUrl}#breadcrumbs`,
    itemListElement: breadcrumbElements,
  };

  const graphItems: Record<string, unknown>[] = [
    realEstateListingSchema,
    residenceSchema,
    breadcrumbListSchema,
  ];

  const eligiblePublishedFaqs = (project.faqs || []).filter(
    (faq) =>
      faq &&
      faq.isPublished !== false &&
      faq.question &&
      faq.question.trim().length > 0 &&
      faq.answer &&
      faq.answer.trim().length > 0
  );

  if (eligiblePublishedFaqs.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      '@id': `${projectUrl}#faqs`,
      mainEntity: eligiblePublishedFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question.trim(),
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer.trim(),
        },
      })),
    });
  }

  const graphData = {
    '@context': 'https://schema.org',
    '@graph': graphItems,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(graphData) }}
    />
  );
}
