export async function generateNewListingSlug(params: {
  projectName?: string | null;
  projectSlug?: string | null;
  locationName?: string | null;
  locationSlug?: string | null;
  bedroomCount: number;
  listingType: 'resale' | 'rental';
  checkExists: (slug: string) => Promise<boolean>;
}): Promise<string> {
  const baseSource =
    params.projectSlug ||
    (params.projectName ? params.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null) ||
    params.locationSlug ||
    (params.locationName ? params.locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null) ||
    'residence';

  const bhkPart = `${params.bedroomCount > 0 ? params.bedroomCount : 1}bhk`;
  const typePart = params.listingType === 'resale' ? 'resale' : 'rental';

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).substring(2, 7);
    const candidate = `${baseSource}-${bhkPart}-${typePart}-${suffix}`.toLowerCase();
    const exists = await params.checkExists(candidate);
    if (!exists) {
      return candidate;
    }
  }

  const fallbackSuffix = Date.now().toString(36).substring(4).toLowerCase();
  return `${baseSource}-${bhkPart}-${typePart}-${fallbackSuffix}`.toLowerCase();
}
