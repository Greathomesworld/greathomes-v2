import { ALLOWED_STAFF_ROLES, type StaffRole } from '../domain/auth/roles';
import { getRoleCapabilities, type StaffCapability, type StaffSessionContext } from '../domain/auth/capabilityModel';

const LEGACY_ROLE_KEY = 'gh_staff_role';
const LEGACY_TOKEN_KEY = 'gh_staff_token';

// Legacy browser storage is retained only for cleanup; it is never an authentication source.
export function getStoredStaffRole(): StaffRole | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(LEGACY_ROLE_KEY);
  return value && ALLOWED_STAFF_ROLES.includes(value as StaffRole) ? value as StaffRole : null;
}
export function getStoredStaffToken(): string | null { return null; }
export function setStaffSession(_role: StaffRole): void {
  if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_TOKEN_KEY);
}
export function clearStaffSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_ROLE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  document.cookie = 'gh_staff_role=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'gh_staff_token=; path=/; max-age=0; SameSite=Lax';
}
export function getAdminHeaders(): HeadersInit { return { 'Content-Type': 'application/json' }; }

const ROLE_NAMES: Record<StaffRole, string> = {
  SUPER_ADMIN: 'Super Administrator',
  ADMIN: 'Operations Admin',
  SALES_MANAGER: 'Sales Manager',
  SALES_EXECUTIVE: 'Sales Executive',
  TELECALLER: 'Telecaller',
  CONTENT_MANAGER: 'Content Manager',
  PROPERTY_MANAGER: 'Property Manager',
  SALES: 'Sales Specialist',
  ANALYST: 'Intelligence Analyst',
};
export function buildStaffContext(role: StaffRole | null, displayName?: string): StaffSessionContext {
  if (!role) return { authenticated: false, role: 'ADMIN', displayName: 'Unauthenticated', capabilities: [] };
  return { authenticated: true, role, displayName: displayName || ROLE_NAMES[role], capabilities: getRoleCapabilities(role) };
}