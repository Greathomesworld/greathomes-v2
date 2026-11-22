import crypto from 'node:crypto';
import { sql, eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  customers,
  customerPartnerProfiles,
  customerPartnerAuditHistory,
  propertySubmissions,
} from '../../db/schema';
import type {
  CustomerAccountType,
  CustomerDto,
  PartnerAuditHistoryEntry,
  PartnerProfile,
  PartnerProfileStatus,
} from './entities';
import { indianPhoneDigits, normalizeIndianPhone, PhoneValidationError } from './phoneNumber';
import { auditService } from '../audit/auditService';
import { notificationService } from './services/notificationService';
import { evaluatePartnerEligibility, type PartnerEligibilityStatus } from '../propertySubmission/repository';
import type { StaffUserRecord } from '../auth/authorizationBoundary';
import type { RequestLike } from '../audit/auditRequestContext';

export const CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT =
  'I confirm that this account is the sole Great Homes Listing Partner login for my agency, all agency details provided are genuine and verifiable, and I will obtain explicit owner consent before submitting any property.';

export class PartnerDomainError extends Error {
  statusCode: number;
  code?: string;
  fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    statusCode: number = 400,
    options?: { code?: string; fieldErrors?: Record<string, string> }
  ) {
    super(message);
    this.name = 'PartnerDomainError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.fieldErrors = options?.fieldErrors;
  }
}

export interface PartnerRegistrationInput {
  agencyName?: unknown;
  businessAddress?: unknown;
  locality?: unknown;
  city?: unknown;
  agencyContactPhone?: unknown;
  declarationAccepted?: unknown;
}

export interface ValidatedPartnerRegistration {
  agencyName: string;
  businessAddress: string;
  locality: string;
  city: string;
  agencyContactPhone: string;
  declarationText: string;
}

export interface AdminPartnerListItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerStatus: string;
  accountType: string | null;
  status: PartnerProfileStatus;
  agencyName: string | null;
  businessAddress: string | null;
  locality: string | null;
  city: string | null;
  agencyContactPhone: string | null;
  declarationAccepted: boolean;
  declarationAcceptedAt: string | null;
  approvedByStaffId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  revocationReason: string | null;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPartnerDetailDto {
  profile: AdminPartnerListItem & {
    declarationText: string | null;
  };
  auditHistory: Array<{
    id: string;
    customerId: string;
    previousStatus: string | null;
    newStatus: string;
    actingStaffUserId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

export type PartnerAdminAction = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REVOKE' | 'REACTIVATE';

function resultRows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function getReadyDb() {
  const db = getDb();
  if (!db) {
    throw new PartnerDomainError(
      'Database persistence is required for partner account operations.',
      503,
      { code: 'DATABASE_NOT_CONFIGURED' }
    );
  }
  return db;
}

export function validatePartnerRegistrationInput(
  input: PartnerRegistrationInput,
  fallbackPhone?: string | null
): ValidatedPartnerRegistration {
  const fieldErrors: Record<string, string> = {};

  const agencyName =
    typeof input.agencyName === 'string'
      ? input.agencyName.trim().replace(/\s+/g, ' ')
      : '';
  if (agencyName.length < 2 || agencyName.length > 160) {
    fieldErrors.agencyName = 'Enter a valid agency name (2–160 characters).';
  }

  const businessAddress =
    typeof input.businessAddress === 'string'
      ? input.businessAddress.trim().replace(/\s+/g, ' ')
      : '';
  if (businessAddress.length < 5 || businessAddress.length > 500) {
    fieldErrors.businessAddress = 'Enter your agency business address (5–500 characters).';
  }

  const locality =
    typeof input.locality === 'string'
      ? input.locality.trim().replace(/\s+/g, ' ')
      : '';
  if (locality.length < 2 || locality.length > 120) {
    fieldErrors.locality = 'Enter the agency locality (2–120 characters).';
  }

  const city =
    typeof input.city === 'string' && input.city.trim().length > 0
      ? input.city.trim().replace(/\s+/g, ' ')
      : 'Kolkata';
  if (city.length < 2 || city.length > 100) {
    fieldErrors.city = 'Enter a valid city (2–100 characters).';
  }

  let normalizedPhone = '';
  const phoneSource =
    typeof input.agencyContactPhone === 'string' && input.agencyContactPhone.trim().length > 0
      ? input.agencyContactPhone
      : fallbackPhone || '';
  try {
    normalizedPhone = normalizeIndianPhone(phoneSource);
  } catch (err) {
    fieldErrors.agencyContactPhone =
      err instanceof PhoneValidationError
        ? err.message
        : 'Enter a valid 10-digit Indian agency contact mobile number.';
  }

  if (input.declarationAccepted !== true) {
    fieldErrors.declarationAccepted =
      'You must accept the Great Homes Partner Agency Declaration to register as a Listing Partner.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    const firstMsg = Object.values(fieldErrors)[0];
    throw new PartnerDomainError(firstMsg, 400, {
      code: 'PARTNER_VALIDATION_ERROR',
      fieldErrors,
    });
  }

  return {
    agencyName,
    businessAddress,
    locality,
    city,
    agencyContactPhone: normalizedPhone,
    declarationText: CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT,
  };
}

export interface PartnerSchemaCapabilities {
  hasCustomerAccountType: boolean;
  hasExtendedPartnerProfileColumns: boolean;
}

let cachedPartnerSchemaCaps: { caps: PartnerSchemaCapabilities; expiresAt: number } | null = null;
const PARTNER_SCHEMA_CACHE_TTL_MS = 5_000;

export async function getPartnerSchemaCapabilities(
  dbOrTx: any
): Promise<PartnerSchemaCapabilities> {
  if (cachedPartnerSchemaCaps && cachedPartnerSchemaCaps.expiresAt > Date.now()) {
    return cachedPartnerSchemaCaps.caps;
  }
  try {
    const rows = resultRows(
      await dbOrTx.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'customers' AND column_name = 'account_type')
            OR (table_name = 'customer_partner_profiles' AND column_name = 'agency_name')
          )
      `)
    );
    const caps: PartnerSchemaCapabilities = {
      hasCustomerAccountType: rows.some(
        (r) => r.table_name === 'customers' && r.column_name === 'account_type'
      ),
      hasExtendedPartnerProfileColumns: rows.some(
        (r) => r.table_name === 'customer_partner_profiles' && r.column_name === 'agency_name'
      ),
    };
    cachedPartnerSchemaCaps = {
      caps,
      expiresAt: Date.now() + PARTNER_SCHEMA_CACHE_TTL_MS,
    };
    return caps;
  } catch {
    return {
      hasCustomerAccountType: true,
      hasExtendedPartnerProfileColumns: true,
    };
  }
}

export interface LegacyPartnerMeta {
  agencyName: string | null;
  businessAddress: string | null;
  locality: string | null;
  city: string | null;
  agencyContactPhone: string | null;
  declarationAccepted: boolean;
  declarationText: string | null;
  declarationAcceptedAt: string | null;
  rejectionReason: string | null;
}

export function encodeLegacyPartnerAuditReason(
  note: string | null,
  meta: LegacyPartnerMeta | null
): string | null {
  if (!meta) return note;
  return JSON.stringify({
    __ghPartnerMeta: meta,
    auditNote: note ?? null,
  });
}

export function decodeLegacyPartnerAuditReason(raw: string | null | undefined): {
  note: string | null;
  meta: LegacyPartnerMeta | null;
} {
  if (!raw || typeof raw !== 'string') {
    return { note: null, meta: null };
  }
  if (raw.startsWith('{') && raw.includes('"__ghPartnerMeta"')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.__ghPartnerMeta) {
        return {
          note: typeof parsed.auditNote === 'string' ? parsed.auditNote : null,
          meta: parsed.__ghPartnerMeta as LegacyPartnerMeta,
        };
      }
    } catch {
      // Fall through to plain reason string
    }
  }
  return { note: raw, meta: null };
}

async function loadLatestLegacyPartnerMetaMap(
  dbOrTx: any,
  customerIds: string[]
): Promise<Map<string, LegacyPartnerMeta>> {
  const map = new Map<string, LegacyPartnerMeta>();
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  const rows = resultRows(
    await dbOrTx.execute(sql`
      SELECT customer_id, reason, created_at
      FROM customer_partner_audit_history
      WHERE customer_id IN (${sql.join(
        uniqueIds.map((id) => sql`${id}`),
        sql`, `
      )})
      ORDER BY created_at DESC, id DESC
    `)
  );

  for (const r of rows) {
    const cid = String(r.customer_id);
    if (map.has(cid)) continue;
    const decoded = decodeLegacyPartnerAuditReason(r.reason);
    if (decoded.meta) {
      map.set(cid, decoded.meta);
    }
  }
  return map;
}

function hydratePartnerRowWithMeta(row: any, meta?: LegacyPartnerMeta | null): any {
  if (!row) return row;
  return {
    ...row,
    agency_name: row.agency_name ?? row.agencyName ?? meta?.agencyName ?? null,
    business_address: row.business_address ?? row.businessAddress ?? meta?.businessAddress ?? null,
    locality: row.locality ?? meta?.locality ?? null,
    city: row.city ?? meta?.city ?? null,
    agency_contact_phone:
      row.agency_contact_phone ?? row.agencyContactPhone ?? meta?.agencyContactPhone ?? null,
    declaration_accepted:
      row.declaration_accepted !== undefined || row.declarationAccepted !== undefined
        ? Boolean(row.declaration_accepted ?? row.declarationAccepted)
        : Boolean(meta?.declarationAccepted),
    declaration_text:
      row.declaration_text ?? row.declarationText ?? meta?.declarationText ?? null,
    declaration_accepted_at:
      row.declaration_accepted_at ??
      row.declarationAcceptedAt ??
      meta?.declarationAcceptedAt ??
      null,
    rejection_reason:
      row.rejection_reason ?? row.rejectionReason ?? meta?.rejectionReason ?? null,
  };
}

export async function resolveLegacyCustomerAccountType(
  dbOrTx: any,
  customerId: string
): Promise<CustomerAccountType | null> {
  if (!customerId) return null;
  try {
    const partnerRows = resultRows(
      await dbOrTx.execute(sql`
        SELECT id
        FROM customer_partner_profiles
        WHERE customer_id = ${customerId}
        LIMIT 1
      `)
    );
    if (partnerRows.length > 0) {
      return 'LISTING_PARTNER';
    }

    const auditRows = resultRows(
      await dbOrTx.execute(sql`
        SELECT new_status
        FROM customer_partner_audit_history
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
    );
    if (auditRows.length > 0) {
      const st = String(auditRows[0].new_status || '').toUpperCase();
      if (st === 'OWNER') return 'OWNER';
      if (
        st === 'PENDING' ||
        st === 'ACTIVE' ||
        st === 'REJECTED' ||
        st === 'SUSPENDED' ||
        st === 'REVOKED' ||
        st === 'LISTING_PARTNER'
      ) {
        return 'LISTING_PARTNER';
      }
    }

    const subRows = resultRows(
      await dbOrTx.execute(sql`
        SELECT listing_source
        FROM property_submissions
        WHERE submitter_customer_id = ${customerId}
        ORDER BY created_at DESC
        LIMIT 1
      `)
    );
    if (subRows.length > 0) {
      const src = String(subRows[0].listing_source || '').toUpperCase();
      if (src === 'PARTNER') return 'LISTING_PARTNER';
      if (src === 'OWNER') return 'OWNER';
    }
  } catch {
    // Ignore fallback lookup errors
  }
  return null;
}

export async function persistLegacyOwnerAccountType(
  dbOrTx: any,
  customerId: string,
  reason: string = 'Customer account type finalized as OWNER'
): Promise<void> {
  await dbOrTx.execute(sql`
    INSERT INTO customer_partner_audit_history
      (id, customer_id, previous_status, new_status, acting_staff_user_id, reason, created_at)
    VALUES
      (${`pah_${crypto.randomUUID()}`}, ${customerId}, NULL, 'OWNER', NULL, ${reason}, now())
  `);
}

export async function assertOneLoginPerAgency(
  tx: any,
  params: {
    customerId: string;
    agencyName: string;
    city: string;
    agencyContactPhone: string;
  }
): Promise<void> {
  const digits = indianPhoneDigits(params.agencyContactPhone);
  const normAgencyName = params.agencyName.trim().replace(/\s+/g, ' ').toLowerCase();
  const normCity = params.city.trim().toLowerCase();

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agency_phone:${digits}`}, 0))`);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agency_name:${normAgencyName}:${normCity}`}, 0))`
  );

  const schemaCaps = await getPartnerSchemaCapabilities(tx);

  if (schemaCaps.hasExtendedPartnerProfileColumns) {
    const phoneConflict = resultRows(
      await tx.execute(sql`
        SELECT id, customer_id, status
        FROM customer_partner_profiles
        WHERE customer_id <> ${params.customerId}
          AND status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')
          AND right(regexp_replace(coalesce(agency_contact_phone, ''), '[^0-9]', '', 'g'), 10) = ${digits}
        LIMIT 1
      `)
    );
    if (phoneConflict.length > 0) {
      throw new PartnerDomainError(
        'An agency partner account with this contact number already exists. Great Homes allows only one login per agency.',
        409,
        {
          code: 'AGENCY_ALREADY_REGISTERED',
          fieldErrors: {
            agencyContactPhone:
              'This agency contact number is already linked to another Listing Partner account.',
          },
        }
      );
    }

    const nameConflict = resultRows(
      await tx.execute(sql`
        SELECT id, customer_id, status
        FROM customer_partner_profiles
        WHERE customer_id <> ${params.customerId}
          AND status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')
          AND lower(regexp_replace(trim(coalesce(agency_name, '')), '\\s+', ' ', 'g')) = ${normAgencyName}
          AND lower(trim(coalesce(city, ''))) = ${normCity}
        LIMIT 1
      `)
    );
    if (nameConflict.length > 0) {
      throw new PartnerDomainError(
        'A partner account for this agency name already exists in this city. Great Homes allows only one login per agency.',
        409,
        {
          code: 'AGENCY_ALREADY_REGISTERED',
          fieldErrors: {
            agencyName:
              'This agency is already registered on Great Homes. Only one login per agency is permitted.',
          },
        }
      );
    }
    return;
  }

  const otherProfiles = resultRows(
    await tx.execute(sql`
      SELECT id, customer_id, status
      FROM customer_partner_profiles
      WHERE customer_id <> ${params.customerId}
        AND status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')
    `)
  );
  if (otherProfiles.length === 0) return;

  const metaMap = await loadLatestLegacyPartnerMetaMap(
    tx,
    otherProfiles.map((p) => String(p.customer_id))
  );

  for (const p of otherProfiles) {
    const meta = metaMap.get(String(p.customer_id));
    if (!meta) continue;
    const otherDigits = String(meta.agencyContactPhone || '')
      .replace(/[^0-9]/g, '')
      .slice(-10);
    if (otherDigits && otherDigits === digits) {
      throw new PartnerDomainError(
        'An agency partner account with this contact number already exists. Great Homes allows only one login per agency.',
        409,
        {
          code: 'AGENCY_ALREADY_REGISTERED',
          fieldErrors: {
            agencyContactPhone:
              'This agency contact number is already linked to another Listing Partner account.',
          },
        }
      );
    }

    const otherAgencyName = String(meta.agencyName || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const otherCity = String(meta.city || '')
      .trim()
      .toLowerCase();
    if (otherAgencyName && otherAgencyName === normAgencyName && otherCity === normCity) {
      throw new PartnerDomainError(
        'A partner account for this agency name already exists in this city. Great Homes allows only one login per agency.',
        409,
        {
          code: 'AGENCY_ALREADY_REGISTERED',
          fieldErrors: {
            agencyName:
              'This agency is already registered on Great Homes. Only one login per agency is permitted.',
          },
        }
      );
    }
  }
}

export async function createPartnerProfileInTx(
  tx: any,
  params: {
    customerId: string;
    registration: ValidatedPartnerRegistration;
    auditReason: string;
  }
): Promise<PartnerProfile> {
  await assertOneLoginPerAgency(tx, {
    customerId: params.customerId,
    agencyName: params.registration.agencyName,
    city: params.registration.city,
    agencyContactPhone: params.registration.agencyContactPhone,
  });

  const profileId = `prt_${crypto.randomUUID()}`;
  const now = new Date();
  const schemaCaps = await getPartnerSchemaCapabilities(tx);

  const meta: LegacyPartnerMeta = {
    agencyName: params.registration.agencyName,
    businessAddress: params.registration.businessAddress,
    locality: params.registration.locality,
    city: params.registration.city,
    agencyContactPhone: params.registration.agencyContactPhone,
    declarationAccepted: true,
    declarationText: params.registration.declarationText,
    declarationAcceptedAt: now.toISOString(),
    rejectionReason: null,
  };

  let insertedRow: any;
  if (schemaCaps.hasExtendedPartnerProfileColumns) {
    const [inserted] = await tx
      .insert(customerPartnerProfiles)
      .values({
        id: profileId,
        customerId: params.customerId,
        status: 'PENDING',
        agencyName: params.registration.agencyName,
        businessAddress: params.registration.businessAddress,
        locality: params.registration.locality,
        city: params.registration.city,
        agencyContactPhone: params.registration.agencyContactPhone,
        declarationAccepted: true,
        declarationText: params.registration.declarationText,
        declarationAcceptedAt: now,
        approvedByStaffId: null,
        approvedAt: null,
        rejectionReason: null,
        suspensionReason: null,
        revocationReason: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    insertedRow = inserted;
  } else {
    const rows = resultRows(
      await tx.execute(sql`
        INSERT INTO customer_partner_profiles
          (id, customer_id, status, approved_by_staff_id, approved_at, suspension_reason, revocation_reason, created_at, updated_at)
        VALUES
          (${profileId}, ${params.customerId}, 'PENDING', NULL, NULL, NULL, NULL, ${now.toISOString()}, ${now.toISOString()})
        RETURNING id, customer_id, status, approved_by_staff_id, approved_at, suspension_reason, revocation_reason, created_at, updated_at
      `)
    );
    insertedRow = hydratePartnerRowWithMeta(rows[0], meta);
  }

  await tx.insert(customerPartnerAuditHistory).values({
    id: `pah_${crypto.randomUUID()}`,
    customerId: params.customerId,
    previousStatus: null,
    newStatus: 'PENDING',
    actingStaffUserId: null,
    reason: schemaCaps.hasExtendedPartnerProfileColumns
      ? params.auditReason
      : encodeLegacyPartnerAuditReason(params.auditReason, meta),
    createdAt: now,
  });

  return mapPartnerProfileRow(insertedRow);
}

function mapPartnerProfileRow(row: any): PartnerProfile {
  return {
    id: row.id,
    customerId: row.customerId ?? row.customer_id,
    status: (row.status || 'PENDING') as PartnerProfileStatus,
    agencyName: row.agencyName ?? row.agency_name ?? null,
    businessAddress: row.businessAddress ?? row.business_address ?? null,
    locality: row.locality ?? null,
    city: row.city ?? null,
    agencyContactPhone: row.agencyContactPhone ?? row.agency_contact_phone ?? null,
    declarationAccepted: Boolean(row.declarationAccepted ?? row.declaration_accepted),
    declarationText: row.declarationText ?? row.declaration_text ?? null,
    declarationAcceptedAt: row.declarationAcceptedAt ?? row.declaration_accepted_at
      ? new Date(row.declarationAcceptedAt ?? row.declaration_accepted_at)
      : null,
    approvedByStaffId: row.approvedByStaffId ?? row.approved_by_staff_id ?? null,
    approvedAt: row.approvedAt ?? row.approved_at
      ? new Date(row.approvedAt ?? row.approved_at)
      : null,
    rejectionReason: row.rejectionReason ?? row.rejection_reason ?? null,
    suspensionReason: row.suspensionReason ?? row.suspension_reason ?? null,
    revocationReason: row.revocationReason ?? row.revocation_reason ?? null,
    createdAt: new Date(row.createdAt ?? row.created_at),
    updatedAt: new Date(row.updatedAt ?? row.updated_at),
  };
}

function mapPartnerCustomerDto(row: any, partnerStatus: PartnerProfileStatus | null): CustomerDto {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    name: String(row.name),
    accountType: (row.account_type ?? row.accountType ?? null) as CustomerAccountType | null,
    partnerStatus,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    status: row.status,
    createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
  };
}

export class PartnerService {
  async getCustomerPartnerStatusDetail(customerId: string): Promise<
    PartnerEligibilityStatus & {
      accountType: CustomerAccountType | null;
      profile: {
        id: string;
        status: PartnerProfileStatus;
        agencyName: string | null;
        businessAddress: string | null;
        locality: string | null;
        city: string | null;
        agencyContactPhone: string | null;
        declarationAccepted: boolean;
        declarationAcceptedAt: string | null;
        approvedAt: string | null;
        rejectionReason: string | null;
        suspensionReason: string | null;
        revocationReason: string | null;
        createdAt: string;
        updatedAt: string;
      } | null;
    }
  > {
    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);

    let custRow: { id: string; accountType: string | null; status: string } | undefined;
    if (schemaCaps.hasCustomerAccountType) {
      const [row] = await db
        .select({
          id: customers.id,
          accountType: customers.accountType,
          status: customers.status,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      custRow = row;
    } else {
      const [legacyRow] = await db
        .select({
          id: customers.id,
          status: customers.status,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      const resolvedAccountType = legacyRow
        ? await resolveLegacyCustomerAccountType(db, customerId)
        : null;
      custRow = legacyRow ? { ...legacyRow, accountType: resolvedAccountType } : undefined;
    }

    if (!custRow || custRow.status !== 'ACTIVE') {
      throw new PartnerDomainError('Customer account not found or inactive.', 404);
    }

    let profileRow: PartnerProfile | null = null;
    if (schemaCaps.hasExtendedPartnerProfileColumns) {
      const [rawRow] = await db
        .select()
        .from(customerPartnerProfiles)
        .where(eq(customerPartnerProfiles.customerId, customerId))
        .limit(1);
      if (rawRow) {
        profileRow = mapPartnerProfileRow(rawRow);
      }
    } else {
      const legacyRows = resultRows(
        await db.execute(sql`
          SELECT id, customer_id, status, approved_by_staff_id, approved_at, suspension_reason, revocation_reason, created_at, updated_at
          FROM customer_partner_profiles
          WHERE customer_id = ${customerId}
          LIMIT 1
        `)
      );
      if (legacyRows[0]) {
        const metaMap = await loadLatestLegacyPartnerMetaMap(db, [customerId]);
        profileRow = mapPartnerProfileRow(
          hydratePartnerRowWithMeta(legacyRows[0], metaMap.get(customerId) || null)
        );
      }
    }

    const effectiveAccountType: CustomerAccountType | null =
      (custRow.accountType as CustomerAccountType | null) ??
      (profileRow ? 'LISTING_PARTNER' : null);

    const eligibility = evaluatePartnerEligibility(customerId, profileRow || null);
    let message = eligibility.message;
    if (profileRow?.status === 'REJECTED') {
      message = profileRow.rejectionReason
        ? `Your partner application was declined: ${profileRow.rejectionReason}. You may update your agency details and resubmit.`
        : 'Your partner application was declined. You may update your agency details and resubmit.';
    }

    return {
      ...eligibility,
      status: (profileRow?.status || eligibility.status) as any,
      message,
      accountType: effectiveAccountType,
      profile: profileRow
        ? {
            id: profileRow.id,
            status: profileRow.status as PartnerProfileStatus,
            agencyName: profileRow.agencyName,
            businessAddress: profileRow.businessAddress,
            locality: profileRow.locality,
            city: profileRow.city,
            agencyContactPhone: profileRow.agencyContactPhone,
            declarationAccepted: profileRow.declarationAccepted,
            declarationAcceptedAt: profileRow.declarationAcceptedAt
              ? profileRow.declarationAcceptedAt.toISOString()
              : null,
            approvedAt: profileRow.approvedAt ? profileRow.approvedAt.toISOString() : null,
            rejectionReason: profileRow.rejectionReason,
            suspensionReason: profileRow.suspensionReason,
            revocationReason: profileRow.revocationReason,
            createdAt: profileRow.createdAt.toISOString(),
            updatedAt: profileRow.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async completeCustomerAccountType(
    customerId: string,
    input: { accountType?: unknown } & PartnerRegistrationInput,
    req?: RequestLike | null
  ): Promise<{ customer: CustomerDto; partnerStatus: PartnerProfileStatus | null }> {
    const requestedType =
      typeof input.accountType === 'string' ? input.accountType.trim().toUpperCase() : '';
    if (requestedType !== 'OWNER' && requestedType !== 'LISTING_PARTNER') {
      throw new PartnerDomainError(
        'Select a valid account type: Property Owner or Listing Partner.',
        400,
        {
          code: 'INVALID_ACCOUNT_TYPE',
          fieldErrors: { accountType: 'Account type must be OWNER or LISTING_PARTNER.' },
        }
      );
    }

    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);
    let createdProfile: PartnerProfile | null = null;

    const updatedCustomer = await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`);

      let cust: any;
      if (schemaCaps.hasCustomerAccountType) {
        const custRows = resultRows(
          await tx.execute(sql`
            SELECT id, email, phone, name, account_type, avatar_url, status, created_at
            FROM customers
            WHERE id = ${customerId}
            FOR UPDATE
          `)
        );
        cust = custRows[0];
      } else {
        const custRows = resultRows(
          await tx.execute(sql`
            SELECT id, email, phone, name, avatar_url, status, created_at
            FROM customers
            WHERE id = ${customerId}
            FOR UPDATE
          `)
        );
        if (custRows[0]) {
          const resolvedType = await resolveLegacyCustomerAccountType(tx, customerId);
          cust = { ...custRows[0], account_type: resolvedType };
        }
      }

      if (!cust || cust.status !== 'ACTIVE') {
        throw new PartnerDomainError('Customer account not found or inactive.', 404);
      }

      if (cust.account_type === 'OWNER' || cust.account_type === 'LISTING_PARTNER') {
        throw new PartnerDomainError(
          'Your account type is already finalized and cannot be switched.',
          409,
          { code: 'ACCOUNT_TYPE_LOCKED' }
        );
      }

      // Check existing property submissions if legacy customer has any
      const existingSubmissions = await tx
        .select({
          id: propertySubmissions.id,
          listingSource: propertySubmissions.listingSource,
        })
        .from(propertySubmissions)
        .where(eq(propertySubmissions.submitterCustomerId, customerId));

      if (existingSubmissions.length > 0) {
        const hasOwnerSub = existingSubmissions.some((s: any) => s.listingSource === 'OWNER');
        const hasPartnerSub = existingSubmissions.some((s: any) => s.listingSource === 'PARTNER');
        if (
          (requestedType === 'LISTING_PARTNER' && hasOwnerSub) ||
          (requestedType === 'OWNER' && hasPartnerSub)
        ) {
          throw new PartnerDomainError(
            'Account type cannot contradict existing property submissions on this account.',
            409,
            { code: 'ACCOUNT_TYPE_SUBMISSION_CONFLICT' }
          );
        }
      }

      if (requestedType === 'LISTING_PARTNER') {
        const registration = validatePartnerRegistrationInput(input, cust.phone);
        createdProfile = await createPartnerProfileInTx(tx, {
          customerId,
          registration,
          auditReason: 'Listing Partner agency profile submitted by existing customer',
        });
      }

      if (schemaCaps.hasCustomerAccountType) {
        const updatedRows = resultRows(
          await tx.execute(sql`
            UPDATE customers
            SET account_type = ${requestedType}, updated_at = now()
            WHERE id = ${customerId}
            RETURNING id, email, phone, name, account_type, avatar_url, status, created_at
          `)
        );
        return updatedRows[0];
      }

      if (requestedType === 'OWNER') {
        await persistLegacyOwnerAccountType(tx, customerId);
      }

      const updatedRows = resultRows(
        await tx.execute(sql`
          UPDATE customers
          SET updated_at = now()
          WHERE id = ${customerId}
          RETURNING id, email, phone, name, avatar_url, status, created_at
        `)
      );
      return { ...updatedRows[0], account_type: requestedType };
    });

    try {
      await auditService.record(req || null, { id: customerId, role: 'CUSTOMER' }, {
        action: 'UPDATE',
        resourceType: 'CUSTOMER',
        resourceId: customerId,
        resourceLabel: updatedCustomer.name,
        after: {
          accountType: requestedType,
          partnerProfileId: (createdProfile as PartnerProfile | null)?.id ?? null,
        },
        success: true,
      });
    } catch (err) {
      console.warn('Non-blocking audit log error during account type completion:', err);
    }

    const partnerStatus: PartnerProfileStatus | null = createdProfile
      ? (createdProfile as PartnerProfile).status
      : null;
    return {
      customer: mapPartnerCustomerDto(updatedCustomer, partnerStatus),
      partnerStatus,
    };
  }

  async resubmitPartnerApplication(
    customerId: string,
    input: PartnerRegistrationInput,
    req?: RequestLike | null
  ): Promise<{ status: PartnerProfileStatus; profileId: string }> {
    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);

    const result = await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`);

      let cust: { id: string; status: string; phone: string | null; accountType?: string | null } | undefined;
      if (schemaCaps.hasCustomerAccountType) {
        const [row] = await tx
          .select({
            id: customers.id,
            status: customers.status,
            phone: customers.phone,
            accountType: customers.accountType,
          })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        cust = row;
      } else {
        const [legacyRow] = await tx
          .select({
            id: customers.id,
            status: customers.status,
            phone: customers.phone,
          })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        const resolvedAccountType = legacyRow
          ? await resolveLegacyCustomerAccountType(tx, customerId)
          : null;
        cust = legacyRow
          ? { ...legacyRow, accountType: resolvedAccountType ?? 'LISTING_PARTNER' }
          : undefined;
      }

      if (!cust || cust.status !== 'ACTIVE') {
        throw new PartnerDomainError('Customer account not found or inactive.', 404);
      }
      if (cust.accountType !== 'LISTING_PARTNER') {
        throw new PartnerDomainError(
          'Only Listing Partner accounts can submit or update agency partner applications.',
          403,
          { code: 'NOT_LISTING_PARTNER' }
        );
      }

      let existingProfile: { id: string; status: string } | undefined;
      if (schemaCaps.hasExtendedPartnerProfileColumns) {
        const [row] = await tx
          .select()
          .from(customerPartnerProfiles)
          .where(eq(customerPartnerProfiles.customerId, customerId))
          .limit(1);
        existingProfile = row;
      } else {
        const rows = resultRows(
          await tx.execute(sql`
            SELECT id, customer_id, status
            FROM customer_partner_profiles
            WHERE customer_id = ${customerId}
            LIMIT 1
          `)
        );
        existingProfile = rows[0];
      }

      const registration = validatePartnerRegistrationInput(input, cust.phone);
      await assertOneLoginPerAgency(tx, {
        customerId,
        agencyName: registration.agencyName,
        city: registration.city,
        agencyContactPhone: registration.agencyContactPhone,
      });

      const now = new Date();
      if (!existingProfile) {
        const created = await createPartnerProfileInTx(tx, {
          customerId,
          registration,
          auditReason: 'Listing Partner application submitted',
        });
        return { profileId: created.id, status: created.status, agencyName: created.agencyName };
      }

      if (existingProfile.status !== 'REJECTED') {
        throw new PartnerDomainError(
          `Partner application cannot be resubmitted while in ${existingProfile.status} status.`,
          409,
          { code: 'INVALID_PARTNER_TRANSITION' }
        );
      }

      const meta: LegacyPartnerMeta = {
        agencyName: registration.agencyName,
        businessAddress: registration.businessAddress,
        locality: registration.locality,
        city: registration.city,
        agencyContactPhone: registration.agencyContactPhone,
        declarationAccepted: true,
        declarationText: registration.declarationText,
        declarationAcceptedAt: now.toISOString(),
        rejectionReason: null,
      };

      if (schemaCaps.hasExtendedPartnerProfileColumns) {
        await tx
          .update(customerPartnerProfiles)
          .set({
            status: 'PENDING',
            agencyName: registration.agencyName,
            businessAddress: registration.businessAddress,
            locality: registration.locality,
            city: registration.city,
            agencyContactPhone: registration.agencyContactPhone,
            declarationAccepted: true,
            declarationText: registration.declarationText,
            declarationAcceptedAt: now,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(eq(customerPartnerProfiles.id, existingProfile.id));
      } else {
        await tx.execute(sql`
          UPDATE customer_partner_profiles
          SET status = 'PENDING', updated_at = ${now.toISOString()}
          WHERE id = ${existingProfile.id}
        `);
      }

      const auditNote = 'Partner agency details updated and resubmitted for verification';
      await tx.insert(customerPartnerAuditHistory).values({
        id: `pah_${crypto.randomUUID()}`,
        customerId,
        previousStatus: existingProfile.status,
        newStatus: 'PENDING',
        actingStaffUserId: null,
        reason: schemaCaps.hasExtendedPartnerProfileColumns
          ? auditNote
          : encodeLegacyPartnerAuditReason(auditNote, meta),
        createdAt: now,
      });

      return {
        profileId: existingProfile.id,
        status: 'PENDING' as PartnerProfileStatus,
        agencyName: registration.agencyName,
      };
    });

    try {
      await auditService.record(req || null, { id: customerId, role: 'CUSTOMER' }, {
        action: 'SUBMIT',
        resourceType: 'CUSTOMER_PARTNER',
        resourceId: result.profileId,
        resourceLabel: result.agencyName || customerId,
        after: { status: result.status, agencyName: result.agencyName },
        success: true,
      });
    } catch (err) {
      console.warn('Non-blocking audit log error during partner resubmission:', err);
    }

    return { status: result.status, profileId: result.profileId };
  }

  async listPartnersForAdmin(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: AdminPartnerListItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
    countsByStatus: {
      ALL: number;
      PENDING: number;
      ACTIVE: number;
      REJECTED: number;
      SUSPENDED: number;
      REVOKED: number;
    };
  }> {
    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const statusFilter =
      options.status && options.status !== 'ALL'
        ? options.status.trim().toUpperCase()
        : null;
    const searchTerm = options.search?.trim() ? options.search.trim().toLowerCase() : null;

    const countsRows = resultRows(
      await db.execute(sql`
        SELECT status, count(*)::int AS cnt
        FROM customer_partner_profiles
        GROUP BY status
      `)
    );
    const countsByStatus = {
      ALL: 0,
      PENDING: 0,
      ACTIVE: 0,
      REJECTED: 0,
      SUSPENDED: 0,
      REVOKED: 0,
    };
    for (const r of countsRows) {
      const s = String(r.status || '').toUpperCase();
      const c = Number(r.cnt || 0);
      countsByStatus.ALL += c;
      if (s === 'PENDING') countsByStatus.PENDING = c;
      else if (s === 'ACTIVE') countsByStatus.ACTIVE = c;
      else if (s === 'REJECTED') countsByStatus.REJECTED = c;
      else if (s === 'SUSPENDED') countsByStatus.SUSPENDED = c;
      else if (s === 'REVOKED') countsByStatus.REVOKED = c;
    }

    if (schemaCaps.hasExtendedPartnerProfileColumns && schemaCaps.hasCustomerAccountType) {
      const sqlSearch = searchTerm ? `%${searchTerm}%` : null;
      const whereClauses: any[] = [];
      if (statusFilter) {
        whereClauses.push(sql`p.status = ${statusFilter}`);
      }
      if (sqlSearch) {
        whereClauses.push(sql`(
          lower(coalesce(p.agency_name, '')) LIKE ${sqlSearch}
          OR lower(coalesce(p.locality, '')) LIKE ${sqlSearch}
          OR lower(coalesce(p.city, '')) LIKE ${sqlSearch}
          OR lower(coalesce(p.agency_contact_phone, '')) LIKE ${sqlSearch}
          OR lower(coalesce(c.name, '')) LIKE ${sqlSearch}
          OR lower(coalesce(c.phone, '')) LIKE ${sqlSearch}
          OR lower(coalesce(c.email, '')) LIKE ${sqlSearch}
          OR lower(p.id) LIKE ${sqlSearch}
          OR lower(p.customer_id) LIKE ${sqlSearch}
        )`);
      }

      const whereSql =
        whereClauses.length > 0 ? sql`WHERE ${sql.join(whereClauses, sql` AND `)}` : sql``;

      const countResult = resultRows(
        await db.execute(sql`
          SELECT count(*)::int AS total
          FROM customer_partner_profiles p
          INNER JOIN customers c ON c.id = p.customer_id
          ${whereSql}
        `)
      );
      const total = Number(countResult[0]?.total || 0);

      const rows = resultRows(
        await db.execute(sql`
          SELECT
            p.*,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.email AS customer_email,
            c.status AS customer_status,
            c.account_type AS account_type,
            (
              SELECT count(*)::int
              FROM property_submissions s
              WHERE s.submitter_customer_id = p.customer_id
                AND s.listing_source = 'PARTNER'
            ) AS submission_count
          FROM customer_partner_profiles p
          INNER JOIN customers c ON c.id = p.customer_id
          ${whereSql}
          ORDER BY
            CASE WHEN p.status = 'PENDING' THEN 0 ELSE 1 END ASC,
            p.updated_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `)
      );

      const items: AdminPartnerListItem[] = rows.map((r) => ({
        id: String(r.id),
        customerId: String(r.customer_id),
        customerName: String(r.customer_name || ''),
        customerPhone: r.customer_phone ?? null,
        customerEmail: r.customer_email ?? null,
        customerStatus: String(r.customer_status || 'ACTIVE'),
        accountType: r.account_type ?? 'LISTING_PARTNER',
        status: String(r.status) as PartnerProfileStatus,
        agencyName: r.agency_name ?? null,
        businessAddress: r.business_address ?? null,
        locality: r.locality ?? null,
        city: r.city ?? null,
        agencyContactPhone: r.agency_contact_phone ?? null,
        declarationAccepted: Boolean(r.declaration_accepted),
        declarationAcceptedAt: r.declaration_accepted_at
          ? new Date(r.declaration_accepted_at).toISOString()
          : null,
        approvedByStaffId: r.approved_by_staff_id ?? null,
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
        rejectionReason: r.rejection_reason ?? null,
        suspensionReason: r.suspension_reason ?? null,
        revocationReason: r.revocation_reason ?? null,
        submissionCount: Number(r.submission_count || 0),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));

      return {
        items,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        countsByStatus,
      };
    }

    // Pre-0012 schema fallback path
    const rawRows = resultRows(
      await db.execute(sql`
        SELECT
          p.id,
          p.customer_id,
          p.status,
          p.approved_by_staff_id,
          p.approved_at,
          p.suspension_reason,
          p.revocation_reason,
          p.created_at,
          p.updated_at,
          c.name AS customer_name,
          c.phone AS customer_phone,
          c.email AS customer_email,
          c.status AS customer_status,
          (
            SELECT count(*)::int
            FROM property_submissions s
            WHERE s.submitter_customer_id = p.customer_id
              AND s.listing_source = 'PARTNER'
          ) AS submission_count
        FROM customer_partner_profiles p
        INNER JOIN customers c ON c.id = p.customer_id
        ORDER BY
          CASE WHEN p.status = 'PENDING' THEN 0 ELSE 1 END ASC,
          p.updated_at DESC
      `)
    );

    const metaMap = await loadLatestLegacyPartnerMetaMap(
      db,
      rawRows.map((r) => String(r.customer_id))
    );

    const allHydratedItems: AdminPartnerListItem[] = rawRows.map((raw) => {
      const r = hydratePartnerRowWithMeta(raw, metaMap.get(String(raw.customer_id)) || null);
      return {
        id: String(r.id),
        customerId: String(r.customer_id),
        customerName: String(r.customer_name || ''),
        customerPhone: r.customer_phone ?? null,
        customerEmail: r.customer_email ?? null,
        customerStatus: String(r.customer_status || 'ACTIVE'),
        accountType: 'LISTING_PARTNER',
        status: String(r.status) as PartnerProfileStatus,
        agencyName: r.agency_name ?? null,
        businessAddress: r.business_address ?? null,
        locality: r.locality ?? null,
        city: r.city ?? null,
        agencyContactPhone: r.agency_contact_phone ?? null,
        declarationAccepted: Boolean(r.declaration_accepted),
        declarationAcceptedAt: r.declaration_accepted_at
          ? new Date(r.declaration_accepted_at).toISOString()
          : null,
        approvedByStaffId: r.approved_by_staff_id ?? null,
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
        rejectionReason: r.rejection_reason ?? null,
        suspensionReason: r.suspension_reason ?? null,
        revocationReason: r.revocation_reason ?? null,
        submissionCount: Number(r.submission_count || 0),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    });

    const filteredItems = allHydratedItems.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (searchTerm) {
        const haystack = [
          item.agencyName,
          item.locality,
          item.city,
          item.agencyContactPhone,
          item.customerName,
          item.customerPhone,
          item.customerEmail,
          item.id,
          item.customerId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

    const total = filteredItems.length;
    const pagedItems = filteredItems.slice(offset, offset + limit);

    return {
      items: pagedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      countsByStatus,
    };
  }

  async getPartnerDetailForAdmin(partnerOrCustomerId: string): Promise<AdminPartnerDetailDto> {
    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);

    let r: any;
    if (schemaCaps.hasExtendedPartnerProfileColumns && schemaCaps.hasCustomerAccountType) {
      const rows = resultRows(
        await db.execute(sql`
          SELECT
            p.*,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.email AS customer_email,
            c.status AS customer_status,
            c.account_type AS account_type,
            (
              SELECT count(*)::int
              FROM property_submissions s
              WHERE s.submitter_customer_id = p.customer_id
                AND s.listing_source = 'PARTNER'
            ) AS submission_count
          FROM customer_partner_profiles p
          INNER JOIN customers c ON c.id = p.customer_id
          WHERE p.id = ${partnerOrCustomerId} OR p.customer_id = ${partnerOrCustomerId}
          LIMIT 1
        `)
      );
      r = rows[0];
    } else {
      const rows = resultRows(
        await db.execute(sql`
          SELECT
            p.id,
            p.customer_id,
            p.status,
            p.approved_by_staff_id,
            p.approved_at,
            p.suspension_reason,
            p.revocation_reason,
            p.created_at,
            p.updated_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.email AS customer_email,
            c.status AS customer_status,
            (
              SELECT count(*)::int
              FROM property_submissions s
              WHERE s.submitter_customer_id = p.customer_id
                AND s.listing_source = 'PARTNER'
            ) AS submission_count
          FROM customer_partner_profiles p
          INNER JOIN customers c ON c.id = p.customer_id
          WHERE p.id = ${partnerOrCustomerId} OR p.customer_id = ${partnerOrCustomerId}
          LIMIT 1
        `)
      );
      if (rows[0]) {
        const metaMap = await loadLatestLegacyPartnerMetaMap(db, [String(rows[0].customer_id)]);
        r = {
          ...hydratePartnerRowWithMeta(rows[0], metaMap.get(String(rows[0].customer_id)) || null),
          account_type: 'LISTING_PARTNER',
        };
      }
    }

    if (!r) {
      throw new PartnerDomainError('Partner application not found.', 404, {
        code: 'PARTNER_NOT_FOUND',
      });
    }

    const historyRows = await db
      .select()
      .from(customerPartnerAuditHistory)
      .where(eq(customerPartnerAuditHistory.customerId, String(r.customer_id)))
      .orderBy(desc(customerPartnerAuditHistory.createdAt));

    return {
      profile: {
        id: String(r.id),
        customerId: String(r.customer_id),
        customerName: String(r.customer_name || ''),
        customerPhone: r.customer_phone ?? null,
        customerEmail: r.customer_email ?? null,
        customerStatus: String(r.customer_status || 'ACTIVE'),
        accountType: r.account_type ?? 'LISTING_PARTNER',
        status: String(r.status) as PartnerProfileStatus,
        agencyName: r.agency_name ?? null,
        businessAddress: r.business_address ?? null,
        locality: r.locality ?? null,
        city: r.city ?? null,
        agencyContactPhone: r.agency_contact_phone ?? null,
        declarationAccepted: Boolean(r.declaration_accepted),
        declarationText: r.declaration_text ?? null,
        declarationAcceptedAt: r.declaration_accepted_at
          ? new Date(r.declaration_accepted_at).toISOString()
          : null,
        approvedByStaffId: r.approved_by_staff_id ?? null,
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
        rejectionReason: r.rejection_reason ?? null,
        suspensionReason: r.suspension_reason ?? null,
        revocationReason: r.revocation_reason ?? null,
        submissionCount: Number(r.submission_count || 0),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      },
      auditHistory: historyRows
        .filter((h) => h.newStatus !== 'OWNER')
        .map((h) => ({
          id: h.id,
          customerId: h.customerId,
          previousStatus: h.previousStatus ?? null,
          newStatus: h.newStatus,
          actingStaffUserId: h.actingStaffUserId ?? null,
          reason: decodeLegacyPartnerAuditReason(h.reason).note,
          createdAt: h.createdAt.toISOString(),
        })),
    };
  }

  async executeAdminPartnerAction(
    partnerOrCustomerId: string,
    staff: StaffUserRecord,
    req: RequestLike | null,
    input: { action: PartnerAdminAction; reason?: string }
  ): Promise<AdminPartnerDetailDto> {
    const db = getReadyDb();
    const schemaCaps = await getPartnerSchemaCapabilities(db);
    const action = input.action;
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';

    if (action === 'REJECT' || action === 'SUSPEND' || action === 'REVOKE') {
      if (reason.length < 5) {
        throw new PartnerDomainError(
          `A clear reason (at least 5 characters) is required when executing ${action}.`,
          400,
          { code: 'REASON_REQUIRED' }
        );
      }
    }

    const txResult = await db.transaction(async (tx: any) => {
      const existingRows = resultRows(
        await tx.execute(sql`
          SELECT *
          FROM customer_partner_profiles
          WHERE id = ${partnerOrCustomerId} OR customer_id = ${partnerOrCustomerId}
          FOR UPDATE
        `)
      );
      const profile = existingRows[0];
      if (!profile) {
        throw new PartnerDomainError('Partner profile not found.', 404, {
          code: 'PARTNER_NOT_FOUND',
        });
      }

      const previousStatus = String(profile.status) as PartnerProfileStatus;
      let nextStatus: PartnerProfileStatus;
      const now = new Date();
      const updatePatch: Record<string, any> = { updatedAt: now };

      switch (action) {
        case 'APPROVE':
          if (previousStatus !== 'PENDING' && previousStatus !== 'REJECTED') {
            throw new PartnerDomainError(
              `Cannot approve partner profile from status ${previousStatus}.`,
              409,
              { code: 'INVALID_PARTNER_TRANSITION' }
            );
          }
          nextStatus = 'ACTIVE';
          updatePatch.status = 'ACTIVE';
          updatePatch.approvedByStaffId = staff.id;
          updatePatch.approvedAt = now;
          updatePatch.rejectionReason = null;
          updatePatch.suspensionReason = null;
          break;

        case 'REJECT':
          if (previousStatus !== 'PENDING') {
            throw new PartnerDomainError(
              `Cannot reject partner profile from status ${previousStatus}.`,
              409,
              { code: 'INVALID_PARTNER_TRANSITION' }
            );
          }
          nextStatus = 'REJECTED';
          updatePatch.status = 'REJECTED';
          updatePatch.rejectionReason = reason;
          break;

        case 'SUSPEND':
          if (previousStatus !== 'ACTIVE') {
            throw new PartnerDomainError(
              `Only ACTIVE partner profiles can be suspended (current status: ${previousStatus}).`,
              409,
              { code: 'INVALID_PARTNER_TRANSITION' }
            );
          }
          nextStatus = 'SUSPENDED';
          updatePatch.status = 'SUSPENDED';
          updatePatch.suspensionReason = reason;
          break;

        case 'REVOKE':
          if (previousStatus === 'REVOKED') {
            throw new PartnerDomainError(
              'Partner profile authorization is already REVOKED.',
              409,
              { code: 'INVALID_PARTNER_TRANSITION' }
            );
          }
          nextStatus = 'REVOKED';
          updatePatch.status = 'REVOKED';
          updatePatch.revocationReason = reason;
          break;

        case 'REACTIVATE':
          if (previousStatus !== 'SUSPENDED') {
            throw new PartnerDomainError(
              previousStatus === 'REVOKED'
                ? 'Revoked partner authorizations cannot be reactivated.'
                : `Only SUSPENDED partner profiles can be reactivated (current status: ${previousStatus}).`,
              409,
              { code: 'INVALID_PARTNER_TRANSITION' }
            );
          }
          nextStatus = 'ACTIVE';
          updatePatch.status = 'ACTIVE';
          updatePatch.suspensionReason = null;
          updatePatch.approvedByStaffId = staff.id;
          updatePatch.approvedAt = now;
          break;

        default:
          throw new PartnerDomainError(`Unsupported partner action: ${String(action)}`, 400);
      }

      if (schemaCaps.hasExtendedPartnerProfileColumns) {
        await tx
          .update(customerPartnerProfiles)
          .set(updatePatch)
          .where(eq(customerPartnerProfiles.id, String(profile.id)));
      } else {
        const legacyPatch: Record<string, any> = {
          status: updatePatch.status,
          updatedAt: now,
        };
        if ('approvedByStaffId' in updatePatch) {
          legacyPatch.approvedByStaffId = updatePatch.approvedByStaffId;
        }
        if ('approvedAt' in updatePatch) {
          legacyPatch.approvedAt = updatePatch.approvedAt;
        }
        if ('suspensionReason' in updatePatch) {
          legacyPatch.suspensionReason = updatePatch.suspensionReason;
        }
        if ('revocationReason' in updatePatch) {
          legacyPatch.revocationReason = updatePatch.revocationReason;
        }
        await tx
          .update(customerPartnerProfiles)
          .set(legacyPatch)
          .where(eq(customerPartnerProfiles.id, String(profile.id)));
      }

      if (schemaCaps.hasCustomerAccountType) {
        await tx
          .update(customers)
          .set({ accountType: 'LISTING_PARTNER', updatedAt: now })
          .where(
            sql`${customers.id} = ${String(profile.customer_id)} AND ${customers.accountType} IS NULL`
          );
      }

      let existingMeta: LegacyPartnerMeta | null = null;
      if (!schemaCaps.hasExtendedPartnerProfileColumns) {
        const metaMap = await loadLatestLegacyPartnerMetaMap(tx, [String(profile.customer_id)]);
        existingMeta = metaMap.get(String(profile.customer_id)) || null;
        if (existingMeta) {
          existingMeta = {
            ...existingMeta,
            rejectionReason:
              action === 'REJECT'
                ? reason
                : action === 'APPROVE'
                  ? null
                  : existingMeta.rejectionReason ?? null,
          };
        } else if (action === 'REJECT') {
          existingMeta = {
            agencyName: null,
            businessAddress: null,
            locality: null,
            city: null,
            agencyContactPhone: null,
            declarationAccepted: false,
            declarationText: null,
            declarationAcceptedAt: null,
            rejectionReason: reason,
          };
        }
      }

      const historyId = `pah_${crypto.randomUUID()}`;
      const auditNote = reason || `Partner status updated via ${action}`;
      await tx.insert(customerPartnerAuditHistory).values({
        id: historyId,
        customerId: String(profile.customer_id),
        previousStatus,
        newStatus: nextStatus,
        actingStaffUserId: staff.id,
        reason: schemaCaps.hasExtendedPartnerProfileColumns
          ? auditNote
          : encodeLegacyPartnerAuditReason(auditNote, existingMeta),
        createdAt: now,
      });

      return {
        profileId: String(profile.id),
        customerId: String(profile.customer_id),
        agencyName: profile.agency_name
          ? String(profile.agency_name)
          : existingMeta?.agencyName ?? null,
        previousStatus,
        nextStatus,
        historyId,
      };
    });

    await auditService.record(req, staff, {
      action,
      resourceType: 'CUSTOMER_PARTNER',
      resourceId: txResult.profileId,
      resourceLabel: txResult.agencyName || txResult.customerId,
      before: { status: txResult.previousStatus },
      after: { status: txResult.nextStatus },
      metadata: {
        customerId: txResult.customerId,
        reason: reason || null,
        historyId: txResult.historyId,
      },
      success: true,
    });

    const notificationCopy = buildPartnerNotificationCopy(txResult.nextStatus, reason);
    try {
      await notificationService.createNotification({
        customerId: txResult.customerId,
        type: 'PARTNER_STATUS_CHANGED',
        title: notificationCopy.title,
        message: notificationCopy.message,
        resourceType: 'CUSTOMER_PARTNER',
        resourceId: txResult.profileId,
        dedupKey: `partner:${txResult.profileId}:${txResult.historyId}`,
        metadata: {
          previousStatus: txResult.previousStatus,
          newStatus: txResult.nextStatus,
          reason: reason || null,
        },
      });
    } catch (err) {
      console.warn('Non-blocking partner notification delivery failure:', err);
    }

    return await this.getPartnerDetailForAdmin(txResult.profileId);
  }
}

function buildPartnerNotificationCopy(
  status: PartnerProfileStatus,
  reason: string
): { title: string; message: string } {
  switch (status) {
    case 'ACTIVE':
      return {
        title: 'Listing Partner Account Approved',
        message:
          'Your Great Homes Listing Partner agency profile is now active. You can submit verified owner-consented properties from Post Property.',
      };
    case 'REJECTED':
      return {
        title: 'Partner Application Declined',
        message: reason
          ? `Your Listing Partner application was declined: ${reason}. Review and update your agency details to reapply.`
          : 'Your Listing Partner application was declined. Please review your agency details.',
      };
    case 'SUSPENDED':
      return {
        title: 'Partner Submission Privileges Suspended',
        message: reason
          ? `Your Listing Partner account has been suspended: ${reason}. Existing live listings remain unaffected unless deactivated separately.`
          : 'Your Listing Partner account has been suspended. Please contact Great Homes support.',
      };
    case 'REVOKED':
      return {
        title: 'Listing Partner Authorization Revoked',
        message: reason
          ? `Your Great Homes Listing Partner authorization has been permanently revoked: ${reason}.`
          : 'Your Great Homes Listing Partner authorization has been permanently revoked.',
      };
    default:
      return {
        title: 'Partner Account Status Updated',
        message: `Your Listing Partner account status is now ${status}.`,
      };
  }
}

export const partnerService = new PartnerService();
