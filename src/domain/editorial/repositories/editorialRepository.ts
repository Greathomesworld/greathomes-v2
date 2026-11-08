import { EditorialArticle, EditorialContentType, EditorialStatus } from '../entities';

export interface EditorialFilterOptions {
  type?: EditorialContentType;
  status?: EditorialStatus;
  projectId?: string;
  developerId?: string;
  locationId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EditorialRepository {
  findAll(filter?: EditorialFilterOptions): Promise<{ items: EditorialArticle[]; total: number }>;
  findBySlug(slug: string): Promise<EditorialArticle | null>;
  findById(id: string): Promise<EditorialArticle | null>;
  create(data: Omit<EditorialArticle, 'id' | 'createdAt' | 'updatedAt'>): Promise<EditorialArticle>;
  update(id: string, data: Partial<EditorialArticle>): Promise<EditorialArticle | null>;
  delete(id: string): Promise<boolean>;
  findRelated(article: EditorialArticle, limit?: number): Promise<EditorialArticle[]>;
}
