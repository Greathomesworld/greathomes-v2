import { NextRequest, NextResponse } from 'next/server';
import { amenityRepository } from '@/src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  CANONICAL_RESIDENTIAL_AMENITIES,
  propertyTypeSchema,
  SubmissionPropertyType,
} from '@/src/domain/propertySubmission/validation';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const rawPropertyType = request.nextUrl.searchParams.get('propertyType');
    let filterPropertyType: SubmissionPropertyType | null = null;
    if (rawPropertyType) {
      const parsed = propertyTypeSchema.safeParse(rawPropertyType);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid propertyType filter.' },
          { status: 400 }
        );
      }
      filterPropertyType = parsed.data;
    }

    type AmenityRecord = Awaited<ReturnType<typeof amenityRepository.findAll>>[number];
    const dbAmenities = await amenityRepository.findAll().catch((): AmenityRecord[] => []);
    const dbBySlug = new Map<string, AmenityRecord>(
      dbAmenities.map((a) => [a.slug.toLowerCase(), a] as const)
    );

    const merged = CANONICAL_RESIDENTIAL_AMENITIES.map((canonical) => {
      const dbMatch = dbBySlug.get(canonical.slug.toLowerCase());
      return {
        id: dbMatch?.id || canonical.slug,
        slug: canonical.slug,
        name: dbMatch?.name || canonical.name,
        category: dbMatch?.category || canonical.category,
        icon: dbMatch?.icon || canonical.icon,
        applicablePropertyTypes: canonical.applicablePropertyTypes,
      };
    });

    // Include any additional active DB amenities not in canonical list (for Apartment/House)
    for (const dbAmenity of dbAmenities) {
      const slugLower = dbAmenity.slug.toLowerCase();
      if (!CANONICAL_RESIDENTIAL_AMENITIES.some((c) => c.slug.toLowerCase() === slugLower)) {
        merged.push({
          id: dbAmenity.id,
          slug: dbAmenity.slug,
          name: dbAmenity.name,
          category: (dbAmenity.category as (typeof merged)[number]['category']) || 'GENERAL',
          icon: dbAmenity.icon || 'check-circle2',
          applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
        });
      }
    }

    const filtered = filterPropertyType
      ? merged.filter((item) => item.applicablePropertyTypes.includes(filterPropertyType))
      : merged;

    return NextResponse.json({
      success: true,
      data: filtered,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load canonical amenities.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
