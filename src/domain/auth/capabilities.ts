import type { StaffRole } from './roles';
import { verifyInternalStaff } from './authorizationBoundary';
import type { StaffUserRecord } from './authorizationBoundary';
import { hasCapability, hasAnyCapability, type StaffCapability } from './capabilityModel';
export * from './capabilityModel';

export async function verifyStaffCapability(
  request: Request,
  capability: StaffCapability
): Promise<{ authorized: boolean; error?: string; status?: number; statusCode?: number; role?: StaffRole; staff?: StaffUserRecord }> {
  const auth = await verifyInternalStaff(request);
  if (!auth.authorized) {
    const status = auth.status || auth.statusCode || 401;
    return { authorized: false, error: auth.error || 'Unauthorized', status, statusCode: status };
  }
  if (!auth.role || !hasCapability(auth.role, capability)) {
    return { authorized: false, error: `Forbidden: role '${auth.role}' does not have capability '${capability}'`, status: 403, statusCode: 403, role: auth.role };
  }
  return { authorized: true, role: auth.role, staff: auth.staff };
}

export function requireCapability(request: Request, capability: StaffCapability) {
  return verifyStaffCapability(request, capability);
}

export async function requireAnyCapability(
  request: Request,
  capabilities: StaffCapability[]
): Promise<{ authorized: boolean; error?: string; status?: number; statusCode?: number; role?: StaffRole; staff?: StaffUserRecord }> {
  const auth = await verifyInternalStaff(request);
  if (!auth.authorized) {
    const status = auth.status || auth.statusCode || 401;
    return { authorized: false, error: auth.error || 'Unauthorized', status, statusCode: status };
  }
  if (!auth.role || !hasAnyCapability(auth.role, capabilities)) {
    return { authorized: false, error: `Forbidden: role '${auth.role}' lacks required capabilities`, status: 403, statusCode: 403, role: auth.role };
  }
  return { authorized: true, role: auth.role, staff: auth.staff };
}