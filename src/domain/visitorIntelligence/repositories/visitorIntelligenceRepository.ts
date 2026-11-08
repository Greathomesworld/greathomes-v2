import crypto from 'crypto';
import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb, getDbReady } from '../../../db/client.ts';
import { enquiries, visitorEvents, visitors, visitorSessions } from '../../../db/schema.ts';
import { registerCustomerDeletionHook } from '../../customer/repositories/inMemoryCustomerRepository.ts';
import { unlinkEnquiryVisitorAttributionInMemory } from '../../enquiry/repositories/enquiryRepository.ts';
import {
  AreaBasisType,
  VisitorDeviceClass,
  VisitorEntity,
  VisitorEntityType,
  VisitorEventEntity,
  VisitorEventType,
  VisitorSessionEntity,
} from '../entities.ts';

export interface UpsertVisitorParams {
  id: string;
  customerId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  referrerUrl?: string | null;
  landingPath?: string | null;
  deviceClass?: VisitorDeviceClass;
  browserFamily?: string | null;
  ipHash?: string | null;
  incrementSessionCount?: boolean;
}

export interface UpsertSessionParams {
  id: string;
  visitorId: string;
  customerId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  referrerUrl?: string | null;
  entryPath?: string | null;
  exitPath?: string | null;
  deviceClass?: VisitorDeviceClass;
  browserFamily?: string | null;
  ipHash?: string | null;
  incrementPageViews?: boolean;
  incrementEvents?: boolean;
  durationSeconds?: number | null;
}

export interface RecordEventParams {
  id?: string;
  visitorId: string;
  sessionId: string;
  customerId?: string | null;
  eventType: VisitorEventType;
  pagePath?: string | null;
  pageTitle?: string | null;
  entityType?: VisitorEntityType | null;
  entityId?: string | null;
  entitySlug?: string | null;
  areaBasis?: AreaBasisType | null;
  durationSeconds?: number | null;
  clientEventId?: string | null;
  metadata?: Record<string, any> | null;
  occurredAt?: Date;
}

export interface BatchedCustomerIntelligenceData {
  visitorsByCustomer: Map<string, VisitorEntity[]>;
  eventsByCustomer: Map<string, VisitorEventEntity[]>;
}

export interface IVisitorIntelligenceRepository {
  upsertVisitor(params: UpsertVisitorParams): Promise<VisitorEntity>;
  linkVisitorToCustomer(
    visitorId: string,
    customerId: string
  ): Promise<{ linked: boolean; conflictDifferentCustomer: boolean; backfilledEvents: number }>;
  findVisitorById(id: string): Promise<VisitorEntity | null>;
  listVisitors(params?: {
    onlyAnonymous?: boolean;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: VisitorEntity[]; total: number }>;
  listVisitorsByCustomerId(customerId: string): Promise<VisitorEntity[]>;

  upsertSession(params: UpsertSessionParams): Promise<VisitorSessionEntity>;
  findSessionById(id: string): Promise<VisitorSessionEntity | null>;
  listSessionsByVisitorId(visitorId: string, limit?: number): Promise<VisitorSessionEntity[]>;
  listSessionsByCustomerId(customerId: string, limit?: number): Promise<VisitorSessionEntity[]>;

  recordEvent(params: RecordEventParams): Promise<{ event: VisitorEventEntity; deduplicated: boolean }>;
  listEvents(params?: {
    visitorId?: string;
    customerId?: string;
    sessionId?: string;
    eventTypes?: VisitorEventType[];
    limit?: number;
    offset?: number;
  }): Promise<VisitorEventEntity[]>;

  getBatchedCustomerIntelligence(customerIds: string[]): Promise<BatchedCustomerIntelligenceData>;
  anonymizeOrDeleteUnlinkedVisitor(visitorId: string): Promise<{ deleted: boolean }>;
  purgeExpiredAnonymousTelemetry(
    retentionDays?: number,
    batchSize?: number
  ): Promise<{
    deletedVisitors: number;
    deletedSessions: number;
    deletedEvents: number;
  }>;

  getOverviewStats(): Promise<{
    totalVisitors: number;
    anonymousVisitors: number;
    authenticatedVisitors: number;
    returningVisitors: number;
    totalSessions: number;
    totalPropertyViews: number;
    totalSearches: number;
    totalShortlists: number;
    totalComparisons: number;
    visitorsWithPropertyViews: number;
    visitorsWithSearchFilter: number;
    visitorsWithShortlist: number;
    topProjectsRaw: Array<{ entityId: string; entitySlug: string | null; views: number; uniqueVisitors: number }>;
    topListingsRaw: Array<{
      entityId: string;
      entityType: string;
      entitySlug: string | null;
      views: number;
      uniqueVisitors: number;
    }>;
    topLocationsRaw: Array<{ entityId: string; entitySlug: string | null; views: number; uniqueVisitors: number }>;
    topSearchFilters: Array<{ label: string; count: number }>;
    trafficSources: Array<{
      source: string;
      medium: string;
      visitors: number;
      authenticatedCustomers: number;
    }>;
    deviceBreakdown: Array<{ deviceClass: VisitorDeviceClass; count: number; percentage: number }>;
  }>;
}

interface GlobalVisitorMemoryStore {
  visitors: Map<string, VisitorEntity>;
  sessions: Map<string, VisitorSessionEntity>;
  events: VisitorEventEntity[];
}

const globalForVisitorIntel = globalThis as unknown as {
  __ghVisitorIntelStore?: GlobalVisitorMemoryStore;
};

function getMemoryStore(): GlobalVisitorMemoryStore {
  if (!globalForVisitorIntel.__ghVisitorIntelStore) {
    globalForVisitorIntel.__ghVisitorIntelStore = {
      visitors: new Map<string, VisitorEntity>(),
      sessions: new Map<string, VisitorSessionEntity>(),
      events: [],
    };
  }
  return globalForVisitorIntel.__ghVisitorIntelStore;
}

registerCustomerDeletionHook((customerId: string) => {
  const store = getMemoryStore();
  for (const [id, v] of store.visitors.entries()) {
    if (v.customerId === customerId) {
      store.visitors.set(id, { ...v, customerId: null });
    }
  }
  for (const [id, s] of store.sessions.entries()) {
    if (s.customerId === customerId) {
      store.sessions.set(id, { ...s, customerId: null });
    }
  }
  for (let i = 0; i < store.events.length; i++) {
    if (store.events[i].customerId === customerId) {
      store.events[i] = { ...store.events[i], customerId: null };
    }
  }
});

const DEDUPE_WINDOW_MS = 3000;

/**
 * Extracts a canonical, deterministic string representing non-sensitive action discriminators
 * (e.g. search query, filter keys/values, floor plan / layout, configuration) from event metadata.
 * Prohibits and strips any sensitive personal information (PII, tokens, passwords, OTP, secrets).
 */
export function extractCanonicalEventDiscriminator(metadata?: Record<string, any> | null): string {
  if (!metadata || typeof metadata !== 'object') return '';

  const SENSITIVE_KEY_REGEX = /^(email|phone|name|token|secret|password|otp|auth|bearer|cookie|jwt|session|credential)/i;
  const entries: string[] = [];

  // 1. Search Query Canonicalization
  const rawQuery =
    typeof metadata.query === 'string'
      ? metadata.query
      : typeof metadata.searchQuery === 'string'
      ? metadata.searchQuery
      : typeof metadata.searchTerm === 'string'
      ? metadata.searchTerm
      : null;
  if (rawQuery && rawQuery.trim()) {
    const normalizedQuery = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedQuery.includes('[redacted_')) {
      entries.push(`q=${normalizedQuery}`);
    }
  }

  // 2. Filter Key & Value Canonicalization
  if (typeof metadata.filterKey === 'string' && metadata.filterKey.trim()) {
    const val = metadata.filterValue !== undefined ? String(metadata.filterValue).trim().toLowerCase() : '';
    entries.push(`fk=${metadata.filterKey.trim().toLowerCase()}:${val}`);
  }

  // 3. Floor Plan / Configuration / BHK Layout Discriminators
  const plan =
    typeof metadata.planId === 'string'
      ? metadata.planId
      : typeof metadata.floorPlanId === 'string'
      ? metadata.floorPlanId
      : typeof metadata.configurationId === 'string'
      ? metadata.configurationId
      : null;
  if (plan && plan.trim()) {
    entries.push(`plan=${plan.trim().toLowerCase()}`);
  }

  if (typeof metadata.bhk === 'string' && metadata.bhk.trim()) {
    entries.push(`bhk=${metadata.bhk.trim().toLowerCase()}`);
  }

  // 4. Sort and extract other safe scalar interaction descriptors
  for (const [k, v] of Object.entries(metadata)) {
    if (
      k === 'query' ||
      k === 'searchQuery' ||
      k === 'searchTerm' ||
      k === 'filterKey' ||
      k === 'filterValue' ||
      k === 'planId' ||
      k === 'floorPlanId' ||
      k === 'configurationId' ||
      k === 'bhk'
    ) {
      continue;
    }
    if (SENSITIVE_KEY_REGEX.test(k)) continue;

    if (typeof v === 'string') {
      const trimmed = v.trim().toLowerCase();
      if (!trimmed || trimmed.includes('[redacted_') || trimmed.length > 80) continue;
      entries.push(`${k.toLowerCase()}=${trimmed}`);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      entries.push(`${k.toLowerCase()}=${v}`);
    }
  }

  entries.sort();
  return entries.slice(0, 10).join('&');
}

/**
 * Concurrency Strategy for Event Deduplication:
 * - If client-supplied `clientEventId` is provided, it is preserved directly for idempotent retries.
 * - If omitted, we derive a deterministic 3-second bucket fingerprint combining the session,
 *   event type, resource target (page, entity, area), canonical non-sensitive action metadata,
 *   and 3-second time bucket.
 * - This ensures distinct user actions (different queries or filters) produce distinct keys,
 *   while network retries of the exact same event produce identical keys and are deduplicated.
 */
export function computeEffectiveClientEventId(params: RecordEventParams, occurredAt: Date): string {
  if (params.clientEventId && params.clientEventId.trim()) {
    return params.clientEventId.trim();
  }
  const bucket = Math.floor(occurredAt.getTime() / DEDUPE_WINDOW_MS);
  const discriminator = extractCanonicalEventDiscriminator(params.metadata);
  const rawKey = [
    params.sessionId,
    params.eventType,
    params.pagePath || '',
    params.entityType || '',
    params.entityId || '',
    params.areaBasis || '',
    discriminator,
    bucket,
  ].join('|');
  const digest = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 24);
  return `auto_${digest}`;
}

export class VisitorIntelligenceRepositoryMemory implements IVisitorIntelligenceRepository {
  async upsertVisitor(params: UpsertVisitorParams): Promise<VisitorEntity> {
    const store = getMemoryStore();
    const now = new Date();
    const existing = store.visitors.get(params.id);

    if (existing) {
      const updated: VisitorEntity = {
        ...existing,
        customerId: existing.customerId || params.customerId || null,
        linkedAt:
          !existing.customerId && params.customerId
            ? now
            : existing.linkedAt,
        lastSeenAt: now,
        sessionCount: params.incrementSessionCount
          ? existing.sessionCount + 1
          : existing.sessionCount,
        firstUtmSource: existing.firstUtmSource || params.utmSource || null,
        firstUtmMedium: existing.firstUtmMedium || params.utmMedium || null,
        firstUtmCampaign: existing.firstUtmCampaign || params.utmCampaign || null,
        firstUtmTerm: existing.firstUtmTerm || params.utmTerm || null,
        firstUtmContent: existing.firstUtmContent || params.utmContent || null,
        firstReferrerUrl: existing.firstReferrerUrl || params.referrerUrl || null,
        firstLandingPath: existing.firstLandingPath || params.landingPath || null,
        lastLandingPath: params.landingPath || existing.lastLandingPath || null,
        deviceClass:
          params.deviceClass && params.deviceClass !== 'UNKNOWN'
            ? params.deviceClass
            : existing.deviceClass,
        browserFamily: params.browserFamily || existing.browserFamily || null,
        ipHash: params.ipHash || existing.ipHash || null,
        updatedAt: now,
      };
      store.visitors.set(params.id, updated);
      return updated;
    }

    const created: VisitorEntity = {
      id: params.id,
      customerId: params.customerId || null,
      firstSeenAt: now,
      lastSeenAt: now,
      linkedAt: params.customerId ? now : null,
      sessionCount: 1,
      firstUtmSource: params.utmSource || null,
      firstUtmMedium: params.utmMedium || null,
      firstUtmCampaign: params.utmCampaign || null,
      firstUtmTerm: params.utmTerm || null,
      firstUtmContent: params.utmContent || null,
      firstReferrerUrl: params.referrerUrl || null,
      firstLandingPath: params.landingPath || null,
      lastLandingPath: params.landingPath || null,
      deviceClass: params.deviceClass || 'UNKNOWN',
      browserFamily: params.browserFamily || null,
      ipHash: params.ipHash || null,
      createdAt: now,
      updatedAt: now,
    };
    store.visitors.set(params.id, created);
    return created;
  }

  async linkVisitorToCustomer(
    visitorId: string,
    customerId: string
  ): Promise<{ linked: boolean; conflictDifferentCustomer: boolean; backfilledEvents: number }> {
    const store = getMemoryStore();
    const existing = store.visitors.get(visitorId);
    if (!existing) {
      return { linked: false, conflictDifferentCustomer: false, backfilledEvents: 0 };
    }

    // Shared-device safety: if this visitor is already linked to a DIFFERENT customer, refuse to overwrite!
    if (existing.customerId && existing.customerId !== customerId) {
      return { linked: false, conflictDifferentCustomer: true, backfilledEvents: 0 };
    }

    const now = new Date();
    existing.customerId = customerId;
    existing.linkedAt = existing.linkedAt || now;
    existing.lastSeenAt = now;
    existing.updatedAt = now;
    store.visitors.set(visitorId, existing);

    // Backfill anonymous sessions for this visitor
    for (const [sid, sess] of store.sessions.entries()) {
      if (sess.visitorId === visitorId && !sess.customerId) {
        store.sessions.set(sid, {
          ...sess,
          customerId,
          updatedAt: now,
        });
      }
    }

    // Backfill anonymous events for this visitor and mark metadata.backfilledFromAnonymous = true
    let backfilledEvents = 0;
    for (let i = 0; i < store.events.length; i++) {
      const ev = store.events[i];
      if (ev.visitorId === visitorId && !ev.customerId) {
        store.events[i] = {
          ...ev,
          customerId,
          metadata: {
            ...(ev.metadata || {}),
            backfilledFromAnonymous: true,
          },
        };
        backfilledEvents++;
      }
    }

    return { linked: true, conflictDifferentCustomer: false, backfilledEvents };
  }

  async findVisitorById(id: string): Promise<VisitorEntity | null> {
    return getMemoryStore().visitors.get(id) || null;
  }

  async listVisitors(params?: {
    onlyAnonymous?: boolean;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: VisitorEntity[]; total: number }> {
    const store = getMemoryStore();
    let list = Array.from(store.visitors.values());
    if (params?.onlyAnonymous) {
      list = list.filter((v) => !v.customerId);
    }
    if (params?.customerId) {
      list = list.filter((v) => v.customerId === params.customerId);
    }
    list.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    const total = list.length;
    const offset = params?.offset || 0;
    const limit = params?.limit || 50;
    return {
      items: list.slice(offset, offset + limit),
      total,
    };
  }

  async listVisitorsByCustomerId(customerId: string): Promise<VisitorEntity[]> {
    const store = getMemoryStore();
    return Array.from(store.visitors.values())
      .filter((v) => v.customerId === customerId)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async upsertSession(params: UpsertSessionParams): Promise<VisitorSessionEntity> {
    const store = getMemoryStore();
    const now = new Date();
    const existing = store.sessions.get(params.id);

    if (existing) {
      const elapsedSeconds = Math.max(
        existing.durationSeconds,
        params.durationSeconds ??
          Math.round((now.getTime() - existing.startedAt.getTime()) / 1000)
      );
      const updated: VisitorSessionEntity = {
        ...existing,
        customerId: existing.customerId || params.customerId || null,
        lastActivityAt: now,
        utmSource: existing.utmSource || params.utmSource || null,
        utmMedium: existing.utmMedium || params.utmMedium || null,
        utmCampaign: existing.utmCampaign || params.utmCampaign || null,
        utmTerm: existing.utmTerm || params.utmTerm || null,
        utmContent: existing.utmContent || params.utmContent || null,
        referrerUrl: existing.referrerUrl || params.referrerUrl || null,
        entryPath: existing.entryPath || params.entryPath || null,
        exitPath: params.exitPath || existing.exitPath || null,
        deviceClass:
          params.deviceClass && params.deviceClass !== 'UNKNOWN'
            ? params.deviceClass
            : existing.deviceClass,
        browserFamily: params.browserFamily || existing.browserFamily || null,
        ipHash: params.ipHash || existing.ipHash || null,
        pageViewCount: params.incrementPageViews
          ? existing.pageViewCount + 1
          : existing.pageViewCount,
        eventCount: params.incrementEvents ? existing.eventCount + 1 : existing.eventCount,
        durationSeconds: Math.min(elapsedSeconds, 7200),
        updatedAt: now,
      };
      store.sessions.set(params.id, updated);
      return updated;
    }

    const created: VisitorSessionEntity = {
      id: params.id,
      visitorId: params.visitorId,
      customerId: params.customerId || null,
      startedAt: now,
      lastActivityAt: now,
      utmSource: params.utmSource || null,
      utmMedium: params.utmMedium || null,
      utmCampaign: params.utmCampaign || null,
      utmTerm: params.utmTerm || null,
      utmContent: params.utmContent || null,
      referrerUrl: params.referrerUrl || null,
      entryPath: params.entryPath || null,
      exitPath: params.exitPath || params.entryPath || null,
      deviceClass: params.deviceClass || 'UNKNOWN',
      browserFamily: params.browserFamily || null,
      ipHash: params.ipHash || null,
      pageViewCount: params.incrementPageViews ? 1 : 0,
      eventCount: params.incrementEvents ? 1 : 0,
      durationSeconds: params.durationSeconds || 0,
      createdAt: now,
      updatedAt: now,
    };
    store.sessions.set(params.id, created);
    return created;
  }

  async findSessionById(id: string): Promise<VisitorSessionEntity | null> {
    return getMemoryStore().sessions.get(id) || null;
  }

  async listSessionsByVisitorId(visitorId: string, limit = 25): Promise<VisitorSessionEntity[]> {
    const store = getMemoryStore();
    return Array.from(store.sessions.values())
      .filter((s) => s.visitorId === visitorId)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .slice(0, limit);
  }

  async listSessionsByCustomerId(customerId: string, limit = 50): Promise<VisitorSessionEntity[]> {
    const store = getMemoryStore();
    const linkedVisitorIds = new Set(
      Array.from(store.visitors.values())
        .filter((v) => v.customerId === customerId)
        .map((v) => v.id)
    );
    return Array.from(store.sessions.values())
      .filter((s) => s.customerId === customerId || linkedVisitorIds.has(s.visitorId))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .slice(0, limit);
  }

  async recordEvent(
    params: RecordEventParams
  ): Promise<{ event: VisitorEventEntity; deduplicated: boolean }> {
    const store = getMemoryStore();
    const now = params.occurredAt || new Date();
    const effectiveClientEventId = computeEffectiveClientEventId(params, now);

    // Idempotency / duplicate-burst protection across all events for this visitor
    for (let i = store.events.length - 1; i >= 0; i--) {
      const candidate = store.events[i];
      if (candidate.visitorId !== params.visitorId) continue;

      if (candidate.clientEventId === effectiveClientEventId) {
        return { event: candidate, deduplicated: true };
      }

      const ageMs = Math.abs(now.getTime() - candidate.occurredAt.getTime());
      if (
        ageMs <= DEDUPE_WINDOW_MS &&
        candidate.sessionId === params.sessionId &&
        candidate.eventType === params.eventType &&
        (candidate.pagePath || '') === (params.pagePath || '') &&
        (candidate.entityId || '') === (params.entityId || '') &&
        extractCanonicalEventDiscriminator(candidate.metadata) ===
          extractCanonicalEventDiscriminator(params.metadata)
      ) {
        return { event: candidate, deduplicated: true };
      }
    }

    const event: VisitorEventEntity = {
      id: params.id || `vev-${crypto.randomUUID()}`,
      visitorId: params.visitorId,
      sessionId: params.sessionId,
      customerId: params.customerId || null,
      eventType: params.eventType,
      pagePath: params.pagePath || null,
      pageTitle: params.pageTitle || null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      entitySlug: params.entitySlug || null,
      areaBasis: params.areaBasis || null,
      durationSeconds: params.durationSeconds ?? null,
      clientEventId: effectiveClientEventId,
      metadata: params.metadata || null,
      occurredAt: now,
    };

    store.events.push(event);
    return { event, deduplicated: false };
  }

  async listEvents(params?: {
    visitorId?: string;
    customerId?: string;
    sessionId?: string;
    eventTypes?: VisitorEventType[];
    limit?: number;
    offset?: number;
  }): Promise<VisitorEventEntity[]> {
    const store = getMemoryStore();
    let linkedVisitorIds: Set<string> | null = null;
    if (params?.customerId) {
      linkedVisitorIds = new Set(
        Array.from(store.visitors.values())
          .filter((v) => v.customerId === params.customerId)
          .map((v) => v.id)
      );
    }

    let filtered = store.events.filter((ev) => {
      if (params?.visitorId && ev.visitorId !== params.visitorId) return false;
      if (params?.sessionId && ev.sessionId !== params.sessionId) return false;
      if (params?.customerId) {
        const matchesCustomer =
          ev.customerId === params.customerId ||
          (linkedVisitorIds ? linkedVisitorIds.has(ev.visitorId) : false);
        if (!matchesCustomer) return false;
      }
      if (params?.eventTypes && params.eventTypes.length > 0) {
        if (!params.eventTypes.includes(ev.eventType)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const offset = params?.offset || 0;
    const limit = params?.limit || 100;
    return filtered.slice(offset, offset + limit);
  }

  async getBatchedCustomerIntelligence(
    customerIds: string[]
  ): Promise<BatchedCustomerIntelligenceData> {
    const store = getMemoryStore();
    const idSet = new Set(customerIds);
    const visitorsByCustomer = new Map<string, VisitorEntity[]>();
    const eventsByCustomer = new Map<string, VisitorEventEntity[]>();
    const visitorToCustomer = new Map<string, string>();

    for (const cid of customerIds) {
      visitorsByCustomer.set(cid, []);
      eventsByCustomer.set(cid, []);
    }

    for (const v of store.visitors.values()) {
      if (v.customerId && idSet.has(v.customerId)) {
        visitorsByCustomer.get(v.customerId)!.push(v);
        visitorToCustomer.set(v.id, v.customerId);
      }
    }

    for (const list of visitorsByCustomer.values()) {
      list.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    }

    for (const ev of store.events) {
      const cid =
        (ev.customerId && idSet.has(ev.customerId) ? ev.customerId : null) ||
        visitorToCustomer.get(ev.visitorId) ||
        null;
      if (cid && idSet.has(cid)) {
        eventsByCustomer.get(cid)!.push(ev);
      }
    }

    for (const [cid, list] of eventsByCustomer.entries()) {
      list.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      if (list.length > 150) {
        eventsByCustomer.set(cid, list.slice(0, 150));
      }
    }

    return { visitorsByCustomer, eventsByCustomer };
  }

  async anonymizeOrDeleteUnlinkedVisitor(visitorId: string): Promise<{ deleted: boolean }> {
    const store = getMemoryStore();
    const existing = store.visitors.get(visitorId);
    if (!existing) {
      return { deleted: false };
    }
    // Never delete records already linked to a verified customer account
    if (existing.customerId) {
      return { deleted: false };
    }

    store.visitors.delete(visitorId);
    const deletedSessionIds = new Set<string>();
    for (const [sid, sess] of store.sessions.entries()) {
      if (sess.visitorId === visitorId && !sess.customerId) {
        deletedSessionIds.add(sid);
        store.sessions.delete(sid);
      }
    }
    store.events = store.events.filter(
      (ev) => !(ev.visitorId === visitorId && !ev.customerId)
    );

    // Preserve enquiries while nulling out visitorId/sessionId (mirrors PostgreSQL ON DELETE SET NULL)
    unlinkEnquiryVisitorAttributionInMemory(new Set([visitorId]), deletedSessionIds);

    return { deleted: true };
  }

  async purgeExpiredAnonymousTelemetry(
    retentionDays = 90,
    batchSize = 500
  ): Promise<{
    deletedVisitors: number;
    deletedSessions: number;
    deletedEvents: number;
  }> {
    const store = getMemoryStore();
    const safeBatchSize = Math.min(Math.max(1, batchSize), 5000);
    const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000);

    // Select bounded batch of eligible expired unlinked visitors ordered by oldest lastSeenAt first.
    // Active visitors (lastSeenAt > cutoff) and customer-linked visitors are never partially stripped.
    const eligibleVisitors = Array.from(store.visitors.values())
      .filter((v) => !v.customerId && v.lastSeenAt.getTime() <= cutoff.getTime())
      .sort((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime())
      .slice(0, safeBatchSize);

    const expiredVisitorIds = new Set<string>();
    for (const v of eligibleVisitors) {
      expiredVisitorIds.add(v.id);
      store.visitors.delete(v.id);
    }

    if (expiredVisitorIds.size === 0) {
      return { deletedVisitors: 0, deletedSessions: 0, deletedEvents: 0 };
    }

    const deletedSessionIds = new Set<string>();
    for (const [sid, sess] of store.sessions.entries()) {
      if (!sess.customerId && expiredVisitorIds.has(sess.visitorId)) {
        deletedSessionIds.add(sid);
        store.sessions.delete(sid);
      }
    }

    const beforeEvents = store.events.length;
    store.events = store.events.filter(
      (ev) => Boolean(ev.customerId) || !expiredVisitorIds.has(ev.visitorId)
    );
    const deletedEvents = beforeEvents - store.events.length;

    // Preserve enquiries while setting visitorId/sessionId to null (mirrors PostgreSQL ON DELETE SET NULL)
    unlinkEnquiryVisitorAttributionInMemory(expiredVisitorIds, deletedSessionIds);

    return {
      deletedVisitors: expiredVisitorIds.size,
      deletedSessions: deletedSessionIds.size,
      deletedEvents,
    };
  }

  async getOverviewStats() {
    const store = getMemoryStore();
    const allVisitors = Array.from(store.visitors.values());
    const allSessions = Array.from(store.sessions.values());
    const allEvents = store.events;

    const totalVisitors = allVisitors.length;
    const authenticatedVisitors = allVisitors.filter((v) => Boolean(v.customerId)).length;
    const anonymousVisitors = totalVisitors - authenticatedVisitors;
    const returningVisitors = allVisitors.filter((v) => v.sessionCount > 1).length;
    const totalSessions = allSessions.length;

    const propertyViewTypes = new Set<VisitorEventType>([
      'PROJECT_VIEW',
      'RESALE_LISTING_VIEW',
      'RENTAL_LISTING_VIEW',
    ]);
    const searchTypes = new Set<VisitorEventType>(['SEARCH_EXECUTED', 'FILTER_APPLIED']);
    const shortlistTypes = new Set<VisitorEventType>([
      'ITEM_SAVED',
      'PROJECT_WATCHED',
      'LOCATION_WATCHED',
    ]);
    const compareTypes = new Set<VisitorEventType>(['COMPARE_ADDED', 'COMPARE_VIEWED']);

    let totalPropertyViews = 0;
    let totalSearches = 0;
    let totalShortlists = 0;
    let totalComparisons = 0;

    const visitorsWithPropertyViewsSet = new Set<string>();
    const visitorsWithSearchFilterSet = new Set<string>();
    const visitorsWithShortlistSet = new Set<string>();

    const projectViewMap = new Map<
      string,
      { entitySlug: string | null; views: number; visitors: Set<string> }
    >();
    const listingViewMap = new Map<
      string,
      { entityType: string; entitySlug: string | null; views: number; visitors: Set<string> }
    >();
    const locationViewMap = new Map<
      string,
      { entitySlug: string | null; views: number; visitors: Set<string> }
    >();
    const filterCounts = new Map<string, number>();

    for (const ev of allEvents) {
      if (propertyViewTypes.has(ev.eventType)) {
        totalPropertyViews++;
        visitorsWithPropertyViewsSet.add(ev.visitorId);
      }
      if (searchTypes.has(ev.eventType)) {
        totalSearches++;
        visitorsWithSearchFilterSet.add(ev.visitorId);
      }
      if (shortlistTypes.has(ev.eventType)) {
        totalShortlists++;
        visitorsWithShortlistSet.add(ev.visitorId);
      }
      if (compareTypes.has(ev.eventType)) {
        totalComparisons++;
        visitorsWithShortlistSet.add(ev.visitorId);
      }

      if (ev.eventType === 'PROJECT_VIEW' && ev.entityId) {
        const current = projectViewMap.get(ev.entityId) || {
          entitySlug: ev.entitySlug,
          views: 0,
          visitors: new Set<string>(),
        };
        current.views++;
        current.visitors.add(ev.visitorId);
        if (!current.entitySlug && ev.entitySlug) current.entitySlug = ev.entitySlug;
        projectViewMap.set(ev.entityId, current);
      }

      if (
        (ev.eventType === 'RESALE_LISTING_VIEW' || ev.eventType === 'RENTAL_LISTING_VIEW') &&
        ev.entityId
      ) {
        const current = listingViewMap.get(ev.entityId) || {
          entityType: ev.entityType || 'RESALE_LISTING',
          entitySlug: ev.entitySlug,
          views: 0,
          visitors: new Set<string>(),
        };
        current.views++;
        current.visitors.add(ev.visitorId);
        listingViewMap.set(ev.entityId, current);
      }

      if (ev.eventType === 'LOCATION_VIEW' && ev.entityId) {
        const current = locationViewMap.get(ev.entityId) || {
          entitySlug: ev.entitySlug,
          views: 0,
          visitors: new Set<string>(),
        };
        current.views++;
        current.visitors.add(ev.visitorId);
        locationViewMap.set(ev.entityId, current);
      }

      if (searchTypes.has(ev.eventType) && ev.metadata) {
        const m = ev.metadata;
        if (typeof m.location === 'string' && m.location.trim()) {
          const label = `Locality: ${m.location.trim()}`;
          filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
        }
        if (typeof m.bhk === 'string' && m.bhk.trim()) {
          const label = `BHK: ${m.bhk.trim()}`;
          filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
        }
        if (typeof m.propertyType === 'string' && m.propertyType.trim()) {
          const label = `Type: ${m.propertyType.trim()}`;
          filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
        }
        if (typeof m.query === 'string' && m.query.trim()) {
          const label = `Search: "${m.query.trim()}"`;
          filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
        }
      }
    }

    const topProjectsRaw = Array.from(projectViewMap.entries())
      .map(([entityId, data]) => ({
        entityId,
        entitySlug: data.entitySlug,
        views: data.views,
        uniqueVisitors: data.visitors.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6);

    const topListingsRaw = Array.from(listingViewMap.entries())
      .map(([entityId, data]) => ({
        entityId,
        entityType: data.entityType,
        entitySlug: data.entitySlug,
        views: data.views,
        uniqueVisitors: data.visitors.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6);

    const topLocationsRaw = Array.from(locationViewMap.entries())
      .map(([entityId, data]) => ({
        entityId,
        entitySlug: data.entitySlug,
        views: data.views,
        uniqueVisitors: data.visitors.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6);

    const topSearchFilters = Array.from(filterCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const sourceMap = new Map<
      string,
      { source: string; medium: string; visitors: number; authenticatedCustomers: number }
    >();
    const deviceMap = new Map<VisitorDeviceClass, number>();

    for (const v of allVisitors) {
      const source = v.firstUtmSource || (v.firstReferrerUrl ? 'referral' : 'direct');
      const medium = v.firstUtmMedium || (v.firstReferrerUrl ? 'web' : 'none');
      const key = `${source}|${medium}`;
      const existing = sourceMap.get(key) || {
        source,
        medium,
        visitors: 0,
        authenticatedCustomers: 0,
      };
      existing.visitors++;
      if (v.customerId) existing.authenticatedCustomers++;
      sourceMap.set(key, existing);

      const dev = v.deviceClass || 'UNKNOWN';
      deviceMap.set(dev, (deviceMap.get(dev) || 0) + 1);
    }

    const trafficSources = Array.from(sourceMap.values())
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 6);

    const deviceBreakdown = Array.from(deviceMap.entries()).map(([deviceClass, count]) => ({
      deviceClass,
      count,
      percentage: totalVisitors > 0 ? Math.round((count / totalVisitors) * 100) : 0,
    }));

    return {
      totalVisitors,
      anonymousVisitors,
      authenticatedVisitors,
      returningVisitors,
      totalSessions,
      totalPropertyViews,
      totalSearches,
      totalShortlists,
      totalComparisons,
      visitorsWithPropertyViews: visitorsWithPropertyViewsSet.size,
      visitorsWithSearchFilter: visitorsWithSearchFilterSet.size,
      visitorsWithShortlist: visitorsWithShortlistSet.size,
      topProjectsRaw,
      topListingsRaw,
      topLocationsRaw,
      topSearchFilters,
      trafficSources,
      deviceBreakdown,
    };
  }
}

export class VisitorIntelligenceRepositoryPostgres implements IVisitorIntelligenceRepository {
  private memoryFallback = new VisitorIntelligenceRepositoryMemory();

  private mapVisitor(row: any): VisitorEntity {
    return {
      id: row.id,
      customerId: row.customerId ?? null,
      firstSeenAt: row.firstSeenAt ? new Date(row.firstSeenAt) : new Date(),
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : new Date(),
      linkedAt: row.linkedAt ? new Date(row.linkedAt) : null,
      sessionCount: Number(row.sessionCount ?? 1),
      firstUtmSource: row.firstUtmSource ?? null,
      firstUtmMedium: row.firstUtmMedium ?? null,
      firstUtmCampaign: row.firstUtmCampaign ?? null,
      firstUtmTerm: row.firstUtmTerm ?? null,
      firstUtmContent: row.firstUtmContent ?? null,
      firstReferrerUrl: row.firstReferrerUrl ?? null,
      firstLandingPath: row.firstLandingPath ?? null,
      lastLandingPath: row.lastLandingPath ?? null,
      deviceClass: (row.deviceClass as VisitorDeviceClass) || 'UNKNOWN',
      browserFamily: row.browserFamily ?? null,
      ipHash: row.ipHash ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
  }

  private mapSession(row: any): VisitorSessionEntity {
    return {
      id: row.id,
      visitorId: row.visitorId,
      customerId: row.customerId ?? null,
      startedAt: row.startedAt ? new Date(row.startedAt) : new Date(),
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt) : new Date(),
      utmSource: row.utmSource ?? null,
      utmMedium: row.utmMedium ?? null,
      utmCampaign: row.utmCampaign ?? null,
      utmTerm: row.utmTerm ?? null,
      utmContent: row.utmContent ?? null,
      referrerUrl: row.referrerUrl ?? null,
      entryPath: row.entryPath ?? null,
      exitPath: row.exitPath ?? null,
      deviceClass: (row.deviceClass as VisitorDeviceClass) || 'UNKNOWN',
      browserFamily: row.browserFamily ?? null,
      ipHash: row.ipHash ?? null,
      pageViewCount: Number(row.pageViewCount ?? 0),
      eventCount: Number(row.eventCount ?? 0),
      durationSeconds: Number(row.durationSeconds ?? 0),
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
  }

  private mapEvent(row: any): VisitorEventEntity {
    return {
      id: row.id,
      visitorId: row.visitorId,
      sessionId: row.sessionId,
      customerId: row.customerId ?? null,
      eventType: row.eventType as VisitorEventType,
      pagePath: row.pagePath ?? null,
      pageTitle: row.pageTitle ?? null,
      entityType: (row.entityType as VisitorEntityType) ?? null,
      entityId: row.entityId ?? null,
      entitySlug: row.entitySlug ?? null,
      areaBasis: (row.areaBasis as AreaBasisType) ?? null,
      durationSeconds:
        row.durationSeconds !== null && row.durationSeconds !== undefined
          ? Number(row.durationSeconds)
          : null,
      clientEventId: row.clientEventId ?? null,
      metadata: (row.metadata as Record<string, any>) ?? null,
      occurredAt: row.occurredAt ? new Date(row.occurredAt) : new Date(),
    };
  }

  async upsertVisitor(params: UpsertVisitorParams): Promise<VisitorEntity> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.upsertVisitor(params);

    const now = new Date();
    const incSession = params.incrementSessionCount ? 1 : 0;

    const [row] = await db
      .insert(visitors)
      .values({
        id: params.id,
        customerId: params.customerId || null,
        firstSeenAt: now,
        lastSeenAt: now,
        linkedAt: params.customerId ? now : null,
        sessionCount: 1,
        firstUtmSource: params.utmSource || null,
        firstUtmMedium: params.utmMedium || null,
        firstUtmCampaign: params.utmCampaign || null,
        firstUtmTerm: params.utmTerm || null,
        firstUtmContent: params.utmContent || null,
        firstReferrerUrl: params.referrerUrl || null,
        firstLandingPath: params.landingPath || null,
        lastLandingPath: params.landingPath || null,
        deviceClass: params.deviceClass || 'UNKNOWN',
        browserFamily: params.browserFamily || null,
        ipHash: params.ipHash || null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: visitors.id,
        set: {
          customerId: sql`COALESCE(${visitors.customerId}, ${params.customerId || null}::text)`,
          linkedAt: sql`CASE WHEN ${visitors.customerId} IS NULL AND ${params.customerId || null}::text IS NOT NULL THEN ${now}::timestamp ELSE ${visitors.linkedAt} END`,
          lastSeenAt: now,
          sessionCount: sql`${visitors.sessionCount} + ${incSession}`,
          firstUtmSource: sql`COALESCE(${visitors.firstUtmSource}, ${params.utmSource || null}::text)`,
          firstUtmMedium: sql`COALESCE(${visitors.firstUtmMedium}, ${params.utmMedium || null}::text)`,
          firstUtmCampaign: sql`COALESCE(${visitors.firstUtmCampaign}, ${params.utmCampaign || null}::text)`,
          firstUtmTerm: sql`COALESCE(${visitors.firstUtmTerm}, ${params.utmTerm || null}::text)`,
          firstUtmContent: sql`COALESCE(${visitors.firstUtmContent}, ${params.utmContent || null}::text)`,
          firstReferrerUrl: sql`COALESCE(${visitors.firstReferrerUrl}, ${params.referrerUrl || null}::text)`,
          firstLandingPath: sql`COALESCE(${visitors.firstLandingPath}, ${params.landingPath || null}::text)`,
          lastLandingPath: sql`COALESCE(${params.landingPath || null}::text, ${visitors.lastLandingPath})`,
          deviceClass: sql`CASE WHEN ${params.deviceClass || 'UNKNOWN'} <> 'UNKNOWN' THEN ${params.deviceClass || 'UNKNOWN'}::text ELSE ${visitors.deviceClass} END`,
          browserFamily: sql`COALESCE(${params.browserFamily || null}::text, ${visitors.browserFamily})`,
          ipHash: sql`COALESCE(${params.ipHash || null}::text, ${visitors.ipHash})`,
          updatedAt: now,
        } as any,
      })
      .returning();

    return this.mapVisitor(row);
  }

  async linkVisitorToCustomer(
    visitorId: string,
    customerId: string
  ): Promise<{ linked: boolean; conflictDifferentCustomer: boolean; backfilledEvents: number }> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.linkVisitorToCustomer(visitorId, customerId);

    const now = new Date();

    // Atomic conditional update: only link if customer_id IS NULL or already equals customerId.
    // Prevents concurrent requests for two different customers from overwriting each other.
    const updatedVisitors = await db
      .update(visitors)
      .set({
        customerId,
        linkedAt: sql`COALESCE(${visitors.linkedAt}, ${now})`,
        lastSeenAt: now,
        updatedAt: now,
      } as any)
      .where(
        and(
          eq(visitors.id, visitorId),
          or(isNull(visitors.customerId), eq(visitors.customerId, customerId))
        )
      )
      .returning({ id: visitors.id });

    if (updatedVisitors.length === 0) {
      const existing = await this.findVisitorById(visitorId);
      if (!existing) {
        return { linked: false, conflictDifferentCustomer: false, backfilledEvents: 0 };
      }
      return { linked: false, conflictDifferentCustomer: true, backfilledEvents: 0 };
    }

    await db
      .update(visitorSessions)
      .set({
        customerId,
        updatedAt: now,
      } as any)
      .where(and(eq(visitorSessions.visitorId, visitorId), isNull(visitorSessions.customerId)));

    const updatedEvents = await db
      .update(visitorEvents)
      .set({
        customerId,
        metadata: sql`jsonb_set(COALESCE(${visitorEvents.metadata}, '{}'::jsonb), '{backfilledFromAnonymous}', 'true'::jsonb, true)`,
      } as any)
      .where(and(eq(visitorEvents.visitorId, visitorId), isNull(visitorEvents.customerId)))
      .returning({ id: visitorEvents.id });

    return {
      linked: true,
      conflictDifferentCustomer: false,
      backfilledEvents: updatedEvents.length,
    };
  }

  async findVisitorById(id: string): Promise<VisitorEntity | null> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.findVisitorById(id);

    const [row] = await db.select().from(visitors).where(eq(visitors.id, id));
    return row ? this.mapVisitor(row) : null;
  }

  async listVisitors(params?: {
    onlyAnonymous?: boolean;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: VisitorEntity[]; total: number }> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.listVisitors(params);

    const conditions = [];
    if (params?.onlyAnonymous) {
      conditions.push(isNull(visitors.customerId));
    }
    if (params?.customerId) {
      conditions.push(eq(visitors.customerId, params.customerId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const rows = await db
      .select()
      .from(visitors)
      .where(whereClause)
      .orderBy(desc(visitors.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(visitors)
      .where(whereClause);

    return {
      items: rows.map((r) => this.mapVisitor(r)),
      total: Number(countRow?.count ?? rows.length),
    };
  }

  async listVisitorsByCustomerId(customerId: string): Promise<VisitorEntity[]> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.listVisitorsByCustomerId(customerId);

    const rows = await db
      .select()
      .from(visitors)
      .where(eq(visitors.customerId, customerId))
      .orderBy(desc(visitors.lastSeenAt));
    return rows.map((r) => this.mapVisitor(r));
  }

  async upsertSession(params: UpsertSessionParams): Promise<VisitorSessionEntity> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.upsertSession(params);

    const now = new Date();
    const incPageViews = params.incrementPageViews ? 1 : 0;
    const incEvents = params.incrementEvents ? 1 : 0;
    const explicitDuration = params.durationSeconds ?? 0;

    const [row] = await db
      .insert(visitorSessions)
      .values({
        id: params.id,
        visitorId: params.visitorId,
        customerId: params.customerId || null,
        startedAt: now,
        lastActivityAt: now,
        utmSource: params.utmSource || null,
        utmMedium: params.utmMedium || null,
        utmCampaign: params.utmCampaign || null,
        utmTerm: params.utmTerm || null,
        utmContent: params.utmContent || null,
        referrerUrl: params.referrerUrl || null,
        entryPath: params.entryPath || null,
        exitPath: params.exitPath || params.entryPath || null,
        deviceClass: params.deviceClass || 'UNKNOWN',
        browserFamily: params.browserFamily || null,
        ipHash: params.ipHash || null,
        pageViewCount: incPageViews,
        eventCount: incEvents,
        durationSeconds: explicitDuration,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: visitorSessions.id,
        set: {
          customerId: sql`COALESCE(${visitorSessions.customerId}, ${params.customerId || null}::text)`,
          lastActivityAt: now,
          utmSource: sql`COALESCE(${visitorSessions.utmSource}, ${params.utmSource || null}::text)`,
          utmMedium: sql`COALESCE(${visitorSessions.utmMedium}, ${params.utmMedium || null}::text)`,
          utmCampaign: sql`COALESCE(${visitorSessions.utmCampaign}, ${params.utmCampaign || null}::text)`,
          utmTerm: sql`COALESCE(${visitorSessions.utmTerm}, ${params.utmTerm || null}::text)`,
          utmContent: sql`COALESCE(${visitorSessions.utmContent}, ${params.utmContent || null}::text)`,
          referrerUrl: sql`COALESCE(${visitorSessions.referrerUrl}, ${params.referrerUrl || null}::text)`,
          entryPath: sql`COALESCE(${visitorSessions.entryPath}, ${params.entryPath || null}::text)`,
          exitPath: sql`COALESCE(${params.exitPath || null}::text, ${visitorSessions.exitPath})`,
          deviceClass: sql`CASE WHEN ${params.deviceClass || 'UNKNOWN'} <> 'UNKNOWN' THEN ${params.deviceClass || 'UNKNOWN'}::text ELSE ${visitorSessions.deviceClass} END`,
          browserFamily: sql`COALESCE(${params.browserFamily || null}::text, ${visitorSessions.browserFamily})`,
          ipHash: sql`COALESCE(${params.ipHash || null}::text, ${visitorSessions.ipHash})`,
          pageViewCount: sql`${visitorSessions.pageViewCount} + ${incPageViews}`,
          eventCount: sql`${visitorSessions.eventCount} + ${incEvents}`,
          durationSeconds: sql`LEAST(7200, GREATEST(${visitorSessions.durationSeconds}, ${explicitDuration}::int, EXTRACT(EPOCH FROM (${now}::timestamp - ${visitorSessions.startedAt}))::int))`,
          updatedAt: now,
        } as any,
      })
      .returning();

    return this.mapSession(row);
  }

  async findSessionById(id: string): Promise<VisitorSessionEntity | null> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.findSessionById(id);

    const [row] = await db
      .select()
      .from(visitorSessions)
      .where(eq(visitorSessions.id, id));
    return row ? this.mapSession(row) : null;
  }

  async listSessionsByVisitorId(visitorId: string, limit = 25): Promise<VisitorSessionEntity[]> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.listSessionsByVisitorId(visitorId, limit);

    const rows = await db
      .select()
      .from(visitorSessions)
      .where(eq(visitorSessions.visitorId, visitorId))
      .orderBy(desc(visitorSessions.lastActivityAt))
      .limit(limit);
    return rows.map((r) => this.mapSession(r));
  }

  async listSessionsByCustomerId(customerId: string, limit = 50): Promise<VisitorSessionEntity[]> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.listSessionsByCustomerId(customerId, limit);

    const rows = await db
      .select()
      .from(visitorSessions)
      .where(
        or(
          eq(visitorSessions.customerId, customerId),
          sql`${visitorSessions.visitorId} IN (SELECT id FROM visitors WHERE customer_id = ${customerId})`
        )
      )
      .orderBy(desc(visitorSessions.lastActivityAt))
      .limit(limit);
    return rows.map((r) => this.mapSession(r));
  }

  async recordEvent(
    params: RecordEventParams
  ): Promise<{ event: VisitorEventEntity; deduplicated: boolean }> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.recordEvent(params);

    const now = params.occurredAt || new Date();
    const effectiveClientEventId = computeEffectiveClientEventId(params, now);
    const burstCutoff = new Date(now.getTime() - DEDUPE_WINDOW_MS);

    // 1. Check 3-second sliding window for cross-bucket boundary duplicates
    const [burstCandidate] = await db
      .select()
      .from(visitorEvents)
      .where(
        and(
          eq(visitorEvents.visitorId, params.visitorId),
          eq(visitorEvents.sessionId, params.sessionId),
          eq(visitorEvents.eventType, params.eventType),
          eq(visitorEvents.clientEventId, effectiveClientEventId),
          sql`${visitorEvents.occurredAt} >= ${burstCutoff}`
        )
      )
      .orderBy(desc(visitorEvents.occurredAt))
      .limit(1);

    if (burstCandidate) {
      return { event: this.mapEvent(burstCandidate), deduplicated: true };
    }

    const id = params.id || `vev-${crypto.randomUUID()}`;

    // 2. Atomic insert with ON CONFLICT DO NOTHING on uq_visitor_events_visitor_client_event (visitor_id, client_event_id).
    // Because effectiveClientEventId is always populated (either client-supplied or deterministic 3-second bucket hash),
    // PostgreSQL enforces atomic uniqueness even under simultaneous requests without a client-supplied ID.
    const insertedRows = await db
      .insert(visitorEvents)
      .values({
        id,
        visitorId: params.visitorId,
        sessionId: params.sessionId,
        customerId: params.customerId || null,
        eventType: params.eventType,
        pagePath: params.pagePath || null,
        pageTitle: params.pageTitle || null,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        entitySlug: params.entitySlug || null,
        areaBasis: params.areaBasis || null,
        durationSeconds: params.durationSeconds ?? null,
        clientEventId: effectiveClientEventId,
        metadata: params.metadata || null,
        occurredAt: now,
      } as any)
      .onConflictDoNothing()
      .returning();

    if (insertedRows.length > 0) {
      return { event: this.mapEvent(insertedRows[0]), deduplicated: false };
    }

    // Conflict occurred on (visitor_id, client_event_id) or id; fetch existing canonical row
    const [existing] = await db
      .select()
      .from(visitorEvents)
      .where(
        and(
          eq(visitorEvents.visitorId, params.visitorId),
          eq(visitorEvents.clientEventId, effectiveClientEventId)
        )
      )
      .limit(1);
    if (existing) {
      return { event: this.mapEvent(existing), deduplicated: true };
    }

    const [fallbackRow] = await db
      .select()
      .from(visitorEvents)
      .where(eq(visitorEvents.id, id))
      .limit(1);

    if (fallbackRow) {
      return { event: this.mapEvent(fallbackRow), deduplicated: true };
    }

    throw new Error('Failed to persist or resolve deduplicated visitor event.');
  }

  async listEvents(params?: {
    visitorId?: string;
    customerId?: string;
    sessionId?: string;
    eventTypes?: VisitorEventType[];
    limit?: number;
    offset?: number;
  }): Promise<VisitorEventEntity[]> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.listEvents(params);

    const conditions = [];
    if (params?.visitorId) {
      conditions.push(eq(visitorEvents.visitorId, params.visitorId));
    }
    if (params?.sessionId) {
      conditions.push(eq(visitorEvents.sessionId, params.sessionId));
    }
    if (params?.customerId) {
      conditions.push(
        or(
          eq(visitorEvents.customerId, params.customerId),
          sql`${visitorEvents.visitorId} IN (SELECT id FROM visitors WHERE customer_id = ${params.customerId})`
        )
      );
    }
    // Push eventTypes filter into PostgreSQL WHERE clause BEFORE LIMIT and OFFSET
    if (params?.eventTypes && params.eventTypes.length > 0) {
      conditions.push(inArray(visitorEvents.eventType, params.eventTypes));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = params?.limit || 100;
    const offset = params?.offset || 0;

    const rows = await db
      .select()
      .from(visitorEvents)
      .where(whereClause)
      .orderBy(desc(visitorEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => this.mapEvent(r));
  }

  async getBatchedCustomerIntelligence(
    customerIds: string[]
  ): Promise<BatchedCustomerIntelligenceData> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.getBatchedCustomerIntelligence(customerIds);

    const visitorsByCustomer = new Map<string, VisitorEntity[]>();
    const eventsByCustomer = new Map<string, VisitorEventEntity[]>();
    for (const cid of customerIds) {
      visitorsByCustomer.set(cid, []);
      eventsByCustomer.set(cid, []);
    }

    if (customerIds.length === 0) {
      return { visitorsByCustomer, eventsByCustomer };
    }

    const [visitorRows, eventRows] = await Promise.all([
      db
        .select()
        .from(visitors)
        .where(inArray(visitors.customerId, customerIds))
        .orderBy(desc(visitors.lastSeenAt)),
      db
        .select()
        .from(visitorEvents)
        .where(inArray(visitorEvents.customerId, customerIds))
        .orderBy(desc(visitorEvents.occurredAt))
        .limit(Math.min(customerIds.length * 100, 5000)),
    ]);

    for (const row of visitorRows) {
      const mapped = this.mapVisitor(row);
      if (mapped.customerId && visitorsByCustomer.has(mapped.customerId)) {
        visitorsByCustomer.get(mapped.customerId)!.push(mapped);
      }
    }

    for (const row of eventRows) {
      const mapped = this.mapEvent(row);
      if (mapped.customerId && eventsByCustomer.has(mapped.customerId)) {
        const list = eventsByCustomer.get(mapped.customerId)!;
        if (list.length < 150) {
          list.push(mapped);
        }
      }
    }

    return { visitorsByCustomer, eventsByCustomer };
  }

  async anonymizeOrDeleteUnlinkedVisitor(visitorId: string): Promise<{ deleted: boolean }> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.anonymizeOrDeleteUnlinkedVisitor(visitorId);

    // Only delete if the visitor record is NOT linked to any verified customer.
    // PostgreSQL FK constraints automatically cascade to visitor_sessions and visitor_events
    // and SET NULL on enquiries.visitor_id and enquiries.session_id.
    const deletedRows = await db
      .delete(visitors)
      .where(and(eq(visitors.id, visitorId), isNull(visitors.customerId)))
      .returning({ id: visitors.id });

    return { deleted: deletedRows.length > 0 };
  }

  async purgeExpiredAnonymousTelemetry(
    retentionDays = 90,
    batchSize = 500
  ): Promise<{
    deletedVisitors: number;
    deletedSessions: number;
    deletedEvents: number;
  }> {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.purgeExpiredAnonymousTelemetry(retentionDays, batchSize);

    const safeBatchSize = Math.min(Math.max(1, batchSize), 5000);
    const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000);

    // 1. Select a bounded batch of expired, unlinked anonymous visitor IDs.
    // Active visitors (last_seen_at > cutoff) and customer-linked visitors are untouched.
    const candidateRows = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(and(isNull(visitors.customerId), lte(visitors.lastSeenAt, cutoff)))
      .orderBy(visitors.lastSeenAt)
      .limit(safeBatchSize);

    const targetVisitorIds = candidateRows.map((r) => r.id);
    if (targetVisitorIds.length === 0) {
      return { deletedVisitors: 0, deletedSessions: 0, deletedEvents: 0 };
    }

    // 2. Count child sessions and events using SQL COUNT(*) without transferring huge ID arrays
    const [[sessionCountRow], [eventCountRow]] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(visitorSessions)
        .where(
          and(
            inArray(visitorSessions.visitorId, targetVisitorIds),
            isNull(visitorSessions.customerId)
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(visitorEvents)
        .where(
          and(
            inArray(visitorEvents.visitorId, targetVisitorIds),
            isNull(visitorEvents.customerId)
          )
        ),
    ]);

    // 3. Delete the bounded batch of unlinked visitors.
    // Foreign keys ON DELETE CASCADE remove child visitor_sessions & visitor_events,
    // and ON DELETE SET NULL preserves enquiries while nulling out visitor_id & session_id.
    const deletedVisitorsRows = await db
      .delete(visitors)
      .where(and(inArray(visitors.id, targetVisitorIds), isNull(visitors.customerId)))
      .returning({ id: visitors.id });

    return {
      deletedVisitors: deletedVisitorsRows.length,
      deletedSessions: Number(sessionCountRow?.count ?? 0),
      deletedEvents: Number(eventCountRow?.count ?? 0),
    };
  }

  async getOverviewStats() {
    const db = await getDbReady();
    if (!db) return this.memoryFallback.getOverviewStats();

    const extractRows = (res: any): any[] => (Array.isArray(res) ? res : res?.rows || []);

    // Perform bounded SQL queries rather than unbounded full-table loading
    const visitorSummaryRes = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_visitors,
        COUNT(*) FILTER (WHERE customer_id IS NULL)::int AS anonymous_visitors,
        COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS authenticated_visitors,
        COUNT(*) FILTER (WHERE session_count > 1)::int AS returning_visitors
      FROM visitors
    `);

    const sessionSummaryRes = await db.execute(sql`
      SELECT COUNT(*)::int AS total_sessions FROM visitor_sessions
    `);

    const eventSummaryRes = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_type IN ('PROJECT_VIEW', 'RESALE_LISTING_VIEW', 'RENTAL_LISTING_VIEW'))::int AS total_property_views,
        COUNT(*) FILTER (WHERE event_type IN ('SEARCH_EXECUTED', 'FILTER_APPLIED'))::int AS total_searches,
        COUNT(*) FILTER (WHERE event_type IN ('ITEM_SAVED', 'PROJECT_WATCHED', 'LOCATION_WATCHED'))::int AS total_shortlists,
        COUNT(*) FILTER (WHERE event_type IN ('COMPARE_ADDED', 'COMPARE_VIEWED'))::int AS total_comparisons,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event_type IN ('PROJECT_VIEW', 'RESALE_LISTING_VIEW', 'RENTAL_LISTING_VIEW'))::int AS visitors_with_property_views,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event_type IN ('SEARCH_EXECUTED', 'FILTER_APPLIED'))::int AS visitors_with_search_filter,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event_type IN ('ITEM_SAVED', 'PROJECT_WATCHED', 'LOCATION_WATCHED', 'COMPARE_ADDED', 'COMPARE_VIEWED'))::int AS visitors_with_shortlist
      FROM visitor_events
    `);

    const topProjectsRes = await db.execute(sql`
      SELECT
        entity_id,
        MAX(entity_slug) AS entity_slug,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM visitor_events
      WHERE event_type = 'PROJECT_VIEW' AND entity_id IS NOT NULL
      GROUP BY entity_id
      ORDER BY views DESC
      LIMIT 6
    `);

    const topListingsRes = await db.execute(sql`
      SELECT
        entity_id,
        MAX(entity_type) AS entity_type,
        MAX(entity_slug) AS entity_slug,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM visitor_events
      WHERE event_type IN ('RESALE_LISTING_VIEW', 'RENTAL_LISTING_VIEW') AND entity_id IS NOT NULL
      GROUP BY entity_id
      ORDER BY views DESC
      LIMIT 6
    `);

    const topLocationsRes = await db.execute(sql`
      SELECT
        entity_id,
        MAX(entity_slug) AS entity_slug,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM visitor_events
      WHERE event_type = 'LOCATION_VIEW' AND entity_id IS NOT NULL
      GROUP BY entity_id
      ORDER BY views DESC
      LIMIT 6
    `);

    const trafficSourcesRes = await db.execute(sql`
      SELECT
        COALESCE(first_utm_source, CASE WHEN first_referrer_url IS NOT NULL THEN 'referral' ELSE 'direct' END) AS source,
        COALESCE(first_utm_medium, CASE WHEN first_referrer_url IS NOT NULL THEN 'web' ELSE 'none' END) AS medium,
        COUNT(*)::int AS visitors,
        COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS authenticated_customers
      FROM visitors
      GROUP BY 1, 2
      ORDER BY visitors DESC
      LIMIT 6
    `);

    const devicesRes = await db.execute(sql`
      SELECT
        COALESCE(device_class, 'UNKNOWN') AS device_class,
        COUNT(*)::int AS count
      FROM visitors
      GROUP BY 1
    `);

    // Recent search filters (bounded to latest 250 search/filter events)
    const recentSearches = await this.listEvents({
      eventTypes: ['SEARCH_EXECUTED', 'FILTER_APPLIED'],
      limit: 250,
    });
    const filterCounts = new Map<string, number>();
    for (const ev of recentSearches) {
      const m = ev.metadata || {};
      if (typeof m.location === 'string' && m.location.trim()) {
        const label = `Locality: ${m.location.trim()}`;
        filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
      }
      if (typeof m.bhk === 'string' && m.bhk.trim()) {
        const label = `BHK: ${m.bhk.trim()}`;
        filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
      }
      if (typeof m.propertyType === 'string' && m.propertyType.trim()) {
        const label = `Type: ${m.propertyType.trim()}`;
        filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
      }
      if (typeof m.query === 'string' && m.query.trim()) {
        const label = `Search: "${m.query.trim()}"`;
        filterCounts.set(label, (filterCounts.get(label) || 0) + 1);
      }
    }

    const vRow: any = extractRows(visitorSummaryRes)[0] || {};
    const sRow: any = extractRows(sessionSummaryRes)[0] || {};
    const eRow: any = extractRows(eventSummaryRes)[0] || {};
    const totalVisitors = Number(vRow.total_visitors ?? 0);

    return {
      totalVisitors,
      anonymousVisitors: Number(vRow.anonymous_visitors ?? 0),
      authenticatedVisitors: Number(vRow.authenticated_visitors ?? 0),
      returningVisitors: Number(vRow.returning_visitors ?? 0),
      totalSessions: Number(sRow.total_sessions ?? 0),
      totalPropertyViews: Number(eRow.total_property_views ?? 0),
      totalSearches: Number(eRow.total_searches ?? 0),
      totalShortlists: Number(eRow.total_shortlists ?? 0),
      totalComparisons: Number(eRow.total_comparisons ?? 0),
      visitorsWithPropertyViews: Number(eRow.visitors_with_property_views ?? 0),
      visitorsWithSearchFilter: Number(eRow.visitors_with_search_filter ?? 0),
      visitorsWithShortlist: Number(eRow.visitors_with_shortlist ?? 0),
      topProjectsRaw: extractRows(topProjectsRes).map((r: any) => ({
        entityId: r.entity_id,
        entitySlug: r.entity_slug ?? null,
        views: Number(r.views ?? 0),
        uniqueVisitors: Number(r.unique_visitors ?? 0),
      })),
      topListingsRaw: extractRows(topListingsRes).map((r: any) => ({
        entityId: r.entity_id,
        entityType: r.entity_type || 'RESALE_LISTING',
        entitySlug: r.entity_slug ?? null,
        views: Number(r.views ?? 0),
        uniqueVisitors: Number(r.unique_visitors ?? 0),
      })),
      topLocationsRaw: extractRows(topLocationsRes).map((r: any) => ({
        entityId: r.entity_id,
        entitySlug: r.entity_slug ?? null,
        views: Number(r.views ?? 0),
        uniqueVisitors: Number(r.unique_visitors ?? 0),
      })),
      topSearchFilters: Array.from(filterCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      trafficSources: extractRows(trafficSourcesRes).map((r: any) => ({
        source: r.source || 'direct',
        medium: r.medium || 'none',
        visitors: Number(r.visitors ?? 0),
        authenticatedCustomers: Number(r.authenticated_customers ?? 0),
      })),
      deviceBreakdown: extractRows(devicesRes).map((r: any) => ({
        deviceClass: (r.device_class as VisitorDeviceClass) || 'UNKNOWN',
        count: Number(r.count ?? 0),
        percentage: totalVisitors > 0 ? Math.round((Number(r.count ?? 0) / totalVisitors) * 100) : 0,
      })),
    };
  }
}

const memoryInstance = new VisitorIntelligenceRepositoryMemory();
const postgresInstance = new VisitorIntelligenceRepositoryPostgres();

export const visitorIntelligenceRepository: IVisitorIntelligenceRepository = new Proxy(
  {} as IVisitorIntelligenceRepository,
  {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      const impl = Boolean(getDb()) ? postgresInstance : memoryInstance;
      const value = Reflect.get(impl, prop, receiver);
      return typeof value === 'function' ? value.bind(impl) : value;
    },
  }
);
