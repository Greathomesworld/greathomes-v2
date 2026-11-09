// Canonical 5 enterprise roles
export type CanonicalStaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES_MANAGER' | 'SALES_EXECUTIVE' | 'TELECALLER';
export const CANONICAL_STAFF_ROLES: CanonicalStaffRole[] = ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'TELECALLER'];

// Comprehensive StaffRole supporting both canonical 5 roles and existing legacy accounts for backward compatibility
export type StaffRole =
  | CanonicalStaffRole
  | 'CONTENT_MANAGER'
  | 'PROPERTY_MANAGER'
  | 'SALES'
  | 'ANALYST';

export const ALLOWED_STAFF_ROLES: StaffRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_EXECUTIVE',
  'TELECALLER',
  'CONTENT_MANAGER',
  'PROPERTY_MANAGER',
  'SALES',
  'ANALYST',
];