import { Location, LocationType } from '../entities';
import { PublicProjectDto } from '../../projects/dto/projectDto';
import { ProjectDiscoveryCardDto } from '../../projects/dto/discoveryDto';
import {
  LOCATION_LEVEL_DISPLAY_NAMES,
  isValidCoordinate,
} from '../../projects/viewModels/projectLocationViewModel';

export interface BreadcrumbNode {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  level: LocationType;
  levelDisplay: string;
  href: string;
}

export interface ChildLocationCardDto {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  levelDisplay: string;
  projectCount: number;
  shortDescription: string | null;
  description: string | null;
  href: string;
}

export interface LocationSummaryDto {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  levelDisplay: string;
  href: string;
}

export interface LocationPageViewModel {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  levelDisplay: string;
  description: string | null;
  shortDescription: string | null;
  breadcrumb: BreadcrumbNode[];
  parent: LocationSummaryDto | null;
  children: ChildLocationCardDto[];
  childSectionTitle: string;
  childSectionSubtitle: string;
  projectCount: number;
  projects: ProjectDiscoveryCardDto[];
  hasChildren: boolean;
  hasProjects: boolean;
  coordinates: { latitude: number; longitude: number } | null;
  hasValidCoordinates: boolean;
  canonicalPath: string;
  canonicalUrl: string;
  featured: boolean;
}

export function toProjectDiscoveryCardDto(proj: PublicProjectDto): ProjectDiscoveryCardDto {
  const featuredImage = proj.media?.find(m => m.isFeatured)?.url || proj.media?.[0]?.url || null;
  const bhkSet = new Set<number>();
  if (proj.configurations) {
    for (const c of proj.configurations) {
      if (c.bedroomCount) bhkSet.add(c.bedroomCount);
    }
  }
  const bhkSummary = Array.from(bhkSet).sort((a, b) => a - b);
  const propertyTypes = Array.from(
    new Set(proj.configurations?.map(() => proj.propertyType) || [proj.propertyType])
  );

  return {
    id: proj.id,
    type: 'PROJECT',
    name: proj.name,
    slug: proj.slug,
    featuredImageUrl: featuredImage,
    developer: proj.developer ? { name: proj.developer.name, slug: proj.developer.slug } : null,
    location: proj.location
      ? {
          id: proj.location.id,
          name: proj.location.name,
          slug: proj.location.slug,
          type: proj.location.type,
        }
      : null,
    propertyTypes,
    bhkSummary,
    startingPrice: proj.pricing?.startingPrice ?? proj.startingPrice ?? null,
    reraVerified: proj.rera?.status === 'VERIFIED',
  };
}

export function getChildSectionMetadata(parentType: LocationType, locationName: string): { title: string; subtitle: string } {
  switch (parentType) {
    case 'STATE':
      return {
        title: `Districts & Cities in ${locationName}`,
        subtitle: `Explore verified metropolitan cities and districts within ${locationName}.`,
      };
    case 'DISTRICT':
      return {
        title: `Cities in ${locationName}`,
        subtitle: `Explore residential hubs and municipalities within ${locationName}.`,
      };
    case 'CITY':
      return {
        title: `Areas in ${locationName}`,
        subtitle: `Explore canonical residential sectors and areas within ${locationName}.`,
      };
    case 'DISCOVERY_REGION':
      return {
        title: `Areas in ${locationName}`,
        subtitle: `Explore residential sectors and communities within ${locationName}.`,
      };
    case 'AREA':
      return {
        title: `Neighbourhoods in ${locationName}`,
        subtitle: `Explore verified residential pockets and neighbourhoods within ${locationName}.`,
      };
    case 'NEIGHBOURHOOD':
    default:
      return {
        title: `Sub-locations in ${locationName}`,
        subtitle: `Explore residential localities within ${locationName}.`,
      };
  }
}

export function buildLocationPageViewModel(params: {
  location: Location;
  path: Location[];
  childLocations: Location[];
  projects: PublicProjectDto[];
  childProjectCounts?: Map<string, number>;
}): LocationPageViewModel {
  const { location, path, childLocations, projects, childProjectCounts = new Map() } = params;

  const currentType = (location.type.toUpperCase() as LocationType);
  const levelDisplay = LOCATION_LEVEL_DISPLAY_NAMES[currentType] || location.type;

  // Build breadcrumbs
  const breadcrumb: BreadcrumbNode[] = path.map(node => {
    const rawType = (node.type.toUpperCase() as LocationType);
    return {
      id: node.id,
      name: node.name,
      slug: node.slug,
      type: rawType,
      level: rawType,
      levelDisplay: LOCATION_LEVEL_DISPLAY_NAMES[rawType] || node.type,
      href: `/locations/${node.slug}`,
    };
  });

  // Parent summary (immediate predecessor in path, excluding self)
  let parent: LocationSummaryDto | null = null;
  const selfIndex = path.findIndex(p => p.id === location.id);
  if (selfIndex > 0) {
    const parentNode = path[selfIndex - 1];
    const parentType = (parentNode.type.toUpperCase() as LocationType);
    parent = {
      id: parentNode.id,
      name: parentNode.name,
      slug: parentNode.slug,
      type: parentType,
      levelDisplay: LOCATION_LEVEL_DISPLAY_NAMES[parentType] || parentNode.type,
      href: `/locations/${parentNode.slug}`,
    };
  }

  // Child cards with deterministic ordering:
  // 1. Featured first
  // 2. Project count descending
  // 3. Alphabetical name
  const children: ChildLocationCardDto[] = childLocations
    .map(child => {
      const childType = (child.type.toUpperCase() as LocationType);
      const childLevelDisplay = LOCATION_LEVEL_DISPLAY_NAMES[childType] || child.type;
      const projectCount = childProjectCounts.get(child.id) || 0;

      return {
        id: child.id,
        name: child.name,
        slug: child.slug,
        type: childType,
        levelDisplay: childLevelDisplay,
        projectCount,
        shortDescription: child.shortDescription ?? null,
        description: child.description ?? null,
        href: `/locations/${child.slug}`,
      };
    })
    .sort((a, b) => {
      if (a.projectCount !== b.projectCount) {
        return b.projectCount - a.projectCount;
      }
      return a.name.localeCompare(b.name);
    });

  const { title: childSectionTitle, subtitle: childSectionSubtitle } = getChildSectionMetadata(
    currentType,
    location.name
  );

  // Map and deduplicate projects
  const projectCards = projects.map(toProjectDiscoveryCardDto);

  // Coordinates
  const hasValidCoordinates = isValidCoordinate(location.latitude, location.longitude);
  const coordinates = hasValidCoordinates
    ? { latitude: location.latitude as number, longitude: location.longitude as number }
    : null;

  const canonicalPath = `/locations/${path.map(p => p.slug).join('/')}`;
  const canonicalUrl = `https://www.greathomes.co.in/locations/${location.slug}`;

  return {
    id: location.id,
    name: location.name,
    slug: location.slug,
    type: currentType,
    levelDisplay,
    description: location.description ?? null,
    shortDescription: location.shortDescription ?? null,
    breadcrumb,
    parent,
    children,
    childSectionTitle,
    childSectionSubtitle,
    projectCount: projectCards.length,
    projects: projectCards,
    hasChildren: children.length > 0,
    hasProjects: projectCards.length > 0,
    coordinates,
    hasValidCoordinates,
    canonicalPath,
    canonicalUrl,
    featured: location.featured,
  };
}
