import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { nearbyPlaceService } from '@/src/domain/places/services/nearbyPlaceService';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import {
  CoordinateSource,
  isValidCoordinate,
  ProjectLocationStatus,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { PlaceCategory } from '@/src/domain/places/entities';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';

export async function GET(req: NextRequest) {
  const ctx = extractRequestContext(req);
  const clientIp = ctx.ipAddress || 'anonymous';

  const searchParams = req.nextUrl.searchParams;
  const projectId = (searchParams.get('projectId') || searchParams.get('projectSlug') || '').trim();
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const locationStatusParam = searchParams.get('locationStatus') as ProjectLocationStatus | null;
  const coordinateSourceParam = searchParams.get('coordinateSource') as CoordinateSource | null;
  const radiusStr = searchParams.get('radius');
  const categoryStr = searchParams.get('category');
  const limitStr = searchParams.get('limit');

  // Apply stricter rate limit for raw coordinate queries vs. canonical project lookups
  const rateLimitKey = projectId
    ? `places_nearby_project:${clientIp}`
    : `places_nearby_coords:${clientIp}`;
  const rateLimitMax = projectId ? 60 : 30;
  const rateCheck = checkRateLimit(rateLimitKey, rateLimitMax, 60_000);
  if (!rateCheck.allowed) {
    return createRateLimitResponse(ctx.requestId, rateCheck);
  }

  await ensureSeedData();

  // Security clamping: Cap radius to max 25 km and limit to max 50 to prevent spatial scraping
  const rawRadius = radiusStr ? parseFloat(radiusStr) : 15;
  const radiusKm = Math.min(25, Math.max(0.5, isNaN(rawRadius) ? 15 : rawRadius));

  const rawLimit = limitStr ? parseInt(limitStr, 10) : 20;
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

  const category = categoryStr ? (categoryStr.toUpperCase() as PlaceCategory) : undefined;

  // Mode 1: Canonical project-aware lookup enforcing 3-state coordinate integrity
  if (projectId) {
    if (projectId.length > 120) {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Invalid project identifier.' }, { status: 400 }),
        ctx.requestId
      );
    }

    const project =
      (await projectIntelligenceService.getProjectById(projectId, false)) ||
      (await projectIntelligenceService.getProjectBySlug(projectId, false));

    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Project not found' }, { status: 404 }),
        ctx.requestId
      );
    }

    const connectivity = await nearbyPlaceService.getProjectNearbyConnectivity(
      {
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        projectLatitude: project.projectLatitude,
        projectLongitude: project.projectLongitude,
        latitude: project.latitude,
        longitude: project.longitude,
        locationStatus: project.locationStatus,
        coordinateSource: project.coordinatesSource,
        hasVerifiedProjectCoordinates: project.hasVerifiedProjectCoordinates,
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
        count: connectivity.places.length,
        originStatus: connectivity.originStatus,
        coordinateSource: connectivity.coordinateSource,
        hasVerifiedProjectCoordinates: connectivity.hasVerifiedProjectCoordinates,
        routingProvider: connectivity.routingProvider,
        attribution: connectivity.attribution,
        disclosureMessage: connectivity.disclosureMessage,
        radiusKm,
        data: connectivity.places,
      }),
      ctx.requestId
    );
  }

  // Mode 2: Explicit coordinate lookup
  if (
    locationStatusParam === 'APPROXIMATE_LOCATION' ||
    coordinateSourceParam === 'LOCATION'
  ) {
    const connectivity = await nearbyPlaceService.getProjectNearbyConnectivity(
      {
        latitude: latStr ? parseFloat(latStr) : null,
        longitude: lngStr ? parseFloat(lngStr) : null,
        locationStatus: 'APPROXIMATE_LOCATION',
        coordinateSource: 'LOCATION',
        hasVerifiedProjectCoordinates: false,
      },
      { radiusKm, limit, category, allowRoadRouting: false }
    );

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        count: 0,
        originStatus: connectivity.originStatus,
        coordinateSource: connectivity.coordinateSource,
        hasVerifiedProjectCoordinates: false,
        routingProvider: connectivity.routingProvider,
        attribution: null,
        disclosureMessage: connectivity.disclosureMessage,
        radiusKm,
        data: [],
      }),
      ctx.requestId
    );
  }

  if (locationStatusParam === 'LOCATION_UNAVAILABLE') {
    const connectivity = await nearbyPlaceService.getProjectNearbyConnectivity(null, {
      radiusKm,
      limit,
      category,
      allowRoadRouting: false,
    });

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        count: 0,
        originStatus: connectivity.originStatus,
        coordinateSource: connectivity.coordinateSource,
        hasVerifiedProjectCoordinates: false,
        routingProvider: connectivity.routingProvider,
        attribution: null,
        disclosureMessage: connectivity.disclosureMessage,
        radiusKm,
        data: [],
      }),
      ctx.requestId
    );
  }

  if (!latStr || !lngStr) {
    return withCorrelationHeaders(
      NextResponse.json(
        { error: 'Missing required query parameters: "lat" and "lng"' },
        { status: 400 }
      ),
      ctx.requestId
    );
  }

  const latitude = parseFloat(latStr);
  const longitude = parseFloat(lngStr);

  if (!isValidCoordinate(latitude, longitude)) {
    return withCorrelationHeaders(
      NextResponse.json(
        { error: 'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.' },
        { status: 400 }
      ),
      ctx.requestId
    );
  }

  // Security audit safeguard: Restrict arbitrary spatial probing to supported operational market bounds
  // West Bengal / Kolkata Regional Market: Lat [21.5, 27.5], Lng [85.5, 89.9]
  const isWithinOperationalMarket =
    latitude >= 21.5 && latitude <= 27.5 && longitude >= 85.5 && longitude <= 89.9;

  if (!isWithinOperationalMarket) {
    return withCorrelationHeaders(
      NextResponse.json(
        { error: 'Spatial queries are restricted to supported operational regional markets (West Bengal / Kolkata).' },
        { status: 400 }
      ),
      ctx.requestId
    );
  }

  // Abuse Protection: Raw coordinate queries without a verified projectId/projectSlug
  // return verified straight-line geodesic places ONLY (`allowRoadRouting: false`, `maxRoutedPlaces: 0`)
  // so arbitrary coordinate probing cannot trigger upstream routing calls or pollute the route cache.
  const connectivity = await nearbyPlaceService.getProjectNearbyConnectivity(
    {
      latitude,
      longitude,
      projectLatitude: latitude,
      projectLongitude: longitude,
      locationStatus: 'VERIFIED_PROJECT_LOCATION',
      coordinateSource: 'PROJECT',
      hasVerifiedProjectCoordinates: true,
    },
    {
      radiusKm,
      limit,
      category,
      maxRoutedPlaces: 0,
      allowRoadRouting: false,
    }
  );

  return withCorrelationHeaders(
    NextResponse.json({
      success: true,
      count: connectivity.places.length,
      origin: {
        latitude,
        longitude,
      },
      originStatus: connectivity.originStatus,
      coordinateSource: connectivity.coordinateSource,
      hasVerifiedProjectCoordinates: connectivity.hasVerifiedProjectCoordinates,
      routingProvider: 'NONE',
      attribution: null,
      disclosureMessage:
        'Arbitrary coordinate lookup returns verified straight-line geodesic distances only. Pass a verified projectId or projectSlug for project road-route connectivity.',
      radiusKm,
      data: connectivity.places,
    }),
    ctx.requestId
  );
}

