import { NextRequest } from 'next/server';
import { handleResolveChangeRequest } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;
  return handleResolveChangeRequest(req, id, reqId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;
  return handleResolveChangeRequest(req, id, reqId);
}
