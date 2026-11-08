import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { developerService } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import {
  DevelopersDirectoryClient,
  DeveloperLocationFilterItem,
} from '@/src/components/developers/DevelopersDirectoryClient';

export const metadata: Metadata = {
  title: 'Real Estate Developers in Kolkata — Verified Builder Directory | Great Homes',
  description:
    "Explore Kolkata's leading real estate developers and builders. Discover active residential developments, project portfolios, and location footprints across Kolkata.",
  alternates: {
    canonical: '/developers',
  },
  openGraph: {
    title: 'Real Estate Developers in Kolkata | Great Homes',
    description:
      "Explore Kolkata's leading real estate developers and builders. Discover active residential developments, project portfolios, and location footprints.",
    url: 'https://greathomes.co.in/developers',
    type: 'website',
  },
};

export default async function DevelopersDirectoryPage() {
  await ensureSeedData();

  // Fetch all eligible public developers & dynamic aggregate stats in parallel
  const [{ items: developers }, statistics, allProjects, allLocations] = await Promise.all([
    developerService.listPublicDevelopers({
      limit: 100,
      sort: 'name:asc',
    }),
    developerService.getDirectoryStatistics(),
    projectRepository.findAll(),
    locationRepository.findAll(),
  ]);

  // Derive distinct canonical locations with published project counts
  const activeDevIds = new Set(developers.map(d => d.id));
  const activeProjects = allProjects.filter(
    p => p.isPublished !== false && p.developerId && activeDevIds.has(p.developerId)
  );

  const projectCountByLocId = new Map<string, number>();
  for (const p of activeProjects) {
    if (p.locationId) {
      projectCountByLocId.set(
        p.locationId,
        (projectCountByLocId.get(p.locationId) || 0) + 1
      );
    }
  }

  const locationFilterItems: DeveloperLocationFilterItem[] = allLocations
    .filter(loc => projectCountByLocId.has(loc.id))
    .map(loc => ({
      id: loc.id,
      name: loc.name,
      slug: loc.slug,
      projectCount: projectCountByLocId.get(loc.id) || 0,
    }))
    .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name));

  // JSON-LD structured data for CollectionPage and ItemList
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Real Estate Developers in Kolkata',
    description:
      "Explore Kolkata's leading real estate developers and builders. Discover active residential developments and project portfolios.",
    url: 'https://greathomes.co.in/developers',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: developers.length,
      itemListElement: developers.map((dev, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: dev.name,
        url: `https://greathomes.co.in/developers/${dev.slug}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="border-b border-[#E6E2DC] bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <ol className="flex items-center space-x-2 text-xs font-body text-[#111111]/60">
            <li>
              <Link href="/" className="hover:text-[#111111] transition-colors">
                Home
              </Link>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-[#111111]/40" />
            </li>
            <li className="text-[#111111] font-medium" aria-current="page">
              Developers
            </li>
          </ol>
        </div>
      </nav>

      {/* Main Interactive Developer Directory */}
      <main>
        <DevelopersDirectoryClient
          initialDevelopers={developers}
          statistics={statistics}
          locations={locationFilterItems}
        />
      </main>
    </div>
  );
}
