export type DeveloperStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Developer {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  websiteUrl: string | null;
  status: DeveloperStatus;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}
