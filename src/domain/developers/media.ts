export type DeveloperMediaCategory = 'LOGO' | 'BRAND' | 'OFFICE' | 'EDITORIAL';
export type DeveloperMediaType = 'IMAGE';

export interface DeveloperMedia {
  id: string;
  developerId: string;
  mediaType: DeveloperMediaType;
  category: DeveloperMediaCategory;
  url: string;
  sortOrder: number;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}
