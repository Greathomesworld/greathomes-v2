import { NextRequest, NextResponse } from 'next/server';
import { amenityRepository } from '@/src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    const amenities = await amenityRepository.findAll();
    const enriched = await Promise.all(
      amenities.map(async (a) => {
        const associationCount = await amenityRepository.countProjectAssociations(a.id);
        return {
          ...a,
          associationCount,
        };
      })
    );

    return NextResponse.json({ data: enriched });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch amenities' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await request.json();
    const { name, slug: customSlug, category, icon } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Amenity name is required and cannot be empty.' },
        { status: 400 }
      );
    }

    const generatedSlug = (customSlug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (!generatedSlug) {
      return NextResponse.json(
        { error: 'Valid canonical slug is required.' },
        { status: 400 }
      );
    }

    const existing = await amenityRepository.findBySlug(generatedSlug);
    if (existing) {
      return NextResponse.json(
        { error: `An amenity with key/slug "${generatedSlug}" already exists.` },
        { status: 400 }
      );
    }

    const validCategories = [
      'OUTDOOR',
      'INDOOR',
      'CLUBHOUSE',
      'COMMUNITY',
      'FITNESS',
      'WELLNESS',
      'SECURITY',
      'ECO',
      'GENERAL',
    ];

    const finalCategory = (category || 'GENERAL').toUpperCase();
    if (!validCategories.includes(finalCategory)) {
      return NextResponse.json(
        { error: `Invalid category "${category}". Allowed categories: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const created = await amenityRepository.create({
      name: name.trim(),
      slug: generatedSlug,
      category: finalCategory,
      icon: icon ? icon.trim() : 'check-circle2',
    });

    return NextResponse.json(
      { data: { ...created, associationCount: 0 }, message: 'Master amenity created successfully.' },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create amenity' },
      { status: 500 }
    );
  }
}
