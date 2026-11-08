export type IllustrationFamily =
  | 'HOME'
  | 'PEOPLE_ASSISTANCE'
  | 'LOCATION_DISCOVERY'
  | 'PROPERTY_INTELLIGENCE'
  | 'LIFESTYLE'
  | 'EMPTY_UTILITY';

export type IllustrationId =
  // 15 Core Master Set
  | 'NEW_LAUNCH'
  | 'BUY_RESALE'
  | 'RENT'
  | 'PROJECT_DISCOVERY'
  | 'LOCATION_DISCOVERY'
  | 'RERA_VERIFIED'
  | 'PROPERTY_INTELLIGENCE'
  | 'SITE_VISIT'
  | 'DEVELOPER_ASSISTANCE'
  | 'SAVED_HOME'
  | 'RECENTLY_VIEWED'
  | 'EMPTY_SEARCH'
  | 'EMPTY_SAVED'
  | 'ACCOUNT'
  | 'GREAT_HOMES_ADVISOR'
  // Stage Extensions
  | 'UNDER_CONSTRUCTION'
  | 'READY_TO_MOVE'
  | 'UPCOMING'
  // Intelligence Guides
  | 'LOCATION_GUIDE'
  | 'PROJECT_REVIEW'
  | 'BUYING_GUIDE'
  | 'MARKET_INSIGHT'
  // Trust & Utility Extensions
  | 'NO_BROKERAGE'
  | 'EMPTY_RECENT'
  | 'EMPTY_UNAVAILABLE';

export type IllustrationSizeTier =
  | 'ICON' // 24-32px
  | 'SMALL' // 48-80px
  | 'CARD' // 96-160px
  | 'EMPTY' // 160-240px
  | 'FEATURE' // 240-360px
  | 'RESPONSIVE'; // 100% width container fluid

export interface IllustrationDefinition {
  id: IllustrationId;
  family: IllustrationFamily;
  name: string;
  description: string;
  svgPath: string;
  lottiePath?: string;
  defaultAlt: string;
  aspectRatio: string;
  tags: string[];
}

export interface GreatHomesIllustrationProps {
  id: IllustrationId;
  size?: IllustrationSizeTier | number;
  className?: string;
  alt?: string;
  decorative?: boolean;
  animated?: boolean;
  priority?: boolean;
  theme?: 'light' | 'dark' | 'auto';
  onClick?: () => void;
}
