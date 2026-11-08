import { eq, and, or, asc, desc, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import {
  projects,
  projectConfigurations,
  projectRera,
  projectMedia,
  amenities,
  projectAmenities,
  projectFaqs,
  projectSeo,
  developerSeo,
  developerMedia,
} from '@/src/db/schema';
import {
  Project,
  ProjectConfiguration,
  ProjectMedia,
  ProjectRera,
  Amenity,
  ProjectFaq,
} from '@/src/domain/projects/entities';
import { DeveloperMedia } from '@/src/domain/developers/media';
import { DeveloperMediaRepository } from '@/src/domain/repositories/developerRepository';

export interface ProjectSeo {
  id: string;
  projectId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperSeo {
  id: string;
  developerId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

import {
  ProjectRepository,
  ProjectFilterOptions,
  ProjectConfigurationRepository,
  ProjectMediaRepository,
  ProjectReraRepository,
  AmenityRepository,
  ProjectFaqRepository,
  ProjectSeoRepository,
} from '@/src/domain/repositories/projectRepository';

const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export class ProjectRepositoryPostgres implements ProjectRepository {
  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .insert(projects)
      .values({
        developerId: data.developerId,
        locationId: data.locationId,
        name: data.name,
        slug: data.slug,
        shortDescription: data.shortDescription,
        description: data.description,
        status: data.status as any,
        lifecycleStatus: (data.lifecycleStatus as any) || 'PUBLISHED',
        propertyType: data.propertyType as any,
        startingPrice: data.startingPrice ? data.startingPrice.toString() : null,
        projectArea: data.projectArea ?? null,
        towerCount: data.towerCount ?? null,
        totalUnits: data.totalUnits ?? null,
        floors: data.floors ?? null,
        possession: data.possession ?? null,
        latitude: data.latitude !== undefined && data.latitude !== null ? data.latitude.toString() : null,
        longitude: data.longitude !== undefined && data.longitude !== null ? data.longitude.toString() : null,
        featured: data.featured ?? false,
        isPublished: data.isPublished ?? true,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  async findById(id: string): Promise<Project | null> {
    if (!isUuid(id)) return null;

    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(projects).where(eq(projects.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findByIds(ids: string[]): Promise<Project[]> {
    const validIds = Array.from(new Set(ids.filter(isUuid)));
    if (validIds.length === 0) return [];

    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(projects).where(inArray(projects.id, validIds));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(projects)
      .where(sql`LOWER(${projects.slug}) = LOWER(${slug})`);
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findAll(): Promise<Project[]> {
    return this.list();
  }

  async list(filter?: ProjectFilterOptions): Promise<Project[]> {
    const db = getDb();
    if (!db) return [];

    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(projects.status, filter.status as any));
    }
    if (filter?.lifecycleStatus) {
      conditions.push(eq(projects.lifecycleStatus, filter.lifecycleStatus as any));
    }
    if (filter?.developerId) {
      if (!isUuid(filter.developerId)) return [];
      conditions.push(eq(projects.developerId, filter.developerId));
    }
    if (filter?.locationId) {
      if (!isUuid(filter.locationId)) return [];
      conditions.push(eq(projects.locationId, filter.locationId));
    }
    if (filter?.propertyType) {
      conditions.push(eq(projects.propertyType, filter.propertyType as any));
    }
    if (filter?.featured !== undefined) {
      conditions.push(eq(projects.featured, filter.featured));
    }
    if (filter?.isPublished !== undefined) {
      conditions.push(eq(projects.isPublished, filter.isPublished));
    }

    const rows = conditions.length > 0
      ? await db.select().from(projects).where(and(...conditions))
      : await db.select().from(projects);

    return rows.map(r => this.mapRowToEntity(r));
  }

  async findByDeveloperId(developerId: string): Promise<Project[]> {
    return this.findByDeveloperIds([developerId]);
  }

  async findByDeveloperIds(developerIds: string[]): Promise<Project[]> {
    const validIds = Array.from(new Set(developerIds.filter(isUuid)));
    if (validIds.length === 0) return [];

    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select({
        project: projects,
        reraStatus: projectRera.status,
        reraRegistrationNumber: projectRera.registrationNumber,
      })
      .from(projects)
      .leftJoin(projectRera, eq(projectRera.projectId, projects.id))
      .where(inArray(projects.developerId, validIds));

    const byProjectId = new Map<string, Project>();
    for (const row of rows) {
      if (!byProjectId.has(row.project.id)) {
        const entity = this.mapRowToEntity(row.project);
        if (row.reraStatus) {
          entity.reraStatus = row.reraStatus as any;
        }
        if (row.reraRegistrationNumber) {
          entity.reraRegistrationNumber = row.reraRegistrationNumber;
        }
        byProjectId.set(row.project.id, entity);
      }
    }
    return Array.from(byProjectId.values());
  }

  async findByLocationId(locationId: string): Promise<Project[]> {
    return this.list({ locationId });
  }

  async update(id: string, data: Partial<Project>): Promise<Project | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.slug !== undefined) updatePayload.slug = data.slug;
    if (data.developerId !== undefined) updatePayload.developerId = data.developerId;
    if (data.locationId !== undefined) updatePayload.locationId = data.locationId;
    if (data.shortDescription !== undefined) updatePayload.shortDescription = data.shortDescription;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.lifecycleStatus !== undefined) updatePayload.lifecycleStatus = data.lifecycleStatus;
    if (data.propertyType !== undefined) updatePayload.propertyType = data.propertyType;
    if (data.startingPrice !== undefined) updatePayload.startingPrice = data.startingPrice ? data.startingPrice.toString() : null;
    if (data.projectArea !== undefined) updatePayload.projectArea = data.projectArea;
    if (data.towerCount !== undefined) updatePayload.towerCount = data.towerCount;
    if (data.totalUnits !== undefined) updatePayload.totalUnits = data.totalUnits;
    if (data.floors !== undefined) updatePayload.floors = data.floors;
    if (data.possession !== undefined) updatePayload.possession = data.possession;
    if (data.latitude !== undefined) updatePayload.latitude = data.latitude !== null ? data.latitude.toString() : null;
    if (data.longitude !== undefined) updatePayload.longitude = data.longitude !== null ? data.longitude.toString() : null;
    if (data.featured !== undefined) updatePayload.featured = data.featured;
    if (data.isPublished !== undefined) updatePayload.isPublished = data.isPublished;

    const [row] = await db
      .update(projects)
      .set(updatePayload)
      .where(eq(projects.id, id))
      .returning();

    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    const res = await db.delete(projects).where(eq(projects.id, id)).returning();
    return res.length > 0;
  }

  private mapRowToEntity(row: any): Project {
    return {
      id: row.id,
      developerId: row.developerId,
      locationId: row.locationId,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      status: row.status,
      lifecycleStatus: row.lifecycleStatus,
      propertyType: row.propertyType,
      startingPrice: row.startingPrice ? parseFloat(row.startingPrice) : undefined,
      projectArea: row.projectArea ?? null,
      towerCount: row.towerCount !== null && row.towerCount !== undefined ? Number(row.towerCount) : null,
      totalUnits: row.totalUnits !== null && row.totalUnits !== undefined ? Number(row.totalUnits) : null,
      floors: row.floors ?? null,
      possession: row.possession ?? null,
      latitude: row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null,
      longitude: row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null,
      featured: row.featured,
      isPublished: row.isPublished,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export class ProjectConfigurationRepositoryPostgres implements ProjectConfigurationRepository {
  async findAll(): Promise<ProjectConfiguration[]> {
    const db = getDb();
    if (!db) return [];
    const rows = await db.select().from(projectConfigurations);
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findByProjectId(projectId: string): Promise<ProjectConfiguration[]> {
    if (!isUuid(projectId)) return [];
    const db = getDb();
    if (!db) return [];
    const rows = await db.select().from(projectConfigurations).where(eq(projectConfigurations.projectId, projectId));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectConfiguration[]> {
    const validIds = Array.from(new Set(projectIds.filter(isUuid)));
    if (validIds.length === 0) return [];
    const db = getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(projectConfigurations)
      .where(inArray(projectConfigurations.projectId, validIds));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findById(id: string): Promise<ProjectConfiguration | null> {
    const db = getDb();
    if (!db) return null;
    const rows = await db.select().from(projectConfigurations).where(eq(projectConfigurations.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async create(data: Omit<ProjectConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfiguration> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .insert(projectConfigurations)
      .values({
        projectId: data.projectId,
        name: data.name,
        bedroomCount: data.bedroomCount,
        carpetArea: data.carpetArea ? data.carpetArea.toString() : null,
        builtUpArea: data.builtUpArea ? data.builtUpArea.toString() : null,
        superBuiltUpArea: data.superBuiltUpArea ? data.superBuiltUpArea.toString() : null,
        price: data.price ? data.price.toString() : '0',
        priceBasis: data.priceBasis as any,
        floorPlanMediaId: data.floorPlanMediaId ?? null,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, data: Partial<ProjectConfiguration>): Promise<ProjectConfiguration | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.bedroomCount !== undefined) updatePayload.bedroomCount = data.bedroomCount;
    if (data.carpetArea !== undefined) updatePayload.carpetArea = data.carpetArea ? data.carpetArea.toString() : null;
    if (data.builtUpArea !== undefined) updatePayload.builtUpArea = data.builtUpArea ? data.builtUpArea.toString() : null;
    if (data.superBuiltUpArea !== undefined) updatePayload.superBuiltUpArea = data.superBuiltUpArea ? data.superBuiltUpArea.toString() : null;
    if (data.price !== undefined) updatePayload.price = data.price ? data.price.toString() : '0';
    if (data.priceBasis !== undefined) updatePayload.priceBasis = data.priceBasis;
    if (data.floorPlanMediaId !== undefined) updatePayload.floorPlanMediaId = data.floorPlanMediaId;

    const [row] = await db
      .update(projectConfigurations)
      .set(updatePayload)
      .where(eq(projectConfigurations.id, id))
      .returning();

    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;
    const res = await db.delete(projectConfigurations).where(eq(projectConfigurations.id, id)).returning();
    return res.length > 0;
  }

  async findDuplicates(projectId: string, name: string, excludeId?: string): Promise<ProjectConfiguration[]> {
    const configs = await this.findByProjectId(projectId);
    const normalized = name.trim().toLowerCase();
    return configs.filter(
      c => c.id !== excludeId && c.name.trim().toLowerCase() === normalized
    );
  }

  private mapRowToEntity(row: any): ProjectConfiguration {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      bedroomCount: row.bedroomCount,
      carpetArea: row.carpetArea ? parseFloat(row.carpetArea) : undefined,
      builtUpArea: row.builtUpArea ? parseFloat(row.builtUpArea) : undefined,
      superBuiltUpArea: row.superBuiltUpArea ? parseFloat(row.superBuiltUpArea) : undefined,
      price: row.price ? parseFloat(row.price) : 0,
      priceBasis: row.priceBasis,
      floorPlanMediaId: row.floorPlanMediaId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export class ProjectMediaRepositoryPostgres implements ProjectMediaRepository {
  async findByProjectId(projectId: string): Promise<ProjectMedia[]> {
    const db = getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(projectMedia)
      .where(eq(projectMedia.projectId, projectId))
      .orderBy(asc(projectMedia.sortOrder), asc(projectMedia.createdAt));
    return rows.map(r => ({
      id: r.id,
      mediaId: r.mediaId ?? r.id,
      projectId: r.projectId,
      configurationId: r.configurationId ?? undefined,
      mediaType: r.mediaType,
      category: r.category as any,
      url: r.url,
      altText: r.altText ?? undefined,
      caption: r.caption ?? undefined,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectMedia[]> {
    const validIds = Array.from(new Set(projectIds.filter(isUuid)));
    if (validIds.length === 0) return [];
    const db = getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(projectMedia)
      .where(inArray(projectMedia.projectId, validIds))
      .orderBy(asc(projectMedia.sortOrder), asc(projectMedia.createdAt));
    return rows.map(r => ({
      id: r.id,
      mediaId: r.mediaId ?? r.id,
      projectId: r.projectId,
      configurationId: r.configurationId ?? undefined,
      mediaType: r.mediaType,
      category: r.category as any,
      url: r.url,
      altText: r.altText ?? undefined,
      caption: r.caption ?? undefined,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async create(data: Omit<ProjectMedia, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ProjectMedia> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const insertPayload: any = {
      projectId: data.projectId,
      mediaId: data.mediaId ?? data.id ?? null,
      configurationId: data.configurationId ?? null,
      mediaType: data.mediaType,
      category: data.category,
      url: data.url,
      altText: data.altText ?? null,
      caption: data.caption ?? null,
      sortOrder: data.sortOrder ?? 0,
      isFeatured: data.isFeatured ?? false,
    };
    if (data.id && isUuid(data.id)) {
      insertPayload.id = data.id;
    }

    const [row] = await db
      .insert(projectMedia)
      .values(insertPayload)
      .returning();

    return {
      id: row.id,
      mediaId: row.mediaId ?? row.id,
      projectId: row.projectId,
      configurationId: row.configurationId ?? undefined,
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

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;
    const isIdUuid = isUuid(id);
    const res = await db
      .delete(projectMedia)
      .where(
        isIdUuid
          ? or(eq(projectMedia.id, id), eq(projectMedia.mediaId, id))
          : eq(projectMedia.mediaId, id)
      )
      .returning();
    return res.length > 0;
  }

  async findById(id: string): Promise<ProjectMedia | null> {
    const db = getDb();
    if (!db) return null;
    const isIdUuid = isUuid(id);
    const rows = await db
      .select()
      .from(projectMedia)
      .where(
        isIdUuid
          ? or(eq(projectMedia.id, id), eq(projectMedia.mediaId, id))
          : eq(projectMedia.mediaId, id)
      );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      mediaId: r.mediaId ?? r.id,
      projectId: r.projectId,
      configurationId: r.configurationId ?? undefined,
      mediaType: r.mediaType,
      category: r.category as any,
      url: r.url,
      altText: r.altText ?? undefined,
      caption: r.caption ?? undefined,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<ProjectMedia[]> {
    const db = getDb();
    if (!db) return [];
    let conditions = [];
    if (filter?.category) conditions.push(eq(projectMedia.category, filter.category));
    if (filter?.isFeatured !== undefined) conditions.push(eq(projectMedia.isFeatured, filter.isFeatured));
    const rows = conditions.length > 0
      ? await db.select().from(projectMedia).where(and(...conditions)).orderBy(asc(projectMedia.sortOrder), asc(projectMedia.createdAt))
      : await db.select().from(projectMedia).orderBy(asc(projectMedia.sortOrder), asc(projectMedia.createdAt));
    return rows.map(r => ({
      id: r.id,
      mediaId: r.mediaId ?? r.id,
      projectId: r.projectId,
      configurationId: r.configurationId ?? undefined,
      mediaType: r.mediaType,
      category: r.category as any,
      url: r.url,
      altText: r.altText ?? undefined,
      caption: r.caption ?? undefined,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async update(id: string, data: Partial<ProjectMedia>): Promise<ProjectMedia | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.url !== undefined) updatePayload.url = data.url;
    if (data.altText !== undefined) updatePayload.altText = data.altText;
    if (data.caption !== undefined) updatePayload.caption = data.caption;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
    if (data.isFeatured !== undefined) updatePayload.isFeatured = data.isFeatured;
    if (data.configurationId !== undefined) updatePayload.configurationId = data.configurationId;
    if (data.mediaId !== undefined) updatePayload.mediaId = data.mediaId;

    const isIdUuid = isUuid(id);
    const [row] = await db
      .update(projectMedia)
      .set(updatePayload)
      .where(
        isIdUuid
          ? or(eq(projectMedia.id, id), eq(projectMedia.mediaId, id))
          : eq(projectMedia.mediaId, id)
      )
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      mediaId: row.mediaId ?? row.id,
      projectId: row.projectId,
      configurationId: row.configurationId ?? undefined,
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
}

export class ProjectReraRepositoryPostgres implements ProjectReraRepository {
  async findByProjectId(projectId: string): Promise<ProjectRera | null> {
    if (!isUuid(projectId)) return null;
    const db = getDb();
    if (!db) return null;
    const rows = await db.select().from(projectRera).where(eq(projectRera.projectId, projectId));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      projectId: r.projectId,
      status: r.status as any,
      authority: r.authority ?? undefined,
      registrationNumber: r.registrationNumber ?? undefined,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : undefined,
      verifiedBy: r.verifiedBy ?? undefined,
      internalNotes: r.internalNotes ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectRera[]> {
    const validIds = Array.from(new Set(projectIds.filter(isUuid)));
    if (validIds.length === 0) return [];
    const db = getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(projectRera)
      .where(inArray(projectRera.projectId, validIds));
    return rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      status: r.status as any,
      authority: r.authority ?? undefined,
      registrationNumber: r.registrationNumber ?? undefined,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : undefined,
      verifiedBy: r.verifiedBy ?? undefined,
      internalNotes: r.internalNotes ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async upsert(data: Omit<ProjectRera, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectRera> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await this.findByProjectId(data.projectId);
    if (existing) {
      const [r] = await db
        .update(projectRera)
        .set({
          status: data.status as any,
          authority: data.authority,
          registrationNumber: data.registrationNumber,
          verifiedAt: data.verifiedAt,
          verifiedBy: data.verifiedBy,
          internalNotes: data.internalNotes,
          updatedAt: new Date(),
        } as any)
        .where(eq(projectRera.id, existing.id))
        .returning();

      return {
        id: r.id,
        projectId: r.projectId,
        status: r.status as any,
        authority: r.authority ?? undefined,
        registrationNumber: r.registrationNumber ?? undefined,
        verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
        verifiedBy: r.verifiedBy ?? null,
        internalNotes: r.internalNotes ?? null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      };
    }

    const [r] = await db
      .insert(projectRera)
      .values({
        projectId: data.projectId,
        status: data.status as any,
        authority: data.authority,
        registrationNumber: data.registrationNumber,
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        internalNotes: data.internalNotes,
      } as any)
      .returning();

    return {
      id: r.id,
      projectId: r.projectId,
      status: r.status as any,
      authority: r.authority ?? undefined,
      registrationNumber: r.registrationNumber ?? undefined,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : undefined,
      verifiedBy: r.verifiedBy ?? undefined,
      internalNotes: r.internalNotes ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findAll(): Promise<ProjectRera[]> {
    const db = getDb();
    if (!db) return [];
    const rows = await db.select().from(projectRera);
    return rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      status: r.status as any,
      authority: r.authority ?? undefined,
      registrationNumber: r.registrationNumber ?? undefined,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : undefined,
      verifiedBy: r.verifiedBy ?? undefined,
      internalNotes: r.internalNotes ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }
}

export class AmenityRepositoryPostgres implements AmenityRepository {
  async findAll(): Promise<Amenity[]> {
    const db = getDb();
    if (!db) return [];
    const rows = await db.select().from(amenities);
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

  async findById(id: string): Promise<Amenity | null> {
    const db = getDb();
    if (!db) return null;
    const rows = await db.select().from(amenities).where(eq(amenities.id, id));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      category: r.category as any,
      icon: r.icon ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findBySlug(slug: string): Promise<Amenity | null> {
    const db = getDb();
    if (!db) return null;
    const rows = await db.select().from(amenities).where(eq(amenities.slug, slug));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      category: r.category as any,
      icon: r.icon ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findByIds(ids: string[]): Promise<Amenity[]> {
    if (ids.length === 0) return [];
    const db = getDb();
    if (!db) return [];
    const rows = await db.select().from(amenities).where(inArray(amenities.id, ids));
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

  async findByProjectId(projectId: string): Promise<{ amenity: Amenity; isFeatured: boolean; sortOrder: number }[]> {
    const db = getDb();
    if (!db) return [];

    const paRows = await db.select().from(projectAmenities).where(eq(projectAmenities.projectId, projectId));
    if (paRows.length === 0) return [];

    const amenityIds = paRows.map(p => p.amenityId);
    const amRows = await this.findByIds(amenityIds);

    const map = new Map(amRows.map(a => [a.id, a]));
    const result: { amenity: Amenity; isFeatured: boolean; sortOrder: number }[] = [];

    for (const pa of paRows) {
      const am = map.get(pa.amenityId);
      if (am) {
        result.push({
          amenity: am,
          isFeatured: pa.isFeatured,
          sortOrder: pa.sortOrder,
        });
      }
    }

    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(data: Omit<Amenity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Amenity> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .insert(amenities)
      .values({
        name: data.name,
        slug: data.slug,
        category: data.category || 'GENERAL',
        icon: data.icon,
      } as any)
      .returning();

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category as any,
      icon: row.icon ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async update(id: string, data: Partial<Amenity>): Promise<Amenity | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: any = { updatedAt: new Date() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.slug !== undefined) updatePayload.slug = data.slug;
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.icon !== undefined) updatePayload.icon = data.icon;

    const [row] = await db
      .update(amenities)
      .set(updatePayload)
      .where(eq(amenities.id, id))
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category as any,
      icon: row.icon ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;
    await db.delete(projectAmenities).where(eq(projectAmenities.amenityId, id));
    const res = await db.delete(amenities).where(eq(amenities.id, id)).returning();
    return res.length > 0;
  }

  async countProjectAssociations(amenityId: string): Promise<number> {
    const db = getDb();
    if (!db) return 0;
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(projectAmenities)
      .where(eq(projectAmenities.amenityId, amenityId));
    return Number(rows[0]?.count ?? 0);
  }

  async associateWithProject(projectId: string, amenityId: string, isFeatured = false, sortOrder = 0): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await db
      .select()
      .from(projectAmenities)
      .where(and(eq(projectAmenities.projectId, projectId), eq(projectAmenities.amenityId, amenityId)));

    if (existing.length > 0) {
      await db
        .update(projectAmenities)
        .set({ isFeatured, sortOrder, updatedAt: new Date() } as any)
        .where(eq(projectAmenities.id, existing[0].id));
      return;
    }

    await db.insert(projectAmenities).values({
      projectId,
      amenityId,
      isFeatured,
      sortOrder,
    } as any);
  }

  async dissociateFromProject(projectId: string, amenityId: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const res = await db
      .delete(projectAmenities)
      .where(and(eq(projectAmenities.projectId, projectId), eq(projectAmenities.amenityId, amenityId)))
      .returning();

    return res.length > 0;
  }
}

export class ProjectFaqRepositoryPostgres implements ProjectFaqRepository {
  async findByProjectId(projectId: string): Promise<ProjectFaq[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(projectFaqs).where(eq(projectFaqs.projectId, projectId));
    return rows
      .map(r => ({
        id: r.id,
        projectId: r.projectId,
        question: r.question,
        answer: r.answer,
        sortOrder: r.sortOrder,
        isPublished: r.isPublished,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<ProjectFaq | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(projectFaqs).where(eq(projectFaqs.id, id));
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      projectId: r.projectId,
      question: r.question,
      answer: r.answer,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findAll(): Promise<ProjectFaq[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(projectFaqs);
    return rows
      .map(r => ({
        id: r.id,
        projectId: r.projectId,
        question: r.question,
        answer: r.answer,
        sortOrder: r.sortOrder,
        isPublished: r.isPublished,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(data: Omit<ProjectFaq, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectFaq> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [r] = await db
      .insert(projectFaqs)
      .values({
        projectId: data.projectId,
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder ?? 0,
        isPublished: data.isPublished ?? true,
      } as any)
      .returning();

    return {
      id: r.id,
      projectId: r.projectId,
      question: r.question,
      answer: r.answer,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async update(id: string, data: Partial<ProjectFaq>): Promise<ProjectFaq | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.question !== undefined) updatePayload.question = data.question;
    if (data.answer !== undefined) updatePayload.answer = data.answer;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
    if (data.isPublished !== undefined) updatePayload.isPublished = data.isPublished;

    const [r] = await db
      .update(projectFaqs)
      .set(updatePayload)
      .where(eq(projectFaqs.id, id))
      .returning();

    if (!r) return null;
    return {
      id: r.id,
      projectId: r.projectId,
      question: r.question,
      answer: r.answer,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const res = await db.delete(projectFaqs).where(eq(projectFaqs.id, id)).returning();
    return res.length > 0;
  }
}

export class ProjectSeoRepositoryPostgres implements ProjectSeoRepository {
  async findByProjectId(projectId: string): Promise<ProjectSeo | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(projectSeo).where(eq(projectSeo.projectId, projectId));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      projectId: r.projectId,
      metaTitle: r.metaTitle ?? undefined,
      metaDescription: r.metaDescription ?? undefined,
      canonicalUrl: r.canonicalUrl ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async upsert(data: Omit<ProjectSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectSeo> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await this.findByProjectId(data.projectId);
    if (existing) {
      const [r] = await db
        .update(projectSeo)
        .set({
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          canonicalUrl: data.canonicalUrl,
          updatedAt: new Date(),
        } as any)
        .where(eq(projectSeo.id, existing.id))
        .returning();

      return {
        id: r.id,
        projectId: r.projectId,
        metaTitle: r.metaTitle ?? undefined,
        metaDescription: r.metaDescription ?? undefined,
        canonicalUrl: r.canonicalUrl ?? undefined,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      };
    }

    const [r] = await db
      .insert(projectSeo)
      .values({
        projectId: data.projectId,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        canonicalUrl: data.canonicalUrl,
      } as any)
      .returning();

    return {
      id: r.id,
      projectId: r.projectId,
      metaTitle: r.metaTitle ?? undefined,
      metaDescription: r.metaDescription ?? undefined,
      canonicalUrl: r.canonicalUrl ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }
}

export class DeveloperSeoRepositoryPostgres {
  async findByDeveloperId(developerId: string): Promise<DeveloperSeo | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(developerSeo).where(eq(developerSeo.developerId, developerId));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      developerId: r.developerId,
      metaTitle: r.metaTitle ?? undefined,
      metaDescription: r.metaDescription ?? undefined,
      canonicalUrl: r.canonicalUrl ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async upsert(data: Omit<DeveloperSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperSeo> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const existing = await this.findByDeveloperId(data.developerId);
    if (existing) {
      const [r] = await db
        .update(developerSeo)
        .set({
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          canonicalUrl: data.canonicalUrl,
          updatedAt: new Date(),
        } as any)
        .where(eq(developerSeo.id, existing.id))
        .returning();

      return {
        id: r.id,
        developerId: r.developerId,
        metaTitle: r.metaTitle ?? undefined,
        metaDescription: r.metaDescription ?? undefined,
        canonicalUrl: r.canonicalUrl ?? undefined,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      };
    }

    const [r] = await db
      .insert(developerSeo)
      .values({
        developerId: data.developerId,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        canonicalUrl: data.canonicalUrl,
      } as any)
      .returning();

    return {
      id: r.id,
      developerId: r.developerId,
      metaTitle: r.metaTitle ?? undefined,
      metaDescription: r.metaDescription ?? undefined,
      canonicalUrl: r.canonicalUrl ?? undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }
}

export class DeveloperMediaRepositoryPostgres implements DeveloperMediaRepository {
  async findByDeveloperId(developerId: string): Promise<DeveloperMedia[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(developerMedia).where(eq(developerMedia.developerId, developerId));
    return rows.map(r => ({
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async findByDeveloperIds(developerIds: string[], category?: string): Promise<DeveloperMedia[]> {
    const validIds = Array.from(new Set(developerIds.filter(isUuid)));
    if (validIds.length === 0) return [];

    const db = getDb();
    if (!db) return [];

    const conditions = [inArray(developerMedia.developerId, validIds)];
    if (category) {
      conditions.push(eq(developerMedia.category, category));
    }

    const rows = await db.select().from(developerMedia).where(and(...conditions));
    return rows.map(r => ({
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async findById(id: string): Promise<DeveloperMedia | null> {
    const db = getDb();
    if (!db) return null;
    const rows = await db.select().from(developerMedia).where(eq(developerMedia.id, id));
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<DeveloperMedia[]> {
    const db = getDb();
    if (!db) return [];
    let conditions = [];
    if (filter?.category) conditions.push(eq(developerMedia.category, filter.category));
    if (filter?.isFeatured !== undefined) conditions.push(eq(developerMedia.isFeatured, filter.isFeatured));
    const rows = conditions.length > 0
      ? await db.select().from(developerMedia).where(and(...conditions))
      : await db.select().from(developerMedia);
    return rows.map(r => ({
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
  }

  async create(data: Omit<DeveloperMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperMedia> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [r] = await db
      .insert(developerMedia)
      .values({
        developerId: data.developerId,
        mediaType: data.mediaType,
        category: data.category,
        url: data.url,
        sortOrder: data.sortOrder ?? 0,
        isFeatured: data.isFeatured ?? false,
      } as any)
      .returning();

    return {
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async update(id: string, data: Partial<DeveloperMedia>): Promise<DeveloperMedia | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.url !== undefined) updatePayload.url = data.url;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
    if (data.isFeatured !== undefined) updatePayload.isFeatured = data.isFeatured;

    const [r] = await db
      .update(developerMedia)
      .set(updatePayload)
      .where(eq(developerMedia.id, id))
      .returning();

    if (!r) return null;
    return {
      id: r.id,
      developerId: r.developerId,
      mediaType: r.mediaType as any,
      category: r.category as any,
      url: r.url,
      sortOrder: r.sortOrder,
      isFeatured: r.isFeatured,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;
    const res = await db.delete(developerMedia).where(eq(developerMedia.id, id)).returning();
    return res.length > 0;
  }
}
