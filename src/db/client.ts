import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __ghPgPool?: Pool | null;
  __ghDbInstance?: DrizzleDb | null;
};

let pool: Pool | null = globalForDb.__ghPgPool ?? null;
let dbInstance: DrizzleDb | null = globalForDb.__ghDbInstance ?? null;

function isPreviewOrProdDeployment(): boolean {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.GH_DEPLOYMENT_ENV || '').trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  return (
    nodeEnv === 'production' ||
    vercelEnv === 'production' ||
    vercelEnv === 'preview' ||
    appEnv === 'production' ||
    appEnv === 'preview' ||
    appEnv === 'staging'
  );
}

export function isPostgresRequired(): boolean {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' && !process.env.DATABASE_URL;
  if (isBuildPhase) {
    return false;
  }
  if (isPreviewOrProdDeployment()) {
    return true;
  }
  if (process.env.PERSISTENCE_PROVIDER === 'memory') {
    return false;
  }
  return process.env.PERSISTENCE_PROVIDER === 'postgres';
}

export function getDb() {
  const isPreviewOrProd = isPreviewOrProdDeployment();
  if (process.env.PERSISTENCE_PROVIDER === 'memory') {
    if (isPreviewOrProd && process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(
        'FATAL: PERSISTENCE_PROVIDER=memory is strictly prohibited in Preview and Production environments.'
      );
    }
    return null;
  }
  if (!dbInstance && globalForDb.__ghDbInstance) {
    pool = globalForDb.__ghPgPool ?? null;
    dbInstance = globalForDb.__ghDbInstance;
  }
  const postgresRequired = isPostgresRequired();
  if (!dbInstance) {
    let connectionString = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
    if (!connectionString) {
      if (postgresRequired) {
        throw new Error(
          'FATAL: PostgreSQL DATABASE_URL is required in Preview/Production or when PERSISTENCE_PROVIDER=postgres. Silent fallback to in-memory mode is disabled.'
        );
      }
      return null;
    }
    if (
      connectionString.includes('sslmode=') &&
      !connectionString.includes('uselibpqcompat=') &&
      !connectionString.includes('sslmode=verify-full')
    ) {
      connectionString = connectionString.replace(/sslmode=(require|prefer|verify-ca)/g, 'sslmode=verify-full');
    }
    try {
      pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
        keepAlive: true,
      });
      pool.on('error', (err) => {
        console.warn('PostgreSQL pool idle client error (handled):', err?.message || err);
      });
      dbInstance = drizzle(pool, { schema });
      globalForDb.__ghPgPool = pool;
      globalForDb.__ghDbInstance = dbInstance;
    } catch (err: any) {
      if (postgresRequired) {
        throw new Error(`FATAL: Failed to connect to PostgreSQL database: ${err?.message || err}`);
      }
      return null;
    }
  }
  return dbInstance;
}

export async function getDbReady() {
  return getDb();
}

export function isPostgresConfigured(): boolean {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return false;
  return Boolean(process.env.DATABASE_URL && isPostgresRequired());
}

export function getConciseDatabaseErrorReason(err: unknown): string {
  if (!err) return 'Database unavailable';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Database unavailable';
}
