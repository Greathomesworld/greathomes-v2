import { NextRequest, NextResponse } from 'next/server';
import { comparisonService } from '@/src/domain/comparison/services/comparisonService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
      const response = NextResponse.json(
        { success: false, error: 'ids query parameter is required (comma-separated, max 4)' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      const response = NextResponse.json(
        { success: false, error: 'At least one valid id is required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    if (ids.length > 4) {
      const response = NextResponse.json(
        { success: false, error: 'Compare up to 4 homes at a time' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const items = await comparisonService.compareResale(ids);
    const response = NextResponse.json({ success: true, mode: 'RESALE', items });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to compare resale homes' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
