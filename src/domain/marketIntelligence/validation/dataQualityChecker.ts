import { DataQualityIssue } from '../entities';

export interface DataQualityAuditTarget {
  projects?: any[];
  resaleListings?: any[];
  rentalListings?: any[];
  locations?: any[];
}

export function auditDataQuality(target: DataQualityAuditTarget): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const now = new Date();

  // Audit Projects
  if (target.projects) {
    for (const p of target.projects) {
      if (!p.locationId) {
        issues.push({
          id: `dq_proj_loc_${p.id}_${Date.now()}`,
          severity: 'CRITICAL',
          entityType: 'PROJECT',
          entityId: p.id,
          field: 'locationId',
          code: 'INVALID_LOCATION',
          message: `Project ${p.name || p.id} is missing a valid location reference.`,
          detectedAt: now,
        });
      }

      if (p.startingPrice && Number(p.startingPrice) < 0) {
        issues.push({
          id: `dq_proj_price_${p.id}_${Date.now()}`,
          severity: 'CRITICAL',
          entityType: 'PROJECT',
          entityId: p.id,
          field: 'startingPrice',
          code: 'INVALID_PRICE',
          message: `Project ${p.name || p.id} has negative starting price: ${p.startingPrice}`,
          detectedAt: now,
        });
      }

      if (p.reraRegistrationNumber && p.reraStatus !== 'VERIFIED') {
        issues.push({
          id: `dq_proj_rera_${p.id}_${Date.now()}`,
          severity: 'WARNING',
          entityType: 'PROJECT',
          entityId: p.id,
          field: 'reraStatus',
          code: 'RERA_NOT_VERIFIED',
          message: `Project ${p.name || p.id} has RERA registration number but status is ${p.reraStatus}`,
          detectedAt: now,
        });
      }
    }
  }

  // Audit Resale Listings
  if (target.resaleListings) {
    for (const r of target.resaleListings) {
      if (!r.askingPrice || Number(r.askingPrice) <= 0) {
        issues.push({
          id: `dq_resale_price_${r.id}_${Date.now()}`,
          severity: 'CRITICAL',
          entityType: 'RESALE_LISTING',
          entityId: r.id,
          field: 'askingPrice',
          code: 'INVALID_PRICE',
          message: `Resale listing ${r.id} has invalid or zero asking price.`,
          detectedAt: now,
        });
      }

      if (!r.carpetArea && !r.builtUpArea && !r.superBuiltUpArea) {
        issues.push({
          id: `dq_resale_area_${r.id}_${Date.now()}`,
          severity: 'WARNING',
          entityType: 'RESALE_LISTING',
          entityId: r.id,
          field: 'carpetArea',
          code: 'MISSING_AREA',
          message: `Resale listing ${r.id} is missing all area measurements.`,
          detectedAt: now,
        });
      }
    }
  }

  // Audit Rental Listings
  if (target.rentalListings) {
    for (const rent of target.rentalListings) {
      if (!rent.monthlyRent || Number(rent.monthlyRent) <= 0) {
        issues.push({
          id: `dq_rent_price_${rent.id}_${Date.now()}`,
          severity: 'CRITICAL',
          entityType: 'RENTAL_LISTING',
          entityId: rent.id,
          field: 'monthlyRent',
          code: 'INVALID_PRICE',
          message: `Rental listing ${rent.id} has invalid or zero monthly rent.`,
          detectedAt: now,
        });
      }
    }
  }

  return issues;
}
