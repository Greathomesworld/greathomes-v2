import { eq, and, sql, inArray, desc, asc } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { resaleListings, resaleListingMedia, resaleListingAmenities, amenities } from '@/src/db/schema';
import {
  ResaleListing,
  ResaleListingMedia,
} from '@/src/domain/projects/entities/resaleEntities';
import { Amenity } from '@/src/domain/projects/entities';
import {
  ResaleListingRepository,
  ResaleFilterOptions,
  ProjectResaleInventoryFacets,
} from '@/src/domain/projects/repositories/resaleRepository';

export class ResaleListingRepositoryPostgres implements ResaleListingRepository {
  async findById(id: string): Promise<ResaleListing | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(resaleListings).where(eq(resaleListings.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findBySlug(slug: string): Promise<ResaleListing | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(resaleListings)
      .where(sql`LOWER(${resaleListings.slug}) = LOWER(${slug})`);
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findBySlugOrId(identifier: string): Promise<ResaleListing | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const byId = await this.findById(trimmed);
    if (byId) return byId;
    return this.findBySlug(trimmed);
  }

  async findByProjectId(projectId: string): Promise<ResaleListing[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(resaleListings).where(eq(resaleListings.projectId, projectId));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findPublishedByProjectId(projectId: string): Promise<ResaleListing[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(resaleListings)
      .where(and(eq(resaleListings.projectId, projectId), eq(resaleListings.lifecycleStatus, 'PUBLISHED')));
    return rows.map(r => this.mapRowToEntity(r));
  }

  private buildWhereConditions(filter?: ResaleFilterOptions) {
    const conditions = [];
    if (filter?.projectId) conditions.push(eq(resaleListings.projectId, filter.projectId));
    if (filter?.propertyType) conditions.push(eq(resaleListings.propertyType, filter.propertyType));
    if (filter?.lifecycleStatus) conditions.push(eq(resaleListings.lifecycleStatus, filter.lifecycleStatus));
    if (filter?.verificationStatus) conditions.push(eq(resaleListings.verificationStatus, filter.verificationStatus));
    if (filter?.listingPartyType) conditions.push(eq(resaleListings.listingPartyType, filter.listingPartyType));
    if (filter?.bedroomCount !== undefined) conditions.push(eq(resaleListings.bedroomCount, filter.bedroomCount));
    if (filter?.furnishing) conditions.push(eq(resaleListings.furnishing, filter.furnishing));
    if (filter?.floorCategory) conditions.push(eq(resaleListings.floorCategory, filter.floorCategory));
    if (filter?.facing) conditions.push(eq(resaleListings.facing, filter.facing));
    if (filter?.possession) {
      if (filter.possession === 'READY') {
        conditions.push(inArray(resaleListings.possession, ['READY', 'READY_TO_MOVE']));
      } else {
        conditions.push(eq(resaleListings.possession, filter.possession));
      }
    }
    if (filter?.minPrice !== undefined) {
      conditions.push(sql`${resaleListings.askingPrice} >= ${filter.minPrice.toString()}`);
    }
    if (filter?.maxPrice !== undefined) {
      conditions.push(sql`${resaleListings.askingPrice} <= ${filter.maxPrice.toString()}`);
    }
    if (filter?.onlyEligiblePublic) {
      conditions.push(eq(resaleListings.lifecycleStatus, 'PUBLISHED'));
      conditions.push(sql`${resaleListings.askingPrice} > 0`);
      conditions.push(
        sql`(${resaleListings.bedroomCount} > 0 OR LENGTH(TRIM(COALESCE(${resaleListings.configuration}, ''))) > 0)`
      );
    }
    return conditions;
  }

  async findAll(filter?: ResaleFilterOptions): Promise<ResaleListing[]> {
    const db = getDb();
    if (!db) return [];

    const conditions = this.buildWhereConditions(filter);
    const sortBy = filter?.sortBy || 'newest';

    let orderClause = sql`${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    if (sortBy === 'price_asc') {
      orderClause = sql`${resaleListings.askingPrice} ASC, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    } else if (sortBy === 'price_desc') {
      orderClause = sql`${resaleListings.askingPrice} DESC, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    } else if (sortBy === 'area_desc') {
      orderClause = sql`${resaleListings.carpetArea} DESC NULLS LAST, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    }

    let query: any = conditions.length > 0
      ? db.select().from(resaleListings).where(and(...conditions)).orderBy(orderClause)
      : db.select().from(resaleListings).orderBy(orderClause);

    if (filter?.limit !== undefined && filter.limit >= 0) {
      query = query.limit(filter.limit);
    }
    if (filter?.offset !== undefined && filter.offset > 0) {
      query = query.offset(filter.offset);
    }

    const rows = await query;
    return rows.map((r: any) => this.mapRowToEntity(r));
  }

  async countAndFacetsForProject(projectId: string, filter?: ResaleFilterOptions): Promise<ProjectResaleInventoryFacets> {
    const db = getDb();
    if (!db) {
      return {
        totalEligibleCount: 0,
        filteredCount: 0,
        verifiedCount: 0,
        availableBhkCounts: [],
        availableFurnishings: [],
        availableFloorCategories: [],
        availablePossessions: [],
        minPrice: null,
        maxPrice: null,
      };
    }

    const baseConditions = this.buildWhereConditions({
      projectId,
      lifecycleStatus: 'PUBLISHED',
      onlyEligiblePublic: true,
    });

    const baseRows = await db
      .select({
        bedroomCount: resaleListings.bedroomCount,
        askingPrice: resaleListings.askingPrice,
        verificationStatus: resaleListings.verificationStatus,
        furnishing: resaleListings.furnishing,
        floorCategory: resaleListings.floorCategory,
        possession: resaleListings.possession,
      })
      .from(resaleListings)
      .where(and(...baseConditions));

    const totalEligibleCount = baseRows.length;
    let verifiedCount = 0;
    const bhkSet = new Set<number>();
    const furnishSet = new Set<string>();
    const floorSet = new Set<string>();
    const possessionSet = new Set<string>();
    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    for (const r of baseRows) {
      if (r.verificationStatus === 'VERIFIED') verifiedCount++;
      if (typeof r.bedroomCount === 'number' && r.bedroomCount > 0) {
        bhkSet.add(r.bedroomCount);
      }
      if (r.furnishing) furnishSet.add(r.furnishing);
      if (r.floorCategory) floorSet.add(r.floorCategory);
      if (r.possession) {
        possessionSet.add(r.possession === 'READY_TO_MOVE' ? 'READY' : r.possession);
      }
      const price = Number(r.askingPrice);
      if (Number.isFinite(price) && price > 0) {
        if (minPrice === null || price < minPrice) minPrice = price;
        if (maxPrice === null || price > maxPrice) maxPrice = price;
      }
    }

    const availableBhkCounts = Array.from(bhkSet).sort((a, b) => a - b);

    const filteredConditions = this.buildWhereConditions({
      ...filter,
      projectId,
      lifecycleStatus: 'PUBLISHED',
      onlyEligiblePublic: true,
    });

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resaleListings)
      .where(and(...filteredConditions));

    return {
      totalEligibleCount,
      filteredCount: countRow ? Number(countRow.count) : 0,
      verifiedCount,
      availableBhkCounts,
      availableFurnishings: Array.from(furnishSet),
      availableFloorCategories: Array.from(floorSet),
      availablePossessions: Array.from(possessionSet),
      minPrice,
      maxPrice,
    };
  }

  async create(data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListing> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = `resale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const [row] = await db
      .insert(resaleListings)
      .values({
        id,
        slug: data.slug,
        projectId: data.projectId,
        locationId: data.locationId,
        latitude: data.latitude ? data.latitude.toString() : null,
        longitude: data.longitude ? data.longitude.toString() : null,
        geometry: data.geometry,
        propertyType: data.propertyType,
        configuration: data.configuration,
        bedroomCount: data.bedroomCount,
        carpetArea: data.carpetArea ? data.carpetArea.toString() : null,
        builtUpArea: data.builtUpArea ? data.builtUpArea.toString() : null,
        superBuiltUpArea: data.superBuiltUpArea ? data.superBuiltUpArea.toString() : null,
        askingPrice: data.askingPrice.toString(),
        furnishing: data.furnishing,
        facing: data.facing,
        floorCategory: data.floorCategory,
        possession: data.possession,
        possessionDate: data.possessionDate,
        description: data.description,
        listingPartyType: data.listingPartyType,
        listingPartyDisplayName: data.listingPartyDisplayName,
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone,
        ownerEmail: data.ownerEmail,
        brokerName: data.brokerName,
        brokerPhone: data.brokerPhone,
        brokerEmail: data.brokerEmail,
        privatePhone: data.privatePhone,
        privateEmail: data.privateEmail,
        internalNotes: data.internalNotes,
        source: data.source,
        crmId: data.crmId,
        lifecycleStatus: data.lifecycleStatus,
        verificationStatus: data.verificationStatus,
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, data: Partial<ResaleListing>): Promise<ResaleListing> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.slug !== undefined) updatePayload.slug = data.slug;
    if (data.projectId !== undefined) updatePayload.projectId = data.projectId;
    if (data.locationId !== undefined) updatePayload.locationId = data.locationId;
    if (data.latitude !== undefined) updatePayload.latitude = data.latitude ? data.latitude.toString() : null;
    if (data.longitude !== undefined) updatePayload.longitude = data.longitude ? data.longitude.toString() : null;
    if (data.geometry !== undefined) updatePayload.geometry = data.geometry;
    if (data.propertyType !== undefined) updatePayload.propertyType = data.propertyType;
    if (data.configuration !== undefined) updatePayload.configuration = data.configuration;
    if (data.bedroomCount !== undefined) updatePayload.bedroomCount = data.bedroomCount;
    if (data.carpetArea !== undefined) updatePayload.carpetArea = data.carpetArea ? data.carpetArea.toString() : null;
    if (data.builtUpArea !== undefined) updatePayload.builtUpArea = data.builtUpArea ? data.builtUpArea.toString() : null;
    if (data.superBuiltUpArea !== undefined) updatePayload.superBuiltUpArea = data.superBuiltUpArea ? data.superBuiltUpArea.toString() : null;
    if (data.askingPrice !== undefined) updatePayload.askingPrice = data.askingPrice.toString();
    if (data.furnishing !== undefined) updatePayload.furnishing = data.furnishing;
    if (data.facing !== undefined) updatePayload.facing = data.facing;
    if (data.floorCategory !== undefined) updatePayload.floorCategory = data.floorCategory;
    if (data.possession !== undefined) updatePayload.possession = data.possession;
    if (data.possessionDate !== undefined) updatePayload.possessionDate = data.possessionDate;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.listingPartyType !== undefined) updatePayload.listingPartyType = data.listingPartyType;
    if (data.listingPartyDisplayName !== undefined) updatePayload.listingPartyDisplayName = data.listingPartyDisplayName;
    if (data.ownerName !== undefined) updatePayload.ownerName = data.ownerName;
    if (data.ownerPhone !== undefined) updatePayload.ownerPhone = data.ownerPhone;
    if (data.ownerEmail !== undefined) updatePayload.ownerEmail = data.ownerEmail;
    if (data.brokerName !== undefined) updatePayload.brokerName = data.brokerName;
    if (data.brokerPhone !== undefined) updatePayload.brokerPhone = data.brokerPhone;
    if (data.brokerEmail !== undefined) updatePayload.brokerEmail = data.brokerEmail;
    if (data.privatePhone !== undefined) updatePayload.privatePhone = data.privatePhone;
    if (data.privateEmail !== undefined) updatePayload.privateEmail = data.privateEmail;
    if (data.internalNotes !== undefined) updatePayload.internalNotes = data.internalNotes;
    if (data.source !== undefined) updatePayload.source = data.source;
    if (data.crmId !== undefined) updatePayload.crmId = data.crmId;
    if (data.lifecycleStatus !== undefined) updatePayload.lifecycleStatus = data.lifecycleStatus;
    if (data.verificationStatus !== undefined) updatePayload.verificationStatus = data.verificationStatus;
    if (data.verifiedAt !== undefined) updatePayload.verifiedAt = data.verifiedAt;
    if (data.verifiedBy !== undefined) updatePayload.verifiedBy = data.verifiedBy;

    const [row] = await db
      .update(resaleListings)
      .set(updatePayload)
      .where(eq(resaleListings.id, id))
      .returning();

    if (!row) throw new Error(`Resale listing ${id} not found.`);
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    await db.delete(resaleListingMedia).where(eq(resaleListingMedia.resaleListingId, id));
    await db.delete(resaleListingAmenities).where(eq(resaleListingAmenities.resaleListingId, id));
    const res = await db.delete(resaleListings).where(eq(resaleListings.id, id)).returning();
    return res.length > 0;
  }

  async findMediaByListingId(listingId: string): Promise<ResaleListingMedia[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(resaleListingMedia).where(eq(resaleListingMedia.resaleListingId, listingId));
    return rows
      .map(r => ({
        id: r.id,
        resaleListingId: r.resaleListingId,
        mediaType: r.mediaType,
        category: r.category as any,
        url: r.url,
        altText: r.altText ?? undefined,
        caption: r.caption ?? undefined,
        sortOrder: r.sortOrder,
        isFeatured: r.isFeatured,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findMediaByListingIds(listingIds: string[]): Promise<ResaleListingMedia[]> {
    const validIds = Array.from(new Set(listingIds.filter(Boolean)));
    if (validIds.length === 0) return [];
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(resaleListingMedia)
      .where(inArray(resaleListingMedia.resaleListingId, validIds));
    return rows
      .map(r => ({
        id: r.id,
        resaleListingId: r.resaleListingId,
        mediaType: r.mediaType,
        category: r.category as any,
        url: r.url,
        altText: r.altText ?? undefined,
        caption: r.caption ?? undefined,
        sortOrder: r.sortOrder,
        isFeatured: r.isFeatured,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async addMedia(data: Omit<ResaleListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListingMedia> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = `rmedia_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const [row] = await db
      .insert(resaleListingMedia)
      .values({
        id,
        resaleListingId: data.resaleListingId,
        mediaType: data.mediaType,
        category: data.category,
        url: data.url,
        altText: data.altText,
        caption: data.caption,
        sortOrder: data.sortOrder ?? 0,
        isFeatured: data.isFeatured ?? false,
      } as any)
      .returning();

    return {
      id: row.id,
      resaleListingId: row.resaleListingId,
      mediaType: row.mediaType,
      category: row.category as any,
      url: row.url,
      altText: row.altText ?? undefined,
      caption: row.caption ?? undefined,
      sortOrder: row.sortOrder,
      isFeatured: row.isFeatured,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    const res = await db.delete(resaleListingMedia).where(eq(resaleListingMedia.id, mediaId)).returning();
    return res.length > 0;
  }

  async updateMedia(mediaId: string, data: Partial<ResaleListingMedia>): Promise<ResaleListingMedia | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    if (data.isFeatured === true) {
      const existingRows = await db
        .select()
        .from(resaleListingMedia)
        .where(eq(resaleListingMedia.id, mediaId));
      const parentListingId = existingRows[0]?.resaleListingId;
      if (parentListingId) {
        await db
          .update(resaleListingMedia)
          .set({ isFeatured: false, updatedAt: new Date() } as any)
          .where(eq(resaleListingMedia.resaleListingId, parentListingId));
      }
    }

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.url !== undefined) updatePayload.url = data.url;
    if (data.altText !== undefined) updatePayload.altText = data.altText;
    if (data.caption !== undefined) updatePayload.caption = data.caption;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
    if (data.isFeatured !== undefined) updatePayload.isFeatured = data.isFeatured;

    const [row] = await db
      .update(resaleListingMedia)
      .set(updatePayload)
      .where(eq(resaleListingMedia.id, mediaId))
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      resaleListingId: row.resaleListingId,
      mediaType: row.mediaType,
      category: row.category as any,
      url: row.url,
      altText: row.altText ?? undefined,
      caption: row.caption ?? undefined,
      sortOrder: row.sortOrder,
      isFeatured: row.isFeatured,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    const db = getDb();
    if (!db) return [];

    const links = await db.select().from(resaleListingAmenities).where(eq(resaleListingAmenities.resaleListingId, listingId));
    if (links.length === 0) return [];

    const amenityIds = links.map(l => l.amenityId);
    const rows = await db.select().from(amenities).where(inArray(amenities.id, amenityIds));
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      category: r.category as any,
      icon: r.icon ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async associateAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await db
      .select()
      .from(resaleListingAmenities)
      .where(and(eq(resaleListingAmenities.resaleListingId, resaleListingId), eq(resaleListingAmenities.amenityId, amenityId)));

    if (existing.length === 0) {
      await db.insert(resaleListingAmenities).values({
        id: `lam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        resaleListingId,
        amenityId,
      });
    }
  }

  async removeAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db
      .delete(resaleListingAmenities)
      .where(and(eq(resaleListingAmenities.resaleListingId, resaleListingId), eq(resaleListingAmenities.amenityId, amenityId)));
  }

  private mapRowToEntity(row: any): ResaleListing {
    return {
      id: row.id,
      slug: row.slug ?? undefined,
      projectId: row.projectId ?? undefined,
      locationId: row.locationId ?? undefined,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      geometry: row.geometry ?? undefined,
      propertyType: row.propertyType,
      configuration: row.configuration,
      bedroomCount: row.bedroomCount,
      carpetArea: row.carpetArea ? parseFloat(row.carpetArea) : undefined,
      builtUpArea: row.builtUpArea ? parseFloat(row.builtUpArea) : undefined,
      superBuiltUpArea: row.superBuiltUpArea ? parseFloat(row.superBuiltUpArea) : undefined,
      askingPrice: parseFloat(row.askingPrice),
      furnishing: row.furnishing,
      facing: row.facing,
      floorCategory: row.floorCategory,
      possession: row.possession,
      possessionDate: row.possessionDate ? new Date(row.possessionDate) : undefined,
      description: row.description ?? undefined,
      listingPartyType: row.listingPartyType,
      listingPartyDisplayName: row.listingPartyDisplayName ?? undefined,
      ownerName: row.ownerName ?? undefined,
      ownerPhone: row.ownerPhone ?? undefined,
      ownerEmail: row.ownerEmail ?? undefined,
      brokerName: row.brokerName ?? undefined,
      brokerPhone: row.brokerPhone ?? undefined,
      brokerEmail: row.brokerEmail ?? undefined,
      privatePhone: row.privatePhone ?? undefined,
      privateEmail: row.privateEmail ?? undefined,
      internalNotes: row.internalNotes ?? undefined,
      source: row.source ?? undefined,
      crmId: row.crmId ?? undefined,
      lifecycleStatus: row.lifecycleStatus,
      verificationStatus: row.verificationStatus,
      verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : undefined,
      verifiedBy: row.verifiedBy ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
