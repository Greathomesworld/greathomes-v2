import { NextRequest } from 'next/server';
import {
  handleGetSubmissionMedia,
  handlePatchSubmissionMediaCollection,
  handlePostSubmissionMedia,
} from '@/src/domain/propertySubmission/mediaRouteHandlers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handleGetSubmissionMedia(req, id);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handlePostSubmissionMedia(req, id);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handlePatchSubmissionMediaCollection(req, id);
}
