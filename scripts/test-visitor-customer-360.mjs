import assert from 'node:assert/strict';

process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.CUSTOMER_AUTH_SECRET = 'test-only-customer-secret-that-is-at-least-32-characters';
process.env.GH_STAFF_SESSION_SECRET = 'test-only-staff-session-secret-that-is-at-least-32-chars';

const { ensureSeedData } = await import('../src/infrastructure/seed.ts');
const { customerIntelligenceService } = await import(
  '../src/domain/visitorIntelligence/services/customerIntelligenceService.ts'
);
const { visitorIntelligenceRepository } = await import(
  '../src/domain/visitorIntelligence/repositories/visitorIntelligenceRepository.ts'
);
const {
  customerRepository,
  recentlyViewedRepository,
  savedItemRepository,
} = await import('../src/domain/customer/repositories/index.ts');
const { enquiryService } = await import('../src/domain/enquiry/services/enquiryService.ts');
const { enquiryRepository } = await import('../src/domain/enquiry/repositories/enquiryRepository.ts');
const { hasCapability } = await import('../src/domain/auth/capabilityModel.ts');
const { auditService } = await import('../src/domain/audit/auditService.ts');

let passed = 0;
let failed = 0;

function check(condition, id, message) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${message}`);
  } else {
    failed++;
    console.error(`\x1b[31m[FAIL]\x1b[0m ${id}: ${message}`);
  }
}

console.log('================================================================');
console.log('GREAT HOMES V2 — VISITOR INTELLIGENCE & CUSTOMER 360 TEST SUITE');
console.log('================================================================\n');

// 1. Seed & Memory-Mode Verification
await ensureSeedData();
const seededOverview = await customerIntelligenceService.getOverview();
check(
  seededOverview.kpis.totalVisitors >= 3,
  'SEED.1',
  `Representative visitors seeded in memory mode (${seededOverview.kpis.totalVisitors} visitors)`
);
check(
  seededOverview.kpis.totalCustomers >= 3,
  'SEED.2',
  `Representative OTP customers seeded in memory mode (${seededOverview.kpis.totalCustomers} customers)`
);
check(
  seededOverview.funnel.length === 7,
  'FUNNEL.1',
  '7-stage conversion funnel computed with step & top conversion rates'
);

// 2. Anonymous Visitor Session & Event Ingestion + Validation
const anonVisitorId = 'test-vis-anon-100';
const anonSessionId = 'test-sess-anon-100';
const mockReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    cookie: `gh_visitor_id=${anonVisitorId}; gh_session_id=${anonSessionId}`,
  },
});

const validIngest = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    pageTitle: 'Merlin Rise — Sports Republic',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    entitySlug: 'merlin-rise',
    areaBasis: 'CARPET',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'rajarhat_launch',
    clientEventId: 'evt-unique-001',
    durationSeconds: 75,
    metadata: {
      locationName: 'Rajarhat',
      bhk: '3 BHK',
      areaSqft: 890,
      price: 6800000,
    },
  },
  null,
  '203.0.113.42'
);

check(validIngest.accepted === true, 'INGEST.1', 'Valid anonymous PROJECT_VIEW event accepted');
check(
  validIngest.visitorId === anonVisitorId && validIngest.sessionId === anonSessionId,
  'INGEST.2',
  'First-party visitorId and sessionId preserved on ingestion'
);

// Deduplication check
const dupIngest = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'evt-unique-001',
  },
  null,
  '203.0.113.42'
);
check(
  dupIngest.accepted === true && dupIngest.deduplicated === true,
  'INGEST.3',
  'Duplicate (sessionId, clientEventId) event is idempotently deduplicated'
);

// Reject invalid event type
const invalidTypeIngest = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'DROP_TABLE_USERS',
    pagePath: '/',
  },
  null
);
check(
  invalidTypeIngest.accepted === false && Boolean(invalidTypeIngest.error),
  'VALID.1',
  'Unrecognized telemetry eventType is rejected'
);

// Reject invalid areaBasis
const invalidAreaBasis = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    areaBasis: 'MIXED_AVERAGE_AREA',
  },
  null
);
check(
  invalidAreaBasis.accepted === false,
  'VALID.2',
  'Invalid areaBasis is rejected to preserve CARPET / BUILT_UP / SUPER_BUILT_UP separation'
);

// Reject oversized metadata (> 2048 bytes)
const oversizedMeta = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'PAGE_VIEW',
    pagePath: '/',
    metadata: { largeBlob: 'x'.repeat(2500) },
  },
  null
);
check(
  oversizedMeta.accepted === false && oversizedMeta.error?.includes('2048'),
  'VALID.3',
  'Oversized event metadata (> 2048 bytes) is rejected'
);

// Strip sensitive keys from metadata
const sensitiveMetaIngest = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'SEARCH_EXECUTED',
    pagePath: '/projects',
    clientEventId: 'evt-sensitive-test',
    metadata: {
      query: 'Rajarhat 3 BHK',
      otp: '1234',
      passwordHash: 'secret-hash',
      sessionToken: 'secret-token',
    },
  },
  null
);
const storedEvents = await visitorIntelligenceRepository.listEvents({
  visitorId: anonVisitorId,
});
const searchEv = storedEvents.find((e) => e.clientEventId === 'evt-sensitive-test');
check(
  sensitiveMetaIngest.accepted === true &&
    searchEv &&
    searchEv.metadata.query === 'Rajarhat 3 BHK' &&
    !('otp' in searchEv.metadata) &&
    !('passwordHash' in searchEv.metadata) &&
    !('sessionToken' in searchEv.metadata),
  'VALID.4',
  'Sensitive keys (otp, passwordHash, sessionToken) are stripped before storage'
);

// 3. Opt-out / DNT / GPC handling
const gpcReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: {
    'sec-gpc': '1',
    cookie: `gh_visitor_id=${anonVisitorId}; gh_session_id=${anonSessionId}`,
  },
});
const gpcResult = await customerIntelligenceService.ingestEvent(gpcReq, {
  eventType: 'PAGE_VIEW',
  pagePath: '/projects',
});
check(
  gpcResult.accepted === false && gpcResult.optedOut === true,
  'PRIVACY.1',
  'Global Privacy Control (Sec-GPC: 1) header suppresses behavioral tracking'
);

const optOutCookieReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: {
    cookie: `gh_visitor_id=${anonVisitorId}; gh_telemetry_opt_out=1`,
  },
});
const optOutCookieResult = await customerIntelligenceService.ingestEvent(optOutCookieReq, {
  eventType: 'PAGE_VIEW',
  pagePath: '/projects',
});
check(
  optOutCookieResult.accepted === false && optOutCookieResult.optedOut === true,
  'PRIVACY.2',
  'First-party opt-out cookie (gh_telemetry_opt_out=1) suppresses behavioral tracking'
);

// 4. OTP Identity Linking & Shared-Device Cross-Customer Isolation
const customerA = await customerRepository.create({
  name: 'Customer A (Debashis)',
  email: 'debashis.a@example.com',
  phone: '+919830990011',
  passwordHash: 'otp-only',
  status: 'ACTIVE',
});

const linkAResult = await customerIntelligenceService.handleCustomerAuthenticated({
  req: mockReq,
  customerId: customerA.id,
  isNewProfile: false,
  ipAddress: '203.0.113.42',
});

check(
  linkAResult.visitorId === anonVisitorId &&
    linkAResult.cookiesRotated === false &&
    linkAResult.backfilledEvents >= 2,
  'LINK.1',
  `Anonymous visitor (${anonVisitorId}) linked to Customer A on OTP verification with ${linkAResult.backfilledEvents} prior events backfilled`
);

const customerARecent = await recentlyViewedRepository.listByCustomer(customerA.id, 10);
check(
  customerARecent.some((r) => r.resourceId === 'proj-merlin-test'),
  'LINK.2',
  'Prior anonymous PROJECT_VIEW automatically synced into Customer A recently_viewed history upon OTP verification'
);

// Now simulate Customer B logging in on the SAME shared browser that still has Customer A's gh_visitor_id cookie!
const customerB = await customerRepository.create({
  name: 'Customer B (Ritu)',
  email: 'ritu.b@example.com',
  phone: '+919830990022',
  passwordHash: 'otp-only',
  status: 'ACTIVE',
});

const linkBResult = await customerIntelligenceService.handleCustomerAuthenticated({
  req: mockReq, // Still carries Customer A's gh_visitor_id!
  customerId: customerB.id,
  isNewProfile: true,
  ipAddress: '203.0.113.42',
});

check(
  linkBResult.cookiesRotated === true &&
    linkBResult.visitorId !== anonVisitorId &&
    linkBResult.backfilledEvents === 0,
  'SHARED_DEVICE.1',
  'When Customer B authenticates on a browser with Customer A visitor cookie, visitorId/sessionId are rotated and Customer A history is NEVER merged into Customer B'
);

const visitorRecordAfterB = await visitorIntelligenceRepository.findVisitorById(anonVisitorId);
check(
  visitorRecordAfterB?.customerId === customerA.id,
  'SHARED_DEVICE.2',
  'Original visitor record remains linked exclusively to Customer A'
);

// 5. Enquiry Association & Separation of Unverified Phone-Match Candidates
// Seeded customer Rahul Sharma (+919876543210) has an unauthenticated historical enquiry from seed.ts
const rahul = await customerRepository.findByPhone('+919876543210');
check(Boolean(rahul), 'ENQ.1', 'Seeded OTP customer Rahul Sharma (+919876543210) resolved by phone');

// Check Rahul's self-service /account/enquiries before he submits a verified session enquiry
const rahulSelfServiceBefore = await enquiryService.getCustomerEnquiries(rahul.id);
check(
  rahulSelfServiceBefore.length === 0,
  'ENQ.2',
  'Unverified historical phone-matched enquiry is NOT exposed in customer self-service /account/enquiries'
);

// Now Rahul submits an enquiry during an authenticated session
const rahulVerifiedEnq = await enquiryService.submitEnquiry({
  contextType: 'PROJECT',
  projectSlug: 'merlin-rise',
  name: rahul.name,
  phone: rahul.phone,
  email: rahul.email,
  preferredContact: 'WHATSAPP',
  requestSiteVisit: false,
  message: 'Verified session enquiry from Rahul.',
  customerId: rahul.id,
  visitorId: 'vis-rahul-verified',
  sessionId: 'sess-rahul-verified',
});
check(rahulVerifiedEnq.success === true, 'ENQ.3', 'Verified customer enquiry created with customerId and visitorId');

const rahulSelfServiceAfter = await enquiryService.getCustomerEnquiries(rahul.id);
check(
  rahulSelfServiceAfter.length === 1 && rahulSelfServiceAfter[0].id === rahulVerifiedEnq.enquiryId,
  'ENQ.4',
  'Self-service /account/enquiries returns ONLY the verified session enquiry (1), excluding unverified phone-match candidates'
);

// Inspect Rahul's Customer 360 profile as Admin
const rahul360 = await customerIntelligenceService.getCustomer360(rahul.id, {
  staffId: 'admin-1',
  role: 'SUPER_ADMIN',
  canViewPii: true,
});
check(
  rahul360.verifiedEnquiries.length === 1 &&
    rahul360.phoneMatchedEnquiryCandidates.length >= 1,
  'ENQ.5',
  `Admin Customer 360 separates verified enquiries (${rahul360.verifiedEnquiries.length}) from phone-matched historical candidates (${rahul360.phoneMatchedEnquiryCandidates.length})`
);

// 6. Area-Basis Separation & Factual Evidence Indicators on Arjun Chatterjee's 360 Profile
const arjun = await customerRepository.findByEmail('arjun.chatterjee@example.com');
const arjun360Full = await customerIntelligenceService.getCustomer360(arjun.id, {
  staffId: 'sales-1',
  role: 'SALES',
  canViewPii: hasCapability('SALES', 'customer_intelligence.pii'),
});

const areaBases = arjun360Full.intent.observedSignals.areaBasisBreakdown.map((b) => b.areaBasis);
check(
  areaBases.includes('CARPET') && areaBases.includes('SUPER_BUILT_UP'),
  'AREA.1',
  `Customer 360 preserves CARPET and SUPER_BUILT_UP area bases separately (${areaBases.join(', ')})`
);
check(
  arjun360Full.intent.evidenceIndicators.some((i) => i.code === 'SITE_VISIT_REQUESTED') &&
    arjun360Full.intent.evidenceIndicators.some((i) => i.code === 'REPEATED_VIEWS'),
  'INTENT.1',
  'Customer 360 generates transparent, factual evidence indicators (Site visit requested, Repeated property views)'
);
check(
  arjun360Full.customer.piiRedacted === false && arjun360Full.customer.phone === '+919830551122',
  'RBAC.1',
  'SALES role with customer_intelligence.pii receives unmasked phone & email for follow-up'
);

// 7. Staff Role Definitions, Least-Privilege Customer 360 Access & Comprehensive Non-PII Masking
check(
  hasCapability('SUPER_ADMIN', 'customer_intelligence.read') === true &&
    hasCapability('SUPER_ADMIN', 'customer_intelligence.pii') === true &&
    hasCapability('ADMIN', 'customer_intelligence.read') === true &&
    hasCapability('ADMIN', 'customer_intelligence.pii') === true &&
    hasCapability('SALES', 'customer_intelligence.read') === true &&
    hasCapability('SALES', 'customer_intelligence.pii') === true &&
    hasCapability('ANALYST', 'customer_intelligence.read') === true &&
    hasCapability('ANALYST', 'customer_intelligence.pii') === false &&
    hasCapability('CONTENT_MANAGER', 'customer_intelligence.read') === false &&
    hasCapability('CONTENT_MANAGER', 'customer_intelligence.pii') === false &&
    hasCapability('PROPERTY_MANAGER', 'customer_intelligence.read') === false &&
    hasCapability('PROPERTY_MANAGER', 'customer_intelligence.pii') === false,
  'RBAC.2',
  'All 6 staff roles (SUPER_ADMIN, ADMIN, SALES, ANALYST, CONTENT_MANAGER, PROPERTY_MANAGER) enforce least-privilege Customer 360 & PII capabilities'
);

const canAnalystViewPii = hasCapability('ANALYST', 'customer_intelligence.pii');
const arjun360Redacted = await customerIntelligenceService.getCustomer360(arjun.id, {
  staffId: 'analyst-1',
  role: 'ANALYST',
  canViewPii: canAnalystViewPii,
});
check(
  canAnalystViewPii === false &&
    arjun360Redacted.customer.piiRedacted === true &&
    arjun360Redacted.customer.name !== arjun.name &&
    arjun360Redacted.customer.name.includes('•') &&
    arjun360Redacted.customer.phone.includes('•••••') &&
    arjun360Redacted.customer.email.includes('•••') &&
    arjun360Redacted.verifiedEnquiries.every((e) => e.message === '[Redacted — requires PII access]') &&
    arjun360Redacted.phoneMatchedEnquiryCandidates.every((e) => e.message === '[Redacted — requires PII access]'),
  'RBAC.3',
  `ANALYST role without customer_intelligence.pii receives masked name (${arjun360Redacted.customer.name}), phone (${arjun360Redacted.customer.phone}), email (${arjun360Redacted.customer.email}), and redacted enquiry messages`
);

// 8. PII Search-Oracle Prevention for Non-PII Staff
const salesPhoneSearch = await customerIntelligenceService.listCustomers(
  { search: '+919830551122' },
  { staffId: 'sales-1', role: 'SALES', canViewPii: true }
);
const analystPhoneSearch = await customerIntelligenceService.listCustomers(
  { search: '+919830551122' },
  { staffId: 'analyst-1', role: 'ANALYST', canViewPii: false }
);
const analystEmailSearch = await customerIntelligenceService.listCustomers(
  { search: 'arjun.chatterjee@example.com' },
  { staffId: 'analyst-1', role: 'ANALYST', canViewPii: false }
);
const analystNameSearch = await customerIntelligenceService.listCustomers(
  { search: 'Arjun Chatterjee' },
  { staffId: 'analyst-1', role: 'ANALYST', canViewPii: false }
);
const analystIdSearch = await customerIntelligenceService.listCustomers(
  { search: arjun.id },
  { staffId: 'analyst-1', role: 'ANALYST', canViewPii: false }
);
check(
  salesPhoneSearch.total === 1 &&
    analystPhoneSearch.total === 0 &&
    analystEmailSearch.total === 0 &&
    analystNameSearch.total === 0 &&
    analystIdSearch.total === 1 &&
    analystIdSearch.items[0].name.includes('•') &&
    analystIdSearch.items[0].phone.includes('•••••'),
  'ORACLE.1',
  'Non-PII staff (ANALYST) cannot use search as a PII oracle for phone/email/name (0 matches), while ID search works and masks PII'
);

// 9. Recursive Nested Metadata Sanitization & Value Redaction
const nestedSensitiveIngest = await customerIntelligenceService.ingestEvent(
  mockReq,
  {
    eventType: 'SEARCH_EXECUTED',
    pagePath: '/projects',
    clientEventId: 'evt-nested-sanitization-001',
    metadata: {
      query: 'Contact me at buyer.secret@example.com or +919830112233',
      nestedFilter: {
        location: 'New Town',
        otp: '998877',
        buyerPhone: '+919830112233',
        deepArray: [
          {
            label: 'Valid Filter',
            sessionToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
            contactNote: 'Reachable at +91 98301 12233 or test@domain.in',
          },
        ],
      },
    },
  },
  null
);
const nestedEvents = await visitorIntelligenceRepository.listEvents({
  sessionId: nestedSensitiveIngest.sessionId,
});
const nestedEv = nestedEvents.find((e) => e.clientEventId === 'evt-nested-sanitization-001');
check(
  nestedSensitiveIngest.accepted === true &&
    nestedEv &&
    nestedEv.metadata.query.includes('[REDACTED_EMAIL]') &&
    nestedEv.metadata.query.includes('[REDACTED_PHONE]') &&
    nestedEv.metadata.nestedFilter?.location === 'New Town' &&
    !('otp' in (nestedEv.metadata.nestedFilter || {})) &&
    !('buyerPhone' in (nestedEv.metadata.nestedFilter || {})) &&
    nestedEv.metadata.nestedFilter?.deepArray?.[0]?.label === 'Valid Filter' &&
    !('sessionToken' in (nestedEv.metadata.nestedFilter?.deepArray?.[0] || {})) &&
    nestedEv.metadata.nestedFilter?.deepArray?.[0]?.contactNote?.includes('[REDACTED_PHONE]') &&
    nestedEv.metadata.nestedFilter?.deepArray?.[0]?.contactNote?.includes('[REDACTED_EMAIL]'),
  'SANITIZE.1',
  'Nested objects and arrays in event metadata are recursively sanitized of forbidden keys and sensitive string values (emails/phones/tokens)'
);

// Overview search query redaction check for non-PII staff
const overviewNonPii = await customerIntelligenceService.getOverview({ canViewPii: false });
const hasUnredactedPiiInOverview = overviewNonPii.topSearchFilters.some(
  (f) => f.label.includes('buyer.secret@example.com') || f.label.includes('9830112233')
);
check(
  hasUnredactedPiiInOverview === false,
  'RBAC.4',
  'Overview topSearchFilters masks/redacts any sensitive string patterns for non-PII staff'
);

// 10. Duplicate Event Counter Stability (Deduplicated Events Must Not Increment Counters)
const counterVisitorId = '11111111-2222-4333-8444-555555555555';
const counterSessionId = '66666666-7777-4888-9999-000000000000';
const counterReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    cookie: `gh_visitor_id=${counterVisitorId}; gh_session_id=${counterSessionId}`,
  },
});

await customerIntelligenceService.ingestEvent(
  counterReq,
  {
    eventType: 'PAGE_VIEW',
    pagePath: '/projects',
    clientEventId: 'counter-evt-1',
  },
  null
);
const visBeforeDup = await visitorIntelligenceRepository.findVisitorById(counterVisitorId);
const sessBeforeDup = await visitorIntelligenceRepository.findSessionById(counterSessionId);

// Replay identical clientEventId twice
await customerIntelligenceService.ingestEvent(
  counterReq,
  {
    eventType: 'PAGE_VIEW',
    pagePath: '/projects',
    clientEventId: 'counter-evt-1',
  },
  null
);
await customerIntelligenceService.ingestEvent(
  counterReq,
  {
    eventType: 'PAGE_VIEW',
    pagePath: '/projects',
    clientEventId: 'counter-evt-1',
  },
  null
);

const visAfterDup = await visitorIntelligenceRepository.findVisitorById(counterVisitorId);
const sessAfterDup = await visitorIntelligenceRepository.findSessionById(counterSessionId);
check(
  visBeforeDup.sessionCount === 1 &&
    visAfterDup.sessionCount === 1 &&
    sessBeforeDup.eventCount === 1 &&
    sessAfterDup.eventCount === 1 &&
    sessAfterDup.pageViewCount === 1,
  'DEDUP.1',
  'Deduplicated events do NOT increment visitor sessionCount or session eventCount/pageViewCount'
);

// 11. Prevent Unauthenticated Visitor/Session ID Spoofing & Enquiry-Attribution Poisoning
// anonVisitorId is linked to customerA. An unauthenticated caller attempts to replay anonVisitorId on ingestEvent and enquiry submission:
const spoofIngest = await customerIntelligenceService.ingestEvent(
  mockReq, // carries Customer A's linked anonVisitorId & anonSessionId, but authenticatedCustomerId = null
  {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/spoofed-view',
    entityType: 'PROJECT',
    entityId: 'proj-spoofed-999',
    clientEventId: 'evt-spoof-attempt-1',
  },
  null
);
const customerAEventsAfterSpoof = await visitorIntelligenceRepository.listEvents({
  customerId: customerA.id,
});
check(
  spoofIngest.accepted === true &&
    spoofIngest.visitorId !== anonVisitorId &&
    spoofIngest.sessionId !== anonSessionId &&
    !customerAEventsAfterSpoof.some((e) => e.entityId === 'proj-spoofed-999'),
  'SPOOF.1',
  'Unauthenticated telemetry request carrying a customer-linked visitorId/sessionId rotates IDs and never attaches events to the linked customer'
);

const safeEnqAttr = await customerIntelligenceService.resolveSafeEnquiryAttribution({
  visitorId: anonVisitorId,
  sessionId: anonSessionId,
  authenticatedCustomerId: null,
});
check(
  safeEnqAttr.rotated === true &&
    safeEnqAttr.visitorId !== anonVisitorId &&
    safeEnqAttr.sessionId !== anonSessionId,
  'SPOOF.2',
  'Unauthenticated enquiry submission carrying a customer-linked visitorId/sessionId rotates attribution IDs before persistence (preventing Customer 360 enquiry poisoning)'
);

// Verify via POST /api/enquiries route handler that an unauthenticated request with Customer A's visitorId does not poison Customer A's 360 enquiries
const { POST: postEnquiryRoute } = await import('../app/api/enquiries/route.ts');
const { NextRequest } = await import('next/server');
const spoofEnqReq = new NextRequest('https://greathomes.co.in/api/enquiries', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: `gh_visitor_id=${anonVisitorId}; gh_session_id=${anonSessionId}`,
  },
  body: JSON.stringify({
    contextType: 'GENERAL',
    name: 'Anonymous Stranger',
    phone: '+919800001111',
    email: 'stranger@example.com',
    preferredContact: 'PHONE',
    requestSiteVisit: false,
    message: 'Unauthenticated enquiry on shared computer',
  }),
});
const spoofEnqRes = await postEnquiryRoute(spoofEnqReq);
const spoofEnqJson = await spoofEnqRes.json();
const customerA360AfterSpoofEnq = await customerIntelligenceService.getCustomer360(customerA.id, {
  staffId: 'admin-1',
  role: 'SUPER_ADMIN',
  canViewPii: true,
});
check(
  spoofEnqRes.status === 201 &&
    spoofEnqJson.success === true &&
    !customerA360AfterSpoofEnq.verifiedEnquiries.some((e) => e.id === spoofEnqJson.enquiryId),
  'SPOOF.3',
  'POST /api/enquiries with unauthenticated customer-linked cookie rotates visitorId and never links stranger enquiry to Customer A 360 profile'
);

// 12. Server-Side Authorization & Complete Audit Logging Across All 5 Admin Customer 360 Endpoints
const { staffRepository } = await import('../src/domain/auth/repositories/staffRepository.ts');
const { createStaffSessionToken, STAFF_SESSION_COOKIE } = await import(
  '../src/domain/auth/authorizationBoundary.ts'
);
const { GET: getOverviewRoute } = await import(
  '../app/api/admin/customer-intelligence/overview/route.ts'
);
const { GET: getCustomersRoute } = await import(
  '../app/api/admin/customer-intelligence/customers/route.ts'
);
const { GET: getCustomerDetailRoute } = await import(
  '../app/api/admin/customer-intelligence/customers/[id]/route.ts'
);
const { GET: getVisitorsRoute } = await import(
  '../app/api/admin/customer-intelligence/visitors/route.ts'
);
const { GET: getVisitorDetailRoute } = await import(
  '../app/api/admin/customer-intelligence/visitors/[id]/route.ts'
);

const staffUsersForTest = {
  superAdmin: await staffRepository.create({
    id: 'staff-test-super-admin',
    email: 'superadmin.test@greathomes.co.in',
    name: 'Test Super Admin',
    role: 'SUPER_ADMIN',
    enabled: true,
    sessionVersion: 0,
  }),
  sales: await staffRepository.create({
    id: 'staff-test-sales',
    email: 'sales.test@greathomes.co.in',
    name: 'Test Sales',
    role: 'SALES',
    enabled: true,
    sessionVersion: 0,
  }),
  analyst: await staffRepository.create({
    id: 'staff-test-analyst',
    email: 'analyst.test@greathomes.co.in',
    name: 'Test Analyst',
    role: 'ANALYST',
    enabled: true,
    sessionVersion: 0,
  }),
  contentMgr: await staffRepository.create({
    id: 'staff-test-cm',
    email: 'cm.test@greathomes.co.in',
    name: 'Test Content Manager',
    role: 'CONTENT_MANAGER',
    enabled: true,
    sessionVersion: 0,
  }),
  propMgr: await staffRepository.create({
    id: 'staff-test-pm',
    email: 'pm.test@greathomes.co.in',
    name: 'Test Property Manager',
    role: 'PROPERTY_MANAGER',
    enabled: true,
    sessionVersion: 0,
  }),
};

function makeAdminRequest(url, staffUser = null) {
  const headers = {};
  if (staffUser) {
    const token = createStaffSessionToken(staffUser.id, staffUser.sessionVersion ?? 0);
    headers.cookie = `${STAFF_SESSION_COOKIE}=${token}`;
  }
  return new NextRequest(url, { headers });
}

// 12a. Unauthenticated requests -> 401
const unauthOverview = await getOverviewRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/overview')
);
const unauthCustomers = await getCustomersRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/customers')
);
const unauthCustomerDetail = await getCustomerDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/customers/${arjun.id}`),
  { params: Promise.resolve({ id: arjun.id }) }
);
const unauthVisitors = await getVisitorsRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/visitors')
);
const unauthVisitorDetail = await getVisitorDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/visitors/${anonVisitorId}`),
  { params: Promise.resolve({ id: anonVisitorId }) }
);
check(
  unauthOverview.status === 401 &&
    unauthCustomers.status === 401 &&
    unauthCustomerDetail.status === 401 &&
    unauthVisitors.status === 401 &&
    unauthVisitorDetail.status === 401,
  'AUTHZ.1',
  'All 5 Customer 360 admin endpoints reject unauthenticated requests with HTTP 401'
);

// 12b. CONTENT_MANAGER and PROPERTY_MANAGER -> 403 Forbidden
const cmOverview = await getOverviewRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/overview', staffUsersForTest.contentMgr)
);
const pmCustomers = await getCustomersRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/customers', staffUsersForTest.propMgr)
);
const cmCustomerDetail = await getCustomerDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/customers/${arjun.id}`, staffUsersForTest.contentMgr),
  { params: Promise.resolve({ id: arjun.id }) }
);
const pmVisitors = await getVisitorsRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/visitors', staffUsersForTest.propMgr)
);
const cmVisitorDetail = await getVisitorDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/visitors/${anonVisitorId}`, staffUsersForTest.contentMgr),
  { params: Promise.resolve({ id: anonVisitorId }) }
);
check(
  cmOverview.status === 403 &&
    pmCustomers.status === 403 &&
    cmCustomerDetail.status === 403 &&
    pmVisitors.status === 403 &&
    cmVisitorDetail.status === 403,
  'AUTHZ.2',
  'CONTENT_MANAGER and PROPERTY_MANAGER are denied access (HTTP 403) across all 5 Customer 360 endpoints'
);

// 12c. ANALYST role -> 200 OK with masked PII + Audit Logs persisted across all 5 endpoints
const analystOverviewRes = await getOverviewRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/overview', staffUsersForTest.analyst)
);
const analystCustomersRes = await getCustomersRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/customers?search=Arjun', staffUsersForTest.analyst)
);
const analystCustomerDetailRes = await getCustomerDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/customers/${arjun.id}`, staffUsersForTest.analyst),
  { params: Promise.resolve({ id: arjun.id }) }
);
const analystVisitorsRes = await getVisitorsRoute(
  makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/visitors', staffUsersForTest.analyst)
);
const analystVisitorDetailRes = await getVisitorDetailRoute(
  makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/visitors/${anonVisitorId}`, staffUsersForTest.analyst),
  { params: Promise.resolve({ id: anonVisitorId }) }
);

const analystCustomerDetailJson = await analystCustomerDetailRes.json();
const analystVisitorDetailJson = await analystVisitorDetailRes.json();

check(
  analystOverviewRes.status === 200 &&
    analystCustomersRes.status === 200 &&
    analystCustomerDetailRes.status === 200 &&
    analystVisitorsRes.status === 200 &&
    analystVisitorDetailRes.status === 200 &&
    analystCustomerDetailJson.canViewPii === false &&
    analystCustomerDetailJson.data.customer.name.includes('•') &&
    analystCustomerDetailJson.data.customer.phone.includes('•••••') &&
    analystVisitorDetailJson.data.linkedCustomer.name.includes('•') &&
    analystVisitorDetailJson.data.linkedCustomer.phoneMasked.includes('•••••'),
  'AUTHZ.3',
  'ANALYST role receives HTTP 200 with consistently masked customer name, phone, email, and metadata across Customer & Visitor 360 endpoints'
);

// Verify all 5 endpoint calls persisted audit logs for staff-test-analyst
const analystAudits = await auditService.list({
  actorStaffId: staffUsersForTest.analyst.id,
  pageSize: 50,
});
const auditedResourceIds = new Set(analystAudits.items.map((a) => a.resourceId));
check(
  analystAudits.total >= 5 &&
    auditedResourceIds.has('overview') &&
    auditedResourceIds.has('directory') &&
    auditedResourceIds.has(arjun.id) &&
    auditedResourceIds.has('visitors_list') &&
    auditedResourceIds.has(anonVisitorId),
  'AUDIT.1',
  'All 5 Customer & Visitor 360 endpoints synchronously persist CUSTOMER_INTELLIGENCE_VIEWED audit records'
);

// 13. Schema Initialization Failure Recovery & Production Fallback Prevention
const {
  ensureSchemaUpdates,
  resetSchemaInitializationStateForTesting,
  isPostgresRequired,
  getDb,
} = await import('../src/db/client.ts');

let shouldFailSchemaRun = true;
const failingMockDb = {
  execute: async () => {
    if (shouldFailSchemaRun) {
      throw new Error('Simulated transient PostgreSQL DDL lock timeout');
    }
    return [];
  },
};

resetSchemaInitializationStateForTesting();
let caughtTransientFailure = false;
try {
  await ensureSchemaUpdates(failingMockDb);
} catch {
  caughtTransientFailure = true;
}

// Subsequent call must retry and succeed instead of latching a broken schemaUpdated=true state
shouldFailSchemaRun = false;
let retrySucceeded = false;
try {
  await ensureSchemaUpdates(failingMockDb);
  retrySucceeded = true;
} catch {
  retrySucceeded = false;
}
resetSchemaInitializationStateForTesting();

check(
  caughtTransientFailure === true && retrySucceeded === true,
  'DB_INIT.1',
  'ensureSchemaUpdates() propagates DDL errors instead of latching schemaUpdated=true, and retries cleanly on subsequent requests'
);

// Verify production mode rejects missing DATABASE_URL instead of silently falling back to memory mode
const prevNodeEnv = process.env.NODE_ENV;
const prevProvider = process.env.PERSISTENCE_PROVIDER;
const prevDbUrl = process.env.DATABASE_URL;
let prodThrewWithoutDbUrl = false;
try {
  process.env.NODE_ENV = 'production';
  delete process.env.PERSISTENCE_PROVIDER;
  delete process.env.DATABASE_URL;
  if (isPostgresRequired()) {
    getDb();
  }
} catch (err) {
  prodThrewWithoutDbUrl = err.message.includes('DATABASE_URL is required');
} finally {
  process.env.NODE_ENV = prevNodeEnv;
  process.env.PERSISTENCE_PROVIDER = prevProvider;
  if (prevDbUrl !== undefined) {
    process.env.DATABASE_URL = prevDbUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
}
check(
  prodThrewWithoutDbUrl === true,
  'DB_INIT.2',
  'Production environment without DATABASE_URL throws a fatal configuration error instead of silently activating memory mode'
);

// 14. Privacy Opt-Out Anonymous Cleanup & Retention Cleanup Policy
const { POST: postTelemetryRoute } = await import('../app/api/telemetry/events/route.ts');
const optOutTestVisitorId = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
const optOutTestSessionId = 'cccccccc-dddd-4eee-8fff-111111111111';

// Ingest anonymous event for optOutTestVisitorId
const optOutSeedReq = new NextRequest('https://greathomes.co.in/api/telemetry/events', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: `gh_visitor_id=${optOutTestVisitorId}; gh_session_id=${optOutTestSessionId}`,
  },
  body: JSON.stringify({
    eventType: 'PAGE_VIEW',
    pagePath: '/projects',
    clientEventId: 'evt-before-opt-out',
  }),
});
await postTelemetryRoute(optOutSeedReq);
const visitorBeforeOptOut = await visitorIntelligenceRepository.findVisitorById(optOutTestVisitorId);

// Now visitor exercises SET_OPT_OUT via POST /api/telemetry/events
const setOptOutReq = new NextRequest('https://greathomes.co.in/api/telemetry/events', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: `gh_visitor_id=${optOutTestVisitorId}; gh_session_id=${optOutTestSessionId}`,
  },
  body: JSON.stringify({
    action: 'SET_OPT_OUT',
    optOut: true,
  }),
});
const setOptOutRes = await postTelemetryRoute(setOptOutReq);
const setOptOutJson = await setOptOutRes.json();
const visitorAfterOptOut = await visitorIntelligenceRepository.findVisitorById(optOutTestVisitorId);
const eventsAfterOptOut = await visitorIntelligenceRepository.listEvents({
  visitorId: optOutTestVisitorId,
});

// Also verify that calling anonymizeOrDeleteUnlinkedVisitor on a customer-linked visitor does NOT delete customer-linked history
const linkedCustomerPurgeAttempt = await visitorIntelligenceRepository.anonymizeOrDeleteUnlinkedVisitor(
  anonVisitorId
);
const linkedVisitorStillExists = await visitorIntelligenceRepository.findVisitorById(anonVisitorId);

check(
  Boolean(visitorBeforeOptOut) &&
    setOptOutJson.accepted === true &&
    setOptOutJson.optedOut === true &&
    setOptOutJson.anonymousRecordsPurged === true &&
    visitorAfterOptOut === null &&
    eventsAfterOptOut.length === 0 &&
    linkedCustomerPurgeAttempt.deleted === false &&
    Boolean(linkedVisitorStillExists),
  'PRIVACY.3',
  'Opt-out (SET_OPT_OUT) purges previously collected unlinked anonymous visitor/session/event records while preserving OTP-verified customer-linked records'
);

// Retention cleanup test: create an expired unlinked anonymous visitor (> 90 days old) and verify purgeExpiredAnonymousTelemetry(90) removes it while keeping active & customer-linked visitors
const expiredAnonId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
await visitorIntelligenceRepository.upsertVisitor({
  id: expiredAnonId,
  customerId: null,
});
// Backdate lastSeenAt in memory store to 120 days ago
const expiredVisitorRef = await visitorIntelligenceRepository.findVisitorById(expiredAnonId);
if (expiredVisitorRef) {
  const memStore = globalThis.__ghVisitorIntelStore;
  const storedVis = memStore?.visitors?.get(expiredAnonId);
  if (storedVis) {
    storedVis.lastSeenAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  }
}
const retentionResult = await visitorIntelligenceRepository.purgeExpiredAnonymousTelemetry(90);
const expiredVisitorAfterPurge = await visitorIntelligenceRepository.findVisitorById(expiredAnonId);
const activeLinkedVisitorAfterPurge = await visitorIntelligenceRepository.findVisitorById(anonVisitorId);
check(
  retentionResult.deletedVisitors >= 1 &&
    expiredVisitorAfterPurge === null &&
    Boolean(activeLinkedVisitorAfterPurge),
  'PRIVACY.4',
  'Retention cleanup (purgeExpiredAnonymousTelemetry) deletes expired unlinked anonymous records older than 90 days without affecting active or customer-linked records'
);

// 15. Customer Deletion Cascade / Unlink in Memory Mode
const tempCust = await customerRepository.create({
  name: 'Temp Delete Customer',
  email: 'temp.delete@example.com',
  phone: '+919830009999',
  passwordHash: 'otp-only',
  status: 'ACTIVE',
});
await savedItemRepository.create({
  customerId: tempCust.id,
  resourceType: 'PROJECT',
  resourceId: 'proj-merlin-test',
});
await visitorIntelligenceRepository.upsertVisitor({
  id: 'vis-temp-delete',
  customerId: tempCust.id,
});
await customerRepository.delete(tempCust.id);
const savedAfterDelete = await savedItemRepository.listByCustomer(tempCust.id);
const visitorAfterDelete = await visitorIntelligenceRepository.findVisitorById('vis-temp-delete');
check(
  savedAfterDelete.length === 0 && visitorAfterDelete?.customerId === null,
  'DELETE.1',
  'Deleting a customer in memory mode cascades to saved items and unlinks visitor records (SET NULL)'
);

// 16. PostgreSQL Migration Readiness Audit Remediation Tests

// 16a. Enquiry submission with previously unpersisted visitor and session IDs
const unpersistedVisId = 'vis-unpersisted-enq-001';
const unpersistedSessId = 'sess-unpersisted-enq-001';
const preEnqVis = await visitorIntelligenceRepository.findVisitorById(unpersistedVisId);
const preEnqSess = await visitorIntelligenceRepository.findSessionById(unpersistedSessId);

const unpersistedEnqReq = new NextRequest('https://greathomes.co.in/api/enquiries', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: `gh_visitor_id=${unpersistedVisId}; gh_session_id=${unpersistedSessId}`,
  },
  body: JSON.stringify({
    contextType: 'GENERAL',
    name: 'First-Time Cookie Visitor',
    phone: '+919830123450',
    email: 'firstcookie@example.com',
    preferredContact: 'PHONE',
    requestSiteVisit: false,
    message: 'Enquiry before any telemetry event persisted the visitor/session cookies.',
  }),
});
const unpersistedEnqRes = await postEnquiryRoute(unpersistedEnqReq);
const unpersistedEnqJson = await unpersistedEnqRes.json();
const postEnqVis = await visitorIntelligenceRepository.findVisitorById(unpersistedVisId);
const postEnqSess = await visitorIntelligenceRepository.findSessionById(unpersistedSessId);
const createdUnpersistedEnq = await enquiryRepository.findById(unpersistedEnqJson.enquiryId);

check(
  preEnqVis === null &&
    preEnqSess === null &&
    unpersistedEnqRes.status === 201 &&
    Boolean(postEnqVis) &&
    Boolean(postEnqSess) &&
    createdUnpersistedEnq?.visitorId === unpersistedVisId &&
    createdUnpersistedEnq?.sessionId === unpersistedSessId,
  'ENQ_FK.1',
  'Enquiry submission with previously unpersisted visitorId and sessionId creates parent visitor & session rows before inserting enquiry'
);

// 16b. Enquiry submission after visitor attribution rotation persists the rotated visitor & session IDs
const rotatedEnqCheck = await enquiryRepository.findById(spoofEnqJson.enquiryId);
const rotatedVisitorRecord = rotatedEnqCheck?.visitorId
  ? await visitorIntelligenceRepository.findVisitorById(rotatedEnqCheck.visitorId)
  : null;
const rotatedSessionRecord = rotatedEnqCheck?.sessionId
  ? await visitorIntelligenceRepository.findSessionById(rotatedEnqCheck.sessionId)
  : null;

check(
  Boolean(rotatedEnqCheck?.visitorId) &&
    rotatedEnqCheck.visitorId !== anonVisitorId &&
    Boolean(rotatedVisitorRecord) &&
    Boolean(rotatedSessionRecord) &&
    rotatedVisitorRecord.customerId === null,
  'ENQ_FK.2',
  'Enquiry submission after visitor attribution rotation persists rotated visitorId and sessionId in parent tables before inserting enquiry'
);

// 16c. Attribution failure fallback clears visitorId/sessionId so enquiry still succeeds
const origUpsertVisitor = visitorIntelligenceRepository.upsertVisitor.bind(visitorIntelligenceRepository);
visitorIntelligenceRepository.upsertVisitor = async () => {
  throw new Error('Simulated DB error during attribution upsert');
};
let fallbackAttr;
try {
  fallbackAttr = await customerIntelligenceService.resolveSafeEnquiryAttribution({
    visitorId: 'vis-fail-attr',
    sessionId: 'sess-fail-attr',
    authenticatedCustomerId: null,
  });
} finally {
  visitorIntelligenceRepository.upsertVisitor = origUpsertVisitor;
}
check(
  fallbackAttr?.visitorId === null && fallbackAttr?.sessionId === null && fallbackAttr?.rotated === false,
  'ENQ_FK.3',
  'Database failure during attribution setup safely falls back to null visitorId/sessionId so enquiry submission remains valid'
);

// 16d. Event listing filtered by eventTypes when newer non-matching events exceed limit
const filterTestVisId = 'vis-event-filter-limit-001';
const filterTestSessId = 'sess-event-filter-limit-001';
const filterTestReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: {
    cookie: `gh_visitor_id=${filterTestVisId}; gh_session_id=${filterTestSessId}`,
  },
});

// Insert 1 older PROJECT_VIEW followed by 5 newer PAGE_VIEW events
await customerIntelligenceService.ingestEvent(filterTestReq, {
  eventType: 'PROJECT_VIEW',
  pagePath: '/projects/urbana',
  entityType: 'PROJECT',
  entityId: 'proj-urbana',
  clientEventId: 'filter-limit-proj-1',
});
for (let i = 1; i <= 5; i++) {
  await customerIntelligenceService.ingestEvent(filterTestReq, {
    eventType: 'PAGE_VIEW',
    pagePath: `/page-${i}`,
    clientEventId: `filter-limit-page-${i}`,
  });
}

const filteredProjectEvents = await visitorIntelligenceRepository.listEvents({
  visitorId: filterTestVisId,
  eventTypes: ['PROJECT_VIEW'],
  limit: 2,
});
check(
  filteredProjectEvents.length === 1 && filteredProjectEvents[0].eventType === 'PROJECT_VIEW',
  'EVENT_FILTER.1',
  'listEvents() applies eventTypes filtering before LIMIT/OFFSET so newer non-matching events do not truncate matching results'
);

// 16e. Concurrent initial PAGE_VIEW and SEARCH_EXECUTED events in a new session increment sessionCount once
const concVisId = 'vis-concurrent-session-001';
const concSess1 = 'sess-concurrent-session-001-initial';
const concSess2 = 'sess-concurrent-session-002-parallel';

const concReq1 = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: { cookie: `gh_visitor_id=${concVisId}; gh_session_id=${concSess1}` },
});
await customerIntelligenceService.ingestEvent(concReq1, {
  eventType: 'PAGE_VIEW',
  pagePath: '/',
  clientEventId: 'conc-s1-ev1',
});
const visAfterSess1 = await visitorIntelligenceRepository.findVisitorById(concVisId);

// Now fire PAGE_VIEW and SEARCH_EXECUTED concurrently on the new session concSess2
const concReq2 = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: { cookie: `gh_visitor_id=${concVisId}; gh_session_id=${concSess2}` },
});
await Promise.all([
  customerIntelligenceService.ingestEvent(concReq2, {
    eventType: 'PAGE_VIEW',
    pagePath: '/projects',
    clientEventId: 'conc-s2-pageview',
  }),
  customerIntelligenceService.ingestEvent(concReq2, {
    eventType: 'SEARCH_EXECUTED',
    pagePath: '/projects',
    clientEventId: 'conc-s2-search',
  }),
]);
const visAfterSess2 = await visitorIntelligenceRepository.findVisitorById(concVisId);
const sess2Record = await visitorIntelligenceRepository.findSessionById(concSess2);

check(
  visAfterSess1?.sessionCount === 1 &&
    visAfterSess2?.sessionCount === 2 &&
    sess2Record?.eventCount === 2 &&
    sess2Record?.pageViewCount === 1,
  'CONCURRENCY.1',
  `Concurrent initial PAGE_VIEW and SEARCH_EXECUTED in a new session increment visitor sessionCount once (1 -> ${visAfterSess2?.sessionCount}) and record both events`
);

// 16f. Concurrent duplicate event insertion (both with explicit clientEventId and 3-second deterministic fingerprint)
const dupConcVisId = 'vis-concurrent-dup-001';
const dupConcSessId = 'sess-concurrent-dup-001';
const dupConcReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: { cookie: `gh_visitor_id=${dupConcVisId}; gh_session_id=${dupConcSessId}` },
});

const [dupResA, dupResB] = await Promise.all([
  customerIntelligenceService.ingestEvent(dupConcReq, {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'conc-dup-explicit-1',
  }),
  customerIntelligenceService.ingestEvent(dupConcReq, {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'conc-dup-explicit-1',
  }),
]);

// Also test concurrent identical events WITHOUT clientEventId (relies on computeEffectiveClientEventId 3-second bucket hash)
const [autoDupA, autoDupB] = await Promise.all([
  customerIntelligenceService.ingestEvent(dupConcReq, {
    eventType: 'LOCATION_VIEW',
    pagePath: '/locations/new-town',
    entityType: 'LOCATION',
    entityId: 'loc-new-town',
  }),
  customerIntelligenceService.ingestEvent(dupConcReq, {
    eventType: 'LOCATION_VIEW',
    pagePath: '/locations/new-town',
    entityType: 'LOCATION',
    entityId: 'loc-new-town',
  }),
]);

const dupConcSessAfter = await visitorIntelligenceRepository.findSessionById(dupConcSessId);
const dupConcEvents = await visitorIntelligenceRepository.listEvents({
  sessionId: dupConcSessId,
});

check(
  Boolean(dupResA.deduplicated) !== Boolean(dupResB.deduplicated) &&
    Boolean(autoDupA.deduplicated) !== Boolean(autoDupB.deduplicated) &&
    dupConcEvents.length === 2 &&
    dupConcSessAfter?.eventCount === 2 &&
    dupConcEvents.every((e) => typeof e.clientEventId === 'string' && e.clientEventId.length > 0),
  'CONCURRENCY.2',
  'Concurrent duplicate event insertions (explicit clientEventId and 3s bucket fingerprint) insert 1 event each and increment counters once'
);

// 16g. Concurrent conflicting linkVisitorToCustomer calls
const raceLinkVisId = 'vis-concurrent-link-race-001';
await visitorIntelligenceRepository.upsertVisitor({
  id: raceLinkVisId,
  customerId: null,
});
const [raceLinkA, raceLinkB] = await Promise.all([
  visitorIntelligenceRepository.linkVisitorToCustomer(raceLinkVisId, customerA.id),
  visitorIntelligenceRepository.linkVisitorToCustomer(raceLinkVisId, customerB.id),
]);
const raceLinkedVisitor = await visitorIntelligenceRepository.findVisitorById(raceLinkVisId);
const exactlyOneLinked =
  (raceLinkA.linked === true &&
    raceLinkA.conflictDifferentCustomer === false &&
    raceLinkB.linked === false &&
    raceLinkB.conflictDifferentCustomer === true &&
    raceLinkedVisitor?.customerId === customerA.id) ||
  (raceLinkB.linked === true &&
    raceLinkB.conflictDifferentCustomer === false &&
    raceLinkA.linked === false &&
    raceLinkA.conflictDifferentCustomer === true &&
    raceLinkedVisitor?.customerId === customerB.id);

check(
  exactlyOneLinked,
  'CONCURRENCY.3',
  'Concurrent conflicting linkVisitorToCustomer calls allow at most one customer association to succeed'
);

// 16h. Anonymous deletion and bounded retention cleanup preserve enquiries and active visitors
const retExpiredVisId = 'vis-ret-expired-enq-001';
const retExpiredSessId = 'sess-ret-expired-enq-001';
const retActiveVisId = 'vis-ret-active-old-firstseen-001';

await visitorIntelligenceRepository.upsertVisitor({ id: retExpiredVisId, customerId: null });
await visitorIntelligenceRepository.upsertSession({
  id: retExpiredSessId,
  visitorId: retExpiredVisId,
  customerId: null,
});
const enqOnExpiredAnon = await enquiryRepository.create({
  contextType: 'GENERAL',
  customerId: null,
  visitorId: retExpiredVisId,
  sessionId: retExpiredSessId,
  buyerName: 'Expired Anon Buyer',
  buyerPhone: '+919830778899',
  buyerEmail: 'expired.anon@example.com',
  preferredContact: 'PHONE',
  requestSiteVisit: false,
  message: 'Enquiry linked to anonymous visitor that later expires',
  source: 'WEB_PORTAL',
});

// Create an active visitor whose firstSeenAt is 120 days ago, but lastSeenAt is today (must NOT be deleted!)
await visitorIntelligenceRepository.upsertVisitor({ id: retActiveVisId, customerId: null });
const memStoreForRet = globalThis.__ghVisitorIntelStore;
if (memStoreForRet) {
  const expV = memStoreForRet.visitors.get(retExpiredVisId);
  if (expV) {
    expV.firstSeenAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    expV.lastSeenAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  }
  const actV = memStoreForRet.visitors.get(retActiveVisId);
  if (actV) {
    actV.firstSeenAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    actV.lastSeenAt = new Date(); // Active today!
  }
}

const boundedPurgeRes = await visitorIntelligenceRepository.purgeExpiredAnonymousTelemetry(90, 10);
const expVisAfter = await visitorIntelligenceRepository.findVisitorById(retExpiredVisId);
const actVisAfter = await visitorIntelligenceRepository.findVisitorById(retActiveVisId);
const enqAfterPurge = await enquiryRepository.findById(enqOnExpiredAnon.id);

check(
  boundedPurgeRes.deletedVisitors >= 1 &&
    expVisAfter === null &&
    Boolean(actVisAfter) &&
    Boolean(enqAfterPurge) &&
    enqAfterPurge.visitorId === null &&
    enqAfterPurge.sessionId === null,
  'RETENTION_ENQ.1',
  'Bounded retention cleanup deletes expired unlinked visitors (lastSeenAt <= cutoff), preserves active visitors (lastSeenAt > cutoff), and preserves enquiries with nulled visitorId/sessionId'
);

// 16i. Migration SQL, runtime schema initializer, and journal reconciliation verification
const fs = await import('node:fs');
const migrationSql = fs.readFileSync('drizzle/0003_visitor_customer_360.sql', 'utf8');
const clientTs = fs.readFileSync('src/db/client.ts', 'utf8');
const schemaTs = fs.readFileSync('src/db/schema.ts', 'utf8');
const journalJson = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
const journalTags = (journalJson.entries || []).map((e) => e.tag);

check(
  migrationSql.includes('DROP INDEX IF EXISTS idx_visitor_events_client_event;') &&
    migrationSql.includes('ROW_NUMBER() OVER') &&
    migrationSql.includes('UPDATE enquiries') &&
    migrationSql.includes('SET visitor_id = NULL') &&
    migrationSql.includes('SET session_id = NULL') &&
    clientTs.includes('DROP INDEX IF EXISTS idx_visitor_events_client_event;') &&
    clientTs.includes('ROW_NUMBER() OVER') &&
    !schemaTs.includes('idx_visitor_events_client_event') &&
    journalTags.includes('0000_adorable_unus') &&
    journalTags.includes('0001_project_coordinates') &&
    journalTags.includes('0002_customer_auth_otp') &&
    journalTags.includes('0003_visitor_customer_360'),
  'MIGRATION.1',
  'Migration 0003, ensureSchemaUpdates(), schema.ts, and _journal.json are reconciled with orphan cleanup, duplicate event cleanup, and index alignment'
);

// 16j. Fail-closed audit logging & Error Sanitization on Customer 360 endpoints
const origAuditRecord = auditService.record.bind(auditService);
auditService.record = async () => {
  throw new Error('FATAL: password authentication failed for user "postgres" (connection: 10.0.0.1:5432, SQL: INSERT INTO audit_logs)');
};
let failClosedOverviewRes;
let failClosedCustomerDetailRes;
let failClosedOverviewJson;
let failClosedCustomerDetailJson;
try {
  failClosedOverviewRes = await getOverviewRoute(
    makeAdminRequest('https://greathomes.co.in/api/admin/customer-intelligence/overview', staffUsersForTest.superAdmin)
  );
  failClosedCustomerDetailRes = await getCustomerDetailRoute(
    makeAdminRequest(`https://greathomes.co.in/api/admin/customer-intelligence/customers/${arjun.id}`, staffUsersForTest.superAdmin),
    { params: Promise.resolve({ id: arjun.id }) }
  );
  failClosedOverviewJson = await failClosedOverviewRes.json();
  failClosedCustomerDetailJson = await failClosedCustomerDetailRes.json();
} finally {
  auditService.record = origAuditRecord;
}

const errorLeakedInternalDetails =
  JSON.stringify(failClosedOverviewJson).includes('postgres') ||
  JSON.stringify(failClosedOverviewJson).includes('password') ||
  JSON.stringify(failClosedOverviewJson).includes('10.0.0.1') ||
  JSON.stringify(failClosedOverviewJson).includes('INSERT INTO') ||
  JSON.stringify(failClosedCustomerDetailJson).includes('postgres') ||
  JSON.stringify(failClosedCustomerDetailJson).includes('password') ||
  JSON.stringify(failClosedCustomerDetailJson).includes('10.0.0.1') ||
  JSON.stringify(failClosedCustomerDetailJson).includes('INSERT INTO');

check(
  failClosedOverviewRes?.status === 500 &&
    failClosedCustomerDetailRes?.status === 500 &&
    failClosedOverviewJson?.error === 'Failed to load intelligence overview' &&
    failClosedCustomerDetailJson?.error === 'Failed to load Customer 360 profile' &&
    !errorLeakedInternalDetails,
  'AUDIT.2',
  'Customer 360 admin endpoints fail closed (HTTP 500) and sanitize internal database/audit errors from client responses'
);

// 17. Legitimate-Event Deduplication Preservation & Action Discriminator Tests

const legitTestVisId = 'vis-legit-dedup-test-001';
const legitTestSessId = 'sess-legit-dedup-test-001';
const legitTestReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: { cookie: `gh_visitor_id=${legitTestVisId}; gh_session_id=${legitTestSessId}` },
});

// 17a. Two different search queries within three seconds are both recorded
const searchRes1 = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'SEARCH_EXECUTED',
  pagePath: '/projects',
  metadata: { query: 'Rajarhat' },
});
const searchRes2 = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'SEARCH_EXECUTED',
  pagePath: '/projects',
  metadata: { query: 'New Town' },
});

check(
  searchRes1.accepted === true &&
    searchRes1.deduplicated === false &&
    searchRes2.accepted === true &&
    searchRes2.deduplicated === false &&
    searchRes1.eventId !== searchRes2.eventId,
  'DEDUP_LEGIT.1',
  'Two different search queries within 3 seconds ("Rajarhat" vs "New Town") are both recorded as distinct events'
);

// 17b. Two distinct filter selections within three seconds are both recorded
const filterRes1 = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'FILTER_APPLIED',
  pagePath: '/projects',
  metadata: { filterKey: 'bhk', filterValue: '3' },
});
const filterRes2 = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'FILTER_APPLIED',
  pagePath: '/projects',
  metadata: { filterKey: 'bhk', filterValue: '2' },
});

check(
  filterRes1.accepted === true &&
    filterRes1.deduplicated === false &&
    filterRes2.accepted === true &&
    filterRes2.deduplicated === false &&
    filterRes1.eventId !== filterRes2.eventId,
  'DEDUP_LEGIT.2',
  'Two distinct filter selections within 3 seconds (bhk:3 vs bhk:2) are both recorded as distinct events'
);

// 17c. A genuine retry of the exact same event is recorded only once
const retryOriginal = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'SEARCH_EXECUTED',
  pagePath: '/projects',
  metadata: { query: 'Salt Lake Sector V' },
});
const retryDuplicate = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'SEARCH_EXECUTED',
  pagePath: '/projects',
  metadata: { query: 'Salt Lake Sector V' },
});

check(
  retryOriginal.accepted === true &&
    retryOriginal.deduplicated === false &&
    retryDuplicate.accepted === true &&
    retryDuplicate.deduplicated === true &&
    retryOriginal.eventId === retryDuplicate.eventId,
  'DEDUP_LEGIT.3',
  'A genuine retry of the exact same event within 3 seconds is deduplicated (recorded only once)'
);

// 17d. Concurrent retries do not increment event/session counters more than once
const concRetryVisId = 'vis-conc-retry-counter-001';
const concRetrySessId = 'sess-conc-retry-counter-001';
const concRetryReq = new Request('https://greathomes.co.in/api/telemetry/events', {
  headers: { cookie: `gh_visitor_id=${concRetryVisId}; gh_session_id=${concRetrySessId}` },
});

const [cRetry1, cRetry2, cRetry3] = await Promise.all([
  customerIntelligenceService.ingestEvent(concRetryReq, {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'explicit-retry-key-001',
  }),
  customerIntelligenceService.ingestEvent(concRetryReq, {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'explicit-retry-key-001',
  }),
  customerIntelligenceService.ingestEvent(concRetryReq, {
    eventType: 'PROJECT_VIEW',
    pagePath: '/projects/merlin-rise',
    entityType: 'PROJECT',
    entityId: 'proj-merlin-test',
    clientEventId: 'explicit-retry-key-001',
  }),
]);

const concRetrySessionRecord = await visitorIntelligenceRepository.findSessionById(concRetrySessId);
const deduplicatedCount = [cRetry1, cRetry2, cRetry3].filter((r) => r.deduplicated).length;
const acceptedCount = [cRetry1, cRetry2, cRetry3].filter((r) => !r.deduplicated).length;

check(
  acceptedCount === 1 &&
    deduplicatedCount === 2 &&
    concRetrySessionRecord?.eventCount === 1 &&
    concRetrySessionRecord?.pageViewCount === 0,
  'DEDUP_LEGIT.4',
  'Concurrent retries of the same event record exactly 1 event and increment session eventCount once'
);

// 17e. Events with sensitive metadata do not expose that metadata through identifiers or logs
const sensitiveEventRes = await customerIntelligenceService.ingestEvent(legitTestReq, {
  eventType: 'SEARCH_EXECUTED',
  pagePath: '/projects',
  metadata: {
    query: 'Normal Project Search',
    otp: '998877',
    password: 'super-secret-password-1234',
    sessionToken: 'jwt-token-string-xyz',
    buyerEmail: 'user.private@example.com',
  },
});

const sensitiveStoredEvents = await visitorIntelligenceRepository.listEvents({
  sessionId: legitTestSessId,
});
const sensitiveEventRecord = sensitiveStoredEvents.find((e) => e.id === sensitiveEventRes.eventId);
const sensitiveKeyContainsSecret =
  sensitiveEventRecord?.clientEventId?.includes('998877') ||
  sensitiveEventRecord?.clientEventId?.includes('secret') ||
  sensitiveEventRecord?.clientEventId?.includes('jwt') ||
  sensitiveEventRecord?.clientEventId?.includes('user.private');

check(
  sensitiveEventRes.accepted === true &&
    sensitiveEventRecord &&
    !sensitiveKeyContainsSecret &&
    !('otp' in (sensitiveEventRecord.metadata || {})) &&
    !('password' in (sensitiveEventRecord.metadata || {})),
  'DEDUP_LEGIT.5',
  'Events with sensitive metadata strip prohibited keys and never expose sensitive values through deduplication identifiers'
);

// 18. F-01 Missing site_visits Relation Tolerance & Error Propagation Suite
const { siteVisitRepository, isMissingSiteVisitsRelationError } = await import(
  '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts'
);

// 18a. isMissingSiteVisitsRelationError helper accurately identifies 42P01 error
const err42P01 = new Error('relation "site_visits" does not exist');
err42P01.code = '42P01';

const errCause42P01 = new Error('DrizzleQueryError: Failed query');
errCause42P01.cause = { code: '42P01', message: 'relation "site_visits" does not exist' };

const errUnrelated = new Error('permission denied for table site_visits');
errUnrelated.code = '42501';

const errConn = new Error('connection terminated unexpectedly');
errConn.code = '08006';

check(
  isMissingSiteVisitsRelationError(err42P01) === true &&
    isMissingSiteVisitsRelationError(errCause42P01) === true &&
    isMissingSiteVisitsRelationError(errUnrelated) === false &&
    isMissingSiteVisitsRelationError(errConn) === false &&
    isMissingSiteVisitsRelationError(null) === false,
  'F01_TOLERANCE.1',
  'isMissingSiteVisitsRelationError matches only 42P01 / relation "site_visits" does not exist and rejects unrelated errors'
);

// 18b. Mock repository simulation: verify list(), findByCustomerId(), and findById() handle 42P01 gracefully
const originalList = siteVisitRepository.list.bind(siteVisitRepository);
const originalFindByCust = siteVisitRepository.findByCustomerId.bind(siteVisitRepository);
const originalListAdmin = siteVisitRepository.listAdmin.bind(siteVisitRepository);

// Simulate missing table error (code: 42P01)
siteVisitRepository.list = async () => {
  throw err42P01;
};
siteVisitRepository.findByCustomerId = async () => {
  throw err42P01;
};

// 18c. Customer 360 overview succeeds when site_visits is absent
let overviewWithMissingTableSucceeded = false;
let overviewResult = null;
try {
  overviewResult = await customerIntelligenceService.getOverview({ canViewPii: true });
  overviewWithMissingTableSucceeded = overviewResult && overviewResult.kpis && overviewResult.kpis.customersWithSiteVisits === 0;
} catch (e) {
  overviewWithMissingTableSucceeded = false;
}

check(
  overviewWithMissingTableSucceeded,
  'F01_TOLERANCE.2',
  'Customer 360 overview succeeds when site_visits table is absent (returns customersWithSiteVisits: 0)'
);

// 18d. Customer listing succeeds when site_visits is absent
let customerListingSucceeded = false;
let customerListingResult = null;
try {
  customerListingResult = await customerIntelligenceService.listCustomers(
    { limit: 10 },
    { staffId: 'staff-audit-1', role: 'ADMIN', canViewPii: true }
  );
  customerListingSucceeded = customerListingResult && Array.isArray(customerListingResult.items);
} catch (e) {
  customerListingSucceeded = false;
}

check(
  customerListingSucceeded,
  'F01_TOLERANCE.3',
  'Customer directory listing succeeds when site_visits table is absent'
);

// 18e. Customer 360 profile succeeds when site_visits is absent
let profileSucceeded = false;
let profileResult = null;
try {
  // Use customer A from earlier tests
  const custA = await customerRepository.findByPhone('+919876543210');
  if (custA) {
    profileResult = await customerIntelligenceService.getCustomer360(
      custA.id,
      { staffId: 'staff-audit-1', role: 'ADMIN', canViewPii: true }
    );
    profileSucceeded = profileResult && profileResult.customer && Array.isArray(profileResult.siteVisits) && profileResult.siteVisits.length === 0;
  }
} catch (e) {
  profileSucceeded = false;
}

check(
  profileSucceeded,
  'F01_TOLERANCE.4',
  'Customer 360 profile succeeds when site_visits table is absent (returns siteVisits: [])'
);

// 18f. Unrelated database errors are strictly re-thrown and never suppressed
siteVisitRepository.list = async () => {
  throw errUnrelated; // Permission denied 42501
};

let unrelatedErrorPropagatedOverview = false;
try {
  await customerIntelligenceService.getOverview({ canViewPii: true });
} catch (e) {
  unrelatedErrorPropagatedOverview = e?.code === '42501' || e?.message?.includes('permission denied');
}

let unrelatedErrorPropagatedList = false;
try {
  await customerIntelligenceService.listCustomers(
    { limit: 10 },
    { staffId: 'staff-audit-1', role: 'ADMIN', canViewPii: true }
  );
} catch (e) {
  unrelatedErrorPropagatedList = e?.code === '42501' || e?.message?.includes('permission denied');
}

check(
  unrelatedErrorPropagatedOverview && unrelatedErrorPropagatedList,
  'F01_TOLERANCE.5',
  'Unrelated database errors (e.g. 42501 permission denied) are strictly re-thrown and never suppressed'
);

// 18g. Restore original methods and confirm existing data is returned when table exists
siteVisitRepository.list = originalList;
siteVisitRepository.findByCustomerId = originalFindByCust;
siteVisitRepository.listAdmin = originalListAdmin;

const restoredOverview = await customerIntelligenceService.getOverview({ canViewPii: true });
check(
  restoredOverview && typeof restoredOverview.kpis.customersWithSiteVisits === 'number',
  'F01_TOLERANCE.6',
  'Existing site-visit metrics are preserved and returned when repository data is present'
);

console.log('\n----------------------------------------------------------------');
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
}



