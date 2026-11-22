import { isPublicCanonicalLocation } from './locationRegionMapper';

export interface PostPropertyLocationOption {
  id: string;
  name: string;
  label: string;
  slug: string;
  type: string;
}

const EXCLUDED_HIERARCHY_TYPES = new Set(['STATE', 'CITY', 'DISTRICT']);

export function buildSelectableKolkataLocations(rawLocations: any[]): PostPropertyLocationOption[] {
  if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
    return [];
  }

  const canonical = rawLocations.filter((loc) => isPublicCanonicalLocation(loc));
  const byId = new Map<string, any>(canonical.map((l) => [String(l.id), l]));

  const residential = canonical.filter(
    (loc) => !EXCLUDED_HIERARCHY_TYPES.has(String(loc.type || '').toUpperCase())
  );

  const nameCounts = new Map<string, number>();
  for (const loc of residential) {
    const key = String(loc.name || '').trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const typeRank = (type: string) => {
    const upper = type.toUpperCase();
    if (upper === 'AREA') return 0;
    if (upper === 'NEIGHBOURHOOD') return 1;
    if (upper === 'DISCOVERY_REGION') return 2;
    return 3;
  };

  return residential
    .map((loc) => {
      const baseName = String(loc.name || '').trim();
      const parent = loc.parentId ? byId.get(String(loc.parentId)) : null;
      const parentType = String(parent?.type || '').toUpperCase();
      const isAmbiguous = (nameCounts.get(baseName.toLowerCase()) || 0) > 1;
      const parentUseful =
        Boolean(parent?.name) &&
        !EXCLUDED_HIERARCHY_TYPES.has(parentType) &&
        !baseName.toLowerCase().includes(String(parent.name).toLowerCase());

      const label =
        (String(loc.type || '').toUpperCase() === 'NEIGHBOURHOOD' || isAmbiguous) && parentUseful
          ? `${baseName} (${String(parent.name).trim()})`
          : baseName;

      return {
        id: String(loc.id),
        name: baseName,
        label,
        slug: String(loc.slug || ''),
        type: String(loc.type || 'AREA'),
        featured: Boolean(loc.featured),
      };
    })
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const rankDiff = typeRank(a.type) - typeRank(b.type);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    })
    .map(({ id, name, label, slug, type }) => ({ id, name, label, slug, type }));
}
