import type { getDb } from '../db/client';

export type DbClient = NonNullable<ReturnType<typeof getDb>>;

export class PersistenceUnavailableError extends Error {
  public readonly statusCode: number = 503;
  public readonly code: string = 'PERSISTENCE_UNAVAILABLE';

  constructor(
    message: string = 'Persistence service is temporarily unavailable. Please try again later.'
  ) {
    super(message);
    this.name = 'PersistenceUnavailableError';
  }
}

export function isPersistenceUnavailableError(
  err: unknown
): err is PersistenceUnavailableError {
  if (err instanceof PersistenceUnavailableError) {
    return true;
  }
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'PERSISTENCE_UNAVAILABLE'
  ) {
    return true;
  }
  return false;
}

export function isPreviewOrProductionEnvironment(): boolean {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.GH_DEPLOYMENT_ENV || '').trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  return (
    vercelEnv === 'production' ||
    vercelEnv === 'preview' ||
    appEnv === 'production' ||
    appEnv === 'preview' ||
    appEnv === 'staging' ||
    nodeEnv === 'production'
  );
}

export function isStrictTestEnvironment(): boolean {
  if ((process.env.NODE_ENV || '').trim().toLowerCase() !== 'test') {
    return false;
  }
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.GH_DEPLOYMENT_ENV || '').trim().toLowerCase();
  if (
    vercelEnv === 'production' ||
    vercelEnv === 'preview' ||
    appEnv === 'production' ||
    appEnv === 'preview' ||
    appEnv === 'staging'
  ) {
    return false;
  }
  return true;
}

export interface GuardedBackendOptions {
  domain: string;
  allowTestMemoryPersistence: boolean;
  dbResolver: () => ReturnType<typeof getDb>;
}

export type GuardedBackendResult =
  | { mode: 'postgres'; db: DbClient }
  | { mode: 'memory' };

export function resolveGuardedPersistenceBackend(
  options: GuardedBackendOptions
): GuardedBackendResult {
  const rawProvider = process.env.PERSISTENCE_PROVIDER;
  const provider = rawProvider === undefined ? '' : rawProvider.trim().toLowerCase();

  // Reject any unsupported persistence provider in all environments
  if (provider !== '' && provider !== 'postgres' && provider !== 'memory') {
    throw new PersistenceUnavailableError(
      `${options.domain} persistence is unavailable: unsupported persistence provider configuration.`
    );
  }

  // Preview and Production must always require explicit PostgreSQL configuration
  if (isPreviewOrProductionEnvironment() && provider !== 'postgres') {
    throw new PersistenceUnavailableError(
      `${options.domain} persistence is unavailable: PostgreSQL persistence is required in preview and production environments.`
    );
  }

  // Explicit memory mode is permitted ONLY in strict isolated test execution with explicit opt-in
  if (provider === 'memory') {
    if (isStrictTestEnvironment() && options.allowTestMemoryPersistence === true) {
      return { mode: 'memory' };
    }
    throw new PersistenceUnavailableError(
      `${options.domain} persistence is unavailable: in-memory persistence is disabled outside isolated test execution.`
    );
  }

  let db: ReturnType<typeof getDb> = null;
  try {
    db = options.dbResolver();
  } catch {
    throw new PersistenceUnavailableError(
      `${options.domain} persistence is temporarily unavailable. Database connection could not be established.`
    );
  }

  if (db) {
    return { mode: 'postgres', db };
  }

  // Explicit postgres mode must never fall back to memory even in test environments
  if (provider === 'postgres') {
    throw new PersistenceUnavailableError(
      `${options.domain} persistence is temporarily unavailable. PostgreSQL connection is not configured.`
    );
  }

  if (isStrictTestEnvironment() && options.allowTestMemoryPersistence === true) {
    return { mode: 'memory' };
  }

  throw new PersistenceUnavailableError(
    `${options.domain} persistence is temporarily unavailable. PostgreSQL persistence is required.`
  );
}

export async function runWithPersistenceGuard<T>(
  domain: string,
  fn: () => Promise<T>,
  passthroughCheck?: (err: unknown) => boolean
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (isPersistenceUnavailableError(err)) {
      throw err;
    }
    if (passthroughCheck && passthroughCheck(err)) {
      throw err;
    }
    // Never leak database credentials, SQL statements, or internal driver stack traces
    throw new PersistenceUnavailableError(
      `${domain} persistence is temporarily unavailable. Please try again later.`
    );
  }
}
