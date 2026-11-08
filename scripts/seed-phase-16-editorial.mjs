import { getDb } from '../src/db/client.js';
import { editorialArticles, projects, developers, locations } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function seedEditorialData() {
  console.log('------------------------------------------------------------');
  console.log('SEEDING PHASE 16 EDITORIAL INTELLIGENCE DATA...');
  console.log('------------------------------------------------------------');

  const db = getDb();
  if (!db) {
    console.error('Database connection unavailable for seeding.');
    process.exit(1);
  }

  // Query existing published entities
  const [allProjects, allDevelopers, allLocations] = await Promise.all([
    db.select().from(projects),
    db.select().from(developers),
    db.select().from(locations),
  ]);

  const merlinRise = allProjects.find(p => p.slug.includes('merlin-rise')) || allProjects[0];
  const merlinGroup = allDevelopers.find(d => d.slug.includes('merlin')) || allDevelopers[0];
  const rajarhat = allLocations.find(l => l.slug.includes('rajarhat')) || allLocations[0];
  const newTown = allLocations.find(l => l.slug.includes('new-town')) || allLocations[1] || rajarhat;

  const articles = [
    {
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
      featuredImage: 'https://picsum.photos/seed/merlinreview/1200/630',
      seoTitle: 'Merlin Rise Rajarhat Project Review & Buyer Overview | Great Homes',
      seoDescription: 'Read the independent Great Homes editorial review of Merlin Rise Rajarhat. Factual breakdown of configurations, pricing context, RERA verification, and location connectivity.',
      canonicalUrl: '/reviews/merlin-rise-rajarhat-review',
      projectId: merlinRise ? merlinRise.id : null,
      developerId: merlinGroup ? merlinGroup.id : null,
      locationId: rajarhat ? rajarhat.id : null,
      readingTimeMinutes: 6,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Project Overview', content: 'Detailed analysis of Merlin Rise high-rise residential towers.' },
        { id: 'sec-2', title: 'RERA & Legal Disclosures', content: 'WB RERA registration details and verified possession timelines.' },
        { id: 'sec-3', title: 'Location Connectivity', content: 'Transit routes to Sector V, Rajarhat Main Road, and NSCBI Airport.' }
      ]
    },
    {
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
      featuredImage: 'https://picsum.photos/seed/carpetareaguide/1200/630',
      seoTitle: 'Carpet Area vs Built-Up Area Kolkata Buying Guide | Great Homes',
      seoDescription: 'Understand the difference between carpet area, built-up area, and super built-up area in Kolkata flats. Learn RERA measurement rules before buying.',
      canonicalUrl: '/guides/carpet-area-vs-built-up-area-kolkata-guide',
      projectId: null,
      developerId: null,
      locationId: null,
      readingTimeMinutes: 5,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Carpet Area Rules under RERA', content: 'How net usable area is calculated by law.' },
        { id: 'sec-2', title: 'Common Loading Explained', content: 'Why loading percentages differ between stand-alone and township developments.' }
      ]
    },
    {
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
      featuredImage: 'https://picsum.photos/seed/rajarhatguide/1200/630',
      seoTitle: 'Rajarhat Kolkata Residential Location Guide | Great Homes',
      seoDescription: 'Explore the complete Rajarhat Kolkata location guide. Neighborhood breakdown, transit connectivity, project options, and market pricing telemetry.',
      canonicalUrl: '/locations/rajarhat/guide',
      projectId: null,
      developerId: null,
      locationId: rajarhat ? rajarhat.id : null,
      readingTimeMinutes: 7,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Neighborhood Zones', content: 'Detailed sector breakdown of Rajarhat Chowmatha, Chinar Park, and Airport corridor.' }
      ]
    },
    {
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
      featuredImage: 'https://picsum.photos/seed/merlingroup/1200/630',
      seoTitle: 'Merlin Group Profile & Residential Portfolio | Great Homes',
      seoDescription: 'Read the Great Homes developer profile on Merlin Group. Overview of completed projects, residential footprints in Kolkata, and township developments.',
      canonicalUrl: '/developers/merlin-group/stories',
      projectId: null,
      developerId: merlinGroup ? merlinGroup.id : null,
      locationId: null,
      readingTimeMinutes: 4,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Portfolio Summary', content: 'Factual overview of completed and ongoing residential projects.' }
      ]
    },
    {
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
      featuredImage: 'https://picsum.photos/seed/kolkatamarketguide/1200/630',
      seoTitle: 'Kolkata Residential Pricing & Configuration Market Guide | Great Homes',
      seoDescription: 'Learn how residential property prices, 2 BHK vs 3 BHK configurations, and transit proximity shape home buying decisions in Kolkata.',
      canonicalUrl: '/guides/kolkata-residential-pricing-configuration-guide',
      projectId: null,
      developerId: null,
      locationId: null,
      readingTimeMinutes: 6,
      factCheckStatus: 'REVIEWED',
      structuredSections: [
        { id: 'sec-1', title: 'Configuration Dynamics', content: 'Analysis of 2 BHK and 3 BHK demand trends across Kolkata expansion corridors.' }
      ]
    }
  ];

  for (const art of articles) {
    const existing = await db.select().from(editorialArticles).where(eq(editorialArticles.slug, art.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(editorialArticles).values(art);
      console.log(`✅ Seeded article: [${art.type}] ${art.title}`);
    } else {
      console.log(`ℹ️ Article already exists: ${art.slug}`);
    }
  }

  console.log('------------------------------------------------------------');
  console.log('PHASE 16 EDITORIAL SEEDING COMPLETE.');
  console.log('------------------------------------------------------------');
}

seedEditorialData().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
