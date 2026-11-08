import { NextRequest, NextResponse } from 'next/server';
import { amenityRepository } from '@/src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const existing = await amenityRepository.findById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Amenity record not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { name, category, icon } = body;

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

    const updatePayload: Partial<typeof existing> = {};
    if (name && typeof name === 'string' && name.trim()) {
      updatePayload.name = name.trim();
    }

    if (category) {
      const upperCategory = category.toUpperCase();
      if (!validCategories.includes(upperCategory)) {
        return NextResponse.json(
          { error: `Invalid category "${category}". Allowed: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      updatePayload.category = upperCategory;
    }

    if (icon !== undefined) {
      updatePayload.icon = icon ? icon.trim() : 'check-circle2';
    }

    const updated = await amenityRepository.update(id, updatePayload);
    const associationCount = await amenityRepository.countProjectAssociations(id);

    return NextResponse.json({
      data: { ...updated, associationCount },
      message: 'Amenity updated successfully.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update amenity' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const existing = await amenityRepository.findById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Amenity record not found.' }, { status: 404 });
    }

    const associationCount = await amenityRepository.countProjectAssociations(id);
    if (associationCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete amenity "${existing.name}" because it is associated with ${associationCount} project(s). Remove the project associations first.`,
        },
        { status: 400 }
      );
    }

    const deleted = await amenityRepository.delete(id);
    return NextResponse.json({
      success: deleted,
      message: `Master amenity "${existing.name}" deleted successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete amenity' },
      { status: 500 }
    );
  }
}
