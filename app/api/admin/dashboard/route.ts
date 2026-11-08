import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { developerService } from '@/src/domain/developers/services/developerService';
import { locationRepository } from '@/src/infrastructure/repositories/memory/locationRepositoryMemory';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalService } from '@/src/domain/projects/services/rentalService';
import { enquiryService } from '@/src/domain/enquiry/services/enquiryService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'dashboard.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();

    // Fetch real metrics in parallel across domain services
    const [
      projectsRes,
      developersRes,
      locationsList,
      resaleList,
      rentalList,
      enquiriesList,
    ] = await Promise.all([
      projectIntelligenceService.listProjects({ limit: 100 }, true).catch(() => ({ data: [], pagination: { total: 0 } })),
      developerService.listPublicDevelopers({ limit: 100, isInternalStaff: true }).catch(() => ({ items: [], pagination: { total: 0 } })),
      locationRepository.findAll().catch(() => []),
      resaleListingService.listAdminListings().catch(() => []),
      rentalService.listAdminListings().catch(() => []),
      enquiryService.getEnquiries({ limit: 10 }).catch(() => ({ items: [], total: 0 })),
    ]);

    const projects = projectsRes.data || [];
    const publishedProjectsCount = projects.filter((p: any) => p.isPublished || p.lifecycleStatus === 'PUBLISHED').length;
    const draftProjectsCount = projects.filter((p: any) => !p.isPublished || p.lifecycleStatus === 'DRAFT').length;

    const resalePendingCount = resaleList.filter((r: any) => r.lifecycleStatus === 'DRAFT' || r.lifecycleStatus === 'SUBMITTED' || r.lifecycleStatus === 'UNDER_REVIEW').length;
    const rentalPendingCount = rentalList.filter((r: any) => r.lifecycleStatus === 'DRAFT' || r.lifecycleStatus === 'SUBMITTED' || r.lifecycleStatus === 'UNDER_REVIEW').length;

    const enquiryItems = Array.isArray(enquiriesList) ? enquiriesList : (enquiriesList?.items || []);
    const enquiriesTotalCount = Array.isArray(enquiriesList) ? enquiriesList.length : (enquiriesList?.total ?? enquiryItems.length);

    // Items needing attention
    const draftProjects = projects.filter((p: any) => !p.isPublished || p.lifecycleStatus === 'DRAFT').slice(0, 5);
    const pendingResale = resaleList.filter((r: any) => r.lifecycleStatus !== 'PUBLISHED').slice(0, 5);
    const recentEnquiries = enquiryItems.slice(0, 5);

    return NextResponse.json({
      metrics: {
        projectsTotal: projectsRes.pagination?.total ?? projects.length,
        projectsPublished: publishedProjectsCount,
        projectsDraft: draftProjectsCount,
        developersTotal: developersRes.pagination?.total ?? developersRes.items?.length ?? 0,
        locationsTotal: locationsList.length,
        resaleTotal: resaleList.length,
        resalePending: resalePendingCount,
        rentalTotal: rentalList.length,
        rentalPending: rentalPendingCount,
        enquiriesTotal: enquiriesTotalCount,
      },
      attention: {
        draftProjects,
        pendingResale,
      },
      recentEnquiries,
    });
  } catch (error: any) {
    console.error('Error loading admin dashboard stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load dashboard data' },
      { status: 500 }
    );
  }
}
