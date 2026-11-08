import type { StaffRole } from '../roles';
import type { StaffCapability } from '../capabilityModel';

export interface CreateStaffDto {
  email: string;
  name: string;
  role: StaffRole;
  password?: string;
  avatarUrl?: string | null;
}

export interface UpdateStaffDto {
  name?: string;
  password?: string;
  role?: StaffRole;
  enabled?: boolean;
  avatarUrl?: string | null;
}

export interface StaffFilterDto {
  search?: string;
  role?: StaffRole | 'ALL';
  enabled?: boolean | 'ALL';
  page?: number;
  limit?: number;
}

export interface StaffPublicDto {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  enabled: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  capabilities: StaffCapability[];
}
