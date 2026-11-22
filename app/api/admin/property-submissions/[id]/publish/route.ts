import { NextRequest } from 'next/server';
import { handlePublishStaffSubmission } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handlePublishStaffSubmission(req, id);
}
