import assert from 'assert';
import { getDb } from '../src/db/client.js';
import { enquiries, siteVisits, projects, locations, auditLogs, customers } from '../src/db/schema.js';
import { eq, sql, inArray } from 'drizzle-orm';
import { enquiryService, EnquiryValidationError, EnquiryNotFoundError } from '../src/domain/enquiry/services/enquiryService.js';
import { siteVisitService } from '../src/domain/siteVisit/services/siteVisitService.js';
import { auditService } from '../src/domain/audit/auditService.js';

let passed = 0;
let failed = 0;
const failures = [];

function assertPass(condition, id, description) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${description}`);
  } else {
    failed++;
    failures.push({ id, description });
    console.error(`\x1b[31m[FAIL]\x1b[0m ${id}: ${description}`);
  }
}

async function runPhase17Audit() {
  console.log('============================================================');
  console.log('GREAT HOMES V2 — PHASE 17 COMPLIANCE AUDIT');
  console.log('ADVANCED ENQUIRY & SITE VISIT EXPERIENCE');
  console.log('============================================================\n');

  const db = getDb();
  assertPass(db !== null && db !== undefined, 'DB.1', 'PostgreSQL database connection is available');

  // --------------------------------------------------------
  // CATEGORY 1: DATABASE SCHEMA & INDEX INTEGRITY
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 1: Database Schema & Index Integrity ---');

  // Verify enquiries table existence
  const enquiriesTableCheck = await db.execute(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'enquiries'
  `);
  assertPass(enquiriesTableCheck.rows.length === 1, 'SCHEMA.1', 'enquiries table exists in public schema');

  // Verify site_visits table existence
  const siteVisitsTableCheck = await db.execute(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'site_visits'
  `);
  assertPass(siteVisitsTableCheck.rows.length === 1, 'SCHEMA.2', 'site_visits table exists in public schema');

  // Verify enquiries columns
  const enquiriesColsCheck = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'enquiries'
  `);
  const enqColNames = enquiriesColsCheck.rows.map(r => r.column_name);
  const requiredEnqCols = [
    'id', 'context_type', 'project_id', 'project_slug', 'project_name', 
    'buyer_name', 'buyer_phone', 'buyer_email', 'preferred_contact', 
    'request_site_visit', 'message', 'status', 'priority', 'assigned_to', 
    'assigned_to_name', 'source', 'source_page', 'internal_notes', 
    'last_contacted_at', 'next_follow_up_at', 'site_visit_id', 'metadata',
    'created_at', 'updated_at'
  ];
  for (const col of requiredEnqCols) {
    assertPass(enqColNames.includes(col), `SCHEMA.enq.${col}`, `Column '${col}' exists in enquiries table`);
  }

  // Verify site_visits columns
  const siteVisitsColsCheck = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'site_visits'
  `);
  const svColNames = siteVisitsColsCheck.rows.map(r => r.column_name);
  const requiredSvCols = [
    'id', 'enquiry_id', 'customer_id', 'project_id', 'configuration_id', 
    'listing_id', 'visit_type', 'preferred_date', 'preferred_time_window', 
    'status', 'buyer_note', 'staff_note', 'assigned_to', 'assigned_to_name', 
    'reschedule_reason', 'cancel_reason', 'confirmed_at', 'completed_at', 
    'cancelled_at', 'created_at', 'updated_at'
  ];
  for (const col of requiredSvCols) {
    assertPass(svColNames.includes(col), `SCHEMA.sv.${col}`, `Column '${col}' exists in site_visits table`);
  }

  // Verify index coverage on enquiries
  const enquiriesIndexesCheck = await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'enquiries'
  `);
  const enqIdxNames = enquiriesIndexesCheck.rows.map(r => r.indexname);
  assertPass(enqIdxNames.some(i => i.includes('status')), 'SCHEMA.enq.idx.status', 'Index on enquiries.status exists');
  assertPass(enqIdxNames.some(i => i.includes('priority')), 'SCHEMA.enq.idx.priority', 'Index on enquiries.priority exists');
  assertPass(enqIdxNames.some(i => i.includes('context_type')), 'SCHEMA.enq.idx.context_type', 'Index on enquiries.context_type exists');
  assertPass(enqIdxNames.some(i => i.includes('project_id')), 'SCHEMA.enq.idx.project_id', 'Index on enquiries.project_id exists');

  // Verify index coverage on site_visits
  const siteVisitsIndexesCheck = await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'site_visits'
  `);
  const svIdxNames = siteVisitsIndexesCheck.rows.map(r => r.indexname);
  assertPass(svIdxNames.some(i => i.includes('enquiry')), 'SCHEMA.sv.idx.enquiry', 'Index on site_visits.enquiry_id exists');
  assertPass(svIdxNames.some(i => i.includes('customer')), 'SCHEMA.sv.idx.customer', 'Index on site_visits.customer_id exists');
  assertPass(svIdxNames.some(i => i.includes('project')), 'SCHEMA.sv.idx.project', 'Index on site_visits.project_id exists');
  assertPass(svIdxNames.some(i => i.includes('status')), 'SCHEMA.sv.idx.status', 'Index on site_visits.status exists');

  // --------------------------------------------------------
  // CATEGORY 2: PHONE & EMAIL VALIDATION ENGINE
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 2: Phone & Email Validation Engine ---');

  // Valid phone numbers check
  const validPhones = ['9830012345', '+91 98300 54321', '09876543210', '+919999988888'];
  for (const rawPhone of validPhones) {
    const normalized = enquiryService.normalizePhone(rawPhone);
    assertPass(normalized.startsWith('+91') && normalized.length === 13, 'VAL.phone.valid', `Phone '${rawPhone}' successfully normalized to '${normalized}'`);
  }

  // Invalid phone numbers check
  const invalidPhones = ['12345', 'abcdefghij', '919830', '+19830012345', ''];
  for (const badPhone of invalidPhones) {
    try {
      enquiryService.normalizePhone(badPhone);
      assertPass(false, 'VAL.phone.invalid', `Fails: Invalid phone '${badPhone}' was accepted`);
    } catch (err) {
      assertPass(err instanceof EnquiryValidationError, 'VAL.phone.invalid', `Passes: Invalid phone '${badPhone}' rejected with EnquiryValidationError`);
    }
  }

  // Valid email syntax
  const validEmails = ['test@greathomes.in', 'buyer.ops@domain.co.in', '   spaces@email.com  '];
  for (const email of validEmails) {
    const validated = enquiryService.validateEmail(email);
    assertPass(validated !== null && validated === email.trim(), 'VAL.email.valid', `Email '${email}' successfully validated & trimmed`);
  }

  // Invalid email syntax
  const invalidEmails = ['plain', 'test@', '@domain.com', 'test@domain', 'test.com'];
  for (const badEmail of invalidEmails) {
    try {
      enquiryService.validateEmail(badEmail);
      assertPass(false, 'VAL.email.invalid', `Fails: Invalid email '${badEmail}' was accepted`);
    } catch (err) {
      assertPass(err instanceof EnquiryValidationError, 'VAL.email.invalid', `Passes: Invalid email '${badEmail}' rejected with EnquiryValidationError`);
    }
  }

  // --------------------------------------------------------
  // CATEGORY 3: ADVANCED ENQUIRY SUBMISSION WORKFLOW
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 3: Advanced Enquiry Submission Workflow ---');

  // Resolve a real project for high-fidelity relationship integration
  const [project] = await db.select({ slug: projects.slug, name: projects.name, id: projects.id }).from(projects).limit(1);
  assertPass(project !== null && project !== undefined, 'SUB.project', `Found existing project '${project?.name}' for test context`);

  // A. Submit Enquiry without Site Visit Request
  const testEnqPayload = {
    contextType: 'PROJECT',
    projectSlug: project.slug,
    name: 'Audit test buyer',
    phone: '9830098300',
    email: 'audit-buyer@test.com',
    preferredContact: 'WHATSAPP',
    requestSiteVisit: false,
    message: 'Testing normal advisory enquiry pipeline.',
    budgetMin: 5000000,
    budgetMax: 9000000,
    preferredBhk: '3 BHK',
    propertyType: 'APARTMENT',
    purchaseTimeline: 'WITHIN_3_MONTHS',
    purpose: 'SELF_USE',
    source: 'TEST_AUTOMATION',
    sourcePage: '/projects/' + project.slug,
  };

  const enqResult = await enquiryService.submitEnquiry(testEnqPayload);
  assertPass(enqResult.success === true, 'SUB.enq.1', 'Enquiry submission returned success');
  assertPass(enqResult.referenceNumber.startsWith('GH-ENQ-'), 'SUB.enq.2', `Generates reference number: ${enqResult.referenceNumber}`);
  assertPass(!enqResult.siteVisitId, 'SUB.enq.3', 'Enquiry submission without site visit request does not produce siteVisitId');

  const enqInDb = await enquiryService.getEnquiryById(enqResult.enquiryId);
  assertPass(enqInDb !== null, 'SUB.enq.4', 'Enquiry successfully fetched from PostgreSQL database');
  assertPass(enqInDb.status === 'NEW', 'SUB.enq.5', `Default status is 'NEW' (current: ${enqInDb.status})`);
  assertPass(enqInDb.priority === 'NORMAL', 'SUB.enq.6', 'Default priority is NORMAL');
  assertPass(enqInDb.buyerName === 'Audit test buyer', 'SUB.enq.7', 'Saves correct buyer name');
  assertPass(enqInDb.buyerPhone === '+919830098300', 'SUB.enq.8', 'Saves normalized buyer phone number');

  // B. Budget validation rules
  try {
    await enquiryService.submitEnquiry({
      ...testEnqPayload,
      budgetMin: -100,
    });
    assertPass(false, 'VAL.budget.negative', 'Fails: Negative budget allowed');
  } catch (err) {
    assertPass(err instanceof EnquiryValidationError, 'VAL.budget.negative', 'Passes: Negative budget rejected');
  }

  try {
    await enquiryService.submitEnquiry({
      ...testEnqPayload,
      budgetMin: 10000000,
      budgetMax: 5000000,
    });
    assertPass(false, 'VAL.budget.invalidRange', 'Fails: Max budget < Min budget allowed');
  } catch (err) {
    assertPass(err instanceof EnquiryValidationError, 'VAL.budget.invalidRange', 'Passes: Max budget < Min budget rejected');
  }

  // --------------------------------------------------------
  // CATEGORY 4: COMPREHENSIVE SITE VISIT LIFECYCLE
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 4: Comprehensive Site Visit Lifecycle ---');

  // Resolve or create a customer for the site visit relations
  const [customer] = await db.select({ id: customers.id }).from(customers).limit(1);
  assertPass(customer !== null && customer !== undefined, 'SV.customer', `Resolved active customer profile '${customer?.id}' for relation integrity`);

  // Submit enquiry WITH site visit request
  const dummyReq = {
    headers: {
      get(name) {
        const key = name.toLowerCase();
        if (key === 'user-agent') return 'Mozilla/5.0 (Compliance Agent)';
        if (key === 'x-forwarded-for') return '127.0.0.1';
        return null;
      }
    }
  };

  const siteVisitEnqPayload = {
    ...testEnqPayload,
    name: 'Guided tour seeker',
    phone: '9123456789',
    requestSiteVisit: true,
    preferredDate: '2026-11-20',
    preferredTimeWindow: '15:00–18:00',
    visitType: 'IN_PERSON',
    buyerNote: 'Need senior citizen access assistance.',
    customerId: customer.id,
  };

  const svResult = await enquiryService.submitEnquiry(siteVisitEnqPayload, dummyReq);
  assertPass(svResult.success === true, 'SV.flow.1', 'Enquiry with site visit request submitted successfully');
  assertPass(svResult.siteVisitId !== undefined && svResult.siteVisitId !== null, 'SV.flow.2', `Linked siteVisitId successfully created: ${svResult.siteVisitId}`);
  assertPass(svResult.siteVisitStatus === 'REQUESTED', 'SV.flow.3', `Initial site visit status is 'REQUESTED' (current: ${svResult.siteVisitStatus})`);

  // Verify DB state of linked site visit & enquiry status change
  const linkedEnq = await enquiryService.getEnquiryById(svResult.enquiryId);
  assertPass(linkedEnq.status === 'SITE_VISIT_SCHEDULED', 'SV.flow.4', `Enquiry status promoted automatically to 'SITE_VISIT_SCHEDULED' (current: ${linkedEnq.status})`);
  assertPass(linkedEnq.siteVisitId === svResult.siteVisitId, 'SV.flow.5', 'Enquiry correctly maintains siteVisitId foreign key link');

  // Verify site visit structure via service layer
  const svDetail = await siteVisitService.getAdminSiteVisitById(svResult.siteVisitId);
  assertPass(svDetail !== null, 'SV.flow.6', 'Site visit detailed record retrieved from PostgreSQL');
  assertPass(svDetail.preferredDate === '2026-11-20', 'SV.flow.7', 'Site visit matches preferred date');
  assertPass(svDetail.preferredTimeWindow === '15:00–18:00', 'SV.flow.8', 'Site visit matches preferred time window');
  assertPass(svDetail.visitType === 'IN_PERSON', 'SV.flow.9', 'Site visit mode saved correctly');
  assertPass(svDetail.buyerNote === 'Need senior citizen access assistance.', 'SV.flow.10', 'Saves buyer notes properly');

  // Customer List own Enquiries
  const customerEnqs = await enquiryService.getCustomerEnquiries(customer.id);
  assertPass(customerEnqs.length >= 1, 'SV.cust.1', `Customer sees their enquiries (Total found: ${customerEnqs.length})`);
  assertPass(customerEnqs.some(e => e.id === svResult.enquiryId), 'SV.cust.2', 'Customer sees the newly submitted site visit enquiry');

  // Customer List own Site Visits
  const customerVisits = await siteVisitService.getCustomerSiteVisits(customer.id);
  assertPass(customerVisits.length >= 1, 'SV.cust.3', `Customer sees their site visits (Total found: ${customerVisits.length})`);
  assertPass(customerVisits.some(v => v.id === svResult.siteVisitId), 'SV.cust.4', 'Customer sees the scheduled site visit request');

  // --------------------------------------------------------
  // CATEGORY 5: CUSTOMER ACTIONS & LIFECYCLE TRANSITIONS
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 5: Customer Actions & State Machine Integrity ---');

  // A. Customer Reschedules Site Visit
  const rescheduledVisit = await siteVisitService.customerRequestReschedule(
    customer.id,
    svResult.siteVisitId,
    '2026-11-22',
    '09:00–12:00',
    'Traveling on the previous date.',
    dummyReq
  );

  assertPass(rescheduledVisit !== null, 'SV.resched.1', 'Site visit rescheduled request successfully completed');
  assertPass(rescheduledVisit.status === 'RESCHEDULE_REQUESTED', 'SV.resched.2', `Visit status is now 'RESCHEDULE_REQUESTED' (current: ${rescheduledVisit.status})`);
  assertPass(rescheduledVisit.preferredDate === '2026-11-22', 'SV.resched.3', 'Date updated to new date');
  assertPass(rescheduledVisit.preferredTimeWindow === '09:00–12:00', 'SV.resched.4', 'Time window updated');
  assertPass(rescheduledVisit.rescheduleReason === 'Traveling on the previous date.', 'SV.resched.5', 'Reschedule reason stored correctly');

  // B. Customer Cancelling Site Visit (Create another one to cancel, keeping the rescheduled one for admin testing)
  const cancelEnqResult = await enquiryService.submitEnquiry({
    ...siteVisitEnqPayload,
    name: 'Cancellation tester',
    phone: '9836698366',
    preferredDate: '2026-11-25',
  }, dummyReq);

  const cancelledVisit = await siteVisitService.customerCancelVisit(
    customer.id,
    cancelEnqResult.siteVisitId,
    'No longer buying in this area.',
    dummyReq
  );

  assertPass(cancelledVisit !== null, 'SV.cancel.1', 'Site visit cancellation request completed successfully');
  assertPass(cancelledVisit.status === 'CANCELLED', 'SV.cancel.2', `Visit status is now 'CANCELLED' (current: ${cancelledVisit.status})`);
  assertPass(cancelledVisit.cancelReason === 'No longer buying in this area.', 'SV.cancel.3', 'Cancellation reason saved');
  assertPass(cancelledVisit.cancelledAt !== null, 'SV.cancel.4', 'Sets cancelledAt timestamp value');

  // C. State Machine Safety / Invalid Transitions
  // Trying to reschedule a cancelled site visit must fail
  try {
    await siteVisitService.customerRequestReschedule(
      customer.id,
      cancelEnqResult.siteVisitId,
      '2026-11-28',
      '12:00–15:00',
      'Attempting to resurrect cancelled visit.'
    );
    assertPass(false, 'SV.state.safety.1', 'Fails: Rescheduling a cancelled visit was permitted');
  } catch (err) {
    assertPass(err instanceof Error, 'SV.state.safety.1', 'Passes: Rescheduling a cancelled visit is blocked by state machine rules');
  }

  // --------------------------------------------------------
  // CATEGORY 6: ADMIN OPERATIONS & OPERATIONS WORKFLOW
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 6: Admin Operations & Operations Workflow ---');

  const testStaff = { id: 'staff-operations-admin', role: 'ADMIN' };

  // A. Admin status transition to CONFIRMED
  const confirmedVisit = await siteVisitService.updateAdminStatus(
    testStaff,
    dummyReq,
    svResult.siteVisitId,
    'CONFIRMED',
    'Advisory desk has verified with the builder representative.'
  );

  assertPass(confirmedVisit !== null, 'SV.admin.confirm.1', 'Admin successfully confirmed the site visit');
  assertPass(confirmedVisit.status === 'CONFIRMED', 'SV.admin.confirm.2', `Visit status updated to 'CONFIRMED'`);
  assertPass(confirmedVisit.confirmedAt !== null, 'SV.admin.confirm.3', 'Sets confirmedAt timestamp');
  assertPass(confirmedVisit.staffNote === 'Advisory desk has verified with the builder representative.', 'SV.admin.confirm.4', 'Saves internal staff note');

  // B. Admin status transition to COMPLETED
  const completedVisit = await siteVisitService.updateAdminStatus(
    testStaff,
    dummyReq,
    svResult.siteVisitId,
    'COMPLETED',
    'Customer attended and loved the project layout.'
  );

  assertPass(completedVisit !== null, 'SV.admin.complete.1', 'Admin successfully completed the site visit');
  assertPass(completedVisit.status === 'COMPLETED', 'SV.admin.complete.2', `Visit status updated to 'COMPLETED'`);
  assertPass(completedVisit.completedAt !== null, 'SV.admin.complete.3', 'Sets completedAt timestamp');

  // Verify associated enquiry status promoted to 'SITE_VISIT_COMPLETED'
  const postCompletedEnq = await enquiryService.getEnquiryById(svResult.enquiryId);
  assertPass(postCompletedEnq.status === 'SITE_VISIT_COMPLETED', 'SV.admin.complete.4', `Linked enquiry status automatically promoted to 'SITE_VISIT_COMPLETED' (current: ${postCompletedEnq.status})`);

  // C. Admin staff assignment
  const assignedVisit = await siteVisitService.assignStaff(
    testStaff,
    dummyReq,
    svResult.siteVisitId,
    'staff-sales-advisor',
    'Amit Sen'
  );
  assertPass(assignedVisit !== null, 'SV.admin.assign.1', 'Admin successfully assigned site visit staff');
  assertPass(assignedVisit.assignedTo === 'staff-sales-advisor', 'SV.admin.assign.2', 'Site visit assignedTo field updated');
  assertPass(assignedVisit.assignedToName === 'Amit Sen', 'SV.admin.assign.3', 'Site visit assignedToName field updated');

  // D. Admin list filtered site visits
  const adminList = await siteVisitService.listAdminSiteVisits({
    status: 'COMPLETED',
    projectId: project.id,
  });
  assertPass(adminList.items.length >= 1, 'SV.admin.list.1', `Admin lists site visits with filters (found: ${adminList.total})`);

  // --------------------------------------------------------
  // CATEGORY 7: ADMINISTRATIVE AUDITABILITY
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 7: Administrative Auditability ---');

  // Audit logs must capture operations events
  const logs = await db.select()
    .from(auditLogs)
    .where(eq(auditLogs.resourceType, 'SITE_VISIT'))
    .orderBy(sql`${auditLogs.timestamp} DESC`);

  assertPass(logs.length >= 2, 'AUDIT.1', `Database contains site visit audit entries (Total found: ${logs.length})`);

  const actions = logs.map(l => l.action);
  assertPass(actions.includes('CREATE_SITE_VISIT'), 'AUDIT.action.create', 'Found CREATE_SITE_VISIT audit log entry');
  assertPass(actions.includes('RESCHEDULE_REQUEST_SITE_VISIT'), 'AUDIT.action.reschedule', 'Found RESCHEDULE_REQUEST_SITE_VISIT audit log entry');
  assertPass(actions.includes('CANCEL_SITE_VISIT'), 'AUDIT.action.cancel', 'Found CANCEL_SITE_VISIT audit log entry');
  assertPass(actions.includes('UPDATE_SITE_VISIT_STATUS'), 'AUDIT.action.status', 'Found UPDATE_SITE_VISIT_STATUS audit log entry');
  assertPass(actions.includes('ASSIGN_SITE_VISIT_STAFF'), 'AUDIT.action.assign', 'Found ASSIGN_SITE_VISIT_STAFF audit log entry');

  // --------------------------------------------------------
  // CATEGORY 8: CRM-READY TELEMETRY & STRUCTURE
  // --------------------------------------------------------
  console.log('\n--- CATEGORY 8: CRM-Ready Telemetry & Structure ---');

  // Enquiries serialize cleanly and match standard non-nested keys for CRM ingest
  const crmTestEnq = await db.select().from(enquiries).where(eq(enquiries.id, svResult.enquiryId)).limit(1);
  const rawEnq = crmTestEnq[0];
  assertPass(rawEnq !== undefined, 'CRM.1', 'Successfully fetched raw database payload for enquiry');
  assertPass(typeof rawEnq.id === 'string', 'CRM.id', 'Enquiry id is standard string');
  assertPass(typeof rawEnq.buyerName === 'string', 'CRM.buyerName', 'Enquiry buyerName is standard string');
  assertPass(typeof rawEnq.buyerPhone === 'string', 'CRM.buyerPhone', 'Enquiry buyerPhone is standard string');
  assertPass(typeof rawEnq.status === 'string', 'CRM.status', 'Enquiry status is standard string');
  assertPass(rawEnq.metadata !== null, 'CRM.metadata', 'Enquiry contains serialized metadata');

  const parsedMetadata = JSON.parse(rawEnq.metadata);
  assertPass(parsedMetadata.referenceNumber !== undefined, 'CRM.meta.referenceNumber', 'Metadata contains referenceNumber');
  assertPass(parsedMetadata.purchaseTimeline !== undefined, 'CRM.meta.purchaseTimeline', 'Metadata contains purchaseTimeline');
  assertPass(parsedMetadata.purpose !== undefined, 'CRM.meta.purpose', 'Metadata contains purchase purpose');

  console.log('\n============================================================');
  console.log(`PHASE 17 COMPLIANCE AUDIT STATUS: ${failed === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log(`Assertions Checked: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error('The following assertions failed:');
    failures.forEach(f => console.error(`- ${f.id}: ${f.description}`));
    process.exit(1);
  } else {
    console.log('PHASE 17 — COMPLIANCE PASS: ALL SERVICE LAYERS, SCHEMAS, AND STATE MACHINES CONFORM TO INTENT.');
    process.exit(0);
  }
}

runPhase17Audit().catch(err => {
  console.error('Unhandled error during audit:', err);
  process.exit(1);
});
