/**
 * Discovery formatters for Great Homes V2
 * Pure formatting utilities for Indian real estate display
 */

export function formatIndianPrice(amount: number, isMonthly = false): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Price on Request';
  
  if (isMonthly) {
    return `₹${amount.toLocaleString('en-IN')} / month`;
  }

  if (amount >= 10000000) {
    const cr = (amount / 10000000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Cr`;
  }
  
  if (amount >= 100000) {
    const l = (amount / 100000).toFixed(2).replace(/\.00$/, '');
    return `₹${l} L`;
  }

  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatArea(sqft?: number | null): string | null {
  if (!sqft) return null;
  return `${sqft.toLocaleString('en-IN')} sq.ft.`;
}

export function formatFurnishing(furnishing?: string | null): string {
  if (!furnishing) return 'Unfurnished';
  switch (furnishing.toUpperCase()) {
    case 'FULLY_FURNISHED':
      return 'Fully Furnished';
    case 'SEMI_FURNISHED':
      return 'Semi Furnished';
    case 'UNFURNISHED':
      return 'Unfurnished';
    default:
      return furnishing.replace(/_/g, ' ');
  }
}

export function formatFloorCategory(floor?: string | null): string | null {
  if (!floor) return null;
  switch (floor.toUpperCase()) {
    case 'GROUND_FLOOR':
      return 'Ground Floor';
    case 'LOWER_FLOOR':
    case 'LOW_FLOOR':
      return 'Lower Floor';
    case 'MID_FLOOR':
      return 'Mid Floor';
    case 'HIGH_FLOOR':
    case 'HIGHER_FLOOR':
      return 'Higher Floor';
    case 'TOP_FLOOR':
      return 'Top Floor';
    default:
      return floor.replace(/_/g, ' ');
  }
}

export function formatPropertyType(type?: string | null): string {
  if (!type) return 'Residential';
  switch (type.toUpperCase()) {
    case 'APARTMENT':
      return 'Apartment';
    case 'VILLA':
      return 'Villa';
    case 'INDEPENDENT_HOUSE':
      return 'Independent House';
    case 'PLOT':
      return 'Plot';
    case 'DUPLEX':
      return 'Duplex';
    case 'PENTHOUSE':
      return 'Penthouse';
    default:
      return type.replace(/_/g, ' ');
  }
}

export function formatProjectStatus(status?: string | null): string {
  if (!status) return 'Project';
  switch (status.toUpperCase()) {
    case 'UPCOMING':
      return 'Upcoming';
    case 'NEW_LAUNCH':
      return 'New Launch';
    case 'UNDER_CONSTRUCTION':
      return 'Under Construction';
    case 'READY_TO_MOVE':
      return 'Ready to Move';
    case 'COMPLETED':
      return 'Completed';
    case 'SOLD_OUT':
      return 'Sold Out';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function formatPossession(possession?: string | null, dateStr?: string | null): string {
  if (!possession) return 'Ready to Move';
  switch (possession.toUpperCase()) {
    case 'READY':
    case 'READY_TO_MOVE':
      return 'Ready to Move';
    case 'UNDER_CONSTRUCTION':
      return 'Under Construction';
    case 'OCCUPIED':
      return 'Occupied';
    case 'AVAILABLE_FROM_DATE': {
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return `From ${parsed.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}`;
        }
      }
      return 'Available from Date';
    }
    default:
      return possession
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
  }
}

export interface FormattedAreaDetails {
  primaryLabel: string;
  primaryValue: string | null;
  secondaryText: string | null;
}

/**
 * Formats genuine area metrics from a listing without fabricating missing values.
 * Prioritizes Carpet Area, falling back to Built-up Area or Super Built-up Area when available.
 */
export function formatAreaDetails(
  carpetArea?: number | null,
  builtUpArea?: number | null,
  superBuiltUpArea?: number | null
): FormattedAreaDetails {
  const hasCarpet = typeof carpetArea === 'number' && Number.isFinite(carpetArea) && carpetArea > 0;
  const hasBuiltUp = typeof builtUpArea === 'number' && Number.isFinite(builtUpArea) && builtUpArea > 0;
  const hasSuperBuiltUp =
    typeof superBuiltUpArea === 'number' && Number.isFinite(superBuiltUpArea) && superBuiltUpArea > 0;

  if (hasCarpet) {
    const primaryValue = `${carpetArea!.toLocaleString('en-IN')} sq.ft.`;
    const secondaryText = hasBuiltUp
      ? `Built-up: ${builtUpArea!.toLocaleString('en-IN')} sq.ft.`
      : hasSuperBuiltUp
      ? `Super Built-up: ${superBuiltUpArea!.toLocaleString('en-IN')} sq.ft.`
      : null;
    return {
      primaryLabel: 'Carpet Area',
      primaryValue,
      secondaryText,
    };
  }

  if (hasBuiltUp) {
    const primaryValue = `${builtUpArea!.toLocaleString('en-IN')} sq.ft.`;
    const secondaryText = hasSuperBuiltUp
      ? `Super Built-up: ${superBuiltUpArea!.toLocaleString('en-IN')} sq.ft.`
      : null;
    return {
      primaryLabel: 'Built-up Area',
      primaryValue,
      secondaryText,
    };
  }

  if (hasSuperBuiltUp) {
    return {
      primaryLabel: 'Super Built-up',
      primaryValue: `${superBuiltUpArea!.toLocaleString('en-IN')} sq.ft.`,
      secondaryText: null,
    };
  }

  return {
    primaryLabel: 'Carpet Area',
    primaryValue: null,
    secondaryText: null,
  };
}

/**
 * Normalizes listing configuration and bedroom count into a clean, consistent card heading
 * while preserving genuine configuration subtypes (e.g., Study, Duplex, Penthouse, Luxury).
 */
export function formatListingDisplayTitle(params: {
  configuration?: string | null;
  bedroomCount?: number | null;
  propertyType?: string | null;
  furnishing?: string | null;
  mode: 'RESALE' | 'RENTAL';
  projectName?: string | null;
}): {
  title: string;
  subtitle: string;
  bhkBadge: string;
} {
  const { configuration, bedroomCount, propertyType, furnishing, mode, projectName } = params;
  const propTypeLabel = formatPropertyType(propertyType);
  const hasBeds = typeof bedroomCount === 'number' && Number.isFinite(bedroomCount) && bedroomCount > 0;
  const bhkBadge = hasBeds ? `${bedroomCount} BHK` : configuration?.trim() || propTypeLabel;

  let subtypeNote = '';
  if (configuration && configuration.trim().length > 0) {
    let cleaned = configuration.trim();
    if (projectName) {
      const escapedProj = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.replace(new RegExp(`\\b(in|at)\\s+${escapedProj}\\b`, 'gi'), '');
      cleaned = cleaned.replace(new RegExp(escapedProj, 'gi'), '');
    }
    cleaned = cleaned
      .replace(/\b\d+\s*bhk\b/gi, '')
      .replace(/\b(resale|rental|rent|for\s+sale|for\s+rent|flat|apartment|unit|in|at)\b/gi, '')
      .replace(/[-–—·,()/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length >= 3 && cleaned.length <= 28 && !/^\d+$/.test(cleaned)) {
      subtypeNote = cleaned.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  if (mode === 'RENTAL') {
    const furnishLabel = formatFurnishing(furnishing);
    const title = hasBeds
      ? `${bedroomCount} BHK ${ propTypeLabel }`
      : `${bhkBadge} ${propTypeLabel}`;
    const subtitleParts = [
      hasBeds ? `${bedroomCount} BHK` : null,
      subtypeNote || furnishLabel,
      projectName || null,
    ].filter(Boolean);
    return {
      title,
      subtitle: subtitleParts.join(' · '),
      bhkBadge,
    };
  }

  const title = hasBeds
    ? subtypeNote && !propTypeLabel.toLowerCase().includes(subtypeNote.toLowerCase())
      ? `${bedroomCount} BHK ${subtypeNote} ${propTypeLabel}`
      : `${bedroomCount} BHK ${propTypeLabel}`
    : configuration?.trim() || propTypeLabel;

  const subtitleParts = [
    hasBeds ? `${bedroomCount} BHK` : null,
    propTypeLabel,
    projectName || null,
  ].filter(Boolean);

  return {
    title,
    subtitle: subtitleParts.join(' · '),
    bhkBadge,
  };
}

