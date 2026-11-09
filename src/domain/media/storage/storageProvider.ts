import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { isTestIsolationActive, TEST_STORAGE_DIR, ensureTestSandboxDir } from '@/src/lib/testIsolationContext';
import { getActiveMediaPublicBaseUrl, normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

export interface StoragePutOptions {
  contentType: string;
  cacheControl?: string;
  isImmutableOriginal?: boolean;
}

export interface StoragePutResult {
  key: string;
  url: string;
  provider: 'local' | 's3';
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: 'local' | 's3';
  put(key: string, buffer: Buffer, options: StoragePutOptions): Promise<StoragePutResult>;
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  replace(key: string, buffer: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Buffer | null>;
  getPublicUrl(key: string): string;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Local Disk Storage Provider (Development & Self-Hosted Fallback)
 * Stores files under public/uploads/{key}
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'public', 'uploads');
  }

  private resolveSafePath(key: string): string {
    // Sanitize key to prevent path traversal attacks
    const normalizedKey = key.replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
    const resolved = path.resolve(this.baseDir, normalizedKey);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Security violation: Invalid storage key path traversal detected.');
    }
    return resolved;
  }

  async put(key: string, buffer: Buffer, _options: StoragePutOptions): Promise<StoragePutResult> {
    const filePath = this.resolveSafePath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, buffer);
    return {
      key,
      url: this.getPublicUrl(key),
      provider: 'local',
      sizeBytes: buffer.length,
    };
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const res = await this.put(key, buffer, { contentType });
    return res.url;
  }

  async replace(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const res = await this.put(key, buffer, { contentType });
    return res.url;
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(key);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(key);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const filePath = this.resolveSafePath(key);
      if (fs.existsSync(filePath)) {
        return await fs.promises.readFile(filePath);
      }
      return null;
    } catch {
      return null;
    }
  }

  getPublicUrl(key: string): string {
    const normalized = key.replace(/(\.\.(\/|\\|$))+/g, '').replace(/^\/+/, '');
    return `/uploads/${normalized}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.getPublicUrl(key);
  }
}

/**
 * Isolated Test Sandbox Storage Provider
 * Used automatically when MEDIA_TEST_ISOLATED=true or x-test-isolated: true header is present.
 * Writes exclusively to /tmp/gh-media-test-sandbox/storage and NEVER touches Cloudflare R2.
 */
export class TestSandboxStorageProvider extends LocalStorageProvider {
  constructor() {
    ensureTestSandboxDir();
    super(TEST_STORAGE_DIR);
  }
}

/**
 * S3 / Cloudflare R2 Compatible Object Storage Provider
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3' as const;
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const endpoint = (process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '').trim();
    const region = (process.env.S3_REGION || 'auto').trim();
    const accessKeyId = (process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.R2_SECRET_ACCESS_KEY ||
      ''
    ).trim();
    const bucket = (process.env.S3_BUCKET || process.env.R2_BUCKET || '').trim();

    const missing: string[] = [];
    if (!endpoint) missing.push('S3_ENDPOINT (or R2_ENDPOINT)');
    if (!bucket) missing.push('S3_BUCKET (or R2_BUCKET)');
    if (!accessKeyId) missing.push('S3_ACCESS_KEY_ID (or R2_ACCESS_KEY_ID)');
    if (!secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY (or R2_SECRET_ACCESS_KEY)');

    if (missing.length > 0) {
      throw new Error(
        `[StorageProvider] S3/R2 storage configuration is incomplete. Missing required environment variables: ${missing.join(', ')}. Refusing to fall back to ephemeral local storage or a default bucket name.`
      );
    }

    this.bucket = bucket;
    const configuredPublicUrl = (
      process.env.MEDIA_PUBLIC_BASE_URL ||
      process.env.S3_PUBLIC_URL ||
      getActiveMediaPublicBaseUrl()
    )
      .trim()
      .replace(/\/+$/, '');
    this.publicBaseUrl = normalizeMediaPublicUrl(configuredPublicUrl) || configuredPublicUrl;

    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: Boolean(endpoint),
    });
  }

  async put(key: string, buffer: Buffer, options: StoragePutOptions): Promise<StoragePutResult> {
    const normalizedKey = key.replace(/^\/+/, '');
    const cacheControl =
      options.cacheControl ||
      (options.isImmutableOriginal
        ? 'private, no-cache, no-store, max-age=0'
        : 'public, max-age=31536000, immutable');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
        Body: buffer,
        ContentType: options.contentType,
        CacheControl: cacheControl,
      })
    );

    return {
      key: normalizedKey,
      url: this.getPublicUrl(normalizedKey),
      provider: 's3',
      sizeBytes: buffer.length,
    };
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const res = await this.put(key, buffer, { contentType });
    return res.url;
  }

  async replace(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const res = await this.put(key, buffer, { contentType });
    return res.url;
  }

  async delete(key: string): Promise<boolean> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        })
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  getPublicUrl(key: string): string {
    const normalized = key.replace(/(\.\.(\/|\\|$))+/g, '').replace(/^\/+/, '');
    if (this.publicBaseUrl) {
      const candidate = `${this.publicBaseUrl}/${normalized}`;
      return normalizeMediaPublicUrl(candidate) || candidate;
    }
    return `${getActiveMediaPublicBaseUrl()}/${normalized}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return this.getPublicUrl(key);
  }
}

let cachedProvider: StorageProvider | null = null;
let cachedTestProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (isTestIsolationActive()) {
    if (!cachedTestProvider) {
      cachedTestProvider = new TestSandboxStorageProvider();
    }
    return cachedTestProvider;
  }

  if (cachedProvider) return cachedProvider;

  const rawProvider = (process.env.STORAGE_PROVIDER || '').trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  const providerType = rawProvider || (isProduction ? 's3' : 'local');

  if (providerType === 's3' || providerType === 'r2') {
    // Fail explicitly if S3/R2 configuration is missing — never silently fall back to LocalStorageProvider
    cachedProvider = new S3StorageProvider();
    return cachedProvider;
  }

  if (isProduction && providerType === 'local' && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true') {
    throw new Error(
      '[StorageProvider] LocalStorageProvider is disabled in production to prevent ephemeral /uploads/ media records. Set STORAGE_PROVIDER=s3 with valid Cloudflare R2 credentials.'
    );
  }

  cachedProvider = new LocalStorageProvider();
  return cachedProvider;
}

/**
 * Resolves a storage provider matching a stored asset's storageProvider field,
 * while strictly honoring test isolation so test runs never touch live S3/R2.
 */
export function getStorageProviderForAsset(providerName?: string): StorageProvider {
  if (isTestIsolationActive()) {
    return getStorageProvider();
  }
  if (providerName === 's3') {
    return new S3StorageProvider();
  }
  if (providerName === 'local') {
    return new LocalStorageProvider();
  }
  return getStorageProvider();
}

