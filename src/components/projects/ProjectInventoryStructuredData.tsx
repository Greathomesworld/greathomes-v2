import React from 'react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { PublicResaleListingDto } from '@/src/domain/projects/dto/resaleDto';
import { PublicRentalListingDto } from '@/src/domain/projects/dto/rentalDto';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import {
  formatLocationWithCity,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

const BASE_URL = SITE_ORIGIN;

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
  const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
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

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumbs`,
    itemListElement: rawCrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };

  const itemListElements = isResale
    ? resaleListings.map((listing, idx) => {
        const configLabel = listing.configuration?.trim()
          ? `${listing.configuration.trim()} `
          : listing.bedroomCount && listing.bedroomCount > 0
          ? `${listing.bedroomCount} BHK `
          : '';
        return {
          '@type': 'ListItem',
          position: idx + 1,
          url: listing.slug ? `${BASE_URL}/buy/${listing.slug}` : pageUrl,
          name: `${configLabel}Resale Apartment in ${project.name}`,
        };
      })
    : rentalListings.map((listing, idx) => {
        const bhkLabel =
          listing.bedroomCount && listing.bedroomCount > 0
            ? `${listing.bedroomCount} BHK `
            : '';
        return {
          '@type': 'ListItem',
          position: idx + 1,
          url: listing.slug ? `${BASE_URL}/rent/${listing.slug}` : pageUrl,
          name: `${bhkLabel}Rental Apartment in ${project.name}`,
        };
      });

  const hasEligibleListings = itemListElements.length > 0;

  const collectionNode: Record<string, unknown> = {
    '@type': 'CollectionPage',
    '@id': `${pageUrl}#collection`,
    name: isResale
      ? `Resale Apartments in ${project.name}, ${localityName}`
      : `Apartments for Rent in ${project.name}, ${localityName}`,
    description: hasEligibleListings
      ? isResale
        ? `Browse resale apartments available for purchase in ${project.name}, ${locationWithCity}.`
        : `Browse apartments available for rent in ${project.name}, ${locationWithCity}.`
      : isResale
        ? `Resale apartment information, master project configurations, and availability alerts for ${project.name} in ${locationWithCity}.`
        : `Rental apartment information, master project configurations, and availability alerts for ${project.name} in ${locationWithCity}.`,
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

  const graphData = {
    '@context': 'https://schema.org',
    '@graph': [collectionNode, breadcrumbNode],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(graphData) }}
    />
  );
}
