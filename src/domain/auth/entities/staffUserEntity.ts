import { StaffRole } from '../authorizationBoundary';

export interface StaffUserEntity {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  passwordHash?: string | null;
  sessionVersion?: number;
  enabled: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
