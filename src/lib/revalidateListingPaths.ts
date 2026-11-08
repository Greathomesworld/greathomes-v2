import { revalidatePath } from 'next/cache';

export interface RevalidateListingOptions {
  slug?: string | null;
  id?: string | null;
  projectSlug?: string | null;
  previousProjectSlug?: string | null;
  locationSlug?: string | null;
  previousLocationSlug?: string | null;
}

export function revalidateResalePaths(options?: RevalidateListingOptions) {
  try {
    revalidatePath('/buy');
    if (options?.slug) {
      revalidatePath(`/buy/${options.slug}`);
    }
    if (options?.id && options.id !== options?.slug) {
      revalidatePath(`/buy/${options.id}`);
    }

    const projectSlugs = new Set(
      [options?.projectSlug, options?.previousProjectSlug].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
    );
    for (const pSlug of projectSlugs) {
      revalidatePath(`/projects/${pSlug}`);
      revalidatePath(`/projects/${pSlug}/resale`);
    }

    const locationSlugs = new Set(
      [options?.locationSlug, options?.previousLocationSlug].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
    );
    if (locationSlugs.size > 0) {
      revalidatePath('/locations');
      for (const lSlug of locationSlugs) {
        revalidatePath(`/locations/${lSlug}`);
      }
    }
  } catch {
    // Safe fallback when invoked outside a Next.js request context (e.g. unit tests)
  }
}

export function revalidateRentalPaths(options?: RevalidateListingOptions) {
  try {
    revalidatePath('/rent');
    if (options?.slug) {
      revalidatePath(`/rent/${options.slug}`);
    }
    if (options?.id && options.id !== options?.slug) {
      revalidatePath(`/rent/${options.id}`);
    }

    const projectSlugs = new Set(
      [options?.projectSlug, options?.previousProjectSlug].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
    );
    for (const pSlug of projectSlugs) {
      revalidatePath(`/projects/${pSlug}`);
      revalidatePath(`/projects/${pSlug}/rent`);
    }

    const locationSlugs = new Set(
      [options?.locationSlug, options?.previousLocationSlug].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
    );
    if (locationSlugs.size > 0) {
      revalidatePath('/locations');
      for (const lSlug of locationSlugs) {
        revalidatePath(`/locations/${lSlug}`);
      }
    }
  } catch {
    // Safe fallback when invoked outside a Next.js request context (e.g. unit tests)
  }
}

export interface RevalidateDeveloperOptions {
  slug?: string | null;
  previousSlug?: string | null;
}

export function revalidateDeveloperPaths(options?: RevalidateDeveloperOptions) {
  try {
    revalidatePath('/developers');
    revalidatePath('/sitemap.xml');
    if (options?.slug) {
      revalidatePath(`/developers/${options.slug}`);
    }
    if (options?.previousSlug && options.previousSlug !== options.slug) {
      revalidatePath(`/developers/${options.previousSlug}`);
    }
  } catch {
    // Safe fallback when invoked outside a Next.js request context (e.g. unit tests)
  }
}

export interface RevalidateProjectDeveloperOptions {
  projectId?: string | null;
  projectSlug?: string | null;
  previousProjectSlug?: string | null;
  developerId?: string | null;
  previousDeveloperId?: string | null;
  developerSlug?: string | null;
  previousDeveloperSlug?: string | null;
  locationId?: string | null;
  previousLocationId?: string | null;
  locationSlug?: string | null;
  previousLocationSlug?: string | null;
}

export async function revalidateProjectAndDeveloperPaths(options: RevalidateProjectDeveloperOptions) {
  try {
    const { projectRepository } = await import('@/src/infrastructure/repositories/projectProvider');
    const { developerRepository } = await import('@/src/infrastructure/repositories/developerProvider');
    const { locationRepository } = await import('@/src/infrastructure/repositories/locationProvider');

    const projectSlugs = new Set<string>();
    const developerIds = new Set<string>();
    const developerSlugs = new Set<string>();
    const locationIds = new Set<string>();
    const locationSlugs = new Set<string>();

    if (options.projectSlug) projectSlugs.add(options.projectSlug);
    if (options.previousProjectSlug) projectSlugs.add(options.previousProjectSlug);
    if (options.developerId) developerIds.add(options.developerId);
    if (options.previousDeveloperId) developerIds.add(options.previousDeveloperId);
    if (options.developerSlug) developerSlugs.add(options.developerSlug);
    if (options.previousDeveloperSlug) developerSlugs.add(options.previousDeveloperSlug);
    if (options.locationId) locationIds.add(options.locationId);
    if (options.previousLocationId) locationIds.add(options.previousLocationId);
    if (options.locationSlug) locationSlugs.add(options.locationSlug);
    if (options.previousLocationSlug) locationSlugs.add(options.previousLocationSlug);

    if (options.projectId && (projectSlugs.size === 0 || developerIds.size === 0 || locationIds.size === 0)) {
      const proj = await projectRepository.findById(options.projectId);
      if (proj) {
        if (proj.slug) projectSlugs.add(proj.slug);
        if (proj.developerId) developerIds.add(proj.developerId);
        if (proj.locationId) locationIds.add(proj.locationId);
      }
    }

    for (const devId of developerIds) {
      const dev = await developerRepository.findById(devId);
      if (dev?.slug) developerSlugs.add(dev.slug);
    }

    for (const locId of locationIds) {
      const loc = await locationRepository.findById(locId);
      if (loc?.slug) locationSlugs.add(loc.slug);
    }

    revalidatePath('/');
    revalidatePath('/projects');
    revalidatePath('/developers');
    revalidatePath('/locations');
    revalidatePath('/sitemap.xml');

    for (const pSlug of projectSlugs) {
      revalidatePath(`/projects/${pSlug}`);
      revalidatePath(`/projects/${pSlug}/resale`);
      revalidatePath(`/projects/${pSlug}/rent`);
    }

    for (const dSlug of developerSlugs) {
      revalidatePath(`/developers/${dSlug}`);
    }

    for (const lSlug of locationSlugs) {
      revalidatePath(`/locations/${lSlug}`);
    }
  } catch {
    // Safe fallback when invoked outside a Next.js request context
  }
}


