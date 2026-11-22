import { NextRequest } from 'next/server';
import { handleWithdrawCustomerSubmission } from '@/src/domain/propertySubmission/customerSubmissionRouteHandlers';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handleWithdrawCustomerSubmission(req, id);
}
