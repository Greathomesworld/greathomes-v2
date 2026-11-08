import { NextRequest, NextResponse } from 'next/server';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { requireAnyCapability } from '@/src/domain/auth/capabilities';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();

    // Verify staff authorization
    const auth = await requireAnyCapability(request, [
      'MANAGE_CONFIGURATIONS',
      'MANAGE_PROJECTS',
      'configuration.read',
      'project.read',
    ]);

    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectIdFilter = searchParams.get('projectId');
    const bhkFilter = searchParams.get('bhk');
    const priceBasisFilter = searchParams.get('priceBasis');
    const hasFloorPlanFilter = searchParams.get('hasFloorPlan');
    const searchQuery = searchParams.get('query') || searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'createdAt:desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));

    // Fetch all configurations enriched with canonical project metadata
    const [allConfigs, allProjects] = await Promise.all([
      projectIntelligenceService.getAllConfigurationsWithProjects(),
      projectRepository.findAll(),
    ]);

    // Format list of projects for UI selection dropdowns
    const projectsList = allProjects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
    }));

    // Filter configurations
    let filtered = allConfigs.filter((c) => {
      if (projectIdFilter && c.projectId !== projectIdFilter) {
        return false;
      }
      if (bhkFilter) {
        const numBhk = parseInt(bhkFilter, 10);
        if (!isNaN(numBhk) && c.bedroomCount !== numBhk) {
          return false;
        }
      }
      if (priceBasisFilter && c.priceBasis !== priceBasisFilter) {
        return false;
      }
      if (hasFloorPlanFilter !== null && hasFloorPlanFilter !== undefined && hasFloorPlanFilter !== '') {
        const wantFP = hasFloorPlanFilter === 'true' || hasFloorPlanFilter === '1';
        if (c.hasFloorPlan !== wantFP) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchProject = c.projectName.toLowerCase().includes(q);
        const matchDev = c.developerName?.toLowerCase().includes(q) || false;
        const matchLoc = c.locationName?.toLowerCase().includes(q) || false;
        if (!matchName && !matchProject && !matchDev && !matchLoc) {
          return false;
        }
      }
      return true;
    });

    // Sort configurations
    filtered.sort((a, b) => {
      switch (sort) {
        case 'name:asc':
          return a.name.localeCompare(b.name);
        case 'name:desc':
          return b.name.localeCompare(a.name);
        case 'price:asc':
          return a.price - b.price;
        case 'price:desc':
          return b.price - a.price;
        case 'effectiveRate:asc':
          return a.effectivePricePerSqft - b.effectivePricePerSqft;
        case 'effectiveRate:desc':
          return b.effectivePricePerSqft - a.effectivePricePerSqft;
        case 'createdAt:asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'createdAt:desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      data: paginated,
      projects: projectsList,
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch global configurations directory' },
      { status: 500 }
    );
  }
}
