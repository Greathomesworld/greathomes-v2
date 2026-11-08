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
    const newStatus = body.status === 'NOT_PROVIDED' ? 'NOT_PROVIDED' : 'PROVIDED';
    const staffUser = req.headers.get('x-staff-user') || auth.role || 'staff-admin';

    const updatedRera = await projectIntelligenceService.upsertRera(
      projectId,
      {
        status: newStatus,
        authority: body.authority || 'WBRERA',
        registrationNumber: body.registrationNumber ?? project.reraRegistrationNumber ?? null,
        verifiedAt: null,
        verifiedBy: null,
        internalNotes: body.internalNotes || `Verification revoked on ${new Date().toISOString()} by ${staffUser}`,
      },
      true
    );

    // Sync project entity
    await projectRepository.update(projectId, {
      reraStatus: newStatus,
      reraRegistrationNumber: body.registrationNumber ?? project.reraRegistrationNumber ?? null,
    });

    return NextResponse.json({
      success: true,
      message: `RERA verification status revoked to ${newStatus}.`,
      data: updatedRera,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
