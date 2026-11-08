import { staffRepository, StaffRepository } from '../repositories/staffRepository';
import { StaffUserEntity } from '../entities/staffUserEntity';
import { CreateStaffDto, UpdateStaffDto, StaffFilterDto, StaffPublicDto } from '../dto/staffDto';
import { StaffRole, ALLOWED_STAFF_ROLES, StaffUserRecord } from '../authorizationBoundary';
import { getRoleCapabilities, hasCapability } from '../capabilities';
import { hashStaffPassword } from '../password';

export class StaffNotFoundError extends Error {
  constructor(id: string) {
    super(`Staff member with ID '${id}' not found`);
    this.name = 'StaffNotFoundError';
  }
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A staff account with email '${email}' already exists`);
    this.name = 'DuplicateEmailError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SelfEscalationError extends Error {
  constructor(message: string = 'Cannot elevate your own role or assign permissions exceeding your own role') {
    super(message);
    this.name = 'SelfEscalationError';
  }
}

export class SelfDisableError extends Error {
  constructor(message: string = 'Staff members cannot disable their own account') {
    super(message);
    this.name = 'SelfDisableError';
  }
}

export class LastSuperAdminError extends Error {
  constructor(message: string = 'Cannot demote or disable the last active SUPER_ADMIN. System requires at least one active Super Administrator.') {
    super(message);
    this.name = 'LastSuperAdminError';
  }
}

export class StaffService {
  constructor(private repo: StaffRepository = staffRepository) {}

  async listStaff(filter?: StaffFilterDto): Promise<{ items: StaffPublicDto[]; total: number }> {
    const res = await this.repo.list(filter);
    return {
      items: res.items.map(this.toPublicDto),
      total: res.total,
    };
  }

  async getStaffById(id: string): Promise<StaffPublicDto | null> {
    const staff = await this.repo.findById(id);
    if (!staff) return null;
    return this.toPublicDto(staff);
  }

  async getStaffByEmail(email: string): Promise<StaffPublicDto | null> {
    const staff = await this.repo.findByEmail(email);
    if (!staff) return null;
    return this.toPublicDto(staff);
  }

  async createStaff(dto: CreateStaffDto, actor?: StaffUserRecord): Promise<StaffPublicDto> {
    if (!dto.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new ValidationError('A valid email address is required');
    }
    if (!dto.name || dto.name.trim().length < 2) {
      throw new ValidationError('Staff name must be at least 2 characters');
    }
    if (!dto.role || !ALLOWED_STAFF_ROLES.includes(dto.role)) {
      throw new ValidationError(`Invalid staff role '${dto.role}'. Allowed roles: ${ALLOWED_STAFF_ROLES.join(', ')}`);
    }
    if (typeof dto.password !== 'string' || dto.password.length < 12 || dto.password.length > 256) {
      throw new ValidationError('An initial password of 12 to 256 characters is required for every staff account.');
    }

    if (actor) {
      if (!hasCapability(actor.role, 'staff.create')) {
        throw new ValidationError("Forbidden: lacking 'staff.create' capability");
      }
      if (dto.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
        throw new SelfEscalationError('Only Super Administrators can create other Super Administrators');
      }
    }

    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new DuplicateEmailError(dto.email);
    }

    const passwordHash = await hashStaffPassword(dto.password);
    const created = await this.repo.create({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      passwordHash,
      enabled: true,
      avatarUrl: dto.avatarUrl || null,
    });

    return this.toPublicDto(created);
  }

  async updateStaff(id: string, dto: UpdateStaffDto, actor?: StaffUserRecord): Promise<StaffPublicDto> {
    const target = await this.repo.findById(id);
    if (!target) {
      throw new StaffNotFoundError(id);
    }

    if (actor && !hasCapability(actor.role, 'staff.update')) {
      throw new ValidationError("Forbidden: lacking 'staff.update' capability");
    }

    if (dto.role && dto.role !== target.role) {
      return this.updateStaffRole(id, dto.role, actor);
    }

    if (dto.enabled !== undefined && dto.enabled !== target.enabled) {
      return this.setStaffEnabled(id, dto.enabled, actor);
    }

    const updatePayload: Partial<Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'>> = { name: dto.name, avatarUrl: dto.avatarUrl };
    if (dto.password !== undefined) {
      if (typeof dto.password !== 'string' || dto.password.length < 12 || dto.password.length > 256) throw new ValidationError('Password must contain between 12 and 256 characters.');
      updatePayload.passwordHash = await hashStaffPassword(dto.password);
      updatePayload.sessionVersion = (target.sessionVersion ?? 0) + 1;
    }
    const updated = await this.repo.update(id, updatePayload);

    return this.toPublicDto(updated);
  }

  async updateStaffRole(id: string, newRole: StaffRole, actor?: StaffUserRecord): Promise<StaffPublicDto> {
    if (!newRole || !ALLOWED_STAFF_ROLES.includes(newRole)) {
      throw new ValidationError(`Invalid role '${newRole}'. Allowed roles: ${ALLOWED_STAFF_ROLES.join(', ')}`);
    }

    const target = await this.repo.findById(id);
    if (!target) {
      throw new StaffNotFoundError(id);
    }

    if (actor) {
      if (!hasCapability(actor.role, 'staff.assignRole')) {
        throw new ValidationError("Forbidden: lacking 'staff.assignRole' capability");
      }
      // Cannot promote to SUPER_ADMIN unless actor is SUPER_ADMIN
      if (newRole === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
        throw new SelfEscalationError('Only Super Administrators can assign the SUPER_ADMIN role');
      }
      // Self demotion/promotion safety
      if (actor.id === target.id && newRole !== target.role) {
        if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
          const activeCount = await this.repo.countActiveSuperAdmins();
          if (activeCount <= 1) {
            throw new LastSuperAdminError();
          }
        }
      }
    }

    // If demoting a SUPER_ADMIN, ensure at least one other active SUPER_ADMIN remains
    if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN' && target.enabled) {
      const activeCount = await this.repo.countActiveSuperAdmins();
      if (activeCount <= 1) {
        throw new LastSuperAdminError();
      }
    }

    const updated = await this.repo.update(id, { role: newRole, sessionVersion: (target.sessionVersion ?? 0) + 1 });
    return this.toPublicDto(updated);
  }

  async setStaffEnabled(id: string, enabled: boolean, actor?: StaffUserRecord): Promise<StaffPublicDto> {
    const target = await this.repo.findById(id);
    if (!target) {
      throw new StaffNotFoundError(id);
    }

    if (actor) {
      if (!hasCapability(actor.role, 'staff.disable')) {
        throw new ValidationError("Forbidden: lacking 'staff.disable' capability");
      }
      if (actor.id === target.id && !enabled) {
        throw new SelfDisableError();
      }
    }

    // If disabling an active SUPER_ADMIN, ensure at least one other active SUPER_ADMIN remains
    if (target.role === 'SUPER_ADMIN' && target.enabled && !enabled) {
      const activeCount = await this.repo.countActiveSuperAdmins();
      if (activeCount <= 1) {
        throw new LastSuperAdminError('Cannot disable the last active SUPER_ADMIN');
      }
    }

    const updated = await this.repo.update(id, { enabled, sessionVersion: (target.sessionVersion ?? 0) + 1 });
    return this.toPublicDto(updated);
  }

  async deleteStaff(id: string, actor?: StaffUserRecord): Promise<boolean> {
    const target = await this.repo.findById(id);
    if (!target) {
      throw new StaffNotFoundError(id);
    }

    if (actor) {
      if (actor.role !== 'SUPER_ADMIN') {
        throw new ValidationError('Only Super Administrators can delete staff accounts');
      }
      if (actor.id === target.id) {
        throw new SelfDisableError('Cannot delete your own staff account');
      }
    }

    if (target.role === 'SUPER_ADMIN' && target.enabled) {
      const activeCount = await this.repo.countActiveSuperAdmins();
      if (activeCount <= 1) {
        throw new LastSuperAdminError('Cannot delete the last active SUPER_ADMIN');
      }
    }

    return this.repo.delete(id);
  }

  async countActiveSuperAdmins(): Promise<number> {
    return this.repo.countActiveSuperAdmins();
  }

  private toPublicDto(entity: StaffUserEntity): StaffPublicDto {
    return {
      id: entity.id,
      email: entity.email,
      name: entity.name,
      role: entity.role,
      enabled: entity.enabled,
      avatarUrl: entity.avatarUrl,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      capabilities: getRoleCapabilities(entity.role),
    };
  }
}

export const staffService = new StaffService();
