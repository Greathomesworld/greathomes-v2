import { Developer, DeveloperStatus } from "../entities";
import { Project } from "../../projects/entities";
import { Location } from "../../locations/entities";

export interface PublicLocationSummary {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface BoundedDeveloperDto {
  id: string;
  name: string;
  slug: string;
}

export interface DeveloperSeoSummary {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
}

export interface PublicDeveloperDto {
  id: string;
  name: string;
  slug: string;
  status: DeveloperStatus;
  shortDescription: string | null;
  description: string | null;
  websiteUrl: string | null;
  featured: boolean;
  projectCount: number;
  locations: PublicLocationSummary[];
  logoUrl?: string | null;
  updatedAt?: string | null;
  seo?: DeveloperSeoSummary | null;
  publishedProjectSummary?: {
    totalProjects: number;
    locationsCount: number;
  };
}

export interface PublicProjectDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  propertyType: string;
  startingPrice?: number;
  reraStatus?: 'NOT_PROVIDED' | 'PROVIDED' | 'VERIFIED';
  reraRegistrationNumber?: string;
  hasVerifiedReraBadge: boolean;
  developer: BoundedDeveloperDto;
  location?: PublicLocationSummary;
  coverImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transforms a Developer entity and its associated published projects and locations
 * into the canonical bounded PublicDeveloperDto.
 * Strips all database internals and private fields.
 */
export function toPublicDeveloperDto(
  developer: Developer,
  publishedProjects: Project[],
  locationsMap: Map<string, Location>,
  logoUrl?: string | null,
  seo?: DeveloperSeoSummary | null
): PublicDeveloperDto {
  // Derive distinct locations from published projects
  const uniqueLocationIds = Array.from(new Set(publishedProjects.map(p => p.locationId)));
  const locations: PublicLocationSummary[] = uniqueLocationIds
    .map(locId => locationsMap.get(locId))
    .filter((loc): loc is Location => Boolean(loc))
    .map(loc => ({
      id: loc.id,
      name: loc.name,
      slug: loc.slug,
      type: loc.type,
    }));

  const updatedAt = developer.updatedAt instanceof Date
    ? developer.updatedAt.toISOString()
    : (developer.updatedAt ? String(developer.updatedAt) : null);

  return {
    id: developer.id,
    name: developer.name,
    slug: developer.slug,
    status: developer.status,
    shortDescription: developer.shortDescription,
    description: developer.description,
    websiteUrl: developer.websiteUrl,
    featured: developer.featured,
    projectCount: publishedProjects.length,
    locations,
    logoUrl: logoUrl ?? null,
    updatedAt,
    seo: seo ?? null,
    publishedProjectSummary: {
      totalProjects: publishedProjects.length,
      locationsCount: locations.length,
    },
  };
}

/**
 * Transforms a Project entity into the canonical bounded PublicProjectDto.
 * RERA badge is strictly VERIFIED-only.
 * Developer relationship is strictly bounded to { id, name, slug } to prevent circular recursion.
 */
export function toPublicProjectDto(
  project: Project,
  developer: { id: string; name: string; slug: string },
  location?: Location,
  coverImageUrl?: string | null
): PublicProjectDto {
  const isReraVerified = project.reraStatus === 'VERIFIED';

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    propertyType: project.propertyType,
    startingPrice: project.startingPrice,
    reraStatus: project.reraStatus ?? 'NOT_PROVIDED',
    reraRegistrationNumber: project.reraRegistrationNumber,
    hasVerifiedReraBadge: isReraVerified,
    developer: {
      id: developer.id,
      name: developer.name,
      slug: developer.slug,
    },
    location: location
      ? {
          id: location.id,
          name: location.name,
          slug: location.slug,
          type: location.type,
        }
      : undefined,
    coverImageUrl: coverImageUrl ?? null,
    createdAt: project.createdAt instanceof Date ? project.createdAt.toISOString() : String(project.createdAt),
    updatedAt: project.updatedAt instanceof Date ? project.updatedAt.toISOString() : String(project.updatedAt),
  };
}
