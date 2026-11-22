import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { createCustomerSession } from './customerAuth.ts';
import { indianPhoneDigits, normalizeIndianPhone } from './phoneNumber.ts';

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const PROFILE_LIFETIME_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_ATTEMPT_LIMIT = 5;

export class CustomerOtpError extends Error {
  statusCode: number;
  retryAfterSeconds?: number;
  code?: string;

  constructor(message: string, statusCode: number, options?: { retryAfterSeconds?: number; code?: string }) {
    super(message);
    this.name = 'CustomerOtpError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.code = options?.code;
  }
}

function resultRows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function fail(message: string, statusCode: number, options?: { retryAfterSeconds?: number; code?: string }): never {
  throw new CustomerOtpError(message, statusCode, options);
}


async function getReadyDb() {
  const db = getDb();
  if (!db) fail('Customer OTP authentication requires the configured PostgreSQL database.', 503, { code: 'DATABASE_NOT_CONFIGURED' });
  return db;
}

function keyedHash(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

import {
  createPartnerProfileInTx,
  getPartnerSchemaCapabilities,
  PartnerDomainError,
  persistLegacyOwnerAccountType,
  resolveLegacyCustomerAccountType,
  validatePartnerRegistrationInput,
  type PartnerRegistrationInput,
} from './partnerService.ts';

function dto(row: any, partnerStatus: string | null = null) {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    phone: row.phone ?? null,
    name: String(row.name),
    accountType: row.account_type ?? row.accountType ?? null,
    partnerStatus: partnerStatus ?? row.partner_status ?? row.partnerStatus ?? null,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    status: row.status,
    createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
  };
}

const OTP_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastOtpCleanupRunAt = 0;

async function runThrottledOtpCleanup(db: any): Promise<void> {
  const now = Date.now();
  if (now - lastOtpCleanupRunAt < OTP_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastOtpCleanupRunAt = now;
  try {
    await Promise.all([
      db.execute(sql`
        DELETE FROM customer_otp_challenges
        WHERE created_at < now() - interval '1 day'
      `),
      db.execute(sql`
        DELETE FROM customer_auth_rate_limits
        WHERE updated_at < now() - interval '30 days'
      `),
    ]);
  } catch {
    // Cleanup is non-blocking maintenance; never delay or fail OTP delivery
  }
}

function customerRowsExactSql(phoneDigits: string, hasCustomerAccountType: boolean = true) {
  const e164 = `+91${phoneDigits}`;
  const with91 = `91${phoneDigits}`;
  if (hasCustomerAccountType) {
    return sql`
      SELECT c.id, c.email, c.phone, c.name, c.account_type, c.avatar_url, c.status, c.phone_verified_at, c.created_at,
             p.status AS partner_status
      FROM customers c
      LEFT JOIN customer_partner_profiles p ON p.customer_id = c.id
      WHERE c.phone IN (${e164}, ${phoneDigits}, ${with91})
      ORDER BY c.created_at ASC
      LIMIT 2
    `;
  }
  return sql`
    SELECT c.id, c.email, c.phone, c.name, c.avatar_url, c.status, c.phone_verified_at, c.created_at,
           p.status AS partner_status
    FROM customers c
    LEFT JOIN customer_partner_profiles p ON p.customer_id = c.id
    WHERE c.phone IN (${e164}, ${phoneDigits}, ${with91})
    ORDER BY c.created_at ASC
    LIMIT 2
  `;
}

function customerRowsSql(phoneDigits: string, hasCustomerAccountType: boolean = true) {
  if (hasCustomerAccountType) {
    return sql`
      SELECT c.id, c.email, c.phone, c.name, c.account_type, c.avatar_url, c.status, c.phone_verified_at, c.created_at,
             p.status AS partner_status
      FROM customers c
      LEFT JOIN customer_partner_profiles p ON p.customer_id = c.id
      WHERE right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneDigits}
      ORDER BY c.created_at ASC
      LIMIT 2
    `;
  }
  return sql`
    SELECT c.id, c.email, c.phone, c.name, c.avatar_url, c.status, c.phone_verified_at, c.created_at,
           p.status AS partner_status
    FROM customers c
    LEFT JOIN customer_partner_profiles p ON p.customer_id = c.id
    WHERE right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneDigits}
    ORDER BY c.created_at ASC
    LIMIT 2
  `;
}

async function findCustomerRowsByPhoneDigits(
  executor: any,
  phoneDigits: string,
  hasCustomerAccountType: boolean
): Promise<any[]> {
  // Fast indexed lookup on idx_customers_phone first; fall back to regex normalization only if 0 exact hits
  const exactRows = resultRows(
    await executor.execute(customerRowsExactSql(phoneDigits, hasCustomerAccountType))
  );
  if (exactRows.length > 0) {
    return exactRows;
  }
  return resultRows(await executor.execute(customerRowsSql(phoneDigits, hasCustomerAccountType)));
}

async function consumeRateLimit(db: any, key: string, limit: number, windowMs: number): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO customer_auth_rate_limits (id, window_start, request_count, updated_at)
    VALUES (${key}, now(), 1, now())
    ON CONFLICT (id) DO UPDATE SET
      request_count = CASE
        WHEN customer_auth_rate_limits.window_start <= now() - (${windowMs} * interval '1 millisecond') THEN 1
        ELSE LEAST(customer_auth_rate_limits.request_count + 1, ${limit + 1})
      END,
      window_start = CASE
        WHEN customer_auth_rate_limits.window_start <= now() - (${windowMs} * interval '1 millisecond') THEN now()
        ELSE customer_auth_rate_limits.window_start
      END,
      updated_at = now()
    RETURNING request_count, window_start
  `);
  const bucket = resultRows(result)[0];
  if (!bucket) fail('Unable to verify request limits. Please try again.', 503);
  const count = Number(bucket.request_count);
  if (count > limit) {
    const startedAt = new Date(bucket.window_start).getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((startedAt + windowMs - Date.now()) / 1000));
    fail('Too many requests. Please try again later.', 429, { retryAfterSeconds, code: 'RATE_LIMITED' });
  }
}

function clientIpHash(secret: string, ip: string): string {
  return keyedHash(secret, `ip:${ip || 'unknown'}`);
}

import { getOtpProvider } from './otpProvider';

async function callProvider(url: string): Promise<any> {
  // Maintained for internal type compatibility if needed, but primary provider is routed through getOtpProvider
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  return await response.json();
}

function providerConfig() {
  const apiKey = process.env.TWOFACTOR_API_KEY?.trim();
  const template = process.env.TWOFACTOR_OTP_TEMPLATE?.trim();
  if (!apiKey || !template) {
    fail('The 2Factor API key and OTP template must be configured in the server environment.', 503, { code: 'OTP_PROVIDER_NOT_CONFIGURED' });
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(template)) {
    fail('The configured 2Factor template name is invalid.', 503, { code: 'OTP_TEMPLATE_INVALID' });
  }
  if (process.env.TWOFACTOR_OTP_LENGTH && process.env.TWOFACTOR_OTP_LENGTH !== '4') {
    fail('Great Homes customer login is configured for four-digit OTPs. Set TWOFACTOR_OTP_LENGTH=4.', 503, { code: 'OTP_LENGTH_MISMATCH' });
  }
  return { apiKey, template };
}


export async function sendCustomerOtp(inputPhone: unknown, ip: string) {
  const phone = normalizeIndianPhone(inputPhone);
  const digits = indianPhoneDigits(phone);
  const { apiKey, template } = providerConfig();
  const secret = apiKey;
  const db = await getReadyDb();

  // Throttled maintenance cleanup (at most once every 10 minutes per process, non-blocking on error)
  await runThrottledOtpCleanup(db);

  const phoneHash = keyedHash(secret, `phone:${phone}`);
  const ipHash = clientIpHash(secret, ip);

  const cooldown = resultRows(await db.execute(sql`
    SELECT id FROM customer_otp_challenges
    WHERE phone_hash = ${phoneHash}
      AND created_at > now() - interval '30 seconds'
      AND status IN ('SENDING', 'PENDING', 'VERIFYING', 'PROFILE_PENDING', 'COMPLETING')
    ORDER BY created_at DESC
    LIMIT 1
  `))[0];
  if (cooldown) {
    fail('Please wait 30 seconds before requesting another code.', 429, { retryAfterSeconds: 30, code: 'RESEND_COOLDOWN' });
  }

  await consumeRateLimit(db, keyedHash(secret, `send-phone:${phoneHash}`), 3, 15 * 60 * 1000);
  if (ip && ip !== 'unknown') {
    await consumeRateLimit(db, keyedHash(secret, `send-ip:${ipHash}`), 10, 60 * 60 * 1000);
  } else {
    // Fallback rate-limit bucket when verified proxy IP provenance is unavailable
    await consumeRateLimit(db, keyedHash(secret, 'send-ip:unknown'), 25, 60 * 60 * 1000);
  }

  // A resend invalidates every older pending challenge for this phone.
  await db.execute(sql`
    UPDATE customer_otp_challenges
    SET status = 'FAILED', updated_at = now()
    WHERE phone_hash = ${phoneHash}
      AND status IN ('SENDING', 'PENDING', 'PROFILE_PENDING')
  `);

  const challengeId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO customer_otp_challenges
      (id, phone, phone_hash, ip_hash, status, attempt_count, expires_at, created_at, updated_at)
    VALUES
      (${challengeId}, ${phone}, ${phoneHash}, ${ipHash}, 'SENDING', 0, now() + interval '5 minutes', now(), now())
  `);

  const provider = await getOtpProvider(apiKey);
  let providerResponse: any;
  try {
    providerResponse = await provider.send(digits, template);
  } catch (error) {

    await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', updated_at = now() WHERE id = ${challengeId}`);
    throw error;
  }

  const providerStatus = String(providerResponse?.Status ?? providerResponse?.status ?? '').toLowerCase();
  const providerSessionId = String(providerResponse?.Details ?? providerResponse?.details ?? '');
  if (providerStatus !== 'success' || !providerSessionId || providerSessionId.length > 256) {
    await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', updated_at = now() WHERE id = ${challengeId}`);
    fail('We could not send an OTP right now. Please check the number and try again later.', 502, { code: 'OTP_SEND_FAILED' });
  }

  await db.execute(sql`
    UPDATE customer_otp_challenges
    SET provider_session_id = ${providerSessionId},
        status = 'PENDING',
        expires_at = now() + interval '5 minutes',
        updated_at = now()
    WHERE id = ${challengeId} AND status = 'SENDING'
  `);

  return { challengeId, expiresInSeconds: Math.floor(OTP_LIFETIME_MS / 1000), resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000) };
}

export async function verifyCustomerOtp(challengeIdInput: unknown, otpInput: unknown, ip: string) {
  if (typeof challengeIdInput !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeIdInput)) {
    fail('This OTP request is invalid or expired. Please request a new code.', 400, { code: 'OTP_CHALLENGE_INVALID' });
  }
  if (typeof otpInput !== 'string' || !/^\d{4}$/.test(otpInput)) {
    fail('Enter the four-digit code sent to your mobile.', 400, { code: 'OTP_FORMAT_INVALID' });
  }

  const { apiKey } = providerConfig();
  const secret = apiKey;
  const db = await getReadyDb();
  const challengeId = challengeIdInput;

  const preview = resultRows(await db.execute(sql`
    SELECT phone, phone_hash, ip_hash
    FROM customer_otp_challenges
    WHERE id = ${challengeId} AND status = 'PENDING' AND expires_at > now()
    LIMIT 1
  `))[0];
  if (!preview) {
    fail('This OTP request is invalid or expired. Please request a new code.', 410, { code: 'OTP_CHALLENGE_EXPIRED' });
  }

  await consumeRateLimit(db, keyedHash(secret, `verify-phone:${preview.phone_hash}`), 10, 15 * 60 * 1000);
  if (ip && ip !== 'unknown') {
    await consumeRateLimit(db, keyedHash(secret, `verify-ip:${clientIpHash(secret, ip)}`), 20, 60 * 60 * 1000);
  } else {
    // Fallback rate-limit bucket when verified proxy IP provenance is unavailable
    await consumeRateLimit(db, keyedHash(secret, 'verify-ip:unknown'), 50, 60 * 60 * 1000);
  }

  const claimed = resultRows(await db.execute(sql`
    UPDATE customer_otp_challenges
    SET status = 'VERIFYING', attempt_count = attempt_count + 1, updated_at = now()
    WHERE id = ${challengeId}
      AND status = 'PENDING'
      AND expires_at > now()
      AND attempt_count < ${OTP_ATTEMPT_LIMIT}
    RETURNING phone, phone_hash, provider_session_id, attempt_count
  `))[0];
  if (!claimed || !claimed.provider_session_id) {
    fail('This OTP request is invalid, expired, or has too many attempts. Please request a new code.', 410, { code: 'OTP_CHALLENGE_UNAVAILABLE' });
  }

  let verifyResponse: any;
  try {
    const provider = await getOtpProvider(apiKey);
    verifyResponse = await provider.verify(String(claimed.provider_session_id), otpInput);
  } catch (error) {
    const status = Number(claimed.attempt_count) >= OTP_ATTEMPT_LIMIT ? 'FAILED' : 'PENDING';
    await db.execute(sql`UPDATE customer_otp_challenges SET status = ${status}, updated_at = now() WHERE id = ${challengeId} AND status = 'VERIFYING'`);
    throw error;
  }

  const verifyStatus = String(verifyResponse?.Status ?? verifyResponse?.status ?? '').toLowerCase();
  const verifyDetails = String(verifyResponse?.Details ?? verifyResponse?.details ?? '').trim().toLowerCase();
  if (verifyStatus !== 'success' || verifyDetails !== 'otp matched') {
    const status = Number(claimed.attempt_count) >= OTP_ATTEMPT_LIMIT ? 'FAILED' : 'PENDING';
    await db.execute(sql`UPDATE customer_otp_challenges SET status = ${status}, updated_at = now() WHERE id = ${challengeId} AND status = 'VERIFYING'`);
    fail('That code is incorrect or expired. Please try again.', 400, { code: 'OTP_NOT_MATCHED' });
  }

  const phone = String(claimed.phone);
  const digits = indianPhoneDigits(phone);
  const schemaCaps = await getPartnerSchemaCapabilities(db);
  const matchingCustomers = await findCustomerRowsByPhoneDigits(
    db,
    digits,
    schemaCaps.hasCustomerAccountType
  );
  if (matchingCustomers.length > 1) {
    await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', verified_at = now(), updated_at = now() WHERE id = ${challengeId}`);
    fail('We could not safely match this number to a single account. Please contact Great Homes support.', 409, { code: 'PHONE_ACCOUNT_CONFLICT' });
  }

  const existing = matchingCustomers[0];
  if (existing) {
    if (!existing.phone_verified_at) {
      await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', verified_at = now(), updated_at = now() WHERE id = ${challengeId}`);
      fail('This number is associated with an account that needs support review. Please contact Great Homes support.', 409, { code: 'ACCOUNT_REVIEW_REQUIRED' });
    }
    if (existing.status !== 'ACTIVE') {
      await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', verified_at = now(), updated_at = now() WHERE id = ${challengeId}`);
      fail('This account is not currently available. Please contact Great Homes support.', 403, { code: 'ACCOUNT_INACTIVE' });
    }

    if (!schemaCaps.hasCustomerAccountType && !existing.account_type) {
      existing.account_type = await resolveLegacyCustomerAccountType(db, String(existing.id));
    }

    await db.execute(sql`UPDATE customers SET last_login_at = now(), updated_at = now() WHERE id = ${existing.id}`);
    await db.execute(sql`
      UPDATE customer_otp_challenges
      SET status = 'CONSUMED', customer_id = ${existing.id}, verified_at = now(), updated_at = now()
      WHERE id = ${challengeId} AND status = 'VERIFYING'
    `);
    return { requiresProfileCompletion: false, customer: dto(existing), token: await createCustomerSession(String(existing.id)) };
  }

  await db.execute(sql`
    UPDATE customer_otp_challenges
    SET status = 'PROFILE_PENDING',
        verified_at = now(),
        profile_expires_at = now() + interval '15 minutes',
        updated_at = now()
    WHERE id = ${challengeId} AND status = 'VERIFYING'
  `);
  return { requiresProfileCompletion: true, challengeId, maskedPhone: `${digits.slice(0, 2)}••••${digits.slice(-2)}` };
}

export interface CompleteCustomerProfileOptions extends PartnerRegistrationInput {
  accountType?: unknown;
}

export async function completeCustomerOtpProfile(
  challengeIdInput: unknown,
  nameInput: unknown,
  emailInput?: unknown,
  options?: CompleteCustomerProfileOptions
) {
  if (typeof challengeIdInput !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeIdInput)) {
    fail('Your verified signup session is invalid or expired. Please verify your mobile again.', 400, { code: 'PROFILE_CHALLENGE_INVALID' });
  }
  if (typeof nameInput !== 'string' || nameInput.trim().length < 2 || nameInput.trim().length > 120) {
    fail('Enter your full name (2–120 characters).', 400, { code: 'PROFILE_NAME_INVALID' });
  }

  const rawAccountType =
    options?.accountType !== undefined && options?.accountType !== null && String(options.accountType).trim() !== ''
      ? String(options.accountType).trim().toUpperCase()
      : 'OWNER';
  if (rawAccountType !== 'OWNER' && rawAccountType !== 'LISTING_PARTNER') {
    fail('Select a valid account type: Property Owner or Listing Partner.', 400, { code: 'INVALID_ACCOUNT_TYPE' });
  }
  const accountType = rawAccountType as 'OWNER' | 'LISTING_PARTNER';

  const rawEmail = typeof emailInput === 'string' ? emailInput.trim() : '';
  const emailProvided = rawEmail.length > 0;
  if (emailProvided) {
    if (rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      fail('Enter a valid email address.', 400, { code: 'PROFILE_EMAIL_INVALID' });
    }
  }

  const db = await getReadyDb();
  const challengeId = challengeIdInput;
  const name = nameInput.trim().replace(/\s+/g, ' ');

  try {
    const result = await db.transaction(async (tx: any) => {
      const challenge = resultRows(await tx.execute(sql`
        SELECT id, phone, status, profile_expires_at
        FROM customer_otp_challenges
        WHERE id = ${challengeId}
        FOR UPDATE
      `))[0];
      if (!challenge || challenge.status !== 'PROFILE_PENDING' || !challenge.profile_expires_at || new Date(challenge.profile_expires_at).getTime() <= Date.now()) {
        fail('Your verified signup session has expired. Please verify your mobile again.', 410, { code: 'PROFILE_CHALLENGE_EXPIRED' });
      }

      const phone = String(challenge.phone);
      const digits = indianPhoneDigits(phone);
      const email = emailProvided ? rawEmail.toLowerCase() : null;

      // Validate partner agency details before creating customer
      const validatedPartner =
        accountType === 'LISTING_PARTNER'
          ? validatePartnerRegistrationInput(options || {}, phone)
          : null;

      // Serialize profile completion attempts for the same number and email across serverless workers.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`);
      if (email) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`email:${email}`}, 0))`);
        const emailMatches = resultRows(await tx.execute(sql`SELECT id FROM customers WHERE lower(email) = ${email} LIMIT 1`));
        if (emailMatches.length) fail('An account with this email already exists. Sign in with the mobile number associated with that account or use another email.', 409, { code: 'EMAIL_ALREADY_EXISTS' });
      }

      const schemaCaps = await getPartnerSchemaCapabilities(tx);
      const phoneMatches = await findCustomerRowsByPhoneDigits(
        tx,
        digits,
        schemaCaps.hasCustomerAccountType
      );
      if (phoneMatches.length) fail('An account already exists for this mobile number and could not be safely linked. Please sign in again or contact support.', 409, { code: 'PHONE_ALREADY_EXISTS' });

      const customerId = `cust_${crypto.randomUUID()}`;
      let created: any;
      if (schemaCaps.hasCustomerAccountType) {
        created = resultRows(await tx.execute(sql`
          INSERT INTO customers
            (id, email, phone, name, account_type, password_hash, status, email_verified_at, phone_verified_at, last_login_at, created_at, updated_at)
          VALUES
            (${customerId}, ${email}, ${phone}, ${name}, ${accountType}, NULL, 'ACTIVE', NULL, now(), now(), now(), now())
          RETURNING id, email, phone, name, account_type, avatar_url, status, phone_verified_at, created_at
        `))[0];
      } else {
        const legacyCreated = resultRows(await tx.execute(sql`
          INSERT INTO customers
            (id, email, phone, name, password_hash, status, email_verified_at, phone_verified_at, last_login_at, created_at, updated_at)
          VALUES
            (${customerId}, ${email}, ${phone}, ${name}, NULL, 'ACTIVE', NULL, now(), now(), now(), now())
          RETURNING id, email, phone, name, avatar_url, status, phone_verified_at, created_at
        `))[0];
        created = legacyCreated ? { ...legacyCreated, account_type: accountType } : null;
        if (created && accountType === 'OWNER') {
          await persistLegacyOwnerAccountType(
            tx,
            customerId,
            'Owner account registered during customer OTP signup'
          );
        }
      }
      if (!created) fail('We could not create your account. Please try again.', 500, { code: 'PROFILE_CREATE_FAILED' });

      let partnerStatus: string | null = null;
      if (validatedPartner) {
        const partnerProfile = await createPartnerProfileInTx(tx, {
          customerId,
          registration: validatedPartner,
          auditReason: 'Listing Partner account registered during customer OTP signup',
        });
        partnerStatus = partnerProfile.status;
      }

      await tx.execute(sql`
        INSERT INTO customer_preferences (id, customer_id, preferred_mode, created_at, updated_at)
        VALUES (${`pref_${crypto.randomUUID()}`}, ${customerId}, 'ALL', now(), now())
        ON CONFLICT (customer_id) DO NOTHING
      `);
      await tx.execute(sql`
        UPDATE customer_otp_challenges
        SET status = 'CONSUMED', customer_id = ${customerId}, updated_at = now()
        WHERE id = ${challengeId} AND status = 'PROFILE_PENDING'
      `);
      return { row: created, partnerStatus };
    });

    return {
      customer: dto(result.row, result.partnerStatus),
      token: await createCustomerSession(String(result.row.id)),
    };
  } catch (error: any) {
    if (error instanceof CustomerOtpError || error instanceof PartnerDomainError) throw error;
    if (error?.code === '23505') {
      const constraint = String(error?.constraint || '');
      if (constraint.includes('partner') || constraint.includes('agency')) {
        throw new PartnerDomainError(
          'An agency partner account with these details already exists. Great Homes allows only one login per agency.',
          409,
          { code: 'AGENCY_ALREADY_REGISTERED' }
        );
      }
      fail('An account with this email or mobile number already exists. Please sign in or use different details.', 409, { code: 'CUSTOMER_ALREADY_EXISTS' });
    }
    throw new CustomerOtpError('We could not complete your profile right now. Please try again.', 500, { code: 'PROFILE_CREATE_FAILED' });
  }
}

export async function sendPhoneChangeOtp(customerId: string, inputPhone: unknown, ip: string) {
  const phone = normalizeIndianPhone(inputPhone);
  const digits = indianPhoneDigits(phone);
  const { apiKey, template } = providerConfig();
  const secret = apiKey;
  const db = await getReadyDb();

  const existingMatches = resultRows(await db.execute(sql`
    SELECT id FROM customers
    WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${digits}
      AND id != ${customerId}
    LIMIT 1
  `));
  if (existingMatches.length > 0) {
    fail('This mobile number is already registered to another account.', 409, { code: 'PHONE_ALREADY_EXISTS' });
  }

  const phoneHash = keyedHash(secret, `phone-change:${phone}`);
  const ipHash = clientIpHash(secret, ip);

  const cooldown = resultRows(await db.execute(sql`
    SELECT id FROM customer_otp_challenges
    WHERE customer_id = ${customerId}
      AND purpose = 'CUSTOMER_PHONE_CHANGE'
      AND created_at > now() - interval '30 seconds'
      AND status IN ('SENDING', 'PENDING', 'VERIFYING')
    ORDER BY created_at DESC
    LIMIT 1
  `))[0];
  if (cooldown) {
    fail('Please wait 30 seconds before requesting another code.', 429, {
      retryAfterSeconds: 30,
      code: 'RESEND_COOLDOWN',
    });
  }

  await consumeRateLimit(db, keyedHash(secret, `send-phone-change:${customerId}`), 3, 15 * 60 * 1000);
  if (ip && ip !== 'unknown') {
    await consumeRateLimit(db, keyedHash(secret, `send-phone-change-ip:${ipHash}`), 10, 60 * 60 * 1000);
  } else {
    await consumeRateLimit(db, keyedHash(secret, 'send-phone-change-ip:unknown'), 25, 60 * 60 * 1000);
  }

  await db.execute(sql`
    UPDATE customer_otp_challenges
    SET status = 'FAILED', updated_at = now()
    WHERE customer_id = ${customerId}
      AND purpose = 'CUSTOMER_PHONE_CHANGE'
      AND status IN ('SENDING', 'PENDING')
  `);

  const challengeId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO customer_otp_challenges
      (id, phone, phone_hash, ip_hash, customer_id, purpose, target_phone, status, attempt_count, expires_at, created_at, updated_at)
    VALUES
      (${challengeId}, ${phone}, ${phoneHash}, ${ipHash}, ${customerId}, 'CUSTOMER_PHONE_CHANGE', ${phone}, 'SENDING', 0, now() + interval '5 minutes', now(), now())
  `);

  const provider = await getOtpProvider(apiKey);
  let providerResponse: any;
  try {
    providerResponse = await provider.send(digits, template);
  } catch (error) {
    await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', updated_at = now() WHERE id = ${challengeId}`);
    throw error;
  }

  const providerStatus = String(providerResponse?.Status ?? providerResponse?.status ?? '').toLowerCase();
  const providerSessionId = String(providerResponse?.Details ?? providerResponse?.details ?? '');
  if (providerStatus !== 'success' || !providerSessionId || providerSessionId.length > 256) {
    await db.execute(sql`UPDATE customer_otp_challenges SET status = 'FAILED', updated_at = now() WHERE id = ${challengeId}`);
    fail('We could not send an OTP right now. Please try again later.', 502, { code: 'OTP_SEND_FAILED' });
  }

  await db.execute(sql`
    UPDATE customer_otp_challenges
    SET provider_session_id = ${providerSessionId},
        status = 'PENDING',
        expires_at = now() + interval '5 minutes',
        updated_at = now()
    WHERE id = ${challengeId} AND status = 'SENDING'
  `);

  return { challengeId, expiresInSeconds: Math.floor(OTP_LIFETIME_MS / 1000), resendAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000) };
}

export async function verifyPhoneChangeOtp(customerId: string, challengeIdInput: unknown, otpInput: unknown, ip: string) {
  if (typeof challengeIdInput !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeIdInput)) {
    fail('This OTP request is invalid or expired. Please request a new code.', 400, { code: 'OTP_CHALLENGE_INVALID' });
  }
  if (typeof otpInput !== 'string' || !/^\d{4}$/.test(otpInput)) {
    fail('Enter the four-digit code sent to your mobile.', 400, { code: 'OTP_FORMAT_INVALID' });
  }

  const { apiKey } = providerConfig();
  const secret = apiKey;
  const db = await getReadyDb();
  const challengeId = challengeIdInput;

  const challenge = resultRows(await db.execute(sql`
    SELECT id, target_phone, phone_hash, provider_session_id, attempt_count
    FROM customer_otp_challenges
    WHERE id = ${challengeId}
      AND customer_id = ${customerId}
      AND purpose = 'CUSTOMER_PHONE_CHANGE'
      AND status = 'PENDING'
      AND expires_at > now()
    LIMIT 1
  `))[0];

  if (!challenge || !challenge.provider_session_id || !challenge.target_phone) {
    fail('This OTP request is invalid or expired. Please request a new code.', 410, { code: 'OTP_CHALLENGE_EXPIRED' });
  }

  await consumeRateLimit(db, keyedHash(secret, `verify-phone-change:${customerId}`), 10, 15 * 60 * 1000);
  if (ip && ip !== 'unknown') {
    await consumeRateLimit(db, keyedHash(secret, `verify-phone-change-ip:${clientIpHash(secret, ip)}`), 20, 60 * 60 * 1000);
  } else {
    await consumeRateLimit(db, keyedHash(secret, 'verify-phone-change-ip:unknown'), 50, 60 * 60 * 1000);
  }

  const claimed = resultRows(await db.execute(sql`
    UPDATE customer_otp_challenges
    SET status = 'VERIFYING', attempt_count = attempt_count + 1, updated_at = now()
    WHERE id = ${challengeId}
      AND customer_id = ${customerId}
      AND purpose = 'CUSTOMER_PHONE_CHANGE'
      AND status = 'PENDING'
      AND expires_at > now()
      AND attempt_count < ${OTP_ATTEMPT_LIMIT}
    RETURNING target_phone, provider_session_id, attempt_count
  `))[0];

  if (!claimed || !claimed.provider_session_id || !claimed.target_phone) {
    fail('This OTP request is invalid, expired, or has too many attempts. Please request a new code.', 410, { code: 'OTP_CHALLENGE_UNAVAILABLE' });
  }

  const targetPhone = String(claimed.target_phone);
  const digits = indianPhoneDigits(targetPhone);

  let verifyResponse: any;
  try {
    const provider = await getOtpProvider(apiKey);
    verifyResponse = await provider.verify(String(claimed.provider_session_id), otpInput);
  } catch (error) {
    const status = Number(claimed.attempt_count) >= OTP_ATTEMPT_LIMIT ? 'FAILED' : 'PENDING';
    await db.execute(sql`UPDATE customer_otp_challenges SET status = ${status}, updated_at = now() WHERE id = ${challengeId} AND status = 'VERIFYING'`);
    throw error;
  }

  const verifyStatus = String(verifyResponse?.Status ?? verifyResponse?.status ?? '').toLowerCase();
  const verifyDetails = String(verifyResponse?.Details ?? verifyResponse?.details ?? '').trim().toLowerCase();
  if (verifyStatus !== 'success' || verifyDetails !== 'otp matched') {
    const status = Number(claimed.attempt_count) >= OTP_ATTEMPT_LIMIT ? 'FAILED' : 'PENDING';
    await db.execute(sql`UPDATE customer_otp_challenges SET status = ${status}, updated_at = now() WHERE id = ${challengeId} AND status = 'VERIFYING'`);
    fail('That code is incorrect or expired. Please try again.', 400, { code: 'OTP_NOT_MATCHED' });
  }

  const updatedCustomer = await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${targetPhone}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`);

    const conflicts = resultRows(await tx.execute(sql`
      SELECT id FROM customers
      WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${digits}
        AND id != ${customerId}
      LIMIT 1
    `));
    if (conflicts.length > 0) {
      fail('This mobile number is already registered to another account.', 409, { code: 'PHONE_ALREADY_EXISTS' });
    }

    const schemaCaps = await getPartnerSchemaCapabilities(tx);
    let cust: any;
    if (schemaCaps.hasCustomerAccountType) {
      const updatedRows = resultRows(await tx.execute(sql`
        UPDATE customers
        SET phone = ${targetPhone},
            phone_verified_at = now(),
            updated_at = now()
        WHERE id = ${customerId}
        RETURNING id, email, phone, name, account_type, avatar_url, status, phone_verified_at, created_at
      `));
      cust = updatedRows[0];
    } else {
      const updatedRows = resultRows(await tx.execute(sql`
        UPDATE customers
        SET phone = ${targetPhone},
            phone_verified_at = now(),
            updated_at = now()
        WHERE id = ${customerId}
        RETURNING id, email, phone, name, avatar_url, status, phone_verified_at, created_at
      `));
      if (updatedRows[0]) {
        const resolvedAccountType = await resolveLegacyCustomerAccountType(tx, customerId);
        cust = { ...updatedRows[0], account_type: resolvedAccountType };
      }
    }

    if (!cust) {
      fail('Customer account not found or inactive.', 404, { code: 'CUSTOMER_NOT_FOUND' });
    }

    await tx.execute(sql`
      UPDATE customer_otp_challenges
      SET status = 'CONSUMED', verified_at = now(), updated_at = now()
      WHERE id = ${challengeId} AND status = 'VERIFYING'
    `);

    await tx.execute(sql`
      INSERT INTO audit_logs (id, actor_staff_id, actor_role, action, resource_type, resource_id, resource_label, metadata, success, created_at)
      VALUES (${`aud_${crypto.randomUUID()}`}, NULL, 'CUSTOMER', 'CUSTOMER_PHONE_CHANGE_VERIFIED', 'CUSTOMER', ${customerId}, ${customerId}, ${JSON.stringify({ customerId, phoneHash: keyedHash(apiKey, `phone:${targetPhone}`) })}::jsonb, true, now())
    `);

    return cust;
  });

  return { customer: dto(updatedCustomer) };
}
