import { revalidatePath } from 'next/cache';
import type { Location } from '@/src/domain/locations/entities';

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
  } catch (err) {
    console.warn('[CacheInvalidation] revalidateResalePaths skipped or non-request context:', err);
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
  } catch (err) {
    console.warn('[CacheInvalidation] revalidateRentalPaths skipped or non-request context:', err);
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
  } catch (err) {
    console.warn('[CacheInvalidation] revalidateDeveloperPaths skipped or non-request context:', err);
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
  bedroomCounts?: number[];
}

/**
 * Authoritative cache invalidation lifecycle for Project mutation & publishing.
 * Invalidates project detail, inventory subpages, parent locations, corridors,
 * developer profiles, affected BHK landing pages, discovery hubs, and sitemap.
 * Executes post-commit with structured logging and non-throwing failure isolation.
 */
export async function revalidateProjectLifecyclePaths(options: RevalidateProjectDeveloperOptions) {
  const revalidatedPaths: string[] = [];

  try {
    const { projectRepository } = await import('@/src/infrastructure/repositories/projectProvider');
    const { developerRepository } = await import('@/src/infrastructure/repositories/developerProvider');
    const { locationRepository } = await import('@/src/infrastructure/repositories/locationProvider');

    const projectSlugs = new Set<string>();
    const developerIds = new Set<string>();
    const developerSlugs = new Set<string>();
    const locationIds = new Set<string>();
    const locationSlugs = new Set<string>();
    const bedroomCounts = new Set<number>(options.bedroomCounts || []);

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

    // If projectId provided, resolve project record to get developer, location, configs
    if (options.projectId) {
      try {
        const proj = await projectRepository.findById(options.projectId);
        if (proj) {
          if (proj.slug) projectSlugs.add(proj.slug);
          if (proj.developerId) developerIds.add(proj.developerId);
          if (proj.locationId) locationIds.add(proj.locationId);
        }
      } catch (err) {
        console.warn(`[CacheInvalidation] Failed to resolve project ${options.projectId}:`, err);
      }
    }

    // Resolve developer slugs
    for (const devId of developerIds) {
      try {
        const dev = await developerRepository.findById(devId);
        if (dev?.slug) developerSlugs.add(dev.slug);
      } catch (err) {
        console.warn(`[CacheInvalidation] Failed to resolve developer ${devId}:`, err);
      }
    }

    // Resolve location slugs and traverse parent corridor chains
    const allLocations: Location[] = await locationRepository.findAll().catch((): Location[] => []);
    const locMap = new Map<string, Location>();
    for (const l of allLocations) {
      if (l.id) locMap.set(l.id, l);
    }

    for (const locId of locationIds) {
      let cur: Location | undefined = locMap.get(locId);
      const visited = new Set<string>();
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        if (cur.slug) locationSlugs.add(cur.slug);
        cur = cur.parentId ? locMap.get(cur.parentId) : undefined;
      }
    }

    // Global discovery & navigation hubs
    const staticHubs = ['/', '/projects', '/buy', '/rent', '/developers', '/locations', '/sitemap.xml'];
    for (const hub of staticHubs) {
      revalidatePath(hub);
      revalidatedPaths.push(hub);
    }

    // Project detail and inventory pages
    for (const pSlug of projectSlugs) {
      const paths = [`/projects/${pSlug}`, `/projects/${pSlug}/resale`, `/projects/${pSlug}/rent`];
      for (const p of paths) {
        revalidatePath(p);
        revalidatedPaths.push(p);
      }
    }

    // Developer profiles
    for (const dSlug of developerSlugs) {
      const p = `/developers/${dSlug}`;
      revalidatePath(p);
      revalidatedPaths.push(p);
    }

    // Location corridor pages
    for (const lSlug of locationSlugs) {
      const p = `/locations/${lSlug}`;
      revalidatePath(p);
      revalidatedPaths.push(p);
    }

    // Affected BHK landing pages (e.g. 2, 3, 4, 5 BHK in affected locations and Kolkata)
    const effectiveBhkCounts = bedroomCounts.size > 0 ? Array.from(bedroomCounts) : [2, 3, 4, 5];
    const candidateLocalities = new Set(['kolkata', ...Array.from(locationSlugs)]);
    for (const bhk of effectiveBhkCounts) {
      for (const loc of candidateLocalities) {
        const bhkPath = `/buy/${bhk}-bhk-flats-in-${loc}`;
        try {
          revalidatePath(bhkPath);
          revalidatedPaths.push(bhkPath);
        } catch {
          // ignore individual path revalidate error
        }
      }
    }

    console.info(`[CacheInvalidation] Successfully revalidated ${revalidatedPaths.length} paths post-commit:`, {
      timestamp: new Date().toISOString(),
      projectSlugs: Array.from(projectSlugs),
      developerSlugs: Array.from(developerSlugs),
      locationSlugs: Array.from(locationSlugs),
      totalPaths: revalidatedPaths.length,
    });
  } catch (err) {
    console.error('[CacheInvalidation] Non-fatal error during lifecycle cache invalidation:', err);
  }
}

export const revalidateProjectAndDeveloperPaths = revalidateProjectLifecyclePaths;
