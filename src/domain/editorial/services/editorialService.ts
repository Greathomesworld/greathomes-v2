import { getDb } from '@/src/db/client';
import { projects, developers, locations } from '@/src/db/schema';
import { eq, or } from 'drizzle-orm';
import {
  EditorialArticle,
  EditorialContentType,
  EditorialStatus,
  PublicEditorialArticleDTO,
  formatContentTypeDisplay,
  calculateReadingTime,
} from '../entities';
import { editorialRepositoryPostgres } from '../repositories/editorialRepositoryPostgres';
import { auditService } from '../../audit/auditService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';

import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

export class EditorialService {
  private repository = editorialRepositoryPostgres;

  /**
   * Helper to map an EditorialArticle entity to a clean, public-safe DTO.
   * Strips internal notes, staff IDs, audit history, and unapproved state.
   */
  private async mapToPublicDto(
    article: EditorialArticle,
    preloadedMaps?: {
      projectMap?: Map<string, any>;
      devMap?: Map<string, any>;
      locMap?: Map<string, any>;
    }
  ): Promise<PublicEditorialArticleDTO> {
    const db = getDb();
    let project = null;
    let developer = null;
    let location = null;

    if (preloadedMaps) {
      if (article.projectId && preloadedMaps.projectMap) {
        const p = preloadedMaps.projectMap.get(article.projectId);
        if (p) {
          project = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            status: p.status,
            startingPrice: !p.priceOnRequest && p.startingPrice !== undefined && p.startingPrice !== null ? String(p.startingPrice) : null,
          };
        }
      }
      if (article.developerId && preloadedMaps.devMap) {
        const d = preloadedMaps.devMap.get(article.developerId);
        if (d) developer = { id: d.id, name: d.name, slug: d.slug };
      }
      if (article.locationId && preloadedMaps.locMap) {
        const l = preloadedMaps.locMap.get(article.locationId);
        if (l) location = { id: l.id, name: l.name, slug: l.slug, type: l.type };
      }
    } else if (db) {
      if (article.projectId) {
        const p = await projectRepository.findById(article.projectId);
        if (p) {
          project = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            status: p.status,
            startingPrice: !p.priceOnRequest && p.startingPrice !== undefined && p.startingPrice !== null ? String(p.startingPrice) : null,
          };
        }
      }

      if (article.developerId) {
        const [d] = await db
          .select({ id: developers.id, name: developers.name, slug: developers.slug })
          .from(developers)
          .where(eq(developers.id, article.developerId))
          .limit(1);
        if (d) developer = d;
      }

      if (article.locationId) {
        const [l] = await db
          .select({ id: locations.id, name: locations.name, slug: locations.slug, type: locations.type })
          .from(locations)
          .where(eq(locations.id, article.locationId))
          .limit(1);
        if (l) location = l;
      }
    } else {
      await ensureSeedData();
      if (article.projectId) {
        const p = await projectRepository.findById(article.projectId);
        if (p) {
          project = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            status: p.status,
            startingPrice: !p.priceOnRequest ? (p.startingPrice ?? null) : null,
          };
        }
      }
      if (article.developerId) {
        const d = await developerRepository.findById(article.developerId);
        if (d) developer = { id: d.id, name: d.name, slug: d.slug };
      }
      if (article.locationId) {
        const l = await locationRepository.findById(article.locationId);
        if (l) location = { id: l.id, name: l.name, slug: l.slug, type: l.type };
      }
    }

    const canonicalPath = article.canonicalUrl ||
      (article.type === 'PROJECT_REVIEW' ? `/reviews/${article.slug}` : `/guides/${article.slug}`);

    return {
      id: article.id,
      type: article.type,
      typeDisplay: formatContentTypeDisplay(article.type),
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      body: article.body,
      authorName: article.authorName || 'Great Homes Editorial Team',
      authorRole: article.authorRole || 'Editorial Team',
      publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
      updatedAt: article.updatedAt.toISOString(),
      featuredImage: normalizeMediaPublicUrl(article.featuredImage || null),
      seoTitle: article.seoTitle || article.title,
      seoDescription: article.seoDescription || article.excerpt,
      canonicalUrl: canonicalPath,
      readingTimeMinutes: article.readingTimeMinutes || calculateReadingTime(article.body),
      structuredSections: article.structuredSections || [],
      project,
      developer,
      location,
    };
  }

  /**
   * Fetches published editorial articles for consumer view.
   */
  async getPublicArticles(options?: {
    type?: EditorialContentType;
    projectId?: string;
    developerId?: string;
    locationId?: string;
    search?: string;
    limit?: number;
    offset?: number;
    preloadedMaps?: {
      projectMap?: Map<string, any>;
      devMap?: Map<string, any>;
      locMap?: Map<string, any>;
    };
  }): Promise<{ items: PublicEditorialArticleDTO[]; total: number }> {
    const { preloadedMaps, ...rest } = options || {};
    const filter = {
      ...rest,
      status: 'PUBLISHED' as EditorialStatus,
    };

    const { items, total } = await this.repository.findAll(filter);
    const dtoItems = await Promise.all(items.map((item) => this.mapToPublicDto(item, preloadedMaps)));

    return { items: dtoItems, total };
  }

  /**
   * Fetches a single published article by slug.
   */
  async getPublicArticleBySlug(slug: string): Promise<PublicEditorialArticleDTO | null> {
    const article = await this.repository.findBySlug(slug);
    if (!article || article.status !== 'PUBLISHED') return null;

    const dto = await this.mapToPublicDto(article);
    const related = await this.repository.findRelated(article, 3);
    dto.relatedArticles = await Promise.all(
      related.map(async (r) => {
        const publicR = await this.mapToPublicDto(r);
        return {
          id: publicR.id,
          type: publicR.type,
          typeDisplay: publicR.typeDisplay,
          title: publicR.title,
          slug: publicR.slug,
          excerpt: publicR.excerpt,
          featuredImage: publicR.featuredImage,
          readingTimeMinutes: publicR.readingTimeMinutes,
        };
      })
    );

    return dto;
  }

  /**
   * Retrieves the canonical Project Review for a project (by ID or slug).
   */
  async getProjectReview(projectIdOrSlug: string): Promise<PublicEditorialArticleDTO | null> {
    const db = getDb();
    let projId: string | null = null;
    if (db) {
      const [proj] = await db
        .select({ id: projects.id, slug: projects.slug })
        .from(projects)
        .where(or(eq(projects.id, projectIdOrSlug), eq(projects.slug, projectIdOrSlug)))
        .limit(1);
      if (proj) projId = proj.id;
    } else {
      await ensureSeedData();
      const proj = (await projectRepository.findBySlug(projectIdOrSlug)) || (await projectRepository.findById(projectIdOrSlug));
      if (proj) projId = proj.id;
    }

    if (!projId) return null;

    const { items } = await this.repository.findAll({
      type: 'PROJECT_REVIEW',
      status: 'PUBLISHED',
      projectId: projId,
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToPublicDto(items[0]);
  }

  /**
   * Retrieves the canonical Location Guide for a location (by ID or slug).
   */
  async getLocationGuide(locationIdOrSlug: string): Promise<PublicEditorialArticleDTO | null> {
    const db = getDb();
    let locId: string | null = null;
    if (db) {
      const [loc] = await db
        .select({ id: locations.id, slug: locations.slug })
        .from(locations)
        .where(or(eq(locations.id, locationIdOrSlug), eq(locations.slug, locationIdOrSlug)))
        .limit(1);
      if (loc) locId = loc.id;
    } else {
      await ensureSeedData();
      const loc = (await locationRepository.findBySlug(locationIdOrSlug)) || (await locationRepository.findById(locationIdOrSlug));
      if (loc) locId = loc.id;
    }

    if (!locId) return null;

    const { items } = await this.repository.findAll({
      type: 'LOCATION_GUIDE',
      status: 'PUBLISHED',
      locationId: locId,
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToPublicDto(items[0]);
  }

  /**
   * Retrieves Developer Stories for a developer (by ID or slug).
   */
  async getDeveloperStories(developerIdOrSlug: string): Promise<PublicEditorialArticleDTO[]> {
    const db = getDb();
    let devId: string | null = null;
    if (db) {
      const [dev] = await db
        .select({ id: developers.id, slug: developers.slug })
        .from(developers)
        .where(or(eq(developers.id, developerIdOrSlug), eq(developers.slug, developerIdOrSlug)))
        .limit(1);
      if (dev) devId = dev.id;
    } else {
      await ensureSeedData();
      const dev = (await developerRepository.findBySlug(developerIdOrSlug)) || (await developerRepository.findById(developerIdOrSlug));
      if (dev) devId = dev.id;
    }

    if (!devId) return [];

    const { items } = await this.repository.findAll({
      type: 'DEVELOPER_STORY',
      status: 'PUBLISHED',
      developerId: devId,
      limit: 10,
    });

    return Promise.all(items.map((i) => this.mapToPublicDto(i)));
  }

  // --- ADMIN & LIFECYCLE WORKFLOW ---

  async listAdminArticles(filter?: {
    type?: EditorialContentType;
    status?: EditorialStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: EditorialArticle[]; total: number }> {
    return this.repository.findAll(filter);
  }

  async getAdminArticleById(id: string): Promise<EditorialArticle | null> {
    return this.repository.findById(id);
  }

  async createArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    data: Omit<EditorialArticle, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<EditorialArticle> {
    const created = await this.repository.create(data);

    await auditService.record(req, staff, {
      action: 'CREATE',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: created.id,
      success: true,
      changes: { newStatus: created.status, type: created.type, title: created.title },
    });

    return created;
  }

  async updateArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    id: string,
    data: Partial<EditorialArticle>
  ): Promise<EditorialArticle | null> {
    const updated = await this.repository.update(id, data);
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'UPDATE',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: updated.id,
      success: true,
      changes: { status: updated.status, updatedFields: Object.keys(data) },
    });

    return updated;
  }

  async submitArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    id: string
  ): Promise<EditorialArticle | null> {
    const updated = await this.repository.update(id, { status: 'IN_REVIEW' });
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'UPDATE_STATUS',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: updated.id,
      success: true,
      changes: { newStatus: 'IN_REVIEW' },
    });

    return updated;
  }

  async approveArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    id: string
  ): Promise<EditorialArticle | null> {
    const updated = await this.repository.update(id, { status: 'APPROVED' });
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'UPDATE_STATUS',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: updated.id,
      success: true,
      changes: { newStatus: 'APPROVED' },
    });

    return updated;
  }

  async publishArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    id: string
  ): Promise<EditorialArticle | null> {
    const updated = await this.repository.update(id, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'PUBLISH',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: updated.id,
      success: true,
      changes: { newStatus: 'PUBLISHED', publishedAt: updated.publishedAt },
    });

    return updated;
  }

  async archiveArticle(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    id: string
  ): Promise<EditorialArticle | null> {
    const updated = await this.repository.update(id, { status: 'ARCHIVED' });
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'ARCHIVE',
      resourceType: 'EDITORIAL_ARTICLE',
      resourceId: updated.id,
      success: true,
      changes: { newStatus: 'ARCHIVED' },
    });

    return updated;
  }
}

export const editorialService = new EditorialService();
