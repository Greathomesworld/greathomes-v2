import { NextRequest } from 'next/server';
import { handleGetStaffSubmissionDetail } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetStaffSubmissionDetail(req, id);
}
