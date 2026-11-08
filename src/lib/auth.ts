import { NextRequest } from 'next/server';
import {
  verifyInternalStaff as verifyStaffBoundary,
  AuthResult as BoundaryAuthResult,
} from '@/src/domain/auth/authorizationBoundary';

export type AuthResult = BoundaryAuthResult;

export async function verifyInternalStaff(req: NextRequest | Request): Promise<AuthResult> {
  return verifyStaffBoundary(req);
}
