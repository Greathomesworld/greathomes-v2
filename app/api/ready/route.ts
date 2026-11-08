import { NextRequest, NextResponse } from 'next/server';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { getDb } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { validateAndGetConfig } from '@/src/lib/config';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);

  try {
    const config = validateAndGetConfig();
    let dbStatus = 'ready';

    if (config.persistenceProvider === 'postgres') {
      const db = getDb();
      if (!db) {
        throw new Error('PostgreSQL persistence is configured but database connection pool is not initialized.');
      }
      // Execute simple heartbeat query
      await db.execute(sql`SELECT 1`);
    } else {
      dbStatus = 'in-memory-ready';
    }

    const body = {
      status: 'ready',
      persistenceProvider: config.persistenceProvider,
      dbStatus,
      timestamp: new Date().toISOString(),
    };

    const response = NextResponse.json(body, { status: 200 });
    return withCorrelationHeaders(response, requestId);
  } catch (err: any) {
    const body = {
      status: 'not_ready',
      error: 'Readiness check failed.',
      timestamp: new Date().toISOString(),
    };

    const response = NextResponse.json(body, { status: 503 });
    return withCorrelationHeaders(response, requestId);
  }
}
