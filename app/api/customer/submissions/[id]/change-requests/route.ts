import { NextRequest } from 'next/server';
import {
  handleCreateCustomerChangeRequest,
  handleListCustomerChangeRequests,
} from '@/src/domain/propertySubmission/customerSubmissionRouteHandlers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handleListCustomerChangeRequests(req, id);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handleCreateCustomerChangeRequest(req, id);
}
