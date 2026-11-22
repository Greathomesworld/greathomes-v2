import { eq, and, sql, inArray } from 'drizzle-orm';
import { pgTable, text, uuid, integer, decimal, timestamp } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db/client';
import { rentalListings, rentalListingMedia, rentalListingAmenities, amenities } from '@/src/db/schema';
import type {
  RentalListing,
  RentalListingMedia,
} from '@/src/domain/projects/entities/rentalEntities';
import type { Amenity } from '@/src/domain/projects/entities';
import type {
  RentalListingRepository,
  RentalListingFilter,
  ProjectRentalInventoryFacets,
} from '@/src/domain/projects/repositories/rentalRepository';
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
const legacyRentalListingsTable = pgTable('rental_listings', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  projectId: uuid('project_id'),
  propertyType: text('property_type').notNull(),
  configuration: text('configuration'),
  bedroomCount: integer('bedroom_count'),
  carpetArea: decimal('carpet_area', { precision: 12, scale: 2 }),
  builtUpArea: decimal('built_up_area', { precision: 12, scale: 2 }),
  superBuiltUpArea: decimal('super_built_up_area', { precision: 12, scale: 2 }),
  monthlyRent: decimal('monthly_rent', { precision: 19, scale: 4 }).notNull(),
  maintenance: decimal('maintenance', { precision: 19, scale: 4 }),
  securityDeposit: decimal('security_deposit', { precision: 19, scale: 4 }),
  furnishing: text('furnishing'),
  facing: text('facing').notNull(),
  floorCategory: text('floor_category'),
  possession: text('possession').notNull(),
  availabilityDate: timestamp('availability_date'),
  leaseDuration: text('lease_duration'),
  noticePeriod: text('notice_period'),
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

const legacyRentalSelection = {
  id: rentalListings.id,
  slug: rentalListings.slug,
  projectId: rentalListings.projectId,
  propertyType: rentalListings.propertyType,
  configuration: rentalListings.configuration,
  bedroomCount: rentalListings.bedroomCount,
  carpetArea: rentalListings.carpetArea,
  builtUpArea: rentalListings.builtUpArea,
  superBuiltUpArea: rentalListings.superBuiltUpArea,
  monthlyRent: rentalListings.monthlyRent,
  maintenance: rentalListings.maintenance,
  securityDeposit: rentalListings.securityDeposit,
  furnishing: rentalListings.furnishing,
  facing: rentalListings.facing,
  floorCategory: rentalListings.floorCategory,
  possession: rentalListings.possession,
  availabilityDate: rentalListings.availabilityDate,
  leaseDuration: rentalListings.leaseDuration,
  noticePeriod: rentalListings.noticePeriod,
  description: rentalListings.description,
  listingPartyType: rentalListings.listingPartyType,
  listingPartyDisplayName: rentalListings.listingPartyDisplayName,
  ownerName: rentalListings.ownerName,
  ownerPhone: rentalListings.ownerPhone,
  ownerEmail: rentalListings.ownerEmail,
  brokerName: rentalListings.brokerName,
  brokerPhone: rentalListings.brokerPhone,
  brokerEmail: rentalListings.brokerEmail,
  privatePhone: rentalListings.privatePhone,
  privateEmail: rentalListings.privateEmail,
  internalNotes: rentalListings.internalNotes,
  source: rentalListings.source,
  crmId: rentalListings.crmId,
  lifecycleStatus: rentalListings.lifecycleStatus,
  verificationStatus: rentalListings.verificationStatus,
  verifiedAt: rentalListings.verifiedAt,
  verifiedBy: rentalListings.verifiedBy,
  locationId: rentalListings.locationId,
  latitude: rentalListings.latitude,
  longitude: rentalListings.longitude,
  geometry: rentalListings.geometry,
  createdAt: rentalListings.createdAt,
  updatedAt: rentalListings.updatedAt,
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

function getPopulatedPhase1RentalFields(data: Partial<RentalListing>): string[] {
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

const LEGACY_RENTAL_NOT_NULL_COLUMN_MAP: Record<string, string> = {
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
    (colRaw && LEGACY_RENTAL_NOT_NULL_COLUMN_MAP[colRaw] ? colRaw : null) ||
    Object.keys(LEGACY_RENTAL_NOT_NULL_COLUMN_MAP).find((c) =>
      new RegExp(`column\\s+"?${c}"?`, 'i').test(combinedMsg)
    );
  if (!matchedCol) return null;
  const fieldName = LEGACY_RENTAL_NOT_NULL_COLUMN_MAP[matchedCol];
  const validationErr = new Error(
    `Field "${fieldName}" cannot be empty because the connected database schema still requires a non-null value until the approved schema migration is applied.`
  );
  validationErr.name = 'ValidationError';
  return validationErr;
}

function isRentalWritePassthroughError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, any>;
  if (e.name === 'ValidationError' || e.name === 'NotFoundError') return true;
  const pgCode = e.code || e.parent?.code || e.cause?.code;
  const pgConstraint = e.constraint || e.parent?.constraint || e.cause?.constraint;
  if (pgCode === '23505' && pgConstraint === 'uq_rental_listings_slug_not_null') {
    return true;
  }
  return false;
}

export class RentalListingRepositoryPostgres implements RentalListingRepository {
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private phase1ColumnsAvailable = true;

  constructor(dbResolver?: () => ReturnType<typeof getDb>) {
    this.dbResolver = dbResolver ?? (() => getDb());
  }

  private selectColumns(db: any) {
    return this.phase1ColumnsAvailable ? db.select() : db.select(legacyRentalSelection);
  }

  private requireDb(): DbClient {
    let db: ReturnType<typeof getDb> = null;
    try {
      db = this.dbResolver();
    } catch {
      throw new PersistenceUnavailableError(
        'Rental listing service is temporarily unavailable. Database connection could not be established.'
      );
    }
    if (!db) {
      throw new PersistenceUnavailableError(
        'Rental listing service is temporarily unavailable. PostgreSQL database is unavailable.'
      );
    }
    return db;
  }

  async findById(id: string): Promise<RentalListing | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      try {
        const rows = await this.selectColumns(db).from(rentalListings).where(eq(rentalListings.id, id));
        if (rows.length === 0) return null;
        return this.mapRowToEntity(rows[0]);
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db.select(legacyRentalSelection).from(rentalListings).where(eq(rentalListings.id, id));
          return rows.length > 0 ? this.mapRowToEntity(rows[0]) : null;
        }
        throw err;
      }
    });
  }

  async findBySlug(slug: string): Promise<RentalListing | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      try {
        const rows = await this.selectColumns(db)
          .from(rentalListings)
          .where(sql`LOWER(${rentalListings.slug}) = LOWER(${slug})`);
        if (rows.length === 0) return null;
        return this.mapRowToEntity(rows[0]);
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db
            .select(legacyRentalSelection)
            .from(rentalListings)
            .where(sql`LOWER(${rentalListings.slug}) = LOWER(${slug})`);
          return rows.length > 0 ? this.mapRowToEntity(rows[0]) : null;
        }
        throw err;
      }
    });
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
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      try {
        const rows = await this.selectColumns(db).from(rentalListings).where(eq(rentalListings.projectId, projectId));
        return rows.map((r: any) => this.mapRowToEntity(r));
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db.select(legacyRentalSelection).from(rentalListings).where(eq(rentalListings.projectId, projectId));
          return rows.map((r: any) => this.mapRowToEntity(r));
        }
        throw err;
      }
    });
  }

  async findPublishedByProjectId(projectId: string): Promise<RentalListing[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      try {
        const rows = await this.selectColumns(db)
          .from(rentalListings)
          .where(and(eq(rentalListings.projectId, projectId), eq(rentalListings.lifecycleStatus, 'PUBLISHED')));
        return rows.map((r: any) => this.mapRowToEntity(r));
      } catch (err) {
        if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
          this.phase1ColumnsAvailable = false;
          const rows = await db
            .select(legacyRentalSelection)
            .from(rentalListings)
            .where(and(eq(rentalListings.projectId, projectId), eq(rentalListings.lifecycleStatus, 'PUBLISHED')));
          return rows.map((r: any) => this.mapRowToEntity(r));
        }
        throw err;
      }
    });
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
      if (this.phase1ColumnsAvailable) {
        conditions.push(
          sql`(
            ${rentalListings.bedroomCount} > 0
            OR LENGTH(TRIM(COALESCE(${rentalListings.configuration}, ''))) > 0
            OR (${rentalListings.propertyType} = 'PLOT' AND ${rentalListings.plotArea} > 0)
          )`
        );
      } else {
        conditions.push(
          sql`(
            ${rentalListings.bedroomCount} > 0
            OR LENGTH(TRIM(COALESCE(${rentalListings.configuration}, ''))) > 0
          )`
        );
      }
    }
    return conditions;
  }

  private buildOrderClause(sortBy: string) {
    let orderClause = sql`${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    if (sortBy === 'rent_asc') {
      orderClause = sql`${rentalListings.monthlyRent} ASC, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    } else if (sortBy === 'rent_desc') {
      orderClause = sql`${rentalListings.monthlyRent} DESC, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    } else if (sortBy === 'area_desc') {
      orderClause = this.phase1ColumnsAvailable
        ? sql`COALESCE(${rentalListings.carpetArea}, ${rentalListings.plotArea}) DESC NULLS LAST, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`
        : sql`${rentalListings.carpetArea} DESC NULLS LAST, ${rentalListings.createdAt} DESC, ${rentalListings.id} ASC`;
    }
    return orderClause;
  }

  async findAll(filter?: RentalListingFilter): Promise<RentalListing[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      const executeFind = async () => {
        const conditions = this.buildWhereConditions(filter);
        const sortBy = filter?.sortBy || 'newest';
        const orderClause = this.buildOrderClause(sortBy);

        let query: any = conditions.length > 0
          ? this.selectColumns(db).from(rentalListings).where(and(...conditions)).orderBy(orderClause)
          : this.selectColumns(db).from(rentalListings).orderBy(orderClause);

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

  async countAndFacetsForProject(projectId: string, filter?: RentalListingFilter): Promise<ProjectRentalInventoryFacets> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      const executeFacets = async () => {
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

  async create(data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListing> {
    const db = this.requireDb();
    return runWithPersistenceGuard(
      'Rental listing',
      async () => {
        const id = `rent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
          monthlyRent: data.monthlyRent.toString(),
          maintenance: data.maintenance ? data.maintenance.toString() : null,
          securityDeposit: data.securityDeposit ? data.securityDeposit.toString() : null,
          furnishing: data.furnishing ?? null,
          facing: data.facing,
          floorCategory: data.floorCategory ?? null,
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
        };

        const fullValues = {
          ...baseValues,
          plotArea: data.plotArea ? data.plotArea.toString() : null,
          customLocalityDisplay: data.customLocalityDisplay ?? null,
          customProjectDisplay: data.customProjectDisplay ?? null,
        };

        const executeLegacyCreate = async () => {
          const unsupportedFields = getPopulatedPhase1RentalFields(data);
          if (unsupportedFields.length > 0) {
            throw createUnsupportedPhase1FieldError(unsupportedFields);
          }
          try {
            const [legacyRow] = await db
              .insert(legacyRentalListingsTable)
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
            .insert(rentalListings)
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
      isRentalWritePassthroughError
    );
  }

  async update(id: string, data: Partial<RentalListing>): Promise<RentalListing> {
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
    if (data.monthlyRent !== undefined) baseUpdatePayload.monthlyRent = data.monthlyRent.toString();
    if (data.maintenance !== undefined) baseUpdatePayload.maintenance = data.maintenance ? data.maintenance.toString() : null;
    if (data.securityDeposit !== undefined) baseUpdatePayload.securityDeposit = data.securityDeposit ? data.securityDeposit.toString() : null;
    if (data.furnishing !== undefined) baseUpdatePayload.furnishing = data.furnishing;
    if (data.facing !== undefined) baseUpdatePayload.facing = data.facing;
    if (data.floorCategory !== undefined) baseUpdatePayload.floorCategory = data.floorCategory;
    if (data.possession !== undefined) baseUpdatePayload.possession = data.possession;
    if (data.availabilityDate !== undefined) baseUpdatePayload.availabilityDate = data.availabilityDate;
    if (data.leaseDuration !== undefined) baseUpdatePayload.leaseDuration = data.leaseDuration;
    if (data.noticePeriod !== undefined) baseUpdatePayload.noticePeriod = data.noticePeriod;
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
      const unsupportedFields = getPopulatedPhase1RentalFields(data);
      if (unsupportedFields.length > 0) {
        throw createUnsupportedPhase1FieldError(unsupportedFields);
      }
      try {
        return await db
          .update(rentalListings)
          .set(baseUpdatePayload)
          .where(eq(rentalListings.id, id))
          .returning(legacyRentalSelection);
      } catch (legacyErr) {
        const notNullErr = toLegacyNotNullValidationError(legacyErr);
        if (notNullErr) throw notNullErr;
        throw legacyErr;
      }
    };

    const [row] = await runWithPersistenceGuard(
      'Rental listing',
      async () => {
        if (!this.phase1ColumnsAvailable) {
          return await executeLegacyUpdate();
        }
        try {
          return await db
            .update(rentalListings)
            .set(fullUpdatePayload)
            .where(eq(rentalListings.id, id))
            .returning();
        } catch (err) {
          if (this.phase1ColumnsAvailable && isMissingPhase1ListingColumnError(err)) {
            this.phase1ColumnsAvailable = false;
            return await executeLegacyUpdate();
          }
          throw err;
        }
      },
      isRentalWritePassthroughError
    );

    if (!row) throw new Error(`Rental listing ${id} not found.`);
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      await db.delete(rentalListingMedia).where(eq(rentalListingMedia.rentalListingId, id));
      await db.delete(rentalListingAmenities).where(eq(rentalListingAmenities.rentalListingId, id));
      const res = await db
        .delete(rentalListings)
        .where(eq(rentalListings.id, id))
        .returning({ id: rentalListings.id });
      return res.length > 0;
    });
  }

  async findMediaByListingId(listingId: string): Promise<RentalListingMedia[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
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
    });
  }

  async findMediaByListingIds(listingIds: string[]): Promise<RentalListingMedia[]> {
    const validIds = Array.from(new Set(listingIds.filter(Boolean)));
    if (validIds.length === 0) return [];
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
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
    });
  }

  async addMedia(data: Omit<RentalListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListingMedia> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {

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
    });
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      const res = await db.delete(rentalListingMedia).where(eq(rentalListingMedia.id, mediaId)).returning();
      return res.length > 0;
    });
  }

  async updateMedia(mediaId: string, data: Partial<RentalListingMedia>): Promise<RentalListingMedia | null> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {

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
    });
  }

  async findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
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
    });
  }

  async associateAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
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
    });
  }

  async removeAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    const db = this.requireDb();
    return runWithPersistenceGuard('Rental listing', async () => {
      await db
        .delete(rentalListingAmenities)
        .where(and(eq(rentalListingAmenities.rentalListingId, rentalListingId), eq(rentalListingAmenities.amenityId, amenityId)));
    });
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
      configuration: row.configuration ?? null,
      bedroomCount: row.bedroomCount ?? null,
      carpetArea: row.carpetArea ? parseFloat(row.carpetArea) : undefined,
      builtUpArea: row.builtUpArea ? parseFloat(row.builtUpArea) : undefined,
      superBuiltUpArea: row.superBuiltUpArea ? parseFloat(row.superBuiltUpArea) : undefined,
      plotArea: row.plotArea ? parseFloat(row.plotArea) : undefined,
      monthlyRent: parseFloat(row.monthlyRent),
      maintenance: row.maintenance ? parseFloat(row.maintenance) : undefined,
      securityDeposit: row.securityDeposit ? parseFloat(row.securityDeposit) : undefined,
      furnishing: row.furnishing ?? null,
      facing: row.facing,
      floorCategory: row.floorCategory ?? null,
      possession: row.possession,
      availabilityDate: row.availabilityDate ? new Date(row.availabilityDate) : undefined,
      leaseDuration: row.leaseDuration ?? undefined,
      noticePeriod: row.noticePeriod ?? undefined,
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
