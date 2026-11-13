import { cache } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

import { developerService } from '@/src/domain/developers/services/developerService';
import { PublicDeveloperDto, PublicProjectDto } from '@/src/domain/developers/dto/developerDto';
import { buildDeveloperJsonLd } from '@/src/domain/seo/auditEngine';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';
import { DeveloperProfileSectionNav } from '@/src/components/developers/DeveloperProfileSectionNav';
import { DeveloperLogoBadge } from '@/src/components/developers/DeveloperLogoBadge';
import {
  Building2,
  MapPin,
  Globe,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Layers,
  Home,
  CheckCircle2,
} from 'lucide-react';

interface DeveloperPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Request-level memoized bundle resolver so generateMetadata() and DeveloperDetailPage()
 * execute a single bounded query batch per SSR request.
 */
const getCachedDeveloperProfileBundle = cache(async (slug: string) => {
  await ensureSeedData();
  return developerService.getDeveloperProfileBundleBySlug(slug);
});

/**
 * Maps a project propertyType enum value to a clean, accurate category label.
 */
function mapPropertyTypeCategory(propertyType?: string | null): string | null {
  if (!propertyType) return null;
  switch (propertyType.toUpperCase()) {
    case 'APARTMENT':
    case 'FLAT':
    case 'DUPLEX':
    case 'PENTHOUSE':
      return 'Apartments';
    case 'VILLA':
    case 'INDEPENDENT_HOUSE':
      return 'Villas';
    case 'PLOT':
      return 'Plots';
    case 'COMMERCIAL':
      return 'Commercial';
    case 'MIXED_USE':
      return 'Mixed-Use';
    default:
      return null;
  }
}

/**
 * Derives an accurate portfolio category label from the developer's actual published projects.
 * Never misclassifies plot, commercial, or mixed-use projects, and uses a neutral fallback when empty.
 */
function deriveDeveloperPortfolioCategory(projects: PublicProjectDto[]): string {
  if (!projects || projects.length === 0) {
    return 'Real Estate';
  }

  const order = ['Apartments', 'Villas', 'Plots', 'Commercial', 'Mixed-Use'];
  const present = new Set<string>();

  for (const project of projects) {
    const mapped = mapPropertyTypeCategory(project.propertyType);
    if (mapped) {
      present.add(mapped);
    }
  }

  const distinct = order.filter(cat => present.has(cat));
  if (distinct.length === 0) {
    return 'Real Estate';
  }
  if (distinct.length === 1) {
    return distinct[0];
  }
  if (distinct.length === 2) {
    return `${distinct[0]} & ${distinct[1]}`;
  }
  if (distinct.includes('Commercial') || distinct.includes('Mixed-Use')) {
    return 'Mixed Portfolio';
  }
  return 'Multi-Format';
}

/**
 * Derives a detailed factual breakdown of published project types for the About section.
 */
function buildFactualPortfolioBreakdown(projects: PublicProjectDto[]): string | null {
  if (!projects || projects.length === 0) return null;

  const counts = new Map<string, number>();
  for (const p of projects) {
    const cat = mapPropertyTypeCategory(p.propertyType) || 'Projects';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [category, count] of counts.entries()) {
    if (count === 1) {
      const singular =
        category === 'Apartments'
          ? '1 Apartment Project'
          : category === 'Villas'
          ? '1 Villa Project'
          : category === 'Plots'
          ? '1 Plotted Development'
          : `1 ${category} Project`;
      parts.push(singular);
    } else {
      const plural =
        category === 'Plots'
          ? `${count} Plotted Developments`
          : category === 'Commercial' || category === 'Mixed-Use'
          ? `${count} ${category} Projects`
          : `${count} ${category}`;
      parts.push(plural);
    }
  }

  return parts.join(' · ');
}

/**
 * Derives factual delivery stage breakdown from published projects.
 */
function buildFactualStageSummary(projects: PublicProjectDto[], reraVerifiedCount: number): string | null {
  if (!projects || projects.length === 0) return null;

  const stageLabels = new Set<string>();
  for (const p of projects) {
    if (!p.status) continue;
    const formatted = p.status
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    stageLabels.add(formatted);
  }

  const parts: string[] = [];
  if (reraVerifiedCount > 0) {
    parts.push(`${reraVerifiedCount} RERA-Verified Project${reraVerifiedCount === 1 ? '' : 's'}`);
  }
  if (stageLabels.size > 0) {
    parts.push(Array.from(stageLabels).slice(0, 3).join(', '));
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Truncates text cleanly at a word boundary to fit within maxLength.
 */
function truncateCleanly(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced).replace(/[.,;:\-\s]+$/, '')}…`;
}

/**
 * Builds the SEO Meta Title enforcing the 60-character limit and conditional Kolkata location rule.
 * Priority:
 * 1. Valid custom admin metaTitle (<= 60 chars)
 * 2. "[Developer Name] Projects in Kolkata | Great Homes" (when developer has Kolkata project-location evidence and <= 60 chars)
 * 3. "[Developer Name] Projects | Great Homes" (when name is long or developer has no project-location evidence)
 * 4. "[Developer Name] | Great Homes" (bounded fallback <= 60 chars)
 */
function buildDeveloperSeoTitle(developer: PublicDeveloperDto): string {
  const customTitle = developer.seo?.metaTitle?.trim();
  if (customTitle && customTitle.length > 0 && customTitle.length <= 60) {
    return customTitle;
  }

  const hasKolkataLocationEvidence = Array.isArray(developer.locations) && developer.locations.length > 0;
  if (hasKolkataLocationEvidence) {
    const withLocation = `${developer.name} Projects in Kolkata | Great Homes`;
    if (withLocation.length <= 60) {
      return withLocation;
    }
  }

  const compact = `${developer.name} Projects | Great Homes`;
  if (compact.length <= 60) {
    return compact;
  }

  const minimal = `${developer.name} | Great Homes`;
  if (minimal.length <= 60) {
    return minimal;
  }

  return truncateCleanly(developer.name, 60);
}

/**
 * Builds the SEO Meta Description enforcing the 160-character limit and factual portfolio accuracy.
 * Priority:
 * 1. Valid custom admin metaDescription (<= 160 chars)
 * 2. Valid developer shortDescription (<= 160 chars)
 * 3. Generated factual description from actual project count, project types, and locations (<= 160 chars)
 */
function buildDeveloperSeoDescription(
  developer: PublicDeveloperDto,
  projects: PublicProjectDto[]
): string {
  const customDesc = developer.seo?.metaDescription?.trim();
  if (customDesc && customDesc.length > 0 && customDesc.length <= 160) {
    return customDesc;
  }

  const shortDesc = developer.shortDescription?.trim();
  if (shortDesc && shortDesc.length > 0) {
    return truncateCleanly(shortDesc, 160);
  }

  if (projects.length > 0) {
    const categoryLabel = deriveDeveloperPortfolioCategory(projects).toLowerCase();
    const locNames = developer.locations.map(l => l.name).filter(Boolean);
    const locSnippet =
      locNames.length === 1
        ? ` in ${locNames[0]}, Kolkata`
        : locNames.length === 2
        ? ` in ${locNames[0]} and ${locNames[1]}, Kolkata`
        : locNames.length > 2
        ? ` across ${locNames[0]}, ${locNames[1]} and ${locNames.length - 2} more Kolkata locations`
        : '';

    const factual = `Explore ${projects.length} published project${projects.length === 1 ? '' : 's'} (${categoryLabel}) by ${developer.name}${locSnippet} on Great Homes.`;
    return truncateCleanly(factual, 160);
  }

  return truncateCleanly(
    `View the official developer profile and published real estate portfolio for ${developer.name} on Great Homes.`,
    160
  );
}

/**
 * Resolves a safe, normalized canonical URL on https://greathomes.co.in/developers/[slug].
 */
function resolveDeveloperCanonicalUrl(developer: PublicDeveloperDto): string {
  const defaultCanonical = `https://www.greathomes.co.in/developers/${developer.slug}`;
  if (!developer.seo?.canonicalUrl) {
    return defaultCanonical;
  }
  try {
    return (
      developerService.validateAndNormalizeCanonicalUrl(developer.seo.canonicalUrl) ||
      defaultCanonical
    );
  } catch {
    return defaultCanonical;
  }
}

export async function generateMetadata(
  props: DeveloperPageProps
): Promise<Metadata> {
  const { slug } = await props.params;
  const bundle = await getCachedDeveloperProfileBundle(slug);

  if (!bundle) {
    notFound();
  }

  const { developer, projects } = bundle;
  const title = buildDeveloperSeoTitle(developer);
  const description = buildDeveloperSeoDescription(developer, projects);
  const canonicalUrl = resolveDeveloperCanonicalUrl(developer);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'profile',
      images: developer.logoUrl ? [{ url: developer.logoUrl, alt: `${developer.name} logo` }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: developer.logoUrl ? [developer.logoUrl] : undefined,
    },
  };
}

function formatPrice(price?: number): string | null {
  if (!price) return null;
  if (price >= 10000000) {
    const cr = (price / 10000000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Cr`;
  }
  if (price >= 100000) {
    const l = (price / 100000).toFixed(2).replace(/\.00$/, '');
    return `₹${l} L`;
  }
  return `₹${price.toLocaleString('en-IN')}`;
}

export default async function DeveloperDetailPage(props: DeveloperPageProps) {
  const { slug } = await props.params;
  const bundle = await getCachedDeveloperProfileBundle(slug);

  if (!bundle) {
    notFound();
  }

  const { developer, projects, relatedDevelopers } = bundle;

  const reraVerifiedCount = projects.filter(p => p.hasVerifiedReraBadge).length;
  const portfolioCategory = deriveDeveloperPortfolioCategory(projects);
  const portfolioBreakdown = buildFactualPortfolioBreakdown(projects);
  const stageSummary = buildFactualStageSummary(projects, reraVerifiedCount);
  const structuredData = buildDeveloperJsonLd(developer, projects);

  // Group locations with count of projects
  const locationProjectCounts = new Map<string, number>();
  for (const project of projects) {
    if (project.location?.id) {
      locationProjectCounts.set(
        project.location.id,
        (locationProjectCounts.get(project.location.id) || 0) + 1
      );
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 text-neutral-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <RecentlyViewedTracker
        resourceType="DEVELOPER"
        resourceId={developer.id}
        resourceSlug={developer.slug}
        metadata={{ developerName: developer.name }}
      />

      {/* Editorial Breadcrumb */}
      <nav aria-label="Breadcrumb" className="border-b border-neutral-200/80 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <ol className="flex items-center space-x-2 text-xs text-neutral-500 font-body">
            <li>
              <Link href="/" className="hover:text-neutral-900 transition-colors">
                Home
              </Link>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </li>
            <li>
              <Link href="/developers" className="hover:text-neutral-900 transition-colors">
                Developers
              </Link>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </li>
            <li className="text-neutral-900 font-medium truncate max-w-[200px] sm:max-w-none" aria-current="page">
              {developer.name}
            </li>
          </ol>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        id="overview"
        className="relative bg-gradient-to-b from-white via-white to-neutral-50/40 border-b border-neutral-200/80 py-10 md:py-14 overflow-hidden"
      >
        {/* Subtle decorative architectural background contour on top-right */}
        <div
          aria-hidden="true"
          className="absolute -top-12 -right-12 w-96 h-96 bg-gradient-to-bl from-orange-100/40 via-amber-50/30 to-transparent rounded-full blur-3xl pointer-events-none"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* Left Column: Developer Identity & Biography */}
            <div className="lg:col-span-8 space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                {/* Logo Container with Initials Fallback */}
                <DeveloperLogoBadge
                  name={developer.name}
                  logoUrl={developer.logoUrl}
                  variant="hero"
                  priority
                />

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase font-display text-neutral-600 bg-neutral-100 border border-neutral-200/70 rounded">
                      Developer Profile
                    </span>
                    {developer.featured && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase font-display text-orange-700 bg-orange-50 border border-orange-200/80 rounded">
                        <Sparkles className="w-3 h-3 text-orange-600" />
                        Featured Partner
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Developer Heading */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold tracking-tight text-neutral-900 leading-tight">
                {developer.name}
              </h1>

              {/* Subtitle / Short Description (Locked to font-display per AGENTS.md) */}
              {developer.shortDescription && (
                <p className="text-base sm:text-lg font-display text-neutral-800 font-medium leading-relaxed max-w-3xl">
                  {developer.shortDescription}
                </p>
              )}

              {/* Long Narrative Bio */}
              {developer.description && (
                <p className="text-sm sm:text-base font-body text-neutral-600 leading-relaxed max-w-3xl pt-1">
                  {developer.description}
                </p>
              )}

              {/* CTA Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#projects"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors font-display"
                >
                  <span>Explore Projects ({developer.projectCount})</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                {developer.websiteUrl && (
                  <a
                    href={developer.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 text-sm font-semibold rounded-lg shadow-xs transition-colors font-display"
                  >
                    <Globe className="w-4 h-4 text-neutral-500" />
                    <span>Official Website</span>
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                  </a>
                )}
              </div>
            </div>

            {/* Right Column: Developer Intelligence Panel */}
            <div className="lg:col-span-4 w-full">
              <div className="bg-white/95 backdrop-blur-xs border border-neutral-200/90 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 font-display">
                  Developer Intelligence
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Metric 1: Published Projects */}
                  <div className="p-3.5 rounded-xl bg-neutral-50/70 border border-neutral-100 space-y-1.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-display font-bold text-neutral-900">
                      {developer.projectCount}
                    </div>
                    <div className="text-[11px] font-body text-neutral-500">
                      Published Projects
                    </div>
                  </div>

                  {/* Metric 2: Active Locations */}
                  <div className="p-3.5 rounded-xl bg-neutral-50/70 border border-neutral-100 space-y-1.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-display font-bold text-neutral-900">
                      {developer.locations.length}
                    </div>
                    <div className="text-[11px] font-body text-neutral-500">
                      Active Locations
                    </div>
                  </div>

                  {/* Metric 3: Dynamic Project Category */}
                  <div className="p-3.5 rounded-xl bg-neutral-50/70 border border-neutral-100 space-y-1.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                      <Home className="w-4 h-4" />
                    </div>
                    <div
                      className="text-base font-display font-bold text-neutral-900 truncate"
                      title={portfolioCategory}
                    >
                      {portfolioCategory}
                    </div>
                    <div className="text-[11px] font-body text-neutral-500">
                      Project Category
                    </div>
                  </div>

                  {/* Metric 4: RERA-verified Projects */}
                  <div className="p-3.5 rounded-xl bg-neutral-50/70 border border-neutral-100 space-y-1.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-display font-bold text-neutral-900">
                      {reraVerifiedCount}
                    </div>
                    <div className="text-[11px] font-body text-neutral-500">
                      RERA-verified Projects
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scroll-Aware Sticky Section Anchor Navigation */}
      <DeveloperProfileSectionNav
        projectCount={projects.length}
        locationCount={developer.locations.length}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* Projects Section */}
        <section id="projects" aria-labelledby="developer-projects-heading" className="space-y-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-neutral-200/80 pb-4">
            <div>
              <h2
                id="developer-projects-heading"
                className="text-2xl font-display font-bold text-neutral-900"
              >
                Projects by {developer.name}
              </h2>
              <p className="text-xs text-neutral-500 font-body mt-1">
                Canonical real estate projects published under {developer.name}.
              </p>
            </div>
            <span className="text-xs font-medium text-neutral-500 font-body">
              Showing {projects.length} published project{projects.length === 1 ? '' : 's'}
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-neutral-300 rounded-2xl bg-white text-sm text-neutral-500 font-body">
              No published projects currently on record for this developer.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => (
                <article
                  key={project.id}
                  id={`project-card-${project.id}`}
                  className="group bg-white border border-neutral-200/90 rounded-2xl overflow-hidden hover:border-neutral-300 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Project Cover Image */}
                    <div className="relative aspect-[16/10] w-full bg-neutral-100 overflow-hidden">
                      {project.coverImageUrl ? (
                        <Image
                          src={project.coverImageUrl}
                          alt={project.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400 p-4">
                          <Building2 className="w-10 h-10 mb-1 opacity-40" />
                          <span className="text-[11px] font-display font-medium text-neutral-500">
                            {project.name}
                          </span>
                        </div>
                      )}

                      {/* Floating Badges */}
                      <div className="absolute top-3 left-3">
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase font-display bg-amber-50 text-amber-800 border border-amber-200/80 rounded shadow-xs">
                          {project.propertyType.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase font-display bg-neutral-900/80 backdrop-blur-xs text-white rounded shadow-xs">
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Project Information */}
                    <div className="p-5 space-y-3">
                      <h3 className="text-lg font-display font-bold text-neutral-900 group-hover:text-orange-600 transition-colors leading-snug">
                        {project.name}
                      </h3>

                      {project.location && (
                        <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-body">
                          <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span>{project.location.name}, Kolkata</span>
                        </div>
                      )}

                      {project.startingPrice ? (
                        <div className="text-base font-display font-bold text-neutral-900">
                          Starts at {formatPrice(project.startingPrice)}
                        </div>
                      ) : (
                        <div className="text-sm font-display font-medium text-neutral-500">
                          Price on Request
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer & RERA Verification */}
                  <div className="p-5 pt-0">
                    <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs font-body">
                      {project.hasVerifiedReraBadge ? (
                        <div className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span>RERA Verified</span>
                        </div>
                      ) : project.reraRegistrationNumber ? (
                        <div className="text-neutral-500 text-[11px] truncate max-w-[160px]" title={project.reraRegistrationNumber}>
                          RERA: {project.reraRegistrationNumber}
                        </div>
                      ) : (
                        <div className="text-neutral-400 text-[11px]">
                          RERA Not Provided
                        </div>
                      )}

                      <span className="text-[11px] text-neutral-400 font-mono">
                        {project.slug}
                      </span>
                    </div>

                    <div className="pt-3">
                      <Link
                        href={`/projects/${project.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors font-display"
                      >
                        <span>View Project Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Active Regions & Locations Section */}
        <section id="locations" aria-labelledby="developer-locations-heading" className="space-y-6 scroll-mt-20">
          <div className="border-b border-neutral-200/80 pb-4">
            <h2
              id="developer-locations-heading"
              className="text-2xl font-display font-bold text-neutral-900"
            >
              Active Regions & Locations
            </h2>
            <p className="text-xs text-neutral-500 font-body mt-1">
              Geographic footprint derived from {developer.name}&apos;s published portfolio.
            </p>
          </div>

          {developer.locations.length === 0 ? (
            <p className="text-sm text-neutral-500 font-body">
              No geographic associations derived yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {developer.locations.map(location => {
                const count = locationProjectCounts.get(location.id) || 1;
                return (
                  <Link
                    key={location.id}
                    href={`/locations/${location.slug}`}
                    className="group bg-white border border-neutral-200/80 rounded-xl p-4 flex items-center justify-between hover:border-neutral-300 hover:shadow-xs transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-display font-bold text-neutral-900 group-hover:text-orange-600 transition-colors">
                          {location.name}
                        </div>
                        <div className="text-xs text-neutral-500 font-body">
                          {count} Project{count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* About Developer Section */}
        <section id="about" aria-labelledby="developer-about-heading" className="space-y-6 scroll-mt-20">
          <div className="border-b border-neutral-200/80 pb-4">
            <h2
              id="developer-about-heading"
              className="text-2xl font-display font-bold text-neutral-900"
            >
              About {developer.name}
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Narrative description backed by canonical database fields */}
            <div className={portfolioBreakdown || stageSummary ? 'lg:col-span-8 space-y-4 font-body text-sm text-neutral-600 leading-relaxed' : 'lg:col-span-12 space-y-4 font-body text-sm text-neutral-600 leading-relaxed'}>
              {developer.description ? (
                <p>{developer.description}</p>
              ) : developer.shortDescription ? (
                <p>{developer.shortDescription}</p>
              ) : projects.length > 0 ? (
                <p>
                  {developer.name} has {projects.length} published project{projects.length === 1 ? '' : 's'} across{' '}
                  {developer.locations.length} active location{developer.locations.length === 1 ? '' : 's'} on Great Homes.
                </p>
              ) : (
                <p>
                  Official developer profile for {developer.name} on Great Homes.
                </p>
              )}
              {developer.shortDescription && developer.description && developer.description !== developer.shortDescription && (
                <p className="text-neutral-500 text-xs italic">
                  Summary: {developer.shortDescription}
                </p>
              )}
            </div>

            {/* Right Column: Factual Portfolio Highlights (shown only when backed by actual project records) */}
            {(portfolioBreakdown || stageSummary) && (
              <div className="lg:col-span-4 space-y-4">
                {portfolioBreakdown && (
                  <div className="p-4 bg-white border border-neutral-200/80 rounded-xl space-y-1 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-display font-bold text-neutral-900">
                      <Building2 className="w-4 h-4 text-orange-600" />
                      <span>Published Portfolio</span>
                    </div>
                    <p className="text-xs text-neutral-500 font-body pl-6">
                      {portfolioBreakdown}
                    </p>
                  </div>
                )}

                {stageSummary && (
                  <div className="p-4 bg-white border border-neutral-200/80 rounded-xl space-y-1 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-display font-bold text-neutral-900">
                      <CheckCircle2 className="w-4 h-4 text-orange-600" />
                      <span>Verification & Project Stages</span>
                    </div>
                    <p className="text-xs text-neutral-500 font-body pl-6">
                      {stageSummary}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Explore Other Developers Section */}
        {relatedDevelopers.length > 0 && (
          <section aria-labelledby="other-developers-heading" className="space-y-6 pt-4 border-t border-neutral-200/80">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <h2
                  id="other-developers-heading"
                  className="text-2xl font-display font-bold text-neutral-900"
                >
                  Explore Other Developers
                </h2>
                <p className="text-xs text-neutral-500 font-body mt-1">
                  Discover other verified real estate developers on Great Homes.
                </p>
              </div>
              <Link
                href="/developers"
                className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-orange-600 hover:text-orange-700 transition-colors"
              >
                <span>View All Developers</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedDevelopers.map(other => (
                <Link
                  key={other.id}
                  href={`/developers/${other.slug}`}
                  className="group bg-white border border-neutral-200/80 rounded-2xl p-4 flex items-center gap-4 hover:border-neutral-300 hover:shadow-xs transition-all"
                >
                  {/* Other Developer Logo with Initials Fallback */}
                  <DeveloperLogoBadge
                    name={other.name}
                    logoUrl={other.logoUrl}
                    variant="compact"
                  />

                  <div className="space-y-0.5 min-w-0">
                    <h3 className="text-sm font-display font-bold text-neutral-900 group-hover:text-orange-600 transition-colors truncate">
                      {other.name}
                    </h3>
                    <p className="text-xs font-body text-neutral-500">
                      {other.projectCount} Projects · {other.locations.length} Locations
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
