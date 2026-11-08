import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { projectRepository, projectReraRepository } from '@/src/infrastructure/repositories/memory/projectRepositoryMemory';
import { developerRepository } from '@/src/infrastructure/repositories/memory/developerRepositoryMemory';
import { locationRepository } from '@/src/infrastructure/repositories/memory/locationRepositoryMemory';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'MANAGE_RERA');
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase().trim() || '';
    const statusFilter = searchParams.get('status')?.toUpperCase() || '';
    const authorityFilter = searchParams.get('authority')?.trim() || '';

    const allProjects = await projectRepository.findAll();
    const allReras = await projectReraRepository.findAll();
    const reraMap = new Map(allReras.map(r => [r.projectId, r]));

    const allDevelopers = await developerRepository.list();
    const devMap = new Map(allDevelopers.map(d => [d.id, d.name]));

    const allLocations = await locationRepository.findAll();
    const locMap = new Map(allLocations.map(l => [l.id, l.name]));

    let totalProjects = allProjects.length;
    let verifiedCount = 0;
    let providedCount = 0;
    let notProvidedCount = 0;

    const items = allProjects.map(p => {
      const rera = reraMap.get(p.id);
      const status = rera?.status || p.reraStatus || 'NOT_PROVIDED';
      const registrationNumber = rera?.registrationNumber || p.reraRegistrationNumber || null;
      const authority = rera?.authority || (registrationNumber ? 'WBRERA' : null);

      if (status === 'VERIFIED') verifiedCount++;
      else if (status === 'PROVIDED') providedCount++;
      else notProvidedCount++;

      return {
        projectId: p.id,
        projectName: p.name,
        projectSlug: p.slug,
        lifecycleStatus: p.lifecycleStatus,
        developerName: devMap.get(p.developerId) || 'Unknown Developer',
        locationName: locMap.get(p.locationId) || 'Unknown Location',
        rera: {
          id: rera?.id || null,
          status,
          authority,
          registrationNumber,
          verifiedAt: rera?.verifiedAt || null,
          verifiedBy: rera?.verifiedBy || null,
          internalNotes: rera?.internalNotes || null,
          updatedAt: rera?.updatedAt || p.updatedAt,
        },
      };
    });

    let filtered = items;

    if (statusFilter && statusFilter !== 'ALL') {
      filtered = filtered.filter(i => i.rera.status === statusFilter);
    }

    if (authorityFilter && authorityFilter !== 'ALL') {
      filtered = filtered.filter(i => (i.rera.authority || '').toLowerCase() === authorityFilter.toLowerCase());
    }

    if (search) {
      filtered = filtered.filter(i =>
        i.projectName.toLowerCase().includes(search) ||
        i.developerName.toLowerCase().includes(search) ||
        (i.rera.registrationNumber && i.rera.registrationNumber.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalProjects,
        verifiedCount,
        providedCount,
        notProvidedCount,
      },
      data: filtered,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
