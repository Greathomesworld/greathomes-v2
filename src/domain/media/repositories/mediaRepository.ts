import { MediaVariantSet } from '../services/mediaProcessingService';
import { getDb } from '@/src/db/client';
import {
  mediaAssets,
  projectConfigurations,
  projectMedia,
  developerMedia,
  resaleListingMedia,
  rentalListingMedia,
} from '@/src/db/schema';
import { eq, and, ilike, or, asc, sql, ne, inArray } from 'drizzle-orm';
import {
  isTestIsolationActive,
  readSandboxJson,
  writeSandboxJson,
  TEST_DB_FILE,
  TEST_ENTITY_MEDIA_FILE,
} from '@/src/lib/testIsolationContext';
import { normalizeMediaPublicUrl, normalizeMediaAssetUrls } from '@/src/lib/mediaUtils';

export interface MediaAsset {
  id: string;
  entityType: 'PROJECT' | 'DEVELOPER' | 'RESALE' | 'RENTAL' | 'GENERAL';
  entityId: string;
  filename: string;
  mimeType: string;
  category: string;
  mediaType: 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  width: number;
  height: number;
  fileSizeBytes: number;
  storageProvider: 'local' | 's3';
  storageKey: string;
  url: string;
  originalUrl: string;
  thumbnailUrl?: string;
  webpUrl?: string;
  avifUrl?: string;
  watermarkedUrl?: string;
  watermarkApplied: boolean;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  variants?: MediaVariantSet;
  createdAt: string;
  updatedAt: string;
}

export interface MediaFilter {
  entityType?: string;
  entityId?: string;
  category?: string;
  featuredOnly?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TestEntityMediaStore {
  projectMedia: any[];
  developerMedia: any[];
  resaleMedia: any[];
  rentalMedia: any[];
  configurations: any[];
}

export function getTestEntityMediaStore(): TestEntityMediaStore {
  return readSandboxJson<TestEntityMediaStore>(TEST_ENTITY_MEDIA_FILE, {
    projectMedia: [],
    developerMedia: [],
    resaleMedia: [],
    rentalMedia: [],
    configurations: [],
  });
}

export function saveTestEntityMediaStore(store: TestEntityMediaStore): void {
  writeSandboxJson(TEST_ENTITY_MEDIA_FILE, store);
}

// Global singleton in-memory store for fallback / non-Postgres environments
const globalForMedia = globalThis as unknown as {
  __ghMediaAssets?: Map<string, MediaAsset>;
};

if (!globalForMedia.__ghMediaAssets) {
  globalForMedia.__ghMediaAssets = new Map<string, MediaAsset>();
}

export function mapRowToMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAsset {
  const rawVariants = (row.variants as unknown as MediaVariantSet) || undefined;
  const normalizedVariants = rawVariants
    ? {
        ...rawVariants,
        original: normalizeMediaPublicUrl(rawVariants.original) || rawVariants.original,
        webp: normalizeMediaPublicUrl(rawVariants.webp) || rawVariants.webp,
        avif: rawVariants.avif
          ? normalizeMediaPublicUrl(rawVariants.avif) || rawVariants.avif
          : undefined,
        thumbnail: normalizeMediaPublicUrl(rawVariants.thumbnail) || rawVariants.thumbnail,
        watermarkedWebp: rawVariants.watermarkedWebp
          ? normalizeMediaPublicUrl(rawVariants.watermarkedWebp) || rawVariants.watermarkedWebp
          : undefined,
        publicUrl: normalizeMediaPublicUrl(rawVariants.publicUrl) || rawVariants.publicUrl,
      }
    : undefined;

  return {
    id: row.id,
    entityType: (row.entityType as MediaAsset['entityType']) || 'PROJECT',
    entityId: row.entityId,
    filename: row.filename,
    mimeType: row.mimeType,
    category: row.category,
    mediaType: (row.mediaType as MediaAsset['mediaType']) || 'IMAGE',
    width: row.width,
    height: row.height,
    fileSizeBytes: row.fileSizeBytes,
    storageProvider: (row.storageProvider as 'local' | 's3') || 'local',
    storageKey: row.storageKey,
    url: normalizeMediaPublicUrl(row.url) || row.url,
    originalUrl: normalizeMediaPublicUrl(row.originalUrl) || row.originalUrl,
    thumbnailUrl: row.thumbnailUrl
      ? normalizeMediaPublicUrl(row.thumbnailUrl) || row.thumbnailUrl
      : undefined,
    webpUrl: row.webpUrl ? normalizeMediaPublicUrl(row.webpUrl) || row.webpUrl : undefined,
    avifUrl: row.avifUrl ? normalizeMediaPublicUrl(row.avifUrl) || row.avifUrl : undefined,
    watermarkedUrl: row.watermarkedUrl
      ? normalizeMediaPublicUrl(row.watermarkedUrl) || row.watermarkedUrl
      : undefined,
    watermarkApplied: row.watermarkApplied,
    altText: row.altText,
    caption: row.caption,
    sortOrder: row.sortOrder,
    isFeatured: row.isFeatured,
    processingStatus: (row.processingStatus as MediaAsset['processingStatus']) || 'READY',
    variants: normalizedVariants,
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
  };
}

export const mapRowToAsset = mapRowToMediaAsset;


export class MediaRepository {
  private get store(): Map<string, MediaAsset> {
    if (isTestIsolationActive()) {
      const records = readSandboxJson<MediaAsset[]>(TEST_DB_FILE, []);
      return new Map(records.map((r) => [r.id, r]));
    }
    return globalForMedia.__ghMediaAssets!;
  }

  private persistTestStore(map: Map<string, MediaAsset>): void {
    if (isTestIsolationActive()) {
      writeSandboxJson(TEST_DB_FILE, Array.from(map.values()));
    }
  }

  private get db() {
    if (isTestIsolationActive()) return null;
    if (process.env.PERSISTENCE_PROVIDER === 'postgres' && process.env.DATABASE_URL) {
      return getDb();
    }
    return null;
  }

  async create(asset: MediaAsset): Promise<MediaAsset> {
    if (isTestIsolationActive()) {
      const map = this.store;
      map.set(asset.id, asset);
      this.persistTestStore(map);
      return asset;
    }

    const db = this.db;
    if (db) {
      try {
        const [inserted] = await db
          .insert(mediaAssets)
          .values({
            id: asset.id,
            entityType: asset.entityType,
            entityId: asset.entityId,
            filename: asset.filename,
            mimeType: asset.mimeType,
            category: asset.category,
            mediaType: asset.mediaType,
            width: asset.width,
            height: asset.height,
            fileSizeBytes: asset.fileSizeBytes,
            storageProvider: asset.storageProvider,
            storageKey: asset.storageKey,
            url: asset.url,
            originalUrl: asset.originalUrl,
            thumbnailUrl: asset.thumbnailUrl || null,
            webpUrl: asset.webpUrl || null,
            avifUrl: asset.avifUrl || null,
            watermarkedUrl: asset.watermarkedUrl || null,
            watermarkApplied: asset.watermarkApplied,
            altText: asset.altText || null,
            caption: asset.caption || null,
            sortOrder: asset.sortOrder,
            isFeatured: asset.isFeatured,
            processingStatus: asset.processingStatus,
            variants: asset.variants ? (asset.variants as unknown as Record<string, unknown>) : null,
            createdAt: asset.createdAt ? new Date(asset.createdAt) : new Date(),
            updatedAt: asset.updatedAt ? new Date(asset.updatedAt) : new Date(),
          } as any)
          .returning();

        const mapped = mapRowToMediaAsset(inserted);
        this.store.set(mapped.id, mapped);
        return mapped;
      } catch (err) {
        console.error('[MediaRepository] Postgres create error, falling back to memory:', err);
      }
    }

    this.store.set(asset.id, asset);
    return asset;
  }

  async findById(id: string): Promise<MediaAsset | null> {
    if (isTestIsolationActive()) {
      return this.store.get(id) || null;
    }

    const db = this.db;
    if (db) {
      try {
        const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
        if (row) {
          const mapped = mapRowToMediaAsset(row);
          this.store.set(mapped.id, mapped);
          return mapped;
        }
      } catch (err) {
        console.error('[MediaRepository] Postgres findById error:', err);
      }
    }
    const mem = this.store.get(id);
    return mem ? normalizeMediaAssetUrls(mem) : null;
  }

  async update(id: string, updates: Partial<MediaAsset>): Promise<MediaAsset | null> {
    if (isTestIsolationActive()) {
      const map = this.store;
      const existing = map.get(id);
      if (!existing) return null;
      const updated: MediaAsset = {
        ...existing,
        ...updates,
        id: existing.id,
        updatedAt: new Date().toISOString(),
      };
      map.set(id, updated);
      this.persistTestStore(map);
      return updated;
    }

    const db = this.db;
    if (db) {
      try {
        const existingInDb = await this.findById(id);
        if (!existingInDb) return null;

        const setPayload: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (updates.filename !== undefined) setPayload.filename = updates.filename;
        if (updates.mimeType !== undefined) setPayload.mimeType = updates.mimeType;
        if (updates.fileSizeBytes !== undefined) setPayload.fileSizeBytes = updates.fileSizeBytes;
        if (updates.storageProvider !== undefined) setPayload.storageProvider = updates.storageProvider;
        if (updates.storageKey !== undefined) setPayload.storageKey = updates.storageKey;
        if (updates.altText !== undefined) setPayload.altText = updates.altText;
        if (updates.caption !== undefined) setPayload.caption = updates.caption;
        if (updates.category !== undefined) setPayload.category = updates.category;
        if (updates.sortOrder !== undefined) setPayload.sortOrder = updates.sortOrder;
        if (updates.isFeatured !== undefined) setPayload.isFeatured = updates.isFeatured;
        if (updates.url !== undefined) setPayload.url = updates.url;
        if (updates.originalUrl !== undefined) setPayload.originalUrl = updates.originalUrl;
        if (updates.thumbnailUrl !== undefined) setPayload.thumbnailUrl = updates.thumbnailUrl || null;
        if (updates.webpUrl !== undefined) setPayload.webpUrl = updates.webpUrl || null;
        if (updates.avifUrl !== undefined) setPayload.avifUrl = updates.avifUrl || null;
        if (updates.watermarkedUrl !== undefined) setPayload.watermarkedUrl = updates.watermarkedUrl || null;
        if (updates.watermarkApplied !== undefined) setPayload.watermarkApplied = updates.watermarkApplied;
        if (updates.width !== undefined) setPayload.width = updates.width;
        if (updates.height !== undefined) setPayload.height = updates.height;
        if (updates.processingStatus !== undefined) setPayload.processingStatus = updates.processingStatus;
        if (updates.variants !== undefined) setPayload.variants = updates.variants;

        const [row] = await db
          .update(mediaAssets)
          .set(setPayload)
          .where(eq(mediaAssets.id, id))
          .returning();

        if (row) {
          const mapped = mapRowToMediaAsset(row);
          this.store.set(id, mapped);
          return mapped;
        }
      } catch (err) {
        console.error('[MediaRepository] Postgres update error:', err);
      }
    }

    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: MediaAsset = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (isTestIsolationActive()) {
      const map = this.store;
      const deleted = map.delete(id);
      this.persistTestStore(map);
      return deleted;
    }

    const db = this.db;
    if (db) {
      try {
        const deleted = await db
          .delete(mediaAssets)
          .where(eq(mediaAssets.id, id))
          .returning({ id: mediaAssets.id });
        this.store.delete(id);
        return deleted.length > 0;
      } catch (err) {
        console.error('[MediaRepository] Postgres delete error:', err);
      }
    }
    return this.store.delete(id);
  }

  async list(filter: MediaFilter = {}): Promise<{
    items: MediaAsset[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 50));

    if (!isTestIsolationActive()) {
      const db = this.db;
      if (db) {
        try {
          const conditions: any[] = [];
          if (filter.entityType && filter.entityType !== 'ALL') {
            conditions.push(eq(mediaAssets.entityType, filter.entityType.toUpperCase()));
          }
          if (filter.entityId) {
            conditions.push(eq(mediaAssets.entityId, filter.entityId));
          }
          if (filter.category && filter.category !== 'ALL') {
            conditions.push(eq(mediaAssets.category, filter.category.toUpperCase()));
          }
          if (filter.featuredOnly) {
            conditions.push(eq(mediaAssets.isFeatured, true));
          }
          if (filter.search && filter.search.trim()) {
            const q = `%${filter.search.trim()}%`;
            conditions.push(
              or(
                ilike(mediaAssets.filename, q),
                ilike(mediaAssets.caption, q),
                ilike(mediaAssets.altText, q),
                ilike(mediaAssets.category, q)
              )
            );
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
          const rows = await db
            .select()
            .from(mediaAssets)
            .where(whereClause)
            .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt));

          const mapped = rows.map(mapRowToMediaAsset);
          for (const m of mapped) {
            this.store.set(m.id, m);
          }

          const total = mapped.length;
          const start = (page - 1) * limit;
          return {
            items: mapped.slice(start, start + limit),
            total,
            page,
            limit,
          };
        } catch (err) {
          console.error('[MediaRepository] Postgres list error:', err);
        }
      }
    }

    let all = Array.from(this.store.values());

    if (filter.entityType && filter.entityType !== 'ALL') {
      all = all.filter((m) => m.entityType === filter.entityType?.toUpperCase());
    }

    if (filter.entityId) {
      all = all.filter((m) => m.entityId === filter.entityId);
    }

    if (filter.category && filter.category !== 'ALL') {
      all = all.filter((m) => m.category === filter.category?.toUpperCase());
    }

    if (filter.featuredOnly) {
      all = all.filter((m) => m.isFeatured);
    }

    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      all = all.filter(
        (m) =>
          m.filename.toLowerCase().includes(q) ||
          (m.caption && m.caption.toLowerCase().includes(q)) ||
          (m.altText && m.altText.toLowerCase().includes(q)) ||
          m.category.toLowerCase().includes(q)
      );
    }

    // Deterministic sort by sortOrder ASC, then createdAt DESC, then id ASC
    all.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const tDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (tDiff !== 0) return tDiff;
      return a.id.localeCompare(b.id);
    });

    const total = all.length;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit).map((item) => normalizeMediaAssetUrls(item));

    return { items, total, page, limit };
  }

  /**
   * Unsets isFeatured on all sibling assets for the same entity, and sets it on the target id.
   */
  async setFeatured(id: string, entityType: string, entityId: string): Promise<MediaAsset | null> {
    if (isTestIsolationActive()) {
      const map = this.store;
      const target = map.get(id);
      if (!target) return null;
      const now = new Date().toISOString();
      for (const [key, item] of map.entries()) {
        if (item.entityType === entityType && item.entityId === entityId) {
          map.set(key, {
            ...item,
            isFeatured: key === id,
            updatedAt: now,
          });
        }
      }
      this.persistTestStore(map);
      return map.get(id) || null;
    }

    const db = this.db;
    if (db) {
      try {
        const now = new Date();
        await db
          .update(mediaAssets)
          .set({ isFeatured: false, updatedAt: now } as any)
          .where(
            and(
              eq(mediaAssets.entityType, entityType),
              eq(mediaAssets.entityId, entityId)
            )
          );

        const [row] = await db
          .update(mediaAssets)
          .set({ isFeatured: true, updatedAt: now } as any)
          .where(eq(mediaAssets.id, id))
          .returning();

        if (row) {
          const mapped = mapRowToMediaAsset(row);
          for (const [key, item] of this.store.entries()) {
            if (item.entityType === entityType && item.entityId === entityId) {
              this.store.set(key, { ...item, isFeatured: key === id });
            }
          }
          this.store.set(id, mapped);
          return mapped;
        }
      } catch (err) {
        console.error('[MediaRepository] Postgres setFeatured error:', err);
      }
    }

    const target = this.store.get(id);
    if (!target) return null;

    const now = new Date().toISOString();
    for (const [key, item] of this.store.entries()) {
      if (item.entityType === entityType && item.entityId === entityId) {
        this.store.set(key, {
          ...item,
          isFeatured: key === id,
          updatedAt: now,
        });
      }
    }

    return this.store.get(id) || null;
  }

  /**
   * Batch updates sortOrder for a list of { id, sortOrder } pairs.
   */
  async reorder(items: { id: string; sortOrder: number }[]): Promise<void> {
    if (isTestIsolationActive()) {
      const map = this.store;
      const now = new Date().toISOString();
      for (const { id, sortOrder } of items) {
        const existing = map.get(id);
        if (existing && typeof sortOrder === 'number') {
          map.set(id, {
            ...existing,
            sortOrder,
            updatedAt: now,
          });
        }
      }
      this.persistTestStore(map);
      return;
    }

    const db = this.db;
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();

    if (db) {
      try {
        for (const { id, sortOrder } of items) {
          if (typeof sortOrder === 'number') {
            await db
              .update(mediaAssets)
              .set({ sortOrder, updatedAt: nowDate } as any)
              .where(eq(mediaAssets.id, id));
          }
        }
      } catch (err) {
        console.error('[MediaRepository] Postgres reorder error:', err);
      }
    }

    for (const { id, sortOrder } of items) {
      const existing = this.store.get(id);
      if (existing && typeof sortOrder === 'number') {
        this.store.set(id, {
          ...existing,
          sortOrder,
          updatedAt: nowIso,
        });
      }
    }
  }

  /**
   * Checks if a media asset is actively referenced by any configuration (e.g. floorPlanMediaId).
   */
  async checkReferenced(id: string): Promise<{ referenced: boolean; reason?: string }> {
    const asset = await this.findById(id);

    if (isTestIsolationActive()) {
      const entityStore = getTestEntityMediaStore();
      const matchedCfg = entityStore.configurations.find(
        (c) => c.floorPlanMediaId === id || (asset && c.floorPlanMediaId === asset.url)
      );
      if (matchedCfg) {
        return {
          referenced: true,
          reason: `Media asset is actively linked as a floor plan on configuration (${matchedCfg.id}). Unlink it before deleting.`,
        };
      }
      return { referenced: false };
    }

    const db = this.db;
    if (db) {
      try {
        const configs = await db
          .select()
          .from(projectConfigurations)
          .where(
            asset
              ? or(
                  eq(projectConfigurations.floorPlanMediaId, id),
                  eq(projectConfigurations.floorPlanMediaId, asset.url)
                )
              : eq(projectConfigurations.floorPlanMediaId, id)
          )
          .limit(1);

        if (configs.length > 0) {
          const cfg = configs[0] as any;
          return {
            referenced: true,
            reason: `Media asset is actively linked as a floor plan on project configuration (${cfg.name || cfg.unitType || cfg.configType} - ${cfg.id}). Unlink it before deleting.`,
          };
        }
      } catch (err) {
        console.error('[MediaRepository] Postgres checkReferenced error:', err);
      }
    }

    try {
      const { projectConfigurationRepository, projectRepository } = await import(
        '@/src/infrastructure/repositories/projectProvider'
      );
      const allProjects = await projectRepository.findAll();
      for (const proj of allProjects) {
        const configs = await projectConfigurationRepository.findByProjectId(proj.id);
        const match = configs.find(
          (c: any) =>
            c.floorPlanMediaId === id || (asset && c.floorPlanMediaId === asset.url)
        );
        if (match) {
          return {
            referenced: true,
            reason: `Media asset is actively linked as a floor plan on project '${proj.name}' configuration (${match.id}). Unlink it before deleting.`,
          };
        }
      }
    } catch {
      // Ignore if repository cannot be loaded in isolated unit test
    }

    return { referenced: false };
  }

  /**
   * Checks whether any other media_assets record shares the same storageKey or URL.
   * Ensures shared storage objects are never deleted while another asset still references them.
   */
  async isStorageObjectShared(
    asset: MediaAsset
  ): Promise<boolean> {
    if (!asset.storageKey && !asset.url) return false;

    if (isTestIsolationActive()) {
      for (const [otherId, other] of this.store.entries()) {
        if (otherId === asset.id) continue;
        if (
          (asset.storageKey && other.storageKey === asset.storageKey) ||
          (asset.url && other.url === asset.url)
        ) {
          return true;
        }
      }
      return false;
    }

    const db = this.db;
    if (db) {
      try {
        const rows = await db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(
            and(
              ne(mediaAssets.id, asset.id),
              or(
                eq(mediaAssets.storageKey, asset.storageKey),
                eq(mediaAssets.url, asset.url)
              )
            )
          )
          .limit(1);
        if (rows.length > 0) return true;
      } catch (err) {
        console.error('[MediaRepository] isStorageObjectShared error:', err);
      }
    }

    for (const [otherId, other] of this.store.entries()) {
      if (otherId === asset.id) continue;
      if (
        (asset.storageKey && other.storageKey === asset.storageKey) ||
        (asset.url && other.url === asset.url)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Removes entity-media linkages across project_media, developer_media, resale_listing_media,
   * and rental_listing_media when a media asset is deleted.
   */
  async removeEntityMediaReferences(asset: MediaAsset): Promise<{
    removedProjectMedia: number;
    removedDeveloperMedia: number;
    removedResaleMedia: number;
    removedRentalMedia: number;
  }> {
    const counts = {
      removedProjectMedia: 0,
      removedDeveloperMedia: 0,
      removedResaleMedia: 0,
      removedRentalMedia: 0,
    };

    const candidateUrls = Array.from(
      new Set(
        [
          asset.url,
          asset.originalUrl,
          asset.watermarkedUrl,
          asset.webpUrl,
          asset.thumbnailUrl,
        ].filter((u): u is string => Boolean(u))
      )
    );

    if (isTestIsolationActive()) {
      const entityStore = getTestEntityMediaStore();
      const beforeProj = entityStore.projectMedia.length;
      entityStore.projectMedia = entityStore.projectMedia.filter(
        (m) => m.mediaId !== asset.id && m.id !== asset.id && !candidateUrls.includes(m.url)
      );
      counts.removedProjectMedia = beforeProj - entityStore.projectMedia.length;

      const beforeDev = entityStore.developerMedia.length;
      entityStore.developerMedia = entityStore.developerMedia.filter(
        (m) => m.id !== asset.id && !candidateUrls.includes(m.url)
      );
      counts.removedDeveloperMedia = beforeDev - entityStore.developerMedia.length;

      const beforeResale = entityStore.resaleMedia.length;
      entityStore.resaleMedia = entityStore.resaleMedia.filter(
        (m) => m.id !== asset.id && !candidateUrls.includes(m.url)
      );
      counts.removedResaleMedia = beforeResale - entityStore.resaleMedia.length;

      const beforeRental = entityStore.rentalMedia.length;
      entityStore.rentalMedia = entityStore.rentalMedia.filter(
        (m) => m.id !== asset.id && !candidateUrls.includes(m.url)
      );
      counts.removedRentalMedia = beforeRental - entityStore.rentalMedia.length;

      saveTestEntityMediaStore(entityStore);
      return counts;
    }

    const db = this.db;
    if (db) {
      try {
        const delProj = await db
          .delete(projectMedia)
          .where(
            candidateUrls.length > 0
              ? or(
                  eq(projectMedia.mediaId, asset.id),
                  eq(projectMedia.id, asset.id),
                  inArray(projectMedia.url, candidateUrls)
                )
              : or(eq(projectMedia.mediaId, asset.id), eq(projectMedia.id, asset.id))
          )
          .returning({ id: projectMedia.id });
        counts.removedProjectMedia = delProj.length;

        if (candidateUrls.length > 0) {
          const delDev = await db
            .delete(developerMedia)
            .where(inArray(developerMedia.url, candidateUrls))
            .returning({ id: developerMedia.id });
          counts.removedDeveloperMedia = delDev.length;

          const delResale = await db
            .delete(resaleListingMedia)
            .where(inArray(resaleListingMedia.url, candidateUrls))
            .returning({ id: resaleListingMedia.id });
          counts.removedResaleMedia = delResale.length;

          const delRental = await db
            .delete(rentalListingMedia)
            .where(inArray(rentalListingMedia.url, candidateUrls))
            .returning({ id: rentalListingMedia.id });
          counts.removedRentalMedia = delRental.length;
        }
      } catch (err) {
        console.error('[MediaRepository] removeEntityMediaReferences error:', err);
      }
    }

    return counts;
  }

  /**
   * Propagates a replaced asset's new URL across all referencing rows in
   * project_media, developer_media, resale_listing_media, and rental_listing_media.
   */
  async propagateReplacedAssetUrl(
    assetId: string,
    oldUrls: string[],
    newUrl: string
  ): Promise<{
    updatedProjectMedia: number;
    updatedDeveloperMedia: number;
    updatedResaleMedia: number;
    updatedRentalMedia: number;
  }> {
    const counts = {
      updatedProjectMedia: 0,
      updatedDeveloperMedia: 0,
      updatedResaleMedia: 0,
      updatedRentalMedia: 0,
    };

    const validOldUrls = Array.from(new Set(oldUrls.filter(Boolean)));

    if (isTestIsolationActive()) {
      const entityStore = getTestEntityMediaStore();
      for (const m of entityStore.projectMedia) {
        if (m.mediaId === assetId || m.id === assetId || validOldUrls.includes(m.url)) {
          m.url = newUrl;
          counts.updatedProjectMedia++;
        }
      }
      for (const m of entityStore.developerMedia) {
        if (m.id === assetId || validOldUrls.includes(m.url)) {
          m.url = newUrl;
          counts.updatedDeveloperMedia++;
        }
      }
      for (const m of entityStore.resaleMedia) {
        if (m.id === assetId || validOldUrls.includes(m.url)) {
          m.url = newUrl;
          counts.updatedResaleMedia++;
        }
      }
      for (const m of entityStore.rentalMedia) {
        if (m.id === assetId || validOldUrls.includes(m.url)) {
          m.url = newUrl;
          counts.updatedRentalMedia++;
        }
      }
      saveTestEntityMediaStore(entityStore);
      return counts;
    }

    const db = this.db;
    if (db) {
      try {
        const now = new Date();
        const updProj = await db
          .update(projectMedia)
          .set({ url: newUrl, updatedAt: now } as any)
          .where(
            validOldUrls.length > 0
              ? or(
                  eq(projectMedia.mediaId, assetId),
                  eq(projectMedia.id, assetId),
                  inArray(projectMedia.url, validOldUrls)
                )
              : or(eq(projectMedia.mediaId, assetId), eq(projectMedia.id, assetId))
          )
          .returning({ id: projectMedia.id });
        counts.updatedProjectMedia = updProj.length;

        if (validOldUrls.length > 0) {
          const updDev = await db
            .update(developerMedia)
            .set({ url: newUrl, updatedAt: now } as any)
            .where(inArray(developerMedia.url, validOldUrls))
            .returning({ id: developerMedia.id });
          counts.updatedDeveloperMedia = updDev.length;

          const updResale = await db
            .update(resaleListingMedia)
            .set({ url: newUrl, updatedAt: now } as any)
            .where(inArray(resaleListingMedia.url, validOldUrls))
            .returning({ id: resaleListingMedia.id });
          counts.updatedResaleMedia = updResale.length;

          const updRental = await db
            .update(rentalListingMedia)
            .set({ url: newUrl, updatedAt: now } as any)
            .where(inArray(rentalListingMedia.url, validOldUrls))
            .returning({ id: rentalListingMedia.id });
          counts.updatedRentalMedia = updRental.length;
        }
      } catch (err) {
        console.error('[MediaRepository] propagateReplacedAssetUrl error:', err);
      }
    }

    return counts;
  }
}

export const mediaRepository = new MediaRepository();
