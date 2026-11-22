import { eq, and, sql, inArray } from 'drizzle-orm';
import { pgTable, text, uuid, integer, decimal, timestamp } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db/client';
import { resaleListings, resaleListingMedia, resaleListingAmenities, amenities } from '@/src/db/schema';
import type {
  ResaleListing,
  ResaleListingMedia,
} from '@/src/domain/projects/entities/resaleEntities';
import type { Amenity } from '@/src/domain/projects/entities';
import type {
  ResaleListingRepository,
  ResaleFilterOptions,
  ProjectResaleInventoryFacets,
} from '@/src/domain/projects/repositories/resaleRepository';
import {
  PersistenceUnavailableError,
  runWithPersistenceGuard,
  type DbClient,
} from '@/src/lib/persistenceGuard';

/**
 * Internal pre-0012 table projection for legacy PostgreSQL INSERT compatibility.
 * Drizzle ORM 0.39.3 emits every column declared on a pgTable in INSERT column lists
 * (using `default` for omitted keys), so legacy INSERTs must target a projection
 * excluding Phase 1 columns (`plot_area`, `custom_locality_display`, `custom_project_display`).
 */
const legacyResaleListingsTable = pgTable('resale_listings', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  projectId: uuid('project_id'),
  propertyType: text('property_type').notNull(),
  configuration: text('configuration'),
  bedroomCount: integer('bedroom_count'),
  carpetArea: decimal('carpet_area', { precision: 12, scale: 2 }),
  builtUpArea: decimal('built_up_area', { precision: 12, scale: 2 }),
  superBuiltUpArea: decimal('super_built_up_area', { precision: 12, scale: 2 }),
  askingPrice: decimal('asking_price', { precision: 19, scale: 4 }).notNull(),
  furnishing: text('furnishing'),
  facing: text('facing').notNull(),
  floorCategory: text('floor_category'),
  possession: text('possession').notNull(),
  possessionDate: timestamp('possession_date'),
  description: text('description'),
  listingPartyType: text('listing_party_type').notNull(),
  listingPartyDisplayName: text('listing_party_display_name'),
  ownerName: text('owner_name'),
  ownerPhone: text('owner_phone'),
  ownerEmail: text('owner_email'),
  brokerName: text('broker_name'),
  brokerPhone: text('broker_phone'),
  brokerEmail: text('broker_email'),
  privatePhone: text('private_phone'),
  privateEmail: text('private_email'),
  internalNotes: text('internal_notes'),
  source: text('source'),
  crmId: text('crm_id'),
  lifecycleStatus: text('lifecycle_status').notNull(),
  verificationStatus: text('verification_status').notNull(),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: text('verified_by'),
  locationId: uuid('location_id'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  geometry: text('geometry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

const legacyResaleSelection = {
  id: resaleListings.id,
  slug: resaleListings.slug,
  projectId: resaleListings.projectId,
  propertyType: resaleListings.propertyType,
  configuration: resaleListings.configuration,
  bedroomCount: resaleListings.bedroomCount,
  carpetArea: resaleListings.carpetArea,
  builtUpArea: resaleListings.builtUpArea,
  superBuiltUpArea: resaleListings.superBuiltUpArea,
  askingPrice: resaleListings.askingPrice,
  furnishing: resaleListings.furnishing,
  facing: resaleListings.facing,
  floorCategory: resaleListings.floorCategory,
  possession: resaleListings.possession,
  possessionDate: resaleListings.possessionDate,
  description: resaleListings.description,
  listingPartyType: resaleListings.listingPartyType,
  listingPartyDisplayName: resaleListings.listingPartyDisplayName,
  ownerName: resaleListings.ownerName,
  ownerPhone: resaleListings.ownerPhone,
  ownerEmail: resaleListings.ownerEmail,
  brokerName: resaleListings.brokerName,
  brokerPhone: resaleListings.brokerPhone,
  brokerEmail: resaleListings.brokerEmail,
  privatePhone: resaleListings.privatePhone,
  privateEmail: resaleListings.privateEmail,
  internalNotes: resaleListings.internalNotes,
  source: resaleListings.source,
  crmId: resaleListings.crmId,
  lifecycleStatus: resaleListings.lifecycleStatus,
  verificationStatus: resaleListings.verificationStatus,
  verifiedAt: resaleListings.verifiedAt,
  verifiedBy: resaleListings.verifiedBy,
  locationId: resaleListings.locationId,
  latitude: resaleListings.latitude,
  longitude: resaleListings.longitude,
  geometry: resaleListings.geometry,
  createdAt: resaleListings.createdAt,
  updatedAt: resaleListings.updatedAt,
};

function isMissingPhase1ListingColumnError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const causeMsg = String(err?.cause?.message || '');
  const parentMsg = String(err?.parent?.message || '');
  const isUndefinedColumn =
    err?.code === '42703' ||
    err?.cause?.code === '42703' ||
    err?.parent?.code === '42703' ||
    /column .* does not exist/i.test(msg) ||
    /column .* does not exist/i.test(causeMsg) ||
    /column .* does not exist/i.test(parentMsg);
  return (
    isUndefinedColumn &&
    (/(plot_area|custom_locality_display|custom_project_display)/i.test(msg) ||
      /(plot_area|custom_locality_display|custom_project_display)/i.test(causeMsg) ||
      /(plot_area|custom_locality_display|custom_project_display)/i.test(parentMsg))
  );
}

function getPopulatedPhase1ResaleFields(data: Partial<ResaleListing>): string[] {
  const populated: string[] = [];
  if (data.plotArea !== undefined && data.plotArea !== null) {
    populated.push('plotArea');
  }
  if (typeof data.customLocalityDisplay === 'string' && data.customLocalityDisplay.trim().length > 0) {
    populated.push('customLocalityDisplay');
  }
  if (typeof data.customProjectDisplay === 'string' && data.customProjectDisplay.trim().length > 0) {
    populated.push('customProjectDisplay');
  }
  return populated;
}

function createUnsupportedPhase1FieldError(fields: string[]): Error {
  const err = new Error(
    `Cannot save ${fields.join(', ')} because the connected database schema does not yet include these columns. Clear those fields or apply the approved schema migration.`
  );
  err.name = 'ValidationError';
  return err;
}

const LEGACY_RESALE_NOT_NULL_COLUMN_MAP: Record<string, string> = {
  configuration: 'configuration',
  bedroom_count: 'bedroomCount',
  furnishing: 'furnishing',
  floor_category: 'floorCategory',
};

function toLegacyNotNullValidationError(err: any): Error | null {
  const code = err?.code || err?.cause?.code || err?.parent?.code;
  if (code !== '23502') return null;
  const colRaw = String(err?.column || err?.cause?.column || err?.parent?.column || '').toLowerCase();
  const combinedMsg = `${String(err?.message || '')} ${String(err?.cause?.message || '')} ${String(err?.parent?.message || '')}`;
  const matchedCol =
    (colRaw && LEGACY_RESALE_NOT_NULL_COLUMN_MAP[colRaw] ? colRaw : null) ||
    Object.keys(LEGACY_RESALE_NOT_NULL_COLUMN_MAP).find((c) =>
      new RegExp(`column\\s+"?${c}"?`, 'i').test(combinedMsg)
    );
  if (!matchedCol) return null;
  const fieldName = LEGACY_RESALE_NOT_NULL_COLUMN_MAP[matchedCol];
  const validationErr = new Error(
    `Field "${fieldName}" cannot be empty because the connected database schema still requires a non-null value until the approved schema migration is applied.`
  );
  validationErr.name = 'ValidationError';
  return validationErr;
}

function isResaleWritePassthroughError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, any>;
  if (e.name === 'ValidationError' || e.name === 'NotFoundError') return true;
  const pgCode = e.code || e.parent?.code || e.cause?.code;
  const pgConstraint = e.constraint || e.parent?.constraint || e.cause?.constraint;
  if (pgCode === '23505' && pgConstraint === 'uq_resale_listings_slug_not_null') {
    return true;
  }
  return false;
}

export class ResaleListingRepositoryPostgres implements ResaleListingRepository {
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private phase1ColumnsAvailable = true;

  constructor(dbResolver?: () => ReturnType<typeof getDb>) {
    this.dbResolver = dbResolver ?? (() => getDb());
  }

  private selectColumns(db: any) {
    return this.phase1ColumnsAvailable ? db.select() : db.select(legacyResaleSelection);
  }

  private requireDb(): DbClient {
    let db: ReturnType<typeof getDb> = null;
    try {
      db = this.dbResolver();
    } catch {
      throw new PersistenceUnavailableError(
        'Resale listing service is temporarily unavailable. Database connection could not be established.'
      );
    }
    if (!db) {
      throw new PersistenceUnavailableError(
        'Resale listing service is temporarily unavailable. PostgreSQL database is unavailable.'
      );
    }
    return db;
  }

  async findById(id: string): Promise<ResaleListing | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      try {
        const rows = await this.selectColumns(db).from(resaleListings).where(eq(resaleListings.id, id));
        if (rows.length === 0) return null;
        return this.mapRowToEntity(rows[0]);
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db.select(legacyResaleSelection).from(resaleListings).where(eq(resaleListings.id, id));
          return rows.length > 0 ? this.mapRowToEntity(rows[0]) : null;
        }
        throw err;
      }
    });
  }

  async findBySlug(slug: string): Promise<ResaleListing | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      try {
        const rows = await this.selectColumns(db)
          .from(resaleListings)
          .where(sql`LOWER(${resaleListings.slug}) = LOWER(${slug})`);
        if (rows.length === 0) return null;
        return this.mapRowToEntity(rows[0]);
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db
            .select(legacyResaleSelection)
            .from(resaleListings)
            .where(sql`LOWER(${resaleListings.slug}) = LOWER(${slug})`);
          return rows.length > 0 ? this.mapRowToEntity(rows[0]) : null;
        }
        throw err;
      }
    });
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
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      try {
        const rows = await this.selectColumns(db).from(resaleListings).where(eq(resaleListings.projectId, projectId));
        return rows.map((r: any) => this.mapRowToEntity(r));
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db.select(legacyResaleSelection).from(resaleListings).where(eq(resaleListings.projectId, projectId));
          return rows.map((r: any) => this.mapRowToEntity(r));
        }
        throw err;
      }
    });
  }

  async findPublishedByProjectId(projectId: string): Promise<ResaleListing[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      try {
        const rows = await this.selectColumns(db)
          .from(resaleListings)
          .where(and(eq(resaleListings.projectId, projectId), eq(resaleListings.lifecycleStatus, 'PUBLISHED')));
        return rows.map((r: any) => this.mapRowToEntity(r));
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db
            .select(legacyResaleSelection)
            .from(resaleListings)
            .where(and(eq(resaleListings.projectId, projectId), eq(resaleListings.lifecycleStatus, 'PUBLISHED')));
          return rows.map((r: any) => this.mapRowToEntity(r));
        }
        throw err;
      }
    });
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
      if (this.phase1ColumnsAvailable) {
        conditions.push(
          sql`(
            ${resaleListings.bedroomCount} > 0
            OR LENGTH(TRIM(COALESCE(${resaleListings.configuration}, ''))) > 0
            OR (${resaleListings.propertyType} = 'PLOT' AND ${resaleListings.plotArea} > 0)
          )`
        );
      } else {
        conditions.push(
          sql`(
            ${resaleListings.bedroomCount} > 0
            OR LENGTH(TRIM(COALESCE(${resaleListings.configuration}, ''))) > 0
          )`
        );
      }
    }
    return conditions;
  }

  private buildOrderClause(sortBy: string) {
    let orderClause = sql`${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    if (sortBy === 'price_asc') {
      orderClause = sql`${resaleListings.askingPrice} ASC, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    } else if (sortBy === 'price_desc') {
      orderClause = sql`${resaleListings.askingPrice} DESC, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    } else if (sortBy === 'area_desc') {
      orderClause = this.phase1ColumnsAvailable
        ? sql`COALESCE(${resaleListings.carpetArea}, ${resaleListings.plotArea}) DESC NULLS LAST, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`
        : sql`${resaleListings.carpetArea} DESC NULLS LAST, ${resaleListings.createdAt} DESC, ${resaleListings.id} ASC`;
    }
    return orderClause;
  }

  async findAll(filter?: ResaleFilterOptions): Promise<ResaleListing[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      const executeFind = async () => {
        const conditions = this.buildWhereConditions(filter);
        const sortBy = filter?.sortBy || 'newest';
        const orderClause = this.buildOrderClause(sortBy);

        let query: any = conditions.length > 0
          ? this.selectColumns(db).from(resaleListings).where(and(...conditions)).orderBy(orderClause)
          : this.selectColumns(db).from(resaleListings).orderBy(orderClause);

        if (filter?.limit !== undefined && filter.limit >= 0) {
          query = query.limit(filter.limit);
        }
        if (filter?.offset !== undefined && filter.offset > 0) {
          query = query.offset(filter.offset);
        }

        const rows = await query;
        return rows.map((r: any) => this.mapRowToEntity(r));
      };

      try {
        return await executeFind();
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          return await executeFind();
        }
        throw err;
      }
    });
  }

  async countAndFacetsForProject(projectId: string, filter?: ResaleFilterOptions): Promise<ProjectResaleInventoryFacets> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      const executeFacets = async () => {
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
      };

      try {
        return await executeFacets();
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          return await executeFacets();
        }
        throw err;
      }
    });
  }

  async create(data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListing> {
    const db = this.requireDb();
    return runWithPersistenceGuard(
      'Resale listing',
      async () => {
        const id = `resale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const baseValues = {
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
          furnishing: data.furnishing ?? null,
          facing: data.facing,
          floorCategory: data.floorCategory ?? null,
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
        };

        const fullValues = {
          ...baseValues,
          plotArea: data.plotArea ? data.plotArea.toString() : null,
          customLocalityDisplay: data.customLocalityDisplay ?? null,
          customProjectDisplay: data.customProjectDisplay ?? null,
        };

        const executeLegacyCreate = async () => {
          const unsupportedFields = getPopulatedPhase1ResaleFields(data);
          if (unsupportedFields.length > 0) {
            throw createUnsupportedPhase1FieldError(unsupportedFields);
          }
          try {
            const [legacyRow] = await db
              .insert(legacyResaleListingsTable)
              .values(baseValues)
              .returning();
            return this.mapRowToEntity(legacyRow);
          } catch (legacyErr) {
            const notNullErr = toLegacyNotNullValidationError(legacyErr);
            if (notNullErr) throw notNullErr;
            throw legacyErr;
          }
        };

        if (!this.phase1ColumnsAvailable) {
          return await executeLegacyCreate();
        }

        try {
          const [row] = await db
            .insert(resaleListings)
            .values(fullValues as any)
            .returning();
          return this.mapRowToEntity(row);
        } catch (err) {
          if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
            this.phase1ColumnsAvailable = false;
            return await executeLegacyCreate();
          }
          throw err;
        }
      },
      isResaleWritePassthroughError
    );
  }

  async update(id: string, data: Partial<ResaleListing>): Promise<ResaleListing> {
    const db = this.requireDb();

    const baseUpdatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.slug !== undefined) baseUpdatePayload.slug = data.slug;
    if (data.projectId !== undefined) baseUpdatePayload.projectId = data.projectId;
    if (data.locationId !== undefined) baseUpdatePayload.locationId = data.locationId;
    if (data.latitude !== undefined) baseUpdatePayload.latitude = data.latitude ? data.latitude.toString() : null;
    if (data.longitude !== undefined) baseUpdatePayload.longitude = data.longitude ? data.longitude.toString() : null;
    if (data.geometry !== undefined) baseUpdatePayload.geometry = data.geometry;
    if (data.propertyType !== undefined) baseUpdatePayload.propertyType = data.propertyType;
    if (data.configuration !== undefined) baseUpdatePayload.configuration = data.configuration;
    if (data.bedroomCount !== undefined) baseUpdatePayload.bedroomCount = data.bedroomCount;
    if (data.carpetArea !== undefined) baseUpdatePayload.carpetArea = data.carpetArea ? data.carpetArea.toString() : null;
    if (data.builtUpArea !== undefined) baseUpdatePayload.builtUpArea = data.builtUpArea ? data.builtUpArea.toString() : null;
    if (data.superBuiltUpArea !== undefined) baseUpdatePayload.superBuiltUpArea = data.superBuiltUpArea ? data.superBuiltUpArea.toString() : null;
    if (data.askingPrice !== undefined) baseUpdatePayload.askingPrice = data.askingPrice.toString();
    if (data.furnishing !== undefined) baseUpdatePayload.furnishing = data.furnishing;
    if (data.facing !== undefined) baseUpdatePayload.facing = data.facing;
    if (data.floorCategory !== undefined) baseUpdatePayload.floorCategory = data.floorCategory;
    if (data.possession !== undefined) baseUpdatePayload.possession = data.possession;
    if (data.possessionDate !== undefined) baseUpdatePayload.possessionDate = data.possessionDate;
    if (data.description !== undefined) baseUpdatePayload.description = data.description;
    if (data.listingPartyType !== undefined) baseUpdatePayload.listingPartyType = data.listingPartyType;
    if (data.listingPartyDisplayName !== undefined) baseUpdatePayload.listingPartyDisplayName = data.listingPartyDisplayName;
    if (data.ownerName !== undefined) baseUpdatePayload.ownerName = data.ownerName;
    if (data.ownerPhone !== undefined) baseUpdatePayload.ownerPhone = data.ownerPhone;
    if (data.ownerEmail !== undefined) baseUpdatePayload.ownerEmail = data.ownerEmail;
    if (data.brokerName !== undefined) baseUpdatePayload.brokerName = data.brokerName;
    if (data.brokerPhone !== undefined) baseUpdatePayload.brokerPhone = data.brokerPhone;
    if (data.brokerEmail !== undefined) baseUpdatePayload.brokerEmail = data.brokerEmail;
    if (data.privatePhone !== undefined) baseUpdatePayload.privatePhone = data.privatePhone;
    if (data.privateEmail !== undefined) baseUpdatePayload.privateEmail = data.privateEmail;
    if (data.internalNotes !== undefined) baseUpdatePayload.internalNotes = data.internalNotes;
    if (data.source !== undefined) baseUpdatePayload.source = data.source;
    if (data.crmId !== undefined) baseUpdatePayload.crmId = data.crmId;
    if (data.lifecycleStatus !== undefined) baseUpdatePayload.lifecycleStatus = data.lifecycleStatus;
    if (data.verificationStatus !== undefined) baseUpdatePayload.verificationStatus = data.verificationStatus;
    if (data.verifiedAt !== undefined) baseUpdatePayload.verifiedAt = data.verifiedAt;
    if (data.verifiedBy !== undefined) baseUpdatePayload.verifiedBy = data.verifiedBy;

    const fullUpdatePayload: Record<string, any> = { ...baseUpdatePayload };
    if (data.plotArea !== undefined) fullUpdatePayload.plotArea = data.plotArea ? data.plotArea.toString() : null;
    if (data.customLocalityDisplay !== undefined) fullUpdatePayload.customLocalityDisplay = data.customLocalityDisplay;
    if (data.customProjectDisplay !== undefined) fullUpdatePayload.customProjectDisplay = data.customProjectDisplay;

    const executeLegacyUpdate = async () => {
      const unsupportedFields = getPopulatedPhase1ResaleFields(data);
      if (unsupportedFields.length > 0) {
        throw createUnsupportedPhase1FieldError(unsupportedFields);
      }
      try {
        return await db
          .update(resaleListings)
          .set(baseUpdatePayload)
          .where(eq(resaleListings.id, id))
          .returning(legacyResaleSelection);
      } catch (legacyErr) {
        const notNullErr = toLegacyNotNullValidationError(legacyErr);
        if (notNullErr) throw notNullErr;
        throw legacyErr;
      }
    };

    const [row] = await runWithPersistenceGuard(
      'Resale listing',
      async () => {
        if (!this.phase1ColumnsAvailable) {
          return await executeLegacyUpdate();
        }
        try {
          return await db
            .update(resaleListings)
            .set(fullUpdatePayload)
            .where(eq(resaleListings.id, id))
            .returning();
        } catch (err) {
          if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
            this.phase1ColumnsAvailable = false;
            return await executeLegacyUpdate();
          }
          throw err;
        }
      },
      isResaleWritePassthroughError
    );

    if (!row) throw new Error(`Resale listing ${id} not found.`);
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      await db.delete(resaleListingMedia).where(eq(resaleListingMedia.resaleListingId, id));
      await db.delete(resaleListingAmenities).where(eq(resaleListingAmenities.resaleListingId, id));
      const res = await db
        .delete(resaleListings)
        .where(eq(resaleListings.id, id))
        .returning({ id: resaleListings.id });
      return res.length > 0;
    });
  }

  async findMediaByListingId(listingId: string): Promise<ResaleListingMedia[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
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
    });
  }

  async findMediaByListingIds(listingIds: string[]): Promise<ResaleListingMedia[]> {
    const validIds = Array.from(new Set(listingIds.filter(Boolean)));
    if (validIds.length === 0) return [];
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
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
    });
  }

  async addMedia(data: Omit<ResaleListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListingMedia> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {

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
    });
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      const res = await db.delete(resaleListingMedia).where(eq(resaleListingMedia.id, mediaId)).returning();
      return res.length > 0;
    });
  }

  async updateMedia(mediaId: string, data: Partial<ResaleListingMedia>): Promise<ResaleListingMedia | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {

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
    });
  }

  async findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
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
    });
  }

  async associateAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
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
    });
  }

  async removeAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Resale listing', async () => {
      await db
        .delete(resaleListingAmenities)
        .where(and(eq(resaleListingAmenities.resaleListingId, resaleListingId), eq(resaleListingAmenities.amenityId, amenityId)));
    });
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
      configuration: row.configuration ?? null,
      bedroomCount: row.bedroomCount ?? null,
      carpetArea: row.carpetArea ? parseFloat(row.carpetArea) : undefined,
      builtUpArea: row.builtUpArea ? parseFloat(row.builtUpArea) : undefined,
      superBuiltUpArea: row.superBuiltUpArea ? parseFloat(row.superBuiltUpArea) : undefined,
      plotArea: row.plotArea ? parseFloat(row.plotArea) : undefined,
      askingPrice: parseFloat(row.askingPrice),
      furnishing: row.furnishing ?? null,
      facing: row.facing,
      floorCategory: row.floorCategory ?? null,
      possession: row.possession,
      possessionDate: row.possessionDate ? new Date(row.possessionDate) : undefined,
      description: row.description ?? undefined,
      customLocalityDisplay: row.customLocalityDisplay ?? undefined,
      customProjectDisplay: row.customProjectDisplay ?? undefined,
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
