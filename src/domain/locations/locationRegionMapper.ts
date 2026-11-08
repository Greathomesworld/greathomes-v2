import { Location } from './entities';
import { LOCATION_MASTER_RECORDS, LocationMasterRecord } from '@/src/infrastructure/data/locations';

/**
 * Canonical Kolkata Regional Corridors (7 Corridors)
 */
export type KolkataCorridorId =
  | 'ALL'
  | 'NEW_TOWN_RAJARHAT'
  | 'SALT_LAKE_VIP'
  | 'SOUTH_KOLKATA'
  | 'NORTH_KOLKATA'
  | 'CENTRAL_KOLKATA'
  | 'EAST_KOLKATA_BYPASS'
  | 'SOUTH_WEST_KOLKATA';

export interface KolkataCorridorDefinition {
  id: Exclude<KolkataCorridorId, 'ALL'>;
  label: string;
  shortLabel: string;
  description: string;
  center: { latitude: number; longitude: number; zoom: number };
  areaSlugs: string[];
}

export const KOLKATA_CORRIDORS: KolkataCorridorDefinition[] = [
  {
    id: 'NEW_TOWN_RAJARHAT',
    label: 'New Town & Rajarhat',
    shortLabel: 'New Town & Rajarhat',
    description:
      'Planned satellite township and eastern growth corridor featuring Action Areas I–III, IT business parks, and modern gated communities.',
    center: { latitude: 22.605, longitude: 88.475, zoom: 12 },
    areaSlugs: ['new-town', 'rajarhat'],
  },
  {
    id: 'SALT_LAKE_VIP',
    label: 'Salt Lake & VIP Belt',
    shortLabel: 'Salt Lake & VIP Belt',
    description:
      'Established Bidhannagar planned sectors, Sector V IT hub, Lake Town, Baguiati, Keshtopur, and the VIP Road airport corridor.',
    center: { latitude: 22.598, longitude: 88.418, zoom: 12 },
    areaSlugs: ['salt-lake', 'lake-town', 'baguiati', 'keshtopur'],
  },
  {
    id: 'SOUTH_KOLKATA',
    label: 'South Kolkata',
    shortLabel: 'South Kolkata',
    description:
      'Prestigious heritage residential neighbourhoods, cultural hubs, and metro-connected southern localities from Ballygunge and Alipore to Garia.',
    center: { latitude: 22.502, longitude: 88.355, zoom: 12 },
    areaSlugs: [
      'ballygunge',
      'alipore',
      'new-alipore',
      'tollygunge',
      'jadavpur',
      'dhakuria',
      'bhowanipore',
      'bhawanipore',
      'gariahat',
      'kalighat',
      'garia',
    ],
  },
  {
    id: 'NORTH_KOLKATA',
    label: 'North Kolkata',
    shortLabel: 'North Kolkata',
    description:
      'Well-connected northern transit and residential belt anchored by Dum Dum Metro, airport proximity, and North Kolkata heritage localities.',
    center: { latitude: 22.632, longitude: 88.388, zoom: 12 },
    areaSlugs: ['dum-dum', 'north-kolkata', 'bt-road'],
  },
  {
    id: 'CENTRAL_KOLKATA',
    label: 'Central Kolkata',
    shortLabel: 'Central Kolkata',
    description:
      'Prime commercial, heritage, and luxury lifestyle core around Park Street, Camac Street, Theatre Road, and Esplanade.',
    center: { latitude: 22.553, longitude: 88.352, zoom: 13 },
    areaSlugs: ['park-street', 'park-street-area', 'central-kolkata'],
  },
  {
    id: 'EAST_KOLKATA_BYPASS',
    label: 'East Kolkata & EM Bypass',
    shortLabel: 'East Kolkata',
    description:
      'High-rise luxury towers, major multispecialty hospital hubs, and rapid arterial connectivity along the Eastern Metropolitan Bypass.',
    center: { latitude: 22.525, longitude: 88.398, zoom: 12 },
    areaSlugs: [
      'em-bypass',
      'kasba',
      'anandapur',
      'mukundapur',
      'east-kolkata',
      'topsia',
      'tangra',
      'beliaghata',
    ],
  },
  {
    id: 'SOUTH_WEST_KOLKATA',
    label: 'South-West Kolkata',
    shortLabel: 'South-West Kolkata',
    description:
      'Fast-expanding residential corridors along the Purple Line Metro, Diamond Harbour Road, Behala, Joka institutional hub, and Kidderpore.',
    center: { latitude: 22.488, longitude: 88.318, zoom: 12 },
    areaSlugs: [
      'behala',
      'joka',
      'thakurpukur',
      'garden-reach',
      'kidderpore',
      'maheshtala',
      'southern-bypass',
    ],
  },
];

const AREA_SLUG_TO_CORRIDOR = new Map<string, KolkataCorridorDefinition>();
for (const corridor of KOLKATA_CORRIDORS) {
  for (const slug of corridor.areaSlugs) {
    AREA_SLUG_TO_CORRIDOR.set(slug, corridor);
  }
}

const MASTER_BY_SLUG = new Map<string, LocationMasterRecord>();
for (const record of LOCATION_MASTER_RECORDS) {
  MASTER_BY_SLUG.set(record.slug.toLowerCase(), record);
}

/**
 * Excludes test, fixture, and non-canonical records from public location discovery,
 * detail pages, autocomplete, and SEO sitemaps without mutating database records.
 */
const EXCLUDED_PUBLIC_SLUGS = new Set<string>([
  'discovery-location',
  'secret-sector-9',
  'old-industrial-zone',
]);

const EXCLUDED_PUBLIC_SLUG_PREFIXES = [
  'neon-loc-',
  'p151-loc-',
  'disposable-test-loc-',
  'test-loc-',
];

const EXCLUDED_PUBLIC_NAMES = new Set<string>([
  'neon test locality',
  'discovery location',
  'disposable test location',
  'secret sector 9',
  'old industrial zone',
]);

export function isPublicCanonicalLocation(
  loc: Pick<Location, 'slug' | 'name' | 'status'> | null | undefined
): boolean {
  if (!loc) return false;
  if (loc.status && loc.status !== 'PUBLISHED') return false;

  const slug = (loc.slug || '').toLowerCase().trim();
  const name = (loc.name || '').toLowerCase().trim();

  if (!slug || !name) return false;
  if (EXCLUDED_PUBLIC_SLUGS.has(slug)) return false;
  if (EXCLUDED_PUBLIC_NAMES.has(name)) return false;

  for (const prefix of EXCLUDED_PUBLIC_SLUG_PREFIXES) {
    if (slug.startsWith(prefix)) return false;
  }

  return true;
}

/**
 * Resolves the canonical Kolkata corridor for an Area or Neighbourhood.
 * Neighbourhood records resolve their corridor from their authoritative parent AREA first,
 * ensuring no neighbourhood slug override can supersede its parent AREA corridor.
 */
export function resolveLocationCorridor(
  slug: string,
  parentSlug?: string | null,
  locationType?: string | null
): KolkataCorridorDefinition | null {
  const cleanSlug = (slug || '').toLowerCase().trim();
  const cleanParent = parentSlug ? parentSlug.toLowerCase().trim() : '';

  // For NEIGHBOURHOOD records (or whenever a parent AREA maps to a corridor),
  // inherit the parent AREA's corridor first so parent-child aggregations always reconcile.
  if (locationType === 'NEIGHBOURHOOD' || (cleanParent && AREA_SLUG_TO_CORRIDOR.has(cleanParent))) {
    if (cleanParent) {
      const byParent = AREA_SLUG_TO_CORRIDOR.get(cleanParent);
      if (byParent) return byParent;
    }
    const master = MASTER_BY_SLUG.get(cleanSlug);
    if (master?.parentSlug) {
      const byMasterParent = AREA_SLUG_TO_CORRIDOR.get(master.parentSlug.toLowerCase());
      if (byMasterParent) return byMasterParent;
    }
  }

  const direct = AREA_SLUG_TO_CORRIDOR.get(cleanSlug);
  if (direct) return direct;

  if (cleanParent) {
    const byParent = AREA_SLUG_TO_CORRIDOR.get(cleanParent);
    if (byParent) return byParent;
  }

  const master = MASTER_BY_SLUG.get(cleanSlug);
  if (master?.parentSlug) {
    const byMasterParent = AREA_SLUG_TO_CORRIDOR.get(master.parentSlug.toLowerCase());
    if (byMasterParent) return byMasterParent;
  }

  return null;
}

/**
 * Returns the concise 1-sentence editorial tagline from LOCATION_MASTER_RECORDS,
 * or falls back to a clean first sentence of the location description.
 */
export function getLocationEditorialTagline(
  loc: Pick<Location, 'slug' | 'name' | 'shortDescription' | 'description' | 'type'>
): string {
  const cleanSlug = (loc.slug || '').toLowerCase().trim();

  if (loc.shortDescription && loc.shortDescription.trim().length > 10) {
    return loc.shortDescription.trim();
  }

  const master = MASTER_BY_SLUG.get(cleanSlug);
  if (master?.tagline && master.tagline.trim().length > 10) {
    return master.tagline.trim();
  }

  // Safe view-model fallbacks for Metropolitan Cities & Districts
  if (cleanSlug === 'howrah') {
    return 'Major twin metropolitan city across the Hooghly River with rail, industrial, and residential corridors connected to Kolkata.';
  }
  if (cleanSlug === 'hooghly') {
    return 'Historic metropolitan district along the western bank of the Hooghly River featuring suburban rail-connected residential towns including Konnagar.';
  }
  if (cleanSlug === 'kolkata') {
    return 'A mature metropolitan housing market spanning established neighbourhoods and fast-growing eastern corridors.';
  }

  if (loc.description && loc.description.trim().length > 0) {
    const firstSentence = loc.description.trim().split(/(?<=\.)\s+/)[0];
    return firstSentence || loc.description.trim();
  }

  return `Established residential ${loc.type === 'NEIGHBOURHOOD' ? 'neighbourhood' : 'locality'} in the Kolkata metropolitan region.`;
}

/**
 * Returns the full authoritative description for a location, including view-model fallbacks
 * for Howrah and Hooghly where DB description is null.
 */
export function getLocationFullDescription(
  loc: Pick<Location, 'slug' | 'name' | 'description' | 'shortDescription' | 'type'>
): string {
  const cleanSlug = (loc.slug || '').toLowerCase().trim();
  if (loc.description && loc.description.trim().length > 15) {
    return loc.description.trim();
  }

  const master = MASTER_BY_SLUG.get(cleanSlug);
  if (master?.description && master.description.trim().length > 15) {
    return master.description.trim();
  }

  if (cleanSlug === 'howrah') {
    return 'Howrah is Kolkata’s twin city on the western bank of the Hooghly River and a vital transportation, industrial, and residential hub within the Kolkata Metropolitan Area. Connected via Howrah Bridge, Vidyasagar Setu, and the East-West Metro corridor, it offers strong commuting links to Central Kolkata.';
  }
  if (cleanSlug === 'hooghly') {
    return 'Hooghly is a historic riverfront district in the northern Kolkata Metropolitan Area, encompassing well-connected suburban municipalities such as Konnagar, Uttarpara, Serampore, and Chandannagar along the Eastern Railway main line.';
  }

  return getLocationEditorialTagline(loc);
}

/**
 * Curated architectural photography and badge metadata for Popular & Key Residential Area cards,
 * matching the visual reference hierarchy while remaining 100% factual.
 */
export interface AreaVisualTheme {
  imageUrl: string;
  badgeText: string;
  badgeTone: 'coral' | 'amber' | 'green' | 'neutral';
}

const CURATED_AREA_VISUALS: Record<string, AreaVisualTheme> = {
  'new-town': {
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80',
    badgeText: 'TRENDING',
    badgeTone: 'coral',
  },
  'salt-lake': {
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80',
    badgeText: 'HIGH DEMAND',
    badgeTone: 'amber',
  },
  'ballygunge': {
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    badgeText: 'PRIME LOCATION',
    badgeTone: 'green',
  },
  'rajarhat': {
    imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80',
    badgeText: 'GROWTH CORRIDOR',
    badgeTone: 'coral',
  },
  'em-bypass': {
    imageUrl: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=900&q=80',
    badgeText: 'ARTERIAL CORRIDOR',
    badgeTone: 'amber',
  },
  'alipore': {
    imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80',
    badgeText: 'HERITAGE LUXURY',
    badgeTone: 'green',
  },
  'tollygunge': {
    imageUrl: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=900&q=80',
    badgeText: 'METRO CONNECTED',
    badgeTone: 'neutral',
  },
  'garia': {
    imageUrl: 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=900&q=80',
    badgeText: 'SOUTHERN HUB',
    badgeTone: 'neutral',
  },
  'joka': {
    imageUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80',
    badgeText: 'EMERGING BELT',
    badgeTone: 'coral',
  },
  'behala': {
    imageUrl: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&q=80',
    badgeText: 'ESTABLISHED AREA',
    badgeTone: 'neutral',
  },
  'dum-dum': {
    imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
    badgeText: 'TRANSIT HUB',
    badgeTone: 'amber',
  },
  'vip-road': {
    imageUrl: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80',
    badgeText: 'AIRPORT CORRIDOR',
    badgeTone: 'amber',
  },
};

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80',
];

export function getLocationVisualTheme(
  slug: string,
  featured: boolean,
  corridorLabel?: string
): AreaVisualTheme {
  const cleanSlug = (slug || '').toLowerCase().trim();
  if (CURATED_AREA_VISUALS[cleanSlug]) {
    return CURATED_AREA_VISUALS[cleanSlug];
  }

  let hash = 0;
  for (let i = 0; i < cleanSlug.length; i++) {
    hash = (hash * 31 + cleanSlug.charCodeAt(i)) % FALLBACK_IMAGES.length;
  }

  return {
    imageUrl: FALLBACK_IMAGES[Math.abs(hash) % FALLBACK_IMAGES.length],
    badgeText: featured ? 'FEATURED LOCALITY' : (corridorLabel || 'RESIDENTIAL AREA').toUpperCase(),
    badgeTone: featured ? 'coral' : 'neutral',
  };
}
