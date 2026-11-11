import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';

interface ProjectStructuredDataProps {
  project: PublicProjectDto;
}

export function ProjectStructuredData({ project }: ProjectStructuredDataProps) {
  const hasPublicPrice = Boolean(
    !project.pricing.priceOnRequest &&
    project.pricing.startingPrice &&
    project.pricing.startingPrice > 0
  );
  const pricedConfigCount = project.configurations.filter(
    c => !c.priceOnRequest && typeof c.price === 'number' && c.price > 0
  ).length;

  const projectSchema = {
    '@type': project.propertyType === 'VILLA' ? 'SingleFamilyResidence' : 'ApartmentComplex',
    name: project.name,
    description: project.shortDescription || project.description,
    url: `https://greathomes.co.in/projects/${project.slug}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: project.location.name,
      addressRegion: project.location.path?.[0]?.name || project.location.name,
      addressCountry: 'IN',
    },
    developer: {
      '@type': 'Organization',
      name: project.developer.name,
      ...(project.developer.slug && !project.developer.slug.startsWith('neon-dev-')
        ? { url: `https://greathomes.co.in/developers/${project.developer.slug}` }
        : {}),
    },
    ...(hasPublicPrice
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'INR',
            lowPrice: project.pricing.startingPrice,
            highPrice: project.pricing.maximumPrice || project.pricing.startingPrice,
            offerCount: pricedConfigCount || project.configurations.length,
          },
        }
      : {}),
    image: project.media.map(m => m.url),
  };

  // Build canonical BreadcrumbList JSON-LD
  const breadcrumbElements = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://greathomes.co.in',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Projects',
      item: 'https://greathomes.co.in/projects',
    },
  ];

  let currentPos = 3;
  if (project.location.path && project.location.path.length > 0) {
    for (const node of project.location.path) {
      breadcrumbElements.push({
        '@type': 'ListItem',
        position: currentPos++,
        name: node.name,
        item: `https://greathomes.co.in/locations/${node.slug}`,
      });
    }
  } else {
    breadcrumbElements.push({
      '@type': 'ListItem',
      position: currentPos++,
      name: project.location.name,
      item: `https://greathomes.co.in/locations/${project.location.slug}`,
    });
  }

  breadcrumbElements.push({
    '@type': 'ListItem',
    position: currentPos,
    name: project.name,
    item: `https://greathomes.co.in/projects/${project.slug}`,
  });

  const breadcrumbListSchema = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbElements,
  };

  const realEstateListingSchema = {
    '@type': 'RealEstateListing',
    name: `${project.name} — Residential Offerings`,
    url: `https://greathomes.co.in/projects/${project.slug}`,
    description: project.shortDescription || project.description,
  };

  const graphItems: Record<string, unknown>[] = [
    projectSchema,
    realEstateListingSchema,
    breadcrumbListSchema,
  ];

  const eligiblePublishedFaqs = (project.faqs || []).filter(
    faq => faq && faq.isPublished !== false && faq.question && faq.question.trim().length > 0 && faq.answer && faq.answer.trim().length > 0
  );

  if (eligiblePublishedFaqs.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      mainEntity: eligiblePublishedFaqs.map(faq => ({
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphData) }}
    />
  );
}
