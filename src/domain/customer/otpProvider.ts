import pkg from 'pg';
import { validateTestDatabaseUrl } from '../../../scripts/lib/db-safety-validation.mjs';

const { Pool } = pkg;

export interface OtpProviderResponse {
  status: string;
  details: string;
}

export interface OtpProvider {
  readonly name: 'live-2factor' | 'mock-test';
  send(digits: string, template: string): Promise<OtpProviderResponse>;
  verify(sessionId: string, otp: string): Promise<OtpProviderResponse>;
}

/**
 * Live 2Factor SMS OTP Provider
 */
export class Live2FactorOtpProvider implements OtpProvider {
  readonly name = 'live-2factor' as const;

  constructor(private apiKey: string) {}

  private base(): string {
    return `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/SMS`;
  }

  async send(digits: string, template: string): Promise<OtpProviderResponse> {
    const url = `${this.base()}/${encodeURIComponent(digits)}/AUTOGEN3/${encodeURIComponent(template)}`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({}));
    return {
      status: String(payload?.Status ?? payload?.status ?? ''),
      details: String(payload?.Details ?? payload?.details ?? ''),
    };
  }

  async verify(sessionId: string, otp: string): Promise<OtpProviderResponse> {
    const url = `${this.base()}/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(otp)}`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({}));
    return {
      status: String(payload?.Status ?? payload?.status ?? ''),
      details: String(payload?.Details ?? payload?.details ?? ''),
    };
  }
}

/**
 * Deterministic Mock OTP Provider for Automated Testing
 * Guarantees zero outbound network requests and returns predictable OTP responses.
 */
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock-test' as const;
  private sessions = new Map<string, { otp: string; expiresAt: number; used: boolean }>();

  async send(digits: string, template: string): Promise<OtpProviderResponse> {
    const sessionId = `mock_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    // Deterministic test OTP is always '1234'
    const otp = '1234';
    this.sessions.set(sessionId, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      used: false,
    });
    return {
      status: 'Success',
      details: sessionId,
    };
  }

  async verify(sessionId: string, otp: string): Promise<OtpProviderResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { status: 'Error', details: 'OTP Expired' };
    }
    if (session.used) {
      return { status: 'Error', details: 'OTP Already Used' };
    }
    if (Date.now() > session.expiresAt) {
      return { status: 'Error', details: 'OTP Expired' };
    }
    if (session.otp !== otp.trim()) {
      return { status: 'Error', details: 'OTP Mismatch' };
    }
    session.used = true;
    return { status: 'Success', details: 'OTP Matched' };
  }
}

let cachedProvider: OtpProvider | null = null;

export function resetOtpProviderCacheForTesting() {
  cachedProvider = null;
}

export async function getOtpProvider(apiKey: string): Promise<OtpProvider> {
  if (cachedProvider) {
    return cachedProvider;
  }

  const isTestIsolated = process.env.OTP_TEST_ISOLATED === 'true';

  if (!isTestIsolated) {
    cachedProvider = new Live2FactorOtpProvider(apiKey);
    return cachedProvider;
  }

  // 1. Static validation when OTP_TEST_ISOLATED=true
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const prodUrl = process.env.DATABASE_URL?.trim();
  const allowDisposable = process.env.ALLOW_DISPOSABLE_DB_TESTS?.trim() || '1';

  const validation = validateTestDatabaseUrl({
    testUrl,
    prodUrl,
    allowDisposable,
  });

  if (!validation.valid) {
    throw new Error(
      `[FATAL SAFETY VIOLATION] OTP_TEST_ISOLATED=true activated without a valid isolated TEST_DATABASE_URL: ${validation.error}. Aborting safely. Live SMS is strictly prohibited.`
    );
  }

  // 2. Verify compute host is explicitly non-production
  const testHostname = validation.parsed.hostname.toLowerCase();
  if (testHostname.includes('ep-royal-smoke-b3uti4fv')) {
    throw new Error(
      '[FATAL SAFETY VIOLATION] OTP_TEST_ISOLATED=true detected production compute endpoint "ep-royal-smoke-b3uti4fv". Aborting safely.'
    );
  }

  // 3. Asynchronous runtime Neon database identity verification
  const client = new Pool({
    connectionString: testUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await client.query(`
      SELECT current_setting('neon.project_id', true) AS project_id,
             current_setting('neon.branch_id', true) AS branch_id;
    `);
    const row = res.rows[0];
    const projectId = row?.project_id ? String(row.project_id).trim() : null;
    const branchId = row?.branch_id ? String(row.branch_id).trim() : null;

    const EXPECTED_PROJECT_ID = 'steep-lake-52591181';
    const EXPECTED_BRANCH_ID = 'br-autumn-voice-b3ci16wp';
    const FORBIDDEN_BRANCH_ID = 'br-dark-bonus-b3s8olt1';
    const FORBIDDEN_ENDPOINT = 'ep-royal-smoke-b3uti4fv';

    if (
      !projectId ||
      !branchId ||
      projectId !== EXPECTED_PROJECT_ID ||
      branchId !== EXPECTED_BRANCH_ID ||
      (branchId as string) === FORBIDDEN_BRANCH_ID ||
      testHostname.includes(FORBIDDEN_ENDPOINT)
    ) {
      throw new Error(
        `[FATAL SAFETY VIOLATION] Runtime Neon database identity verification failed. Expected Project: ${EXPECTED_PROJECT_ID}, Branch: ${EXPECTED_BRANCH_ID}. Got Project: ${projectId}, Branch: ${branchId}. Aborting safely. Live SMS is strictly prohibited.`
      );
    }
  } catch (err: any) {
    throw new Error(
      `[FATAL SAFETY VIOLATION] Runtime Neon database identity check failed: ${err.message}. Aborting safely. Live SMS is strictly prohibited.`
    );
  } finally {
    await client.end().catch(() => {});
  }

  cachedProvider = new MockOtpProvider();
  return cachedProvider;
}
