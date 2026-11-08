import assert from 'node:assert/strict';

// Isolated in-memory test configuration. Never points at a real database.
process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.GH_STAFF_SESSION_SECRET = 'test-only-session-secret-which-is-more-than-32-characters-long';

const { verifyInternalStaff, createStaffSessionToken } = await import('../src/domain/auth/authorizationBoundary.js');
const { staffRepository } = await import('../src/domain/auth/repositories/staffRepository.js');
const { hashStaffPassword, verifyStaffPassword } = await import('../src/domain/auth/password.js');
const { getRoleCapabilities, hasCapability } = await import('../src/domain/auth/capabilities.js');

async function run() {
  const anonymous = await verifyInternalStaff(new Request('http://localhost/api/admin/dashboard'));
  assert.equal(anonymous.authorized, false, 'Anonymous requests must be rejected');
  assert.equal(anonymous.statusCode, 401);

  const spoofedRole = await verifyInternalStaff(new Request('http://localhost/api/admin/dashboard', {
    headers: { authorization: 'Bearer gh-internal-staff-secret', 'x-staff-role': 'SUPER_ADMIN' },
  }));
  assert.equal(spoofedRole.authorized, false, 'Legacy shared secrets and client-selected roles must be rejected');
  assert.equal(spoofedRole.statusCode, 401);

  const password = 'Secure-test-password-2026!';
  const passwordHash = await hashStaffPassword(password);
  assert.notEqual(passwordHash, password, 'Passwords must be stored as salted hashes');
  assert.equal(await verifyStaffPassword(password, passwordHash), true);
  assert.equal(await verifyStaffPassword('incorrect-password', passwordHash), false);
  await assert.rejects(() => hashStaffPassword('short'), /12 and 256/);

  const staff = await staffRepository.create({
    id: 'test-super-admin', email: 'security-test@greathomes.invalid', name: 'Security Test',
    role: 'SUPER_ADMIN', enabled: true, passwordHash, sessionVersion: 0, avatarUrl: null,
  });
  const token = createStaffSessionToken(staff.id, staff.sessionVersion ?? 0);
  const authenticated = await verifyInternalStaff(new Request('http://localhost/api/admin/dashboard', {
    headers: { authorization: `Bearer ${token}`, 'x-staff-role': 'SALES' },
  }));
  assert.equal(authenticated.authorized, true);
  assert.equal(authenticated.role, 'SUPER_ADMIN', 'The persisted role, not the request header, is authoritative');
  assert.ok(getRoleCapabilities('SUPER_ADMIN').includes('MANAGE_STAFF'));
  assert.equal(hasCapability('SUPER_ADMIN', 'staff.disable'), true);

  await staffRepository.update(staff.id, { sessionVersion: 1 });
  const revoked = await verifyInternalStaff(new Request('http://localhost/api/admin/dashboard', { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(revoked.authorized, false, 'Incrementing sessionVersion must revoke prior sessions');

  const currentToken = createStaffSessionToken(staff.id, 1);
  await staffRepository.update(staff.id, { enabled: false });
  const disabled = await verifyInternalStaff(new Request('http://localhost/api/admin/dashboard', { headers: { authorization: `Bearer ${currentToken}` } }));
  assert.equal(disabled.authorized, false, 'Disabled staff accounts must be rejected');

  console.log('Staff-auth security tests passed: spoofed roles, legacy keys, password hashing, persisted roles, session revocation, and disabled accounts.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });