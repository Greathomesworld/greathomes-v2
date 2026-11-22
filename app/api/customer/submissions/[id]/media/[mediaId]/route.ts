import { NextRequest } from 'next/server';
import {
  handleDeleteSubmissionMediaItem,
  handlePatchSubmissionMediaItem,
} from '@/src/domain/propertySubmission/mediaRouteHandlers';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id, mediaId } = await context.params;
  return await handlePatchSubmissionMediaItem(req, id, mediaId);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id, mediaId } = await context.params;
  return await handleDeleteSubmissionMediaItem(req, id, mediaId);
}
