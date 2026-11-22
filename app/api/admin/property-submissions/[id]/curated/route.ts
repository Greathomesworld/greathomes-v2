import { NextRequest } from 'next/server';
import { handleEditCuratedStaffSubmission } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleEditCuratedStaffSubmission(req, id);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleEditCuratedStaffSubmission(req, id);
}
