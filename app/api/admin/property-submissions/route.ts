import { NextRequest } from 'next/server';
import { handleListStaffSubmissions } from '@/src/domain/propertySubmission/staffSubmissionRouteHandlers';

export async function GET(req: NextRequest) {
  return handleListStaffSubmissions(req);
}
