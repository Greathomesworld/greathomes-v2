import { NextRequest } from 'next/server';
import { handleResolveDuplicateFlag } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; flagId: string }> }
) {
  const { id, flagId } = await params;
  return handleResolveDuplicateFlag(req, id, flagId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; flagId: string }> }
) {
  const { id, flagId } = await params;
  return handleResolveDuplicateFlag(req, id, flagId);
}
