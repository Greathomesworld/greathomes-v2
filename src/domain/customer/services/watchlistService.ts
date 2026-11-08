import {
  projectWatchRepository,
  locationWatchRepository,
  savedItemRepository,
} from '../repositories/index.ts';
import { projectRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory.ts';
import { locationRepository } from '../../../infrastructure/repositories/memory/locationRepositoryMemory.ts';
import { ProjectWatch, LocationWatch, ProjectWatchDto, LocationWatchDto, SavedItemSummary } from '../entities.ts';
import { getDb } from '../../../db/client.ts';
import { eq } from 'drizzle-orm';
import { locations } from '../../../db/schema.ts';

export class WatchlistService {
  async watchProject(customerId: string, projectId: string, enabled = true): Promise<ProjectWatch> {
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const existing = await projectWatchRepository.findByCustomerAndProject(customerId, projectId);
    if (existing) {
      if (existing.enabled === enabled) return existing;
      const updated = await projectWatchRepository.update(existing.id, customerId, { enabled });
      if (!updated) throw new Error('Failed to update project watch');
      return updated;
    }

    return await projectWatchRepository.create({
      customerId,
      projectId,
      enabled,
    });
  }

  async unwatchProject(customerId: string, projectId: string): Promise<boolean> {
    const existing = await projectWatchRepository.findByCustomerAndProject(customerId, projectId);
    if (!existing) return false;
    return await projectWatchRepository.delete(existing.id, customerId);
  }

  async watchLocation(customerId: string, locationId: string, enabled = true): Promise<LocationWatch> {
    // Check if valid published location
    const db = getDb();
    if (db) {
      const [loc] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
      if (!loc || loc.status !== 'PUBLISHED') {
        throw new Error('Location not found or not published');
      }
    } else {
      const loc = await locationRepository.findById(locationId);
      if (!loc || ((loc as any).status && (loc as any).status !== 'PUBLISHED')) {
        throw new Error('Location not found or not published');
      }
    }

    const existing = await locationWatchRepository.findByCustomerAndLocation(customerId, locationId);
    if (existing) {
      if (existing.enabled === enabled) return existing;
      const updated = await locationWatchRepository.update(existing.id, customerId, { enabled });
      if (!updated) throw new Error('Failed to update location watch');
      return updated;
    }

    return await locationWatchRepository.create({
      customerId,
      locationId,
      enabled,
    });
  }

  async unwatchLocation(customerId: string, locationId: string): Promise<boolean> {
    const existing = await locationWatchRepository.findByCustomerAndLocation(customerId, locationId);
    if (!existing) return false;
    return await locationWatchRepository.delete(existing.id, customerId);
  }

  async checkProjectWatch(customerId: string, projectId: string): Promise<boolean> {
    return await projectWatchRepository.isWatched(customerId, projectId);
  }

  async checkLocationWatch(customerId: string, locationId: string): Promise<boolean> {
    return await locationWatchRepository.isWatched(customerId, locationId);
  }

  async getProjectWatchlist(customerId: string): Promise<ProjectWatchDto[]> {
    const watches = await projectWatchRepository.listByCustomer(customerId);
    const activeWatches = watches.filter(w => w.enabled);

    const watchlistDtos: ProjectWatchDto[] = [];
    for (const w of activeWatches) {
      try {
        const project = await projectRepository.findById(w.projectId);
        let summary: SavedItemSummary | undefined;
        
        if (project) {
          summary = {
            id: project.id,
            title: project.name,
            slug: project.slug,
            url: `/projects/${project.slug}`,
            priceDisplay: project.startingPrice ? `Starting from ₹${(Number(project.startingPrice) / 100000).toFixed(1)} Lakh` : 'Price on request',
            isAvailable: project.lifecycleStatus === 'PUBLISHED',
            stageOrStatus: project.status,
          };
        } else {
          summary = {
            id: w.projectId,
            title: 'Project no longer available',
            slug: '',
            url: '#',
            isAvailable: false,
            unavailableReason: 'PROJECT_UNAVAILABLE',
          };
        }

        watchlistDtos.push({
          id: w.id,
          projectId: w.projectId,
          enabled: w.enabled,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
          project: summary,
        });
      } catch {
        // Fallback for failed enrichment
        watchlistDtos.push({
          id: w.id,
          projectId: w.projectId,
          enabled: w.enabled,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
          project: {
            id: w.projectId,
            title: 'Project no longer available',
            slug: '',
            url: '#',
            isAvailable: false,
          }
        });
      }
    }
    return watchlistDtos;
  }

  async getLocationWatchlist(customerId: string): Promise<LocationWatchDto[]> {
    const watches = await locationWatchRepository.listByCustomer(customerId);
    const activeWatches = watches.filter(w => w.enabled);

    const watchlistDtos: LocationWatchDto[] = [];
    const db = getDb();
    
    for (const w of activeWatches) {
      let locationName = 'Unknown Location';
      let locationSlug = '';
      let locationType = '';
      
      if (db) {
        const [loc] = await db.select().from(locations).where(eq(locations.id, w.locationId)).limit(1);
        if (loc) {
          locationName = loc.name;
          locationSlug = loc.slug;
          locationType = loc.type;
        }
      } else {
        const loc = await locationRepository.findById(w.locationId);
        if (loc) {
          locationName = loc.name;
          locationSlug = loc.slug;
          locationType = (loc as any).type || 'LOCALITY';
        }
      }

      watchlistDtos.push({
        id: w.id,
        locationId: w.locationId,
        enabled: w.enabled,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
        locationName,
        locationSlug,
        locationType,
      });
    }
    return watchlistDtos;
  }
}

export const watchlistService = new WatchlistService();
