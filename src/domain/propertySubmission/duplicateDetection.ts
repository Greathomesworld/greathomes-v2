import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/client.ts';
import {
  propertySubmissions,
  propertySubmissionDuplicateFlags,
  resaleListings,
  rentalListings,
} from '../../db/schema.ts';
import { ne, eq, and, or, notInArray, isNotNull } from 'drizzle-orm';

export type DuplicateMatchedEntityType = 'SUBMISSION' | 'RESALE_LISTING' | 'RENTAL_LISTING';
export type DuplicateResolutionStatus = 'OPEN' | 'CONFIRMED_DUPLICATE' | 'DISMISSED';

export interface DuplicateFlagRecord {
  id: string;
  submissionId: string;
  matchedEntityType: DuplicateMatchedEntityType;
  matchedEntityId: string;
  matchReason: string;
  confidenceScore: number;
  signals: Record<string, unknown> | null;
  resolutionStatus: DuplicateResolutionStatus;
  resolutionNote: string | null;
  resolvedByStaffId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim().length > 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function computeDistanceMeters(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null
): number | null {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function extractPrimaryArea(payload: Record<string, any>): number | null {
  const details = (payload?.details || {}) as Record<string, any>;
  if (payload?.propertyType === 'PLOT') {
    return toFiniteNumber(details.plotArea ?? details.carpetArea);
  }
  return toFiniteNumber(details.carpetArea ?? details.builtUpArea ?? details.superBuiltUpArea);
}

function extractPrimaryPrice(payload: Record<string, any>, listingType: string): number | null {
  const details = (payload?.details || {}) as Record<string, any>;
  return listingType === 'RENTAL'
    ? toFiniteNumber(details.monthlyRent)
    : toFiniteNumber(details.askingPrice ?? details.expectedPrice);
}

interface CandidateComparisonInput {
  candidateEntityType: DuplicateMatchedEntityType;
  candidateEntityId: string;
  candidateListingType: string;
  candidatePropertyType: string | null;
  candidateProjectId: string | null;
  candidateLocationId: string | null;
  candidateLocality: string | null;
  candidateLat: number | null;
  candidateLng: number | null;
  candidateBedrooms: number | null;
  candidateArea: number | null;
  candidatePrice: number | null;
  candidateStatus: string;
  sameSubmitter: boolean;
}

function evaluateDuplicateCandidate(
  target: {
    listingType: string;
    propertyType: string | null;
    projectId: string | null;
    locationId: string | null;
    locality: string | null;
    lat: number | null;
    lng: number | null;
    bedrooms: number | null;
    area: number | null;
    price: number | null;
  },
  candidate: CandidateComparisonInput
): {
  confidenceScore: number;
  matchReason: string;
  signals: Record<string, unknown>;
} | null {
  if (
    target.listingType &&
    candidate.candidateListingType &&
    target.listingType !== candidate.candidateListingType
  ) {
    return null;
  }

  if (
    target.propertyType &&
    candidate.candidatePropertyType &&
    target.propertyType !== candidate.candidatePropertyType
  ) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  const projectMatch =
    Boolean(target.projectId && candidate.candidateProjectId && target.projectId === candidate.candidateProjectId);
  if (projectMatch) {
    score += 35;
    reasons.push('Same project');
  }

  const locationMatch =
    Boolean(target.locationId && candidate.candidateLocationId && target.locationId === candidate.candidateLocationId);
  const localityMatch =
    Boolean(
      target.locality &&
        candidate.candidateLocality &&
        target.locality.trim().toLowerCase() === candidate.candidateLocality.trim().toLowerCase()
    );

  if (locationMatch) {
    score += 18;
    reasons.push('Same locality ID');
  } else if (localityMatch) {
    score += 12;
    reasons.push('Same locality name');
  }

  const distanceMeters = computeDistanceMeters(
    target.lat,
    target.lng,
    candidate.candidateLat,
    candidate.candidateLng
  );
  if (distanceMeters !== null && distanceMeters <= 150) {
    score += 35;
    reasons.push(`Proximity within ${distanceMeters}m`);
  }

  let bedroomMatch = false;
  if (target.propertyType !== 'PLOT' && target.bedrooms !== null && candidate.candidateBedrooms !== null) {
    if (target.bedrooms === candidate.candidateBedrooms) {
      bedroomMatch = true;
      score += 15;
      reasons.push(`Matching ${target.bedrooms} BHK`);
    } else {
      // Different BHK in same project shouldn't trigger false duplicate without very strong other signals
      return null;
    }
  } else if (target.propertyType === 'PLOT') {
    score += 10;
  }

  let areaDiffPct: number | null = null;
  if (target.area && candidate.candidateArea && target.area > 0 && candidate.candidateArea > 0) {
    areaDiffPct = Math.round(
      (Math.abs(target.area - candidate.candidateArea) / Math.max(target.area, candidate.candidateArea)) * 100
    );
    if (areaDiffPct <= 5) {
      score += 22;
      reasons.push('Area within 5%');
    } else if (areaDiffPct <= 10) {
      score += 15;
      reasons.push('Area within 10%');
    } else if (areaDiffPct > 25) {
      score -= 20;
    }
  }

  let priceDiffPct: number | null = null;
  if (target.price && candidate.candidatePrice && target.price > 0 && candidate.candidatePrice > 0) {
    priceDiffPct = Math.round(
      (Math.abs(target.price - candidate.candidatePrice) / Math.max(target.price, candidate.candidatePrice)) * 100
    );
    if (priceDiffPct <= 5) {
      score += 18;
      reasons.push('Price within 5%');
    } else if (priceDiffPct <= 15) {
      score += 10;
      reasons.push('Price within 15%');
    }
  }

  if (candidate.sameSubmitter) {
    score += 5;
  }

  if (score < 60) {
    return null;
  }

  const boundedScore = Math.max(60, Math.min(99, score));
  return {
    confidenceScore: boundedScore,
    matchReason: reasons.join(' · ') || 'High-similarity residential match',
    signals: {
      matchedStatus: candidate.candidateStatus,
      projectMatch,
      locationMatch,
      localityMatch,
      bedroomMatch,
      distanceMeters,
      areaDiffPct,
      priceDiffPct,
      sameSubmitter: candidate.sameSubmitter,
    },
  };
}

export async function detectAndRecordDuplicates(params: {
  db?: NonNullable<ReturnType<typeof getDb>>;
  memorySubmissions?: Map<string, any>;
  memoryDuplicateFlags?: Map<string, DuplicateFlagRecord[]>;
  submissionId: string;
  submitterCustomerId: string;
  listingType: string;
  payload: Record<string, any>;
}): Promise<DuplicateFlagRecord[]> {
  const location = (params.payload?.location || {}) as Record<string, any>;
  const details = (params.payload?.details || {}) as Record<string, any>;

  const target = {
    listingType: (params.listingType || 'RESALE').toUpperCase(),
    propertyType: typeof params.payload?.propertyType === 'string' ? params.payload.propertyType : null,
    projectId: typeof location.projectId === 'string' && location.projectId.trim() ? location.projectId.trim() : null,
    locationId: typeof location.locationId === 'string' && location.locationId.trim() ? location.locationId.trim() : null,
    locality: typeof location.locality === 'string' && location.locality.trim() ? location.locality.trim() : null,
    lat: toFiniteNumber(location.latitude),
    lng: toFiniteNumber(location.longitude),
    bedrooms: toFiniteNumber(details.bedroomCount ?? details.bedrooms),
    area: extractPrimaryArea(params.payload),
    price: extractPrimaryPrice(params.payload, (params.listingType || 'RESALE').toUpperCase()),
  };

  if (!target.projectId && !target.locationId && !target.locality && target.lat === null) {
    return [];
  }

  const flagged: DuplicateFlagRecord[] = [];
  const now = new Date();

  if (params.db) {
    const db = params.db;
    const isMissingOptionalCol = (err: unknown): boolean => {
      const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
      const code = e?.code || e?.cause?.code;
      const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
      return code === '42703' || /(plot_area|custom_locality_display)/i.test(msg);
    };

    const buildResaleConditions = (includeCustomLocality: boolean) => {
      const conds = [eq(resaleListings.lifecycleStatus, 'PUBLISHED')];
      if (target.propertyType) {
        conds.push(eq(resaleListings.propertyType, target.propertyType));
      }
      if (target.lat === null || target.lng === null) {
        const locClauses: any[] = [];
        if (target.projectId) locClauses.push(eq(resaleListings.projectId, target.projectId));
        if (target.locationId) locClauses.push(eq(resaleListings.locationId, target.locationId));
        if (includeCustomLocality && target.locality) {
          locClauses.push(isNotNull(resaleListings.customLocalityDisplay));
        }
        if (locClauses.length === 1) conds.push(locClauses[0]);
        else if (locClauses.length > 1) conds.push(or(...locClauses)!);
      }
      return conds;
    };

    const buildRentalConditions = (includeCustomLocality: boolean) => {
      const conds = [eq(rentalListings.lifecycleStatus, 'PUBLISHED')];
      if (target.propertyType) {
        conds.push(eq(rentalListings.propertyType, target.propertyType));
      }
      if (target.lat === null || target.lng === null) {
        const locClauses: any[] = [];
        if (target.projectId) locClauses.push(eq(rentalListings.projectId, target.projectId));
        if (target.locationId) locClauses.push(eq(rentalListings.locationId, target.locationId));
        if (includeCustomLocality && target.locality) {
          locClauses.push(isNotNull(rentalListings.customLocalityDisplay));
        }
        if (locClauses.length === 1) conds.push(locClauses[0]);
        else if (locClauses.length > 1) conds.push(or(...locClauses)!);
      }
      return conds;
    };

    const fetchResaleCandidates = async (): Promise<any[]> => {
      if (target.listingType !== 'RESALE') return [];
      try {
        return await db
          .select({
            id: resaleListings.id,
            propertyType: resaleListings.propertyType,
            projectId: resaleListings.projectId,
            locationId: resaleListings.locationId,
            customLocalityDisplay: resaleListings.customLocalityDisplay,
            latitude: resaleListings.latitude,
            longitude: resaleListings.longitude,
            bedroomCount: resaleListings.bedroomCount,
            carpetArea: resaleListings.carpetArea,
            builtUpArea: resaleListings.builtUpArea,
            superBuiltUpArea: resaleListings.superBuiltUpArea,
            plotArea: resaleListings.plotArea,
            askingPrice: resaleListings.askingPrice,
            lifecycleStatus: resaleListings.lifecycleStatus,
          })
          .from(resaleListings)
          .where(and(...buildResaleConditions(true)));
      } catch (err) {
        if (!isMissingOptionalCol(err)) throw err;
        return db
          .select({
            id: resaleListings.id,
            propertyType: resaleListings.propertyType,
            projectId: resaleListings.projectId,
            locationId: resaleListings.locationId,
            latitude: resaleListings.latitude,
            longitude: resaleListings.longitude,
            bedroomCount: resaleListings.bedroomCount,
            carpetArea: resaleListings.carpetArea,
            builtUpArea: resaleListings.builtUpArea,
            superBuiltUpArea: resaleListings.superBuiltUpArea,
            askingPrice: resaleListings.askingPrice,
            lifecycleStatus: resaleListings.lifecycleStatus,
          })
          .from(resaleListings)
          .where(and(...buildResaleConditions(false)));
      }
    };

    const fetchRentalCandidates = async (): Promise<any[]> => {
      if (target.listingType !== 'RENTAL') return [];
      try {
        return await db
          .select({
            id: rentalListings.id,
            propertyType: rentalListings.propertyType,
            projectId: rentalListings.projectId,
            locationId: rentalListings.locationId,
            customLocalityDisplay: rentalListings.customLocalityDisplay,
            latitude: rentalListings.latitude,
            longitude: rentalListings.longitude,
            bedroomCount: rentalListings.bedroomCount,
            carpetArea: rentalListings.carpetArea,
            builtUpArea: rentalListings.builtUpArea,
            superBuiltUpArea: rentalListings.superBuiltUpArea,
            plotArea: rentalListings.plotArea,
            monthlyRent: rentalListings.monthlyRent,
            lifecycleStatus: rentalListings.lifecycleStatus,
          })
          .from(rentalListings)
          .where(and(...buildRentalConditions(true)));
      } catch (err) {
        if (!isMissingOptionalCol(err)) throw err;
        return db
          .select({
            id: rentalListings.id,
            propertyType: rentalListings.propertyType,
            projectId: rentalListings.projectId,
            locationId: rentalListings.locationId,
            latitude: rentalListings.latitude,
            longitude: rentalListings.longitude,
            bedroomCount: rentalListings.bedroomCount,
            carpetArea: rentalListings.carpetArea,
            builtUpArea: rentalListings.builtUpArea,
            superBuiltUpArea: rentalListings.superBuiltUpArea,
            monthlyRent: rentalListings.monthlyRent,
            lifecycleStatus: rentalListings.lifecycleStatus,
          })
          .from(rentalListings)
          .where(and(...buildRentalConditions(false)));
      }
    };

    const [otherSubs, pubResales, pubRentals] = await Promise.all([
      db
        .select({
          id: propertySubmissions.id,
          submitterCustomerId: propertySubmissions.submitterCustomerId,
          listingType: propertySubmissions.listingType,
          submissionStatus: propertySubmissions.submissionStatus,
          payload: propertySubmissions.payload,
        })
        .from(propertySubmissions)
        .where(
          and(
            ne(propertySubmissions.id, params.submissionId),
            eq(propertySubmissions.listingType, target.listingType),
            notInArray(propertySubmissions.submissionStatus, ['DRAFT', 'WITHDRAWN', 'REJECTED'])
          )
        ),
      fetchResaleCandidates(),
      fetchRentalCandidates(),
    ]);

    const candidates: CandidateComparisonInput[] = [];

    for (const sub of otherSubs) {
      const rawP = ((sub.payload || {}) as Record<string, any>);
      const p = ((rawP.__ghSubMeta?.curatedPayload || rawP) as Record<string, any>);
      const loc = (p.location || {}) as Record<string, any>;
      const det = (p.details || {}) as Record<string, any>;
      candidates.push({
        candidateEntityType: 'SUBMISSION',
        candidateEntityId: sub.id,
        candidateListingType: (sub.listingType || 'RESALE').toUpperCase(),
        candidatePropertyType: typeof p.propertyType === 'string' ? p.propertyType : null,
        candidateProjectId: typeof loc.projectId === 'string' ? loc.projectId : null,
        candidateLocationId: typeof loc.locationId === 'string' ? loc.locationId : null,
        candidateLocality: typeof loc.locality === 'string' ? loc.locality : null,
        candidateLat: toFiniteNumber(loc.latitude),
        candidateLng: toFiniteNumber(loc.longitude),
        candidateBedrooms: toFiniteNumber(det.bedroomCount ?? det.bedrooms),
        candidateArea: extractPrimaryArea(p),
        candidatePrice: extractPrimaryPrice(p, (sub.listingType || 'RESALE').toUpperCase()),
        candidateStatus: sub.submissionStatus,
        sameSubmitter: sub.submitterCustomerId === params.submitterCustomerId,
      });
    }

    for (const r of pubResales as any[]) {
      candidates.push({
        candidateEntityType: 'RESALE_LISTING',
        candidateEntityId: r.id,
        candidateListingType: 'RESALE',
        candidatePropertyType: r.propertyType,
        candidateProjectId: r.projectId ?? null,
        candidateLocationId: r.locationId ?? null,
        candidateLocality: r.customLocalityDisplay ?? null,
        candidateLat: toFiniteNumber(r.latitude),
        candidateLng: toFiniteNumber(r.longitude),
        candidateBedrooms: r.bedroomCount ?? null,
        candidateArea:
          r.propertyType === 'PLOT'
            ? toFiniteNumber(r.plotArea)
            : toFiniteNumber(r.carpetArea ?? r.builtUpArea ?? r.superBuiltUpArea),
        candidatePrice: toFiniteNumber(r.askingPrice),
        candidateStatus: r.lifecycleStatus,
        sameSubmitter: false,
      });
    }

    for (const r of pubRentals as any[]) {
      candidates.push({
        candidateEntityType: 'RENTAL_LISTING',
        candidateEntityId: r.id,
        candidateListingType: 'RENTAL',
        candidatePropertyType: r.propertyType,
        candidateProjectId: r.projectId ?? null,
        candidateLocationId: r.locationId ?? null,
        candidateLocality: r.customLocalityDisplay ?? null,
        candidateLat: toFiniteNumber(r.latitude),
        candidateLng: toFiniteNumber(r.longitude),
        candidateBedrooms: r.bedroomCount ?? null,
        candidateArea:
          r.propertyType === 'PLOT'
            ? toFiniteNumber(r.plotArea)
            : toFiniteNumber(r.carpetArea ?? r.builtUpArea ?? r.superBuiltUpArea),
        candidatePrice: toFiniteNumber(r.monthlyRent),
        candidateStatus: r.lifecycleStatus,
        sameSubmitter: false,
      });
    }

    const insertRows: Array<
      typeof propertySubmissionDuplicateFlags.$inferInsert &
        Partial<typeof propertySubmissionDuplicateFlags.$inferSelect>
    > = [];

    for (const cand of candidates) {
      const match = evaluateDuplicateCandidate(target, cand);
      if (!match) continue;
      const flagId = `dupf_${uuidv4()}`;
      const record: DuplicateFlagRecord = {
        id: flagId,
        submissionId: params.submissionId,
        matchedEntityType: cand.candidateEntityType,
        matchedEntityId: cand.candidateEntityId,
        matchReason: match.matchReason,
        confidenceScore: match.confidenceScore,
        signals: match.signals,
        resolutionStatus: 'OPEN',
        resolutionNote: null,
        resolvedByStaffId: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      insertRows.push({
        id: record.id,
        submissionId: record.submissionId,
        matchedEntityType: record.matchedEntityType,
        matchedEntityId: record.matchedEntityId,
        matchReason: record.matchReason,
        confidenceScore: record.confidenceScore,
        signals: record.signals,
        resolutionStatus: record.resolutionStatus,
        createdAt: now,
        updatedAt: now,
      });
      flagged.push(record);
    }

    if (insertRows.length > 0) {
      try {
        await params.db
          .insert(propertySubmissionDuplicateFlags)
          .values(insertRows)
          .onConflictDoNothing();
      } catch {
        // Table may not exist on pre-0012 schema; caller stores fallback if needed
      }
    }

    return flagged;
  }

  if (params.memorySubmissions && params.memoryDuplicateFlags) {
    const existingList = params.memoryDuplicateFlags.get(params.submissionId) || [];
    const seenPairs = new Set(
      existingList.map((f) => `${f.matchedEntityType}:${f.matchedEntityId}`)
    );

    for (const sub of params.memorySubmissions.values()) {
      if (
        sub.id === params.submissionId ||
        ['DRAFT', 'WITHDRAWN', 'REJECTED'].includes(sub.submissionStatus)
      ) {
        continue;
      }
      const p = ((sub.curatedPayload || sub.payload || {}) as Record<string, any>);
      const loc = (p.location || {}) as Record<string, any>;
      const det = (p.details || {}) as Record<string, any>;
      const match = evaluateDuplicateCandidate(target, {
        candidateEntityType: 'SUBMISSION',
        candidateEntityId: sub.id,
        candidateListingType: (sub.listingType || 'RESALE').toUpperCase(),
        candidatePropertyType: typeof p.propertyType === 'string' ? p.propertyType : null,
        candidateProjectId: typeof loc.projectId === 'string' ? loc.projectId : null,
        candidateLocationId: typeof loc.locationId === 'string' ? loc.locationId : null,
        candidateLocality: typeof loc.locality === 'string' ? loc.locality : null,
        candidateLat: toFiniteNumber(loc.latitude),
        candidateLng: toFiniteNumber(loc.longitude),
        candidateBedrooms: toFiniteNumber(det.bedroomCount ?? det.bedrooms),
        candidateArea: extractPrimaryArea(p),
        candidatePrice: extractPrimaryPrice(p, (sub.listingType || 'RESALE').toUpperCase()),
        candidateStatus: sub.submissionStatus,
        sameSubmitter: sub.submitterCustomerId === params.submitterCustomerId,
      });
      if (!match) continue;
      const pairKey = `SUBMISSION:${sub.id}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const record: DuplicateFlagRecord = {
        id: `dupf_${uuidv4()}`,
        submissionId: params.submissionId,
        matchedEntityType: 'SUBMISSION',
        matchedEntityId: sub.id,
        matchReason: match.matchReason,
        confidenceScore: match.confidenceScore,
        signals: match.signals,
        resolutionStatus: 'OPEN',
        resolutionNote: null,
        resolvedByStaffId: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      existingList.push(record);
      flagged.push(record);
    }

    params.memoryDuplicateFlags.set(params.submissionId, existingList);
  }

  return flagged;
}
