export type EditorialContentType =
  | 'PROJECT_REVIEW'
  | 'BUYING_GUIDE'
  | 'LOCATION_GUIDE'
  | 'DEVELOPER_STORY'
  | 'MARKET_GUIDE';

export type EditorialStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type FactCheckStatus =
  | 'NOT_REVIEWED'
  | 'REVIEWED'
  | 'NEEDS_UPDATE';

export interface StructuredSection {
  id: string;
  title: string;
  content: string;
}

export interface EditorialArticle {
  id: string;
  type: EditorialContentType;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: EditorialStatus;
  authorName: string;
  authorRole: string;
  publishedAt?: Date | null;
  featuredImage?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  projectId?: string | null;
  developerId?: string | null;
  locationId?: string | null;
  readingTimeMinutes: number;
  contentVersion: number;
  factCheckStatus: FactCheckStatus;
  structuredSections?: StructuredSection[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicEditorialArticleDTO {
  id: string;
  type: EditorialContentType;
  typeDisplay: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  authorName: string;
  authorRole: string;
  publishedAt: string | null;
  updatedAt: string;
  featuredImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string;
  readingTimeMinutes: number;
  structuredSections: StructuredSection[];
  project?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    startingPrice: string | number | null;
  } | null;
  developer?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  location?: {
    id: string;
    name: string;
    slug: string;
    type: string;
  } | null;
  relatedArticles?: Array<{
    id: string;
    type: EditorialContentType;
    typeDisplay: string;
    title: string;
    slug: string;
    excerpt: string;
    featuredImage: string | null;
    readingTimeMinutes: number;
  }>;
}

export function formatContentTypeDisplay(type: EditorialContentType): string {
  switch (type) {
    case 'PROJECT_REVIEW': return 'Project Review';
    case 'BUYING_GUIDE': return 'Buying Guide';
    case 'LOCATION_GUIDE': return 'Location Guide';
    case 'DEVELOPER_STORY': return 'Developer Story';
    case 'MARKET_GUIDE': return 'Market Guide';
    default: return type;
  }
}

export function calculateReadingTime(text: string): number {
  if (!text) return 3;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}
