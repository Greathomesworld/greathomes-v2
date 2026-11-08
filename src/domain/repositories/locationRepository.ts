import { Location } from "../locations/entities";

export interface LocationRepository {
  create(location: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location>;
  findById(id: string): Promise<Location | null>;
  findByIds(ids: string[]): Promise<Location[]>;
  findBySlug(slug: string): Promise<Location | null>;
  findAll(): Promise<Location[]>;
  findByParentId(parentId: string): Promise<Location[]>;
  update(id: string, location: Partial<Location>): Promise<Location | null>;
  delete(id: string): Promise<boolean>;
}
