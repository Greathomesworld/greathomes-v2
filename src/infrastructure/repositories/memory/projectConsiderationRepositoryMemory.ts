import {
  ProjectConsideration,
  ConsiderationSection,
  ConsiderationSourceType,
} from "../../../domain/projects/entities";
import { ProjectConsiderationRepository } from "../../../domain/repositories/projectRepository";
import { v4 as uuidv4 } from 'uuid';

export class ProjectConsiderationRepositoryMemory implements ProjectConsiderationRepository {
  private considerations: ProjectConsideration[] = [];

  async findByProjectId(projectId: string): Promise<ProjectConsideration[]> {
    return this.considerations
      .filter(c => c.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectConsideration[]> {
    if (projectIds.length === 0) return [];
    const set = new Set(projectIds);
    return this.considerations
      .filter(c => set.has(c.projectId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<ProjectConsideration | null> {
    return this.considerations.find(c => c.id === id) || null;
  }

  async create(data: Omit<ProjectConsideration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConsideration> {
    const item: ProjectConsideration = {
      ...data,
      id: uuidv4(),
      sourceType: data.sourceType || 'EDITORIAL',
      sortOrder: data.sortOrder ?? 0,
      isVisible: data.isVisible ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.considerations.push(item);
    return item;
  }

  async update(id: string, data: Partial<ProjectConsideration>): Promise<ProjectConsideration | null> {
    const index = this.considerations.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.considerations[index] = {
      ...this.considerations[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.considerations[index];
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.considerations.length;
    this.considerations = this.considerations.filter(c => c.id !== id);
    return this.considerations.length < initialLength;
  }

  async reorder(projectId: string, section: ConsiderationSection, orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const item = this.considerations.find(c => c.id === id && c.projectId === projectId && c.section === section);
      if (item) {
        item.sortOrder = index;
        item.updatedAt = new Date();
      }
    });
  }
}
