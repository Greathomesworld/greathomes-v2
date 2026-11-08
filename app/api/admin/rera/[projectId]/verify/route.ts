import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { projectRepository } from '@/src/infrastructure/repositories/memory/projectRepositoryMemory';
import { ensureSeedData } from '@/src/infrastructure/seed';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'MANAGE_RERA');
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { projectId } = await context.params;
    const project = await projectRepository.findById(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const staffUser = req.headers.get('x-staff-user') || auth.role || 'staff-admin';

    const registrationNumber = body.registrationNumber || project.reraRegistrationNumber;
    if (!registrationNumber || !registrationNumber.trim()) {
      return NextResponse.json(
        { success: false, error: 'Registration number is required to verify RERA.' },
        { status: 400 }
      );
    }

    const updatedRera = await projectIntelligenceService.upsertRera(
      projectId,
      {
        status: 'VERIFIED',
        authority: body.authority || 'WBRERA',
        registrationNumber: registrationNumber.trim(),
        verifiedAt: new Date(),
        verifiedBy: staffUser,
        internalNotes: body.internalNotes || `Verified on ${new Date().toISOString()} by ${staffUser}`,
      },
      true
    );

    // Sync project entity fields
    await projectRepository.update(projectId, {
      reraStatus: 'VERIFIED',
      reraRegistrationNumber: registrationNumber.trim(),
    });

    return NextResponse.json({
      success: true,
      message: 'Project RERA registration verified successfully.',
      data: updatedRera,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
