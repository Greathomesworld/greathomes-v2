import { eq, and, sql, inArray, desc, asc } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { rentalListings, rentalListingMedia, rentalListingAmenities, amenities } from '@/src/db/schema';
import {
  RentalListing,
  RentalListingMedia,
} from '@/src/domain/projects/entities/rentalEntities';
import { Amenity } from '@/src/domain/projects/entities';
import {
  RentalListingRepository,
  RentalListingFilter,
  ProjectRentalInventoryFacets,
} from '@/src/domain/projects/repositories/rentalRepository';

export class RentalListingRepositoryPostgres implements RentalListingRepository {
  async findById(id: string): Promise<RentalListing | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(rentalListings).where(eq(rentalListings.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findBySlug(slug: string): Promise<RentalListing | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(rentalListings)
      .where(sql`LOWER(${rentalListings.slug}) = LOWER(${slug})`);
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findBySlugOrId(identifier: string): Promise<RentalListing | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const byId = await this.findById(trimmed);
    if (byId) return byId;
    return this.findBySlug(trimmed);
  }

  async findByProjectId(projectId: string): Promise<RentalListing[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(rentalListings).where(eq(rentalListings.projectId, projectId));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findPublishedByProjectId(projectId: string): Promise<RentalListing[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(rentalListings)
      .where(and(eq(rentalListings.projectId, projectId), eq(rentalListings.lifecycleStatus, 'PUBLISHED')));
    return rows.map(r => this.mapRowToEntity(r));
  }

  private buildWhereConditions(filter?: RentalListingFilter) {
    const conditions = [];
    if (filter?.projectId) conditions.push(eq(rentalListings.projectId, filter.projectId));
    if (filter?.lifecycleStatus) conditions.push(eq(rentalListings.lifecycleStatus, filter.lifecycleStatus));
    if (filter?.verificationStatus) conditions.push(eq(rentalListings.verificationStatus, filter.verificationStatus));
    if (filter?.listingPartyType) conditions.push(eq(rentalListings.listingPartyType, filter.listingPartyType));
    if (filter?.bedroomCount !== undefined) conditions.push(eq(rentalListings.bedroomCount, filter.bedroomCount));
    if (filter?.propertyType) conditions.push(eq(rentalListings.propertyType, filter.propertyType));
    if (filter?.furnishing) conditions.push(eq(rentalListings.furnishing, filter.furnishing));
    if (filter?.floorCategory) conditions.push(eq(rentalListings.floorCategory, filter.floorCategory));
    if (filter?.facing) conditions.push(eq(rentalListings.facing, filter.facing));
    if (filter?.possession) {
      if (filter.possession === 'READY') {
        conditions.push(inArray(rentalListings.possession, ['READY', 'READY_TO_MOVE']));
      } else {
        conditions.push(eq(rentalListings.possession, filter.possession));
      }
    }
    if (filter?.minRent !== undefined) {
      conditions.push(sql`${rentalListings.monthlyRent} >= ${filter.minRent.toString()}`);
    }
    if (filter?.maxRent !== undefined) {
      conditions.push(sql`${rentalListings.monthlyRent} <= ${filter.maxRent.toString()}`);
    }
    if (filter?.onlyEligiblePublic) {
      conditions.push(eq(rentalListings.lifecycleStatus, 'PUBLISHED'));
      conditions.push(sql`${rentalListings.monthlyRent} > 0`);
      conditions.push(
        sql`(${rentalListings.bedroomCount} > 0 OR LENGTH(TRIM(COALESCE(${rentalListings.configuration}, ''))) > 0)`
      );
    }
    return conditions;
  }

  async findAll(filter?: RentalListingFilter): Promise<RentalListing[]> {
    const db = getDb();
    if (!db) return [];

    const conditions = this.buildWhereConditions(filter);
    const sortBy = filter?.sortBy || 'newest';

    let orderClause = sql`${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    if (sortBy === 'rent_asc') {
      orderClause = sql`${rentalListings.monthlyRent} ASC, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    } else if (sortBy === 'rent_desc') {
      orderClause = sql`${rentalListings.monthlyRent} DESC, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    } else if (sortBy === 'area_desc') {
      orderClause = sql`${rentalListings.carpetArea} DESC NULLS LAST, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    }

    let query: any = conditions.length > 0
      ? db.select().from(rentalListings).where(and(...conditions)).orderBy(orderClause)
      : db.select().from(rentalListings).orderBy(orderClause);

    if (filter?.limit !== undefined && filter.limit >= 0) {
      query = query.limit(filter.limit);
    }
    if (filter?.offset !== undefined && filter.offset > 0) {
      query = query.offset(filter.offset);
    }

    const rows = await query;
    return rows.map((r: any) => this.mapRowToEntity(r));
  }

  async countAndFacetsForProject(projectId: string, filter?: RentalListingFilter): Promise<ProjectRentalInventoryFacets> {
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
        minRent: null,
        maxRent: null,
      };
    }

    const baseConditions = this.buildWhereConditions({
      projectId,
      lifecycleStatus: 'PUBLISHED',
      onlyEligiblePublic: true,
    });

    const baseRows = await db
      .select({
        bedroomCount: rentalListings.bedroomCount,
        monthlyRent: rentalListings.monthlyRent,
        verificationStatus: rentalListings.verificationStatus,
        furnishing: rentalListings.furnishing,
        floorCategory: rentalListings.floorCategory,
        possession: rentalListings.possession,
      })
      .from(rentalListings)
      .where(and(...baseConditions));

    const totalEligibleCount = baseRows.length;
    let verifiedCount = 0;
    const bhkSet = new Set<number>();
    const furnishSet = new Set<string>();
    const floorSet = new Set<string>();
    const possessionSet = new Set<string>();
    let minRent: number | null = null;
    let maxRent: number | null = null;

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
      const rent = Number(r.monthlyRent);
      if (Number.isFinite(rent) && rent > 0) {
        if (minRent === null || rent < minRent) minRent = rent;
        if (maxRent === null || rent > maxRent) maxRent = rent;
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
      .from(rentalListings)
      .where(and(...filteredConditions));

    return {
      totalEligibleCount,
      filteredCount: countRow ? Number(countRow.count) : 0,
      verifiedCount,
      availableBhkCounts,
      availableFurnishings: Array.from(furnishSet),
      availableFloorCategories: Array.from(floorSet),
      availablePossessions: Array.from(possessionSet),
      minRent,
      maxRent,
    };
  }

  async create(data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListing> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = `rent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const [row] = await db
      .insert(rentalListings)
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
        monthlyRent: data.monthlyRent.toString(),
        maintenance: data.maintenance ? data.maintenance.toString() : null,
        securityDeposit: data.securityDeposit ? data.securityDeposit.toString() : null,
        furnishing: data.furnishing,
        facing: data.facing,
        floorCategory: data.floorCategory,
        possession: data.possession,
        availabilityDate: data.availabilityDate,
        leaseDuration: data.leaseDuration,
        noticePeriod: data.noticePeriod,
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

  async update(id: string, data: Partial<RentalListing>): Promise<RentalListing> {
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
    if (data.monthlyRent !== undefined) updatePayload.monthlyRent = data.monthlyRent.toString();
    if (data.maintenance !== undefined) updatePayload.maintenance = data.maintenance ? data.maintenance.toString() : null;
    if (data.securityDeposit !== undefined) updatePayload.securityDeposit = data.securityDeposit ? data.securityDeposit.toString() : null;
    if (data.furnishing !== undefined) updatePayload.furnishing = data.furnishing;
    if (data.facing !== undefined) updatePayload.facing = data.facing;
    if (data.floorCategory !== undefined) updatePayload.floorCategory = data.floorCategory;
    if (data.possession !== undefined) updatePayload.possession = data.possession;
    if (data.availabilityDate !== undefined) updatePayload.availabilityDate = data.availabilityDate;
    if (data.leaseDuration !== undefined) updatePayload.leaseDuration = data.leaseDuration;
    if (data.noticePeriod !== undefined) updatePayload.noticePeriod = data.noticePeriod;
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
      .update(rentalListings)
      .set(updatePayload)
      .where(eq(rentalListings.id, id))
      .returning();

    if (!row) throw new Error(`Rental listing ${id} not found.`);
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    await db.delete(rentalListingMedia).where(eq(rentalListingMedia.rentalListingId, id));
    await db.delete(rentalListingAmenities).where(eq(rentalListingAmenities.rentalListingId, id));
    const res = await db.delete(rentalListings).where(eq(rentalListings.id, id)).returning();
    return res.length > 0;
  }

  async findMediaByListingId(listingId: string): Promise<RentalListingMedia[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(rentalListingMedia).where(eq(rentalListingMedia.rentalListingId, listingId));
    return rows
      .map(r => ({
        id: r.id,
        rentalListingId: r.rentalListingId,
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

  async findMediaByListingIds(listingIds: string[]): Promise<RentalListingMedia[]> {
    const validIds = Array.from(new Set(listingIds.filter(Boolean)));
    if (validIds.length === 0) return [];
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(rentalListingMedia)
      .where(inArray(rentalListingMedia.rentalListingId, validIds));
    return rows
      .map(r => ({
        id: r.id,
        rentalListingId: r.rentalListingId,
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

  async addMedia(data: Omit<RentalListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListingMedia> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = `rmed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const [row] = await db
      .insert(rentalListingMedia)
      .values({
        id,
        rentalListingId: data.rentalListingId,
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
      rentalListingId: row.rentalListingId,
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

    const res = await db.delete(rentalListingMedia).where(eq(rentalListingMedia.id, mediaId)).returning();
    return res.length > 0;
  }

  async updateMedia(mediaId: string, data: Partial<RentalListingMedia>): Promise<RentalListingMedia | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    if (data.isFeatured === true) {
      const existingRows = await db
        .select()
        .from(rentalListingMedia)
        .where(eq(rentalListingMedia.id, mediaId));
      const parentListingId = existingRows[0]?.rentalListingId;
      if (parentListingId) {
        await db
          .update(rentalListingMedia)
          .set({ isFeatured: false, updatedAt: new Date() } as any)
          .where(eq(rentalListingMedia.rentalListingId, parentListingId));
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
      .update(rentalListingMedia)
      .set(updatePayload)
      .where(eq(rentalListingMedia.id, mediaId))
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      rentalListingId: row.rentalListingId,
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

    const links = await db.select().from(rentalListingAmenities).where(eq(rentalListingAmenities.rentalListingId, listingId));
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

  async associateAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await db
      .select()
      .from(rentalListingAmenities)
      .where(and(eq(rentalListingAmenities.rentalListingId, rentalListingId), eq(rentalListingAmenities.amenityId, amenityId)));

    if (existing.length === 0) {
      await db.insert(rentalListingAmenities).values({
        id: `lam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        rentalListingId,
        amenityId,
      });
    }
  }

  async removeAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db
      .delete(rentalListingAmenities)
      .where(and(eq(rentalListingAmenities.rentalListingId, rentalListingId), eq(rentalListingAmenities.amenityId, amenityId)));
  }

  private mapRowToEntity(row: any): RentalListing {
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
      monthlyRent: parseFloat(row.monthlyRent),
      maintenance: row.maintenance ? parseFloat(row.maintenance) : undefined,
      securityDeposit: row.securityDeposit ? parseFloat(row.securityDeposit) : undefined,
      furnishing: row.furnishing,
      facing: row.facing,
      floorCategory: row.floorCategory,
      possession: row.possession,
      availabilityDate: row.availabilityDate ? new Date(row.availabilityDate) : undefined,
      leaseDuration: row.leaseDuration ?? undefined,
      noticePeriod: row.noticePeriod ?? undefined,
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
