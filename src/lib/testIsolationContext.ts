import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'node:crypto';
import fs from 'fs';
import path from 'path';

const testIsolationStorage = new AsyncLocalStorage<boolean>();

export const TEST_SANDBOX_DIR = '/tmp/gh-media-test-sandbox';
export const TEST_STORAGE_DIR = path.join(TEST_SANDBOX_DIR, 'storage');
export const TEST_DB_FILE = path.join(TEST_SANDBOX_DIR, 'media_assets.json');
export const TEST_AUDIT_FILE = path.join(TEST_SANDBOX_DIR, 'audit_logs.json');
export const TEST_ENTITY_MEDIA_FILE = path.join(TEST_SANDBOX_DIR, 'entity_media.json');

export const TEST_SECRET_FILE = path.join(TEST_SANDBOX_DIR, '.test-runner-secret');

export function getActiveTestRunnerSecret(): string | null {
  const envVal = process.env.GH_STAFF_TEST_SHARED_SECRET;
  if (envVal && envVal.length >= 32) return envVal;
  try {
    if (fs.existsSync(TEST_SECRET_FILE)) {
      const val = fs.readFileSync(TEST_SECRET_FILE, 'utf8').trim();
      if (val && val.length >= 32) return val;
    }
  } catch {
    return null;
  }
  return null;
}

export function isTestIsolationActive(req?: { headers?: { get?: (name: string) => string | null } } | null): boolean {
  if (process.env.MEDIA_TEST_ISOLATED === 'true') {
    return true;
  }
  if (testIsolationStorage.getStore() === true) {
    return true;
  }
  // External request header x-test-isolated is strictly rejected unless matched with the local test runner secret
  if (req?.headers && typeof req.headers.get === 'function') {
    const headerVal = req.headers.get('x-test-isolated');
    const suppliedToken = req.headers.get('x-staff-test-token')?.trim();
    const activeSecret = getActiveTestRunnerSecret();
    if ((headerVal === 'true' || headerVal === '1') && activeSecret && suppliedToken === activeSecret) {
      return true;
    }
  }
  return false;
}

export function enterTestIsolationForRequest(req?: { headers?: { get?: (name: string) => string | null } } | null): void {
  if (isTestIsolationActive(req)) {
    testIsolationStorage.enterWith(true);
  }
}

export function runInTestIsolation<T>(fn: () => T): T {
  return testIsolationStorage.run(true, fn);
}

export function ensureTestSandboxDir(): void {
  if (!fs.existsSync(TEST_STORAGE_DIR)) {
    fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
  }
}

export function readSandboxJson<T>(filePath: string, fallback: T): T {
  try {
    ensureTestSandboxDir();
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSandboxJson<T>(filePath: string, data: T): void {
  ensureTestSandboxDir();
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

export function initializeTestRunnerSecret(): string {
  ensureTestSandboxDir();
  // Generate 32 bytes (256 bits) of cryptographically secure randomness via Node.js CSPRNG
  const entropy = randomBytes(32).toString('hex');
  const secret = `test_sec_${Date.now()}_${entropy}`;
  fs.writeFileSync(TEST_SECRET_FILE, secret, 'utf8');
  return secret;
}

export function resetTestSandbox(): void {
  try {
    if (fs.existsSync(TEST_SANDBOX_DIR)) {
      fs.rmSync(TEST_SANDBOX_DIR, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup error
  }
}
