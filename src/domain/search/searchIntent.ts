export type SearchMode = 'ALL' | 'PROJECTS' | 'BUY' | 'RENT';

export type TransactionIntent = 'BUY' | 'RENT' | 'PROJECT_DISCOVERY' | 'UNKNOWN';

export type ProjectStageOrStatus =
  | 'UPCOMING'
  | 'NEW LAUNCH'
  | 'UNDER CONSTRUCTION'
  | 'READY TO MOVE'
  | 'COMPLETED'
  | 'SOLD OUT';

export type PropertyType =
  | 'APARTMENT'
  | 'FLAT'
  | 'VILLA'
  | 'INDEPENDENT_HOUSE'
  | 'PLOT'
  | 'DUPLEX'
  | 'PENTHOUSE';

export interface SearchIntent {
  rawQuery: string;
  normalizedQuery: string;
  mode: SearchMode;
  entityTypes: Array<'PROJECT' | 'DEVELOPER' | 'LOCATION' | 'RESALE' | 'RENTAL'>;
  transactionIntent: TransactionIntent;
  projectQuery?: string;
  developerQuery?: string;
  locationQuery?: string;
  locationIds: string[];
  bhk: number[];
  bhkMin?: number;
  bhkMax?: number;
  propertyTypes: PropertyType[];
  projectStages: ProjectStageOrStatus[];
  budgetMin?: number;
  budgetMax?: number;
  searchTokens: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  parsedTerms: Record<string, any>;
  unresolvedTerms: string[];
}
