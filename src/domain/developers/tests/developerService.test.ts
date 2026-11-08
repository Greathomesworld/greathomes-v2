import assert from 'node:assert/strict';
import { DeveloperRepositoryMemory } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { ProjectRepositoryMemory } from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { LocationRepositoryMemory } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import {
  DeveloperService,
  ValidationError,
  DuplicateSlugError,
  PotentialDuplicateError,
  NotFoundError,
} from '../services/developerService';
import { verifyInternalStaff } from '../../auth/authorizationBoundary';

async function runDeveloperTests() {
  console.log('Running Developer Intelligence Foundation Tests...');

  const devRepo = new DeveloperRepositoryMemory();
  const projRepo = new ProjectRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();
  const service = new DeveloperService(devRepo, projRepo, locRepo);

  // 1. Create Developer
  const dev1 = await service.createDeveloper({
    name: 'Merlin Group',
    slug: 'merlin-group',
    shortDescription: 'Leading real estate builder.',
    description: 'Extensive legacy in residential real estate.',
    websiteUrl: 'https://merlingroup.com',
    status: 'PUBLISHED',
    featured: true,
  });
  assert.ok(dev1.id, 'Developer should have an ID');
  assert.equal(dev1.name, 'Merlin Group');
  assert.equal(dev1.slug, 'merlin-group');
  assert.equal(dev1.status, 'PUBLISHED');
  assert.equal(dev1.featured, true);
  console.log('✔ 1. Create Developer passed');

  // 2. Required name validation
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: '   ',
        slug: 'empty-name',
      });
    },
    ValidationError,
    'Should reject empty developer name'
  );
  console.log('✔ 2. Required name validation passed');

  // 3. Slug validation (format)
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'Bad Slug Dev',
        slug: 'INVALID SLUG WITH SPACES',
      });
    },
    ValidationError,
    'Should reject invalid slug format'
  );
  console.log('✔ 3. Slug validation passed');

  // 4. Duplicate slug rejection
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'Another Merlin Company',
        slug: 'merlin-group', // collision with dev1
      });
    },
    DuplicateSlugError,
    'Should reject duplicate slug with DuplicateSlugError'
  );
  console.log('✔ 4. Duplicate slug rejection passed');

  // 5. Duplicate developer detection (case-insensitive & normalization)
  const duplicates = await service.findDuplicateCandidates('merlin group');
  assert.equal(duplicates.length, 1, 'Should find 1 duplicate candidate for merlin group');
  assert.equal(duplicates[0].id, dev1.id);

  // Attempting creation of matching normalized name without explicit flag should throw PotentialDuplicateError
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'MERLIN GROUP',
        slug: 'merlin-group-corp',
      });
    },
    PotentialDuplicateError,
    'Should detect and flag normalized duplicate developer'
  );
  console.log('✔ 5. Duplicate developer detection passed');

  // 6. Status validation
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'Invalid Status Dev',
        slug: 'invalid-status',
        status: 'UNKNOWN_STATUS' as any,
      });
    },
    ValidationError,
    'Should reject unknown status'
  );
  console.log('✔ 6. Status validation passed');

  // 7. Update Developer
  const updated = await service.updateDeveloper(dev1.id, {
    shortDescription: 'Updated short description.',
  });
  assert.equal(updated.shortDescription, 'Updated short description.');
  console.log('✔ 7. Update Developer passed');

  // 8. Archive Developer
  const devToArchive = await service.createDeveloper({
    name: 'Archive Dev',
    slug: 'archive-dev',
    status: 'PUBLISHED',
  });
  const archived = await service.archiveDeveloper(devToArchive.id);
  assert.equal(archived.status, 'ARCHIVED');
  console.log('✔ 8. Archive Developer passed');

  // 9. Find by ID
  const foundById = await service.getDeveloperById(dev1.id);
  assert.ok(foundById);
  assert.equal(foundById?.id, dev1.id);
  console.log('✔ 9. Find by ID passed');

  // 10. Find by slug
  const foundBySlug = await service.getDeveloperBySlug('merlin-group');
  assert.ok(foundBySlug);
  assert.equal(foundBySlug?.slug, 'merlin-group');
  console.log('✔ 10. Find by slug passed');

  // 11. Published-only public behavior
  const draftDev = await service.createDeveloper({
    name: 'Draft Builder',
    slug: 'draft-builder',
    status: 'DRAFT',
  });
  const publicDraftById = await service.getPublicDeveloperDtoById(draftDev.id, false);
  assert.equal(publicDraftById, null, 'Public anonymous user should NOT access DRAFT developer');
  const publicArchivedById = await service.getPublicDeveloperDtoById(devToArchive.id, false);
  assert.equal(publicArchivedById, null, 'Public anonymous user should NOT access ARCHIVED developer');
  const staffDraftById = await service.getPublicDeveloperDtoById(draftDev.id, true);
  assert.ok(staffDraftById, 'Internal staff SHOULD access DRAFT developer');
  console.log('✔ 11. Published-only public behavior passed');

  // 12. Project relationship & 13. Project count derivation & 14. Location derivation
  const locKolkata = await locRepo.create({
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: true,
  });
  const locNewTown = await locRepo.create({
    name: 'New Town',
    slug: 'new-town',
    type: 'AREA',
    parentId: locKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const proj1 = await projRepo.create({
    developerId: dev1.id,
    locationId: locNewTown.id,
    name: 'Merlin The Fourth',
    slug: 'merlin-the-fourth',
    status: 'UNDER_CONSTRUCTION',
    propertyType: 'APARTMENT',
    isPublished: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/001',
  });

  const proj2 = await projRepo.create({
    developerId: dev1.id,
    locationId: locKolkata.id,
    name: 'Merlin Elements',
    slug: 'merlin-elements',
    status: 'COMPLETED',
    propertyType: 'APARTMENT',
    isPublished: true,
    reraStatus: 'PROVIDED', // Not verified!
    reraRegistrationNumber: 'WBRERA/P/002',
  });

  const draftProj = await projRepo.create({
    developerId: dev1.id,
    locationId: locKolkata.id,
    name: 'Merlin Unpublished Project',
    slug: 'merlin-unpub',
    status: 'UPCOMING',
    propertyType: 'APARTMENT',
    isPublished: false, // Not published!
  });

  console.log('✔ 12. Project relationship verified (developerId foreign key intact)');

  // 13. Developer project count derivation
  const publicMerlin = await service.getPublicDeveloperDtoById(dev1.id);
  assert.ok(publicMerlin);
  assert.equal(
    publicMerlin?.projectCount,
    2,
    'Derived projectCount must equal 2 published projects (excluding unpublished draft project)'
  );
  console.log('✔ 13. Developer project count derivation passed');

  // 14. Developer location derivation
  assert.equal(
    publicMerlin?.locations.length,
    2,
    'Should have 2 unique derived locations (New Town and Kolkata)'
  );
  const locationSlugs = publicMerlin?.locations.map(l => l.slug);
  assert.ok(locationSlugs?.includes('new-town'));
  assert.ok(locationSlugs?.includes('kolkata'));
  console.log('✔ 14. Developer location derivation passed');

  // 15. Public Developer DTO shape
  assert.equal(typeof publicMerlin?.id, 'string');
  assert.equal(typeof publicMerlin?.name, 'string');
  assert.equal(typeof publicMerlin?.slug, 'string');
  assert.equal((publicMerlin as any).createdAt, undefined, 'Raw createdAt internal should not leak');
  assert.equal((publicMerlin as any).projects, undefined, 'Manually stored projects[] must NOT exist on Developer');
  console.log('✔ 15. Public Developer DTO shape passed');

  // 16. Project DTO includes bounded Developer object & 17. No circular DTO response
  const developerProjects = await service.getDeveloperPublicProjects(dev1.id);
  assert.equal(developerProjects.length, 2, 'Should return exactly 2 published projects');
  const sampleProjectDto = developerProjects[0];
  assert.deepEqual(sampleProjectDto.developer, {
    id: dev1.id,
    name: dev1.name,
    slug: dev1.slug,
  });
  assert.equal((sampleProjectDto.developer as any).projects, undefined, 'Must NOT contain circular projects array');
  console.log('✔ 16. Project DTO includes bounded Developer object passed');
  console.log('✔ 17. No circular DTO response passed');

  // 18. RERA badge remains VERIFIED-only
  const verifiedProject = developerProjects.find(p => p.slug === 'merlin-the-fourth');
  const providedOnlyProject = developerProjects.find(p => p.slug === 'merlin-elements');
  assert.equal(verifiedProject?.hasVerifiedReraBadge, true, 'VERIFIED status must display verified badge');
  assert.equal(providedOnlyProject?.hasVerifiedReraBadge, false, 'PROVIDED status must NOT display verified badge');
  console.log('✔ 18. RERA badge remains VERIFIED-only passed');

  // 19. Mutation endpoint authorization boundary
  const anonRequest = new Request('http://localhost:3000/api/developers', { method: 'POST' });
  const authAnon = await verifyInternalStaff(anonRequest);
  assert.equal(authAnon.authorized, false);
  assert.equal(authAnon.statusCode, 401);

  const invalidRoleRequest = new Request('http://localhost:3000/api/developers', {
    method: 'POST',
    headers: { 'x-staff-role': 'GUEST_USER' },
  });
  const authInvalid = await verifyInternalStaff(invalidRoleRequest);
  assert.equal(authInvalid.authorized, false);
  assert.equal(authInvalid.statusCode, 401, 'A role header without a signed session is unauthenticated');

  const validAdminRequest = new Request('http://localhost:3000/api/developers', {
    method: 'POST',
    headers: { 'x-staff-role': 'SUPER_ADMIN' },
  });
  const authValid = await verifyInternalStaff(validAdminRequest);
  assert.equal(authValid.authorized, false, 'A role header alone cannot authenticate staff');
  assert.equal(authValid.statusCode, 401);
  console.log('✔ 19. Mutation endpoint authorization boundary passed');

  // 20. Pagination
  const pagedList = await service.listPublicDevelopers({ page: 1, limit: 1 });
  assert.equal(pagedList.items.length, 1);
  assert.ok(pagedList.pagination.total >= 1);
  assert.equal(pagedList.pagination.limit, 1);
  console.log('✔ 20. Pagination passed');

  // 21. Controlled sorting
  const sortedDesc = await service.listPublicDevelopers({ sort: 'name:desc' });
  for (let i = 1; i < sortedDesc.items.length; i++) {
    assert.ok(
      sortedDesc.items[i - 1].name.localeCompare(sortedDesc.items[i].name) >= 0,
      'Controlled sort name:desc should be in descending order'
    );
  }
  console.log('✔ 21. Controlled sorting passed');

  // 22. 404 behavior
  await assert.rejects(
    async () => {
      await service.updateDeveloper('non-existent-uuid', { name: 'New Name' });
    },
    NotFoundError,
    'Updating non-existent developer should throw NotFoundError'
  );
  const nonExistentSlug = await service.getPublicDeveloperDtoBySlug('does-not-exist');
  assert.equal(nonExistentSlug, null, 'Non-existent slug should resolve to null (yielding 404)');
  console.log('✔ 22. 404 behavior passed');

  // 23. 400 validation behavior
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'Bad Url Dev',
        slug: 'bad-url-dev',
        websiteUrl: 'not-a-valid-url',
      });
    },
    ValidationError,
    'Invalid URL should throw ValidationError'
  );
  console.log('✔ 23. 400 validation behavior passed');

  // 24. 409 duplicate behavior
  await assert.rejects(
    async () => {
      await service.createDeveloper({
        name: 'Another Unique Dev',
        slug: 'merlin-group', // conflict with dev1
      });
    },
    DuplicateSlugError,
    'Duplicate slug conflict should throw DuplicateSlugError (mapping to HTTP 409)'
  );
  console.log('✔ 24. 409 duplicate behavior passed');

  console.log('\nAll 24 Developer tests passed successfully!');
}

runDeveloperTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
