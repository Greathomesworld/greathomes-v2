import { getDb } from '@/src/db/client';
import { editorialArticles } from '@/src/db/schema';
import { eq, and, or, ilike, desc, sql, ne } from 'drizzle-orm';
import { EditorialArticle, EditorialContentType, EditorialStatus, FactCheckStatus, calculateReadingTime } from '../entities';
import { EditorialRepository, EditorialFilterOptions } from './editorialRepository';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';

let memoryArticles: EditorialArticle[] | null = null;

async function getMemoryArticles(): Promise<EditorialArticle[]> {
  if (memoryArticles) return memoryArticles;
  await ensureSeedData();

  const [merlinRise, merlinGroup, rajarhat] = await Promise.all([
    projectRepository.findBySlug('merlin-rise'),
    developerRepository.findBySlug('merlin-group'),
    locationRepository.findBySlug('rajarhat'),
  ]);

  const now = new Date();
  memoryArticles = [
    {
      id: 'ed-article-merlin-rise-review',
      type: 'PROJECT_REVIEW',
      title: 'Merlin Rise Rajarhat: Comprehensive Editorial Review & Buyer Overview',
      slug: 'merlin-rise-rajarhat-review',
      excerpt: 'An independent, factual editorial assessment of Merlin Rise in Rajarhat, covering sports-themed amenities, connectivity, configuration layouts, and RERA registration details.',
      body: `## Overview of Merlin Rise

Merlin Rise is a major residential development situated in the Rajarhat sector of Kolkata. Designed around a sports-themed residential ecosystem, the project spans multi-tower high-rise residential blocks offering 2 BHK and 3 BHK apartment configurations.

### Location & Connectivity
Situated along Rajarhat Main Road, Merlin Rise offers direct vehicular access to the Biswa Bangla Sarani corridor, connecting residents to Salt Lake Sector V in approximately 20–25 minutes depending on traffic conditions. The upcoming Yellow Line Metro expansion near Chinar Park is expected to enhance rapid transit connectivity for commuters heading toward NSCBI Airport and Central Kolkata.

### Configuration Layouts & Pricing Context
- **2 BHK Units**: Ranging from 610 sq.ft. to 685 sq.ft. carpet area. Entry-level carpet pricing is recorded starting from approximately ₹45 Lakhs.
- **3 BHK Units**: Ranging from 820 sq.ft. to 980 sq.ft. carpet area, with multi-balcony layouts and dedicated utility space.

### RERA Registration & Project Verification
Merlin Rise is registered under West Bengal Housing Industry Regulatory Authority (WB RERA). The project's official registration status is verified on state regulatory portals with registered tower completion schedules.

### Buyer Considerations
- **Who May Consider**: Families seeking community living with integrated sports training academies and structured club facilities.
- **Things to Keep in Mind**: Construction is progressing in phased tower handovers. Buyers should verify specific tower possession schedules with official developer disclosures.`,
      status: 'PUBLISHED',
      authorName: 'Great Homes Editorial Team',
      authorRole: 'Residential Content Analysts',
      publishedAt: new Date('2026-09-15'),
      featuredImage: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      seoTitle: 'Merlin Rise Rajarhat Project Review & Buyer Overview | Great Homes',
      seoDescription: 'Read the independent Great Homes editorial review of Merlin Rise Rajarhat. Factual breakdown of configurations, pricing context, RERA verification, and location connectivity.',
      canonicalUrl: '/reviews/merlin-rise-rajarhat-review',
      projectId: merlinRise ? merlinRise.id : null,
      developerId: merlinGroup ? merlinGroup.id : null,
      locationId: rajarhat ? rajarhat.id : null,
      readingTimeMinutes: 6,
      contentVersion: 1,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Project Overview', content: 'Detailed analysis of Merlin Rise high-rise residential towers.' },
        { id: 'sec-2', title: 'RERA & Legal Disclosures', content: 'WB RERA registration details and verified possession timelines.' },
        { id: 'sec-3', title: 'Location Connectivity', content: 'Transit routes to Sector V, Rajarhat Main Road, and NSCBI Airport.' },
      ],
      createdAt: new Date('2026-09-15'),
      updatedAt: now,
    },
    {
      id: 'ed-article-carpet-area-guide',
      type: 'BUYING_GUIDE',
      title: 'Carpet Area vs Built-Up Area in Kolkata: A Buyer Guide',
      slug: 'carpet-area-vs-built-up-area-kolkata-guide',
      excerpt: 'Learn how carpet area, built-up area, and super built-up area are calculated in West Bengal residential real estate, with practical examples and RERA standards.',
      body: `## Understanding Area Terms in Kolkata Real Estate

When evaluating residential apartments in Kolkata, understanding how square footage is measured is essential to evaluating fair pricing per square foot.

### 1. Carpet Area (RERA Mandated)
Carpet area represents the net usable floor area of an apartment, excluding the area covered by external walls, service shafts, and balconies, but including internal partition walls. Under RERA, developers are legally required to quote and register all sales transactions based strictly on carpet area.

### 2. Built-Up Area
Built-up area includes the carpet area plus the area of outer walls, balconies, and private terraces. Typically, built-up area is 10% to 15% larger than carpet area.

### 3. Super Built-Up Area
Super built-up area includes the built-up area plus a proportionate share of common building areas such as lobbies, staircase wells, elevator shafts, generator rooms, and clubhouses.

### Key Takeaway for Buyers
Always demand pricing breakdown per square foot of **Carpet Area**. Comparing two projects based on super built-up area can be misleading due to varying common loading percentages (ranging from 20% to 35%).`,
      status: 'PUBLISHED',
      authorName: 'Great Homes Editorial Team',
      authorRole: 'Real Estate Legal & Technical Editors',
      publishedAt: new Date('2026-09-01'),
      featuredImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      seoTitle: 'Carpet Area vs Built-Up Area Kolkata Buying Guide | Great Homes',
      seoDescription: 'Understand the difference between carpet area, built-up area, and super built-up area in Kolkata flats. Learn RERA measurement rules before buying.',
      canonicalUrl: '/guides/carpet-area-vs-built-up-area-kolkata-guide',
      projectId: null,
      developerId: null,
      locationId: null,
      readingTimeMinutes: 5,
      contentVersion: 1,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Carpet Area Rules under RERA', content: 'How net usable area is calculated by law.' },
        { id: 'sec-2', title: 'Common Loading Explained', content: 'Why loading percentages differ between stand-alone and township developments.' },
      ],
      createdAt: new Date('2026-09-01'),
      updatedAt: now,
    },
    {
      id: 'ed-article-rajarhat-location-guide',
      type: 'LOCATION_GUIDE',
      title: 'Rajarhat Residential Location Guide: Infrastructure, Connectivity & Options',
      slug: 'rajarhat-residential-location-guide',
      excerpt: 'An in-depth residential guide to Rajarhat, Kolkata. Explore neighborhood sectors, transit routes, project availability, and key buyer considerations.',
      body: `## Residential Overview of Rajarhat

Rajarhat has emerged as one of Kolkata's primary residential expansion zones over the past two decades. Bordering Salt Lake and New Town, it offers a diverse range of housing options from standalone G+4 apartment blocks to multi-tower gated townships.

### Neighborhood Sectors & Connectivity
- **Chinar Park / Rajarhat Main Road**: High density of retail, healthcare, and dining hubs, with immediate access to Major Arterial Road.
- **Lalkuthi / Chowmatha**: Established residential pockets featuring mid-tier residential developments.
- **Airport Proximity**: Located within 15–20 minutes drive of NSCBI Airport.

### Residential Supply & Price Trends
Great Homes market telemetry indicates a strong concentration of 2 BHK and 3 BHK apartment units in Rajarhat, with carpet pricing ranging between ₹4,200 and ₹6,800 per sq.ft. depending on project age, amenities, and proximity to major transit nodes.`,
      status: 'PUBLISHED',
      authorName: 'Great Homes Editorial Team',
      authorRole: 'Location Intelligence Analysts',
      publishedAt: new Date('2026-08-20'),
      featuredImage: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
      seoTitle: 'Rajarhat Kolkata Residential Location Guide | Great Homes',
      seoDescription: 'Explore the complete Rajarhat Kolkata location guide. Neighborhood breakdown, transit connectivity, project options, and market pricing telemetry.',
      canonicalUrl: '/locations/rajarhat/guide',
      projectId: null,
      developerId: null,
      locationId: rajarhat ? rajarhat.id : null,
      readingTimeMinutes: 7,
      contentVersion: 1,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Neighborhood Zones', content: 'Detailed sector breakdown of Rajarhat Chowmatha, Chinar Park, and Airport corridor.' },
      ],
      createdAt: new Date('2026-08-20'),
      updatedAt: now,
    },
    {
      id: 'ed-article-merlin-group-story',
      type: 'DEVELOPER_STORY',
      title: 'Merlin Group: Decades of Residential Development in Kolkata',
      slug: 'merlin-group-developer-story',
      excerpt: 'A factual developer profile on Merlin Group, detailing their residential portfolio, major completed projects, township developments, and presence across Kolkata.',
      body: `## Overview of Merlin Group

Established over three decades ago, Merlin Group is one of Eastern India's prominent real estate development firms. Headquartered in Kolkata, the group has delivered residential townships, commercial complexes, and retail centers across West Bengal.

### Key Residential Footprint
Merlin Group's portfolio spans established residential nodes in Kolkata including Prince Anwar Shah Road, EM Bypass, Rajarhat, New Town, and BT Road. Notable developments include Merlin Rise (Rajarhat), Merlin Fifth Avenue (Sector V), and Merlin Waterfront (Howrah).

### Architectural & Project Ecosystem
Projects typically feature comprehensive resident clubhouses, landscaped gardens, and dedicated sports/wellness infrastructure integrated into high-rise gated complexes.`,
      status: 'PUBLISHED',
      authorName: 'Great Homes Editorial Team',
      authorRole: 'Developer Industry Analysts',
      publishedAt: new Date('2026-08-10'),
      featuredImage: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      seoTitle: 'Merlin Group Profile & Residential Portfolio | Great Homes',
      seoDescription: 'Read the Great Homes developer profile on Merlin Group. Overview of completed projects, residential footprints in Kolkata, and township developments.',
      canonicalUrl: '/developers/merlin-group/stories',
      projectId: null,
      developerId: merlinGroup ? merlinGroup.id : null,
      locationId: null,
      readingTimeMinutes: 4,
      contentVersion: 1,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Portfolio Summary', content: 'Factual overview of completed and ongoing residential projects.' },
      ],
      createdAt: new Date('2026-08-10'),
      updatedAt: now,
    },
    {
      id: 'ed-article-kolkata-pricing-guide',
      type: 'MARKET_GUIDE',
      title: 'Understanding Kolkata Residential Pricing & Configuration Trends',
      slug: 'kolkata-residential-pricing-configuration-guide',
      excerpt: 'An educational guide explaining how carpet area pricing, bedroom configurations (2 BHK vs 3 BHK), and RERA verification impact Kolkata residential property choices.',
      body: `## Residential Market Structure in Kolkata

Kolkata's residential market is characterized by distinct geographic micro-markets, varying from heritage South/Central neighborhoods to planned eastern expansion zones in Salt Lake, Rajarhat, and New Town.

### Bedroom Configuration Distribution
Data recorded across published projects in Great Homes reveals that 2 BHK and 3 BHK units constitute over 80% of total residential supply in Kolkata's growth corridors. 2 BHK configurations cater primarily to first-time homebuyers and working professionals in Sector V / New Town IT hubs, whereas 3 BHK units accommodate joint families and long-term end users.

### Pricing Mechanics & Area Bases
Price comparisons must always account for the underlying measurement basis:
- **Carpet Area**: The legally mandated pricing metric under RERA.
- **Location Premium**: Proximity to metro stations (e.g., Green Line, Orange Line, Yellow Line) commands a consistent 10%–15% valuation premium over interior pockets.`,
      status: 'PUBLISHED',
      authorName: 'Great Homes Editorial Team',
      authorRole: 'Market Intelligence Analysts',
      publishedAt: new Date('2026-07-25'),
      featuredImage: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      seoTitle: 'Kolkata Residential Pricing & Configuration Market Guide | Great Homes',
      seoDescription: 'Learn how residential property prices, 2 BHK vs 3 BHK configurations, and transit proximity shape home buying decisions in Kolkata.',
      canonicalUrl: '/guides/kolkata-residential-pricing-configuration-guide',
      projectId: null,
      developerId: null,
      locationId: null,
      readingTimeMinutes: 6,
      contentVersion: 1,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Configuration Dynamics', content: 'Analysis of 2 BHK and 3 BHK demand trends across Kolkata expansion corridors.' },
      ],
      createdAt: new Date('2026-07-25'),
      updatedAt: now,
    },
  ];
  return memoryArticles;
}

export class EditorialRepositoryPostgres implements EditorialRepository {
  private mapRowToEntity(row: any): EditorialArticle {
    return {
      id: row.id,
      type: row.type as EditorialContentType,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      body: row.body,
      status: row.status as EditorialStatus,
      authorName: row.authorName || 'Great Homes Editorial Team',
      authorRole: row.authorRole || 'Editorial Team',
      publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
      featuredImage: row.featuredImage || null,
      seoTitle: row.seoTitle || null,
      seoDescription: row.seoDescription || null,
      canonicalUrl: row.canonicalUrl || null,
      projectId: row.projectId || null,
      developerId: row.developerId || null,
      locationId: row.locationId || null,
      readingTimeMinutes: row.readingTimeMinutes || calculateReadingTime(row.body),
      contentVersion: row.contentVersion || 1,
      factCheckStatus: (row.factCheckStatus as FactCheckStatus) || 'NOT_REVIEWED',
      structuredSections: row.structuredSections || null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async findAll(filter?: EditorialFilterOptions): Promise<{ items: EditorialArticle[]; total: number }> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      let filtered = [...all];
      if (filter?.type) filtered = filtered.filter((a) => a.type === filter.type);
      if (filter?.status) filtered = filtered.filter((a) => a.status === filter.status);
      if (filter?.projectId) filtered = filtered.filter((a) => a.projectId === filter.projectId);
      if (filter?.developerId) filtered = filtered.filter((a) => a.developerId === filter.developerId);
      if (filter?.locationId) filtered = filtered.filter((a) => a.locationId === filter.locationId);
      if (filter?.search) {
        const q = filter.search.trim().toLowerCase();
        filtered = filtered.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.excerpt.toLowerCase().includes(q) ||
            a.slug.toLowerCase().includes(q)
        );
      }
      const total = filtered.length;
      const offset = filter?.offset || 0;
      const limit = filter?.limit || 50;
      return { items: filtered.slice(offset, offset + limit), total };
    }

    const conditions = [];

    if (filter?.type) {
      conditions.push(eq(editorialArticles.type, filter.type));
    }
    if (filter?.status) {
      conditions.push(eq(editorialArticles.status, filter.status));
    }
    if (filter?.projectId) {
      conditions.push(eq(editorialArticles.projectId, filter.projectId));
    }
    if (filter?.developerId) {
      conditions.push(eq(editorialArticles.developerId, filter.developerId));
    }
    if (filter?.locationId) {
      conditions.push(eq(editorialArticles.locationId, filter.locationId));
    }
    if (filter?.search) {
      const searchPattern = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(editorialArticles.title, searchPattern),
          ilike(editorialArticles.excerpt, searchPattern),
          ilike(editorialArticles.slug, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    const rows = await db
      .select()
      .from(editorialArticles)
      .where(whereClause)
      .orderBy(desc(editorialArticles.publishedAt), desc(editorialArticles.createdAt))
      .limit(limit)
      .offset(offset);

    let total = rows.length;
    if (offset > 0 || rows.length === limit) {
      const countRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(editorialArticles)
        .where(whereClause);
      total = Number(countRes[0]?.count || 0);
    }

    const items = rows.map((r) => this.mapRowToEntity(r));

    return { items, total };
  }

  async findBySlug(slug: string): Promise<EditorialArticle | null> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      return all.find((a) => a.slug === slug) || null;
    }

    const rows = await db
      .select()
      .from(editorialArticles)
      .where(eq(editorialArticles.slug, slug))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findById(id: string): Promise<EditorialArticle | null> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      return all.find((a) => a.id === id) || null;
    }

    const rows = await db
      .select()
      .from(editorialArticles)
      .where(eq(editorialArticles.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async create(data: Omit<EditorialArticle, 'id' | 'createdAt' | 'updatedAt'>): Promise<EditorialArticle> {
    const db = getDb();
    const readingTime = data.readingTimeMinutes || calculateReadingTime(data.body);

    if (!db) {
      const all = await getMemoryArticles();
      const now = new Date();
      const created: EditorialArticle = {
        ...data,
        id: `ed-${Date.now()}`,
        readingTimeMinutes: readingTime,
        createdAt: now,
        updatedAt: now,
      };
      all.unshift(created);
      return created;
    }

    const [row] = await db
      .insert(editorialArticles)
      .values({
        type: data.type,
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt,
        body: data.body,
        status: data.status || 'DRAFT',
        authorName: data.authorName || 'Great Homes Editorial Team',
        authorRole: data.authorRole || 'Editorial Team',
        publishedAt: data.publishedAt || null,
        featuredImage: data.featuredImage || null,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        canonicalUrl: data.canonicalUrl || null,
        projectId: data.projectId || null,
        developerId: data.developerId || null,
        locationId: data.locationId || null,
        readingTimeMinutes: readingTime,
        contentVersion: data.contentVersion || 1,
        factCheckStatus: data.factCheckStatus || 'NOT_REVIEWED',
        structuredSections: data.structuredSections || null,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, data: Partial<EditorialArticle>): Promise<EditorialArticle | null> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      const idx = all.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      const updated: EditorialArticle = {
        ...all[idx],
        ...data,
        readingTimeMinutes: data.body ? calculateReadingTime(data.body) : all[idx].readingTimeMinutes,
        updatedAt: new Date(),
      };
      all[idx] = updated;
      return updated;
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.slug !== undefined) updatePayload.slug = data.slug;
    if (data.excerpt !== undefined) updatePayload.excerpt = data.excerpt;
    if (data.body !== undefined) {
      updatePayload.body = data.body;
      updatePayload.readingTimeMinutes = calculateReadingTime(data.body);
    }
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.authorName !== undefined) updatePayload.authorName = data.authorName;
    if (data.authorRole !== undefined) updatePayload.authorRole = data.authorRole;
    if (data.publishedAt !== undefined) updatePayload.publishedAt = data.publishedAt;
    if (data.featuredImage !== undefined) updatePayload.featuredImage = data.featuredImage;
    if (data.seoTitle !== undefined) updatePayload.seoTitle = data.seoTitle;
    if (data.seoDescription !== undefined) updatePayload.seoDescription = data.seoDescription;
    if (data.canonicalUrl !== undefined) updatePayload.canonicalUrl = data.canonicalUrl;
    if (data.projectId !== undefined) updatePayload.projectId = data.projectId;
    if (data.developerId !== undefined) updatePayload.developerId = data.developerId;
    if (data.locationId !== undefined) updatePayload.locationId = data.locationId;
    if (data.readingTimeMinutes !== undefined) updatePayload.readingTimeMinutes = data.readingTimeMinutes;
    if (data.contentVersion !== undefined) updatePayload.contentVersion = data.contentVersion;
    if (data.factCheckStatus !== undefined) updatePayload.factCheckStatus = data.factCheckStatus;
    if (data.structuredSections !== undefined) updatePayload.structuredSections = data.structuredSections;

    const [row] = await db
      .update(editorialArticles)
      .set(updatePayload)
      .where(eq(editorialArticles.id, id))
      .returning();

    return row ? this.mapRowToEntity(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      const idx = all.findIndex((a) => a.id === id);
      if (idx === -1) return false;
      all.splice(idx, 1);
      return true;
    }

    await db.delete(editorialArticles).where(eq(editorialArticles.id, id));
    return true;
  }

  async findRelated(article: EditorialArticle, limit: number = 3): Promise<EditorialArticle[]> {
    const db = getDb();
    if (!db) {
      const all = await getMemoryArticles();
      return all
        .filter((a) => a.status === 'PUBLISHED' && a.id !== article.id)
        .slice(0, limit);
    }

    const conditions = [
      eq(editorialArticles.status, 'PUBLISHED'),
      ne(editorialArticles.id, article.id),
    ];

    const matchers = [];
    if (article.projectId) matchers.push(eq(editorialArticles.projectId, article.projectId));
    if (article.locationId) matchers.push(eq(editorialArticles.locationId, article.locationId));
    if (article.developerId) matchers.push(eq(editorialArticles.developerId, article.developerId));
    matchers.push(eq(editorialArticles.type, article.type));

    if (matchers.length > 0) {
      conditions.push(or(...matchers));
    }

    const rows = await db
      .select()
      .from(editorialArticles)
      .where(and(...conditions))
      .orderBy(desc(editorialArticles.publishedAt))
      .limit(limit);

    return rows.map((r) => this.mapRowToEntity(r));
  }
}

export const editorialRepositoryPostgres = new EditorialRepositoryPostgres();
