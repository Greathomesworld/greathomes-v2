import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { nearbyPlaceService } from '@/src/domain/places/services/nearbyPlaceService';
import { buildProjectLocationViewModel } from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { PlaceCategory } from '@/src/domain/places/entities';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const ctx = extractRequestContext(req);
  const clientIp = ctx.ipAddress || 'anonymous';
  const rateCheck = checkRateLimit(`project_slug_nearby:${clientIp}`, 60, 60_000);
  if (!rateCheck.allowed) {
    return createRateLimitResponse(ctx.requestId, rateCheck);
  }

  await ensureSeedData();

  const { slug } = await context.params;
  if (!slug || slug.trim().length === 0 || slug.length > 120) {
    return withCorrelationHeaders(
      NextResponse.json({ error: 'Invalid project slug' }, { status: 400 }),
      ctx.requestId
    );
  }

  const project = await projectIntelligenceService.getProjectBySlug(slug);

  if (!project) {
    return withCorrelationHeaders(
      NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      ),
      ctx.requestId
    );
  }

  const locationVm = buildProjectLocationViewModel(project.location, null, project);

  if (
    !locationVm.hasVerifiedProjectCoordinates ||
    locationVm.locationStatus !== 'VERIFIED_PROJECT_LOCATION' ||
    locationVm.latitude === null ||
    locationVm.longitude === null
  ) {
    const isApproximate = locationVm.locationStatus === 'APPROXIMATE_LOCATION';
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        hasCoordinates: false,
        hasVerifiedProjectCoordinates: false,
        isApproximateLocation: isApproximate,
        locationStatus: locationVm.locationStatus,
        coordinateSource: locationVm.coordinateSource,
        projectName: project.name,
        projectLocation: {
          name: locationVm.name,
          latitude: locationVm.latitude,
          longitude: locationVm.longitude,
          coordinateSource: locationVm.coordinateSource,
          locationStatus: locationVm.locationStatus,
        },
        message: isApproximate
          ? `Only approximate locality coordinates (${locationVm.name}) are available. Exact project-site coordinates are pending verification.`
          : 'Project location coordinates are pending verification.',
        count: 0,
        data: [],
      }),
      ctx.requestId
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const categoryStr = searchParams.get('category');
  const radiusStr = searchParams.get('radius');
  const limitStr = searchParams.get('limit');

  const rawRadius = radiusStr ? parseFloat(radiusStr) : 15;
  const radiusKm = Math.min(25, Math.max(0.5, isNaN(rawRadius) ? 15 : rawRadius));

  const rawLimit = limitStr ? parseInt(limitStr, 10) : 20;
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

  const category = categoryStr ? (categoryStr.toUpperCase() as PlaceCategory) : undefined;

  const connectivity = await nearbyPlaceService.getProjectNearbyConnectivity(
    {
      projectId: project.id,
      projectSlug: project.slug,
      projectName: project.name,
      projectLatitude: project.projectLatitude,
      projectLongitude: project.projectLongitude,
      latitude: locationVm.latitude,
      longitude: locationVm.longitude,
      locationStatus: locationVm.locationStatus,
      coordinateSource: locationVm.coordinateSource,
      hasVerifiedProjectCoordinates: locationVm.hasVerifiedProjectCoordinates,
      location: project.location,
    },
    {
      radiusKm,
      limit,
      category,
      maxRoutedPlaces: 9,
      allowRoadRouting: true,
      overallDeadlineMs: 2500,
    }
  );

  return withCorrelationHeaders(
    NextResponse.json({
      success: true,
      hasCoordinates: true,
      hasVerifiedProjectCoordinates: true,
      isApproximateLocation: false,
      locationStatus: locationVm.locationStatus,
      coordinateSource: locationVm.coordinateSource,
      routingProvider: connectivity.routingProvider,
      attribution: connectivity.attribution,
      disclosureMessage: connectivity.disclosureMessage,
      projectName: project.name,
      projectLocation: {
        name: locationVm.name,
        latitude: locationVm.latitude,
        longitude: locationVm.longitude,
        coordinateSource: locationVm.coordinateSource,
        locationStatus: locationVm.locationStatus,
      },
      count: connectivity.places.length,
      data: connectivity.places,
    }),
    ctx.requestId
  );
}

