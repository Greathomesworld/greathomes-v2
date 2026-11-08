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
    const endpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '';
    const region = process.env.S3_REGION || 'auto';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucket = process.env.S3_BUCKET || process.env.R2_BUCKET || 'greathomes-media';
    this.publicBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL || process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '');

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
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
      return `${this.publicBaseUrl}/${normalized}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${normalized}`;
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

  const providerType = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  const hasS3Credentials = Boolean(
    (process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID) &&
      (process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY)
  );

  if ((providerType === 's3' || providerType === 'r2') && hasS3Credentials) {
    cachedProvider = new S3StorageProvider();
  } else {
    cachedProvider = new LocalStorageProvider();
  }

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
  if (providerName === 'local') {
    return new LocalStorageProvider();
  }
  return getStorageProvider();
}
