import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerService } from '@/src/domain/customer/services/customerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const { searchParams } = new URL(req.url);
    const resourceType = searchParams.get('resourceType') as any;

    const items = await customerService.listSavedItems(
      auth.customerId,
      resourceType || undefined
    );

    const response = NextResponse.json({ success: true, items });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to list saved items' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const body = await req.json();
    const { resourceType, resourceId } = body;

    if (!resourceType || !resourceId) {
      const response = NextResponse.json(
        { success: false, error: 'resourceType and resourceId are required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const saved = await customerService.saveItem(auth.customerId, resourceType, resourceId);
    const response = NextResponse.json({ success: true, item: saved }, { status: 201 });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to save item' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function DELETE(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const resourceType = searchParams.get('resourceType') as any;
    const resourceId = searchParams.get('resourceId');

    let deleted = false;
    if (id) {
      deleted = await customerService.deleteSavedItem(auth.customerId, id);
    } else if (resourceType && resourceId) {
      deleted = await customerService.unsaveItem(auth.customerId, resourceType, resourceId);
    } else {
      const response = NextResponse.json(
        { success: false, error: 'Either id or (resourceType and resourceId) is required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const response = NextResponse.json({ success: true, deleted });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to remove saved item' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
