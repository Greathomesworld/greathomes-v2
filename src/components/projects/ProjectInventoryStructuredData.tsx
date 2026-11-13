import React from 'react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { PublicResaleListingDto } from '@/src/domain/projects/dto/resaleDto';
import { PublicRentalListingDto } from '@/src/domain/projects/dto/rentalDto';

const BASE_URL = 'https://www.greathomes.co.in';

interface ProjectInventoryStructuredDataProps {
  project: PublicProjectDto;
  mode: 'RESALE' | 'RENTAL';
  resaleListings?: PublicResaleListingDto[];
  rentalListings?: PublicRentalListingDto[];
}

export function ProjectInventoryStructuredData({
  project,
  mode,
  resaleListings = [],
  rentalListings = [],
}: ProjectInventoryStructuredDataProps) {
  const isResale = mode === 'RESALE';
  const pageUrl = `${BASE_URL}/projects/${project.slug}/${isResale ? 'resale' : 'rent'}`;
  const projectUrl = `${BASE_URL}/projects/${project.slug}`;
  const localityName = project.location?.name?.trim() || 'Kolkata';
  const localitySlug = project.location?.slug?.trim() || null;

  const rawCrumbs: Array<{ name: string; item: string }> = [
    { name: 'Home', item: BASE_URL },
    { name: 'Projects', item: `${BASE_URL}/projects` },
    ...(project.location?.name && localitySlug
      ? [{ name: project.location.name.trim(), item: `${BASE_URL}/locations/${localitySlug}` }]
      : []),
    { name: project.name, item: projectUrl },
    { name: isResale ? 'Resale Apartments' : 'Apartments for Rent', item: pageUrl },
  ];

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: rawCrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };

  const itemListElements = isResale
    ? resaleListings.map((listing, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: listing.slug ? `${BASE_URL}/buy/${listing.slug}` : pageUrl,
        name: `${listing.configuration} Resale Apartment in ${project.name}`,
      }))
    : rentalListings.map((listing, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: listing.slug ? `${BASE_URL}/rent/${listing.slug}` : pageUrl,
        name: `${listing.bedroomCount} BHK Rental Apartment in ${project.name}`,
      }));

  const hasEligibleListings = itemListElements.length > 0;

  const collectionSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: isResale
      ? `Resale Apartments in ${project.name}, ${localityName}`
      : `Apartments for Rent in ${project.name}, ${localityName}`,
    description: hasEligibleListings
      ? isResale
        ? `Browse resale apartments available for purchase in ${project.name}, ${localityName}, Kolkata.`
        : `Browse apartments available for rent in ${project.name}, ${localityName}, Kolkata.`
      : isResale
        ? `Resale apartment information, master project configurations, and availability alerts for ${project.name} in ${localityName}, Kolkata.`
        : `Rental apartment information, master project configurations, and availability alerts for ${project.name} in ${localityName}, Kolkata.`,
    url: pageUrl,
    isPartOf: {
      '@type': 'WebPage',
      '@id': projectUrl,
      name: project.name,
      url: projectUrl,
    },
    ...(hasEligibleListings
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: itemListElements.length,
            itemListElement: itemListElements,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
    </>
  );
}

