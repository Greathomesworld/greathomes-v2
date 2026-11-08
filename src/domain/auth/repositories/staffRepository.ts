import { StaffUserEntity } from '../entities/staffUserEntity';
import { StaffFilterDto } from '../dto/staffDto';
import { StaffRole } from '../authorizationBoundary';

export interface StaffRepository {
  findById(id: string): Promise<StaffUserEntity | null>;
  findByEmail(email: string): Promise<StaffUserEntity | null>;
  list(filter?: StaffFilterDto): Promise<{ items: StaffUserEntity[]; total: number }>;
  create(data: Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<StaffUserEntity>;
  update(id: string, data: Partial<Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<StaffUserEntity>;
  delete(id: string): Promise<boolean>;
  countActiveSuperAdmins(): Promise<number>;
}

export class InMemoryStaffRepository implements StaffRepository {
  private staff: Map<string, StaffUserEntity> = new Map();

  constructor() {}

  async findById(id: string): Promise<StaffUserEntity | null> {
    return this.staff.get(id) || null;
  }

  async findByEmail(email: string): Promise<StaffUserEntity | null> {
    const normalized = email.toLowerCase().trim();
    for (const s of this.staff.values()) {
      if (s.email.toLowerCase().trim() === normalized) {
        return s;
      }
    }
    return null;
  }

  async list(filter?: StaffFilterDto): Promise<{ items: StaffUserEntity[]; total: number }> {
    let items = Array.from(this.staff.values());

    if (filter?.role && filter.role !== 'ALL') {
      items = items.filter((s) => s.role === filter.role);
    }

    if (filter?.enabled !== undefined && filter.enabled !== 'ALL') {
      items = items.filter((s) => s.enabled === filter.enabled);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q)
      );
    }

    const total = items.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const start = (page - 1) * limit;
    const paginated = items.slice(start, start + limit);

    return { items: paginated, total };
  }

  async create(
    data: Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<StaffUserEntity> {
    const id = data.id || `staff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const entity: StaffUserEntity = {
      id,
      email: data.email,
      name: data.name,
      role: data.role,
      passwordHash: data.passwordHash || null,
      sessionVersion: data.sessionVersion ?? 0,
      enabled: data.enabled !== undefined ? data.enabled : true,
      avatarUrl: data.avatarUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.staff.set(id, entity);
    return entity;
  }

  async update(
    id: string,
    data: Partial<Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<StaffUserEntity> {
    const existing = this.staff.get(id);
    if (!existing) {
      throw new Error(`Staff with id '${id}' not found`);
    }
    const updated: StaffUserEntity = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.staff.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.staff.delete(id);
  }

  async countActiveSuperAdmins(): Promise<number> {
    let count = 0;
    for (const s of this.staff.values()) {
      if (s.role === 'SUPER_ADMIN' && s.enabled) {
        count++;
      }
    }
    return count;
  }
}

import { StaffRepositoryPostgres } from '@/src/infrastructure/repositories/postgres/staffRepositoryPostgres';

export const staffRepository: StaffRepository =
  process.env.PERSISTENCE_PROVIDER === 'postgres' || !process.env.PERSISTENCE_PROVIDER
    ? new StaffRepositoryPostgres()
    : new InMemoryStaffRepository();
