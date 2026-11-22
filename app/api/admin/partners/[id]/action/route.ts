import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability, type StaffCapability } from '@/src/domain/auth/capabilityModel';
import {
  partnerService,
  PartnerDomainError,
  type PartnerAdminAction,
} from '@/src/domain/customer/partnerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_CAPABILITY_MAP: Record<PartnerAdminAction, StaffCapability> = {
  APPROVE: 'partner.approve',
  REJECT: 'partner.reject',
  SUSPEND: 'partner.suspend',
  REVOKE: 'partner.revoke',
  REACTIVATE: 'partner.reactivate',
};

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyInternalStaff(req);

  if (!auth.authorized || !auth.role || !auth.staff) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON request payload.' }, { status: 400 }),
      requestId
    );
  }

  const rawAction =
    typeof body?.action === 'string' ? body.action.trim().toUpperCase() : '';
  if (!['APPROVE', 'REJECT', 'SUSPEND', 'REVOKE', 'REACTIVATE'].includes(rawAction)) {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          error: 'Invalid partner action. Allowed actions: APPROVE, REJECT, SUSPEND, REVOKE, REACTIVATE.',
        },
        { status: 400 }
      ),
      requestId
    );
  }

  const action = rawAction as PartnerAdminAction;
  const requiredCap = ACTION_CAPABILITY_MAP[action];
  if (!hasCapability(auth.role, requiredCap)) {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          error: `Forbidden: role '${auth.role}' lacks capability '${requiredCap}'.`,
        },
        { status: 403 }
      ),
      requestId
    );
  }

  try {
    const { id } = await props.params;
    const detail = await partnerService.executeAdminPartnerAction(id, auth.staff, req, {
      action,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
    });

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...detail,
      }),
      requestId
    );
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode }),
        requestId
      );
    }
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Failed to execute partner action.' }, { status: 500 }),
      requestId
    );
  }
}
