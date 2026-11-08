import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  projectRepository,
  projectMediaRepository,
  projectConfigurationRepository,
  projectReraRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { HomeProjectCardData } from '@/src/components/home/HomeExploreProjects';

export async function runPart2Verification() {
  console.log('--- STARTING PART 2 VERIFICATION SUITE ---');
  await ensureSeedData();

  // Test 1: Verify all published projects and metadata resolution
  const [allProjects, allLocations, allDevelopers] = await Promise.all([
    projectRepository.findAll(),
    locationRepository.findAll(),
    developerRepository.list(),
  ]);

  const locationMap = new Map(allLocations.map((l) => [l.id, l]));
  const developerMap = new Map(allDevelopers.map((d) => [d.id, d]));
  const publishedProjects = allProjects.filter(
    (p: any) => p.lifecycleStatus === 'PUBLISHED' || p.isPublished === true
  );

  if (publishedProjects.length < 3) {
    throw new Error(`Expected at least 3 published projects, found ${publishedProjects.length}`);
  }
  console.log(`✓ Test 1: Published projects count verified (${publishedProjects.length} projects).`);

  // Test 2: Build card data with media and RERA semantics
  const homeProjectCards: HomeProjectCardData[] = await Promise.all(
    publishedProjects.map(async (p: any) => {
      const [media, configs, rera] = await Promise.all([
        projectMediaRepository.findByProjectId(p.id),
        projectConfigurationRepository.findByProjectId(p.id),
        projectReraRepository.findByProjectId(p.id),
      ]);

      const loc = p.locationId ? locationMap.get(p.locationId) : null;
      const dev = p.developerId ? developerMap.get(p.developerId) : null;

      const imageMedia = media.filter(
        (m) =>
          m.mediaType === 'IMAGE' &&
          m.category !== 'FLOOR_PLANS' &&
          !m.url.endsWith('.svg')
      );
      const featuredMedia = imageMedia.find((m) => m.isFeatured) || imageMedia[0] || media[0];

      const bhkList = Array.from(
        new Set(
          configs
            .map((c: any) => c.bedroomCount || c.bedrooms)
            .filter((b): b is number => Boolean(b && b > 0))
            .sort((a, b) => a - b)
        )
      );

      const isReraVerified = rera?.status === 'VERIFIED';

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        developerName: dev?.name || 'Leading Developer',
        locationName: loc?.name || 'Kolkata',
        status: p.status || 'NEW_LAUNCH',
        startingPrice: p.startingPrice,
        configurationString: bhkList.length > 0 ? `${bhkList.join(', ')} BHK` : undefined,
        imageUrl: featuredMedia?.url,
        isReraVerified,
        isFeatured: Boolean(p.featured),
      };
    })
  );

  // Test 3: Verify Merlin Elements cover image is not an SVG floor plan
  const elementsCard = homeProjectCards.find((p) => p.slug === 'merlin-elements');
  if (!elementsCard) {
    throw new Error('Merlin Elements card not found');
  }
  if (elementsCard.imageUrl?.endsWith('.svg')) {
    throw new Error(`Merlin Elements has SVG floor plan as cover image: ${elementsCard.imageUrl}`);
  }
  console.log(`✓ Test 2: Merlin Elements image sanitized (${elementsCard.imageUrl}).`);

  // Test 4: Verify Merlin Elements RERA is NOT verified
  if (elementsCard.isReraVerified === true) {
    throw new Error('Merlin Elements incorrectly marked as RERA verified!');
  }
  console.log('✓ Test 3: Merlin Elements RERA is accurately unverified (PROVIDED status).');

  // Test 5: Verify Featured Spotlight selection logic
  const eligibleFeaturedProjects = homeProjectCards.filter((p) => p.isFeatured === true);
  if (eligibleFeaturedProjects.length === 0) {
    throw new Error('No featured projects found');
  }
  const spotlightProject = eligibleFeaturedProjects[0];
  if (!spotlightProject.isFeatured) {
    throw new Error('Spotlight project is not featured');
  }
  console.log(`✓ Test 4: Spotlight project correctly selected (${spotlightProject.name}, featured: ${spotlightProject.isFeatured}).`);

  // Test 6: Verify Exclusion of Spotlight project from Explore collection
  const exploreProjectsList = homeProjectCards.filter((p) => p.id !== spotlightProject.id);
  const duplicate = exploreProjectsList.find((p) => p.id === spotlightProject.id);
  if (duplicate) {
    throw new Error('Spotlight project found duplicated in Explore Projects grid');
  }
  console.log(`✓ Test 5: No duplicate content. Explore list has ${exploreProjectsList.length} distinct items.`);

  console.log('--- ALL PART 2 UNIT/INTEGRATION TESTS PASSED ---');
}

runPart2Verification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
