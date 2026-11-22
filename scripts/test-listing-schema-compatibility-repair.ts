import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/node-postgres';
import { parseListingDate } from '../src/domain/projects/services/listingDateNormalizer';
import {
  RentalListingRepositoryPostgres,
} from '../src/infrastructure/repositories/postgres/rentalRepositoryPostgres';
import {
  ResaleListingRepositoryPostgres,
} from '../src/infrastructure/repositories/postgres/resaleRepositoryPostgres';
import {
  RentalService,
  ValidationError as RentalValidationError,
} from '../src/domain/projects/services/rentalService';
import {
  ResaleListingService,
  ValidationError as ResaleValidationError,
} from '../src/domain/projects/services/resaleService';
import { ProjectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService';
import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
} from '../src/infrastructure/repositories/memory/projectRepositoryMemory';
import { DeveloperRepositoryMemory } from '../src/infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory } from '../src/infrastructure/repositories/memory/locationRepositoryMemory';
import {
  PersistenceUnavailableError,
  isPersistenceUnavailableError,
} from '../src/lib/persistenceGuard';
import {
  safeFetchJson,
  getSafeApiErrorTitle,
} from '../src/lib/safeApiFetch';

const PHASE1_SQL_COLUMNS = [
  'plot_area',
  'custom_locality_display',
  'custom_project_display',
] as const;

const PRE_0012_NOT_NULL_SQL_COLUMNS = [
  'configuration',
  'bedroom_count',
  'furnishing',
  'floor_category',
] as const;

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function makePgError(code: string, message: string, extra?: Record<string, unknown>) {
  const err: any = new Error(message);
  err.code = code;
  if (extra) {
    Object.assign(err, extra);
  }
  return err;
}

function parseQuotedIdentifiers(segment: string): string[] {
  const cols: string[] = [];
  const regex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(segment)) !== null) {
    cols.push(match[1]);
  }
  return cols;
}

function parseInsertSql(sqlText: string) {
  const match = sqlText.match(
    /^insert\s+into\s+"([^"]+)"\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)(?:\s+returning\s+(.+))?$/i
  );
  if (!match) return null;
  const tableName = match[1];
  const columns = parseQuotedIdentifiers(match[2]);
  const valueTokens = match[3].split(',').map((t) => t.trim());
  const returningCols = match[4] ? parseQuotedIdentifiers(match[4]) : [];
  return { tableName, columns, valueTokens, returningCols };
}

function parseUpdateSql(sqlText: string) {
  const match = sqlText.match(
    /^update\s+"([^"]+)"\s+set\s+(.+?)\s+where\s+(.+?)(?:\s+returning\s+(.+))?$/i
  );
  if (!match) return null;
  const tableName = match[1];
  const setSegment = match[2];
  const whereSegment = match[3];
  const returningCols = match[4] ? parseQuotedIdentifiers(match[4]) : [];
  const assignments: Array<{ col: string; token: string }> = [];
  for (const part of setSegment.split(',')) {
    const m = part.trim().match(/^"([^"]+)"\s*=\s*(.+)$/);
    if (m) {
      assignments.push({ col: m[1], token: m[2].trim() });
    }
  }
  return { tableName, assignments, whereSegment, returningCols };
}

function parseDeleteSql(sqlText: string) {
  const match = sqlText.match(
    /^delete\s+from\s+"([^"]+)"\s+where\s+(.+?)(?:\s+returning\s+(.+))?$/i
  );
  if (!match) return null;
  return {
    tableName: match[1],
    whereSegment: match[2],
    returningCols: match[3] ? parseQuotedIdentifiers(match[3]) : [],
  };
}

function parseSelectSql(sqlText: string) {
  const match = sqlText.match(
    /^select\s+(.+?)\s+from\s+"([^"]+)"(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+.+)?(?:\s+limit\s+.+)?$/i
  );
  if (!match) return null;
  const selectCols = parseQuotedIdentifiers(match[1]);
  return {
    tableName: match[2],
    selectCols,
    whereSegment: match[3] || '',
  };
}

function resolveParamToken(token: string, params: unknown[]): unknown {
  const paramMatch = token.match(/^\$(\d+)$/);
  if (paramMatch) {
    const idx = Number(paramMatch[1]) - 1;
    return params[idx];
  }
  if (/^default$/i.test(token)) {
    return '__DEFAULT__';
  }
  if (/^null$/i.test(token)) {
    return null;
  }
  return token;
}

/**
 * Real Drizzle 0.39.3 SQL-capturing PostgreSQL harness.
 * Executes actual `drizzle({ client })` SQL generation (`PgDialect.buildInsertQuery`,
 * `buildUpdateQuery`, `buildSelectQuery`, `buildDeleteQuery`) and validates EVERY
 * generated SQL statement against pre-0012 or post-0012 PostgreSQL rules without
 * touching any live or production database.
 */
function createDrizzleSqlCapturingPgDb(options: {
  tableName: 'rental_listings' | 'resale_listings';
  hasPhase1Columns: boolean;
  enforcePre0012NotNull?: boolean;
  injectErrorOnNextQuery?: Error | null;
}) {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: CapturedQuery[] = [];
  let nextError: Error | null = options.injectErrorOnNextQuery ?? null;
  const enforceNotNull = options.enforcePre0012NotNull ?? !options.hasPhase1Columns;

  const projectRowForColumns = (
    row: Record<string, unknown>,
    cols: string[],
    rowMode?: string
  ) => {
    if (rowMode === 'array') {
      return cols.map((col) => (col in row ? row[col] : null));
    }
    const out: Record<string, unknown> = {};
    for (const col of cols) {
      out[col] = col in row ? row[col] : null;
    }
    return out;
  };

  const TIMESTAMP_SQL_COLUMNS = new Set([
    'availability_date',
    'possession_date',
    'verified_at',
    'created_at',
    'updated_at',
  ]);

  const toPgTimestampWithoutTz = (val: unknown): string | null => {
    if (val === null || val === undefined) return null;
    const d = val instanceof Date ? val : new Date(String(val));
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toISOString().replace('T', ' ').replace(/Z$/, '');
  };

  const mockPgClient = {
    query: async (queryInput: string | { text: string; rowMode?: string }, params: unknown[] = []) => {
      const sqlText = typeof queryInput === 'string' ? queryInput : queryInput.text;
      const rowMode = typeof queryInput === 'string' ? undefined : queryInput.rowMode;
      queries.push({ sql: sqlText, params: [...params] });

      if (nextError) {
        const errToThrow = nextError;
        nextError = null;
        throw errToThrow;
      }

      // Enforce pre-0012 column existence on the ACTUAL Drizzle-generated SQL string!
      if (!options.hasPhase1Columns) {
        for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
          const colPattern = new RegExp(`"${forbiddenCol}"|\\b${forbiddenCol}\\b`, 'i');
          if (colPattern.test(sqlText)) {
            throw makePgError(
              '42703',
              `column "${forbiddenCol}" of relation "${options.tableName}" does not exist`
            );
          }
        }
      }

      // Handle INSERT
      const insertParsed = parseInsertSql(sqlText);
      if (insertParsed) {
        if (insertParsed.tableName !== options.tableName) {
          return { rows: [] };
        }
        const nowPg = toPgTimestampWithoutTz(new Date());
        const stored: Record<string, unknown> = {};
        for (let i = 0; i < insertParsed.columns.length; i++) {
          const col = insertParsed.columns[i];
          const val = resolveParamToken(insertParsed.valueTokens[i], params);
          if (val === '__DEFAULT__') {
            if (col === 'created_at' || col === 'updated_at') {
              stored[col] = nowPg;
            } else {
              stored[col] = null;
            }
          } else if (TIMESTAMP_SQL_COLUMNS.has(col)) {
            stored[col] = toPgTimestampWithoutTz(val);
          } else {
            stored[col] = val;
          }
        }
        if (enforceNotNull) {
          for (const nnCol of PRE_0012_NOT_NULL_SQL_COLUMNS) {
            if (stored[nnCol] === null || stored[nnCol] === undefined) {
              throw makePgError(
                '23502',
                `null value in column "${nnCol}" of relation "${options.tableName}" violates not-null constraint`,
                { column: nnCol, table: options.tableName }
              );
            }
          }
        }
        rows.set(String(stored.id), stored);
        return {
          rows: [projectRowForColumns(stored, insertParsed.returningCols, rowMode)],
        };
      }

      // Handle UPDATE
      const updateParsed = parseUpdateSql(sqlText);
      if (updateParsed) {
        if (updateParsed.tableName !== options.tableName) {
          return { rows: [] };
        }
        const whereParamMatch = updateParsed.whereSegment.match(/\$(\d+)/);
        const targetId = whereParamMatch ? String(params[Number(whereParamMatch[1]) - 1]) : null;
        const existing = targetId ? rows.get(targetId) : undefined;
        if (!existing) {
          return { rows: [] };
        }
        const updated: Record<string, unknown> = { ...existing };
        for (const { col, token } of updateParsed.assignments) {
          const val = resolveParamToken(token, params);
          if (val === '__DEFAULT__') {
            updated[col] = null;
          } else if (TIMESTAMP_SQL_COLUMNS.has(col)) {
            updated[col] = toPgTimestampWithoutTz(val);
          } else {
            updated[col] = val;
          }
        }
        if (enforceNotNull) {
          for (const nnCol of PRE_0012_NOT_NULL_SQL_COLUMNS) {
            if (updated[nnCol] === null || updated[nnCol] === undefined) {
              throw makePgError(
                '23502',
                `null value in column "${nnCol}" of relation "${options.tableName}" violates not-null constraint`,
                { column: nnCol, table: options.tableName }
              );
            }
          }
        }
        rows.set(String(updated.id), updated);
        return {
          rows: [projectRowForColumns(updated, updateParsed.returningCols, rowMode)],
        };
      }

      // Handle DELETE
      const deleteParsed = parseDeleteSql(sqlText);
      if (deleteParsed) {
        if (deleteParsed.tableName !== options.tableName) {
          return { rows: [] };
        }
        const whereParamMatch = deleteParsed.whereSegment.match(/\$(\d+)/);
        const targetId = whereParamMatch ? String(params[Number(whereParamMatch[1]) - 1]) : null;
        const existing = targetId ? rows.get(targetId) : undefined;
        if (!existing) {
          return { rows: [] };
        }
        rows.delete(targetId!);
        return {
          rows: [projectRowForColumns(existing, deleteParsed.returningCols, rowMode)],
        };
      }

      // Handle SELECT
      const selectParsed = parseSelectSql(sqlText);
      if (selectParsed) {
        if (selectParsed.tableName !== options.tableName) {
          return { rows: [] };
        }
        let matched = Array.from(rows.values());
        if (selectParsed.whereSegment) {
          const whereParamMatch = selectParsed.whereSegment.match(/\$(\d+)/);
          const filterVal = whereParamMatch ? params[Number(whereParamMatch[1]) - 1] : undefined;
          if (/LOWER\("[^"]+"\."slug"\)/i.test(selectParsed.whereSegment) && typeof filterVal === 'string') {
            matched = matched.filter(
              (r) => typeof r.slug === 'string' && r.slug.toLowerCase() === filterVal.toLowerCase()
            );
          } else if (/"id"\s*=\s*\$/i.test(selectParsed.whereSegment) && typeof filterVal === 'string') {
            matched = matched.filter((r) => r.id === filterVal);
          }
        }
        return {
          rows: matched.map((r) => projectRowForColumns(r, selectParsed.selectCols, rowMode)),
        };
      }

      return { rows: [] };
    },
  };

  const db = drizzle({ client: mockPgClient as any });
  return {
    db,
    rows,
    queries,
    setNextError: (err: Error | null) => {
      nextError = err;
    },
  };
}

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err?.stack || err?.message || err}`);
  }
}

async function main() {
  (process.env as any).NODE_ENV = 'test';
  console.log('\n=== Listing Schema Compatibility, Real Drizzle 0.39.3 SQL Generation & Safe Fetch Tests ===\n');

  // 1. Date Normalization Tests
  await runTest('1. parseListingDate handles empty / null / undefined cleanly', () => {
    assert.equal(parseListingDate(null, 'Possession date', ResaleValidationError), null);
    assert.equal(parseListingDate(undefined, 'Possession date', ResaleValidationError), null);
    assert.equal(parseListingDate('', 'Possession date', ResaleValidationError), null);
    assert.equal(parseListingDate('   ', 'Availability date', RentalValidationError), null);
  });

  await runTest('2. parseListingDate parses YYYY-MM-DD deterministically as UTC midnight without day shift', () => {
    const d = parseListingDate('2026-06-15', 'Possession date', ResaleValidationError);
    assert.ok(d instanceof Date);
    assert.equal(d.toISOString(), '2026-06-15T00:00:00.000Z');

    const leap = parseListingDate('2028-02-29', 'Possession date', ResaleValidationError);
    assert.ok(leap instanceof Date);
    assert.equal(leap.toISOString(), '2028-02-29T00:00:00.000Z');
  });

  await runTest('3. parseListingDate parses valid ISO strings and Date objects', () => {
    const iso = parseListingDate('2026-08-20T00:00:00.000Z', 'Possession date', ResaleValidationError);
    assert.ok(iso instanceof Date);
    assert.equal(iso.toISOString(), '2026-08-20T00:00:00.000Z');

    const dateObj = parseListingDate(new Date('2026-12-01T00:00:00.000Z'), 'Availability date', RentalValidationError);
    assert.ok(dateObj instanceof Date);
    assert.equal(dateObj.toISOString(), '2026-12-01T00:00:00.000Z');
  });

  await runTest('4. parseListingDate rejects invalid & calendar-rollover dates with ValidationError', () => {
    for (const bad of ['2026-02-31', '2025-02-29', '2026-04-31', '2026-13-01', 'not-a-date', '15-06-2026', new Date('invalid')]) {
      assert.throws(
        () => parseListingDate(bad, 'Possession date', ResaleValidationError),
        (err: any) => err instanceof ResaleValidationError && /Possession date/i.test(err.message)
      );
    }
  });

  // 2. Real Drizzle 0.39.3 SQL Generation Tests — RENTAL LEGACY & PRIMARY
  await runTest('5. Rental legacy INSERT SQL (real Drizzle 0.39.3) excludes plot_area, custom_locality_display, custom_project_display', async () => {
    const harness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: false,
    });
    const repo = new RentalListingRepositoryPostgres(() => harness.db as any);

    const created = await repo.create({
      slug: '2-bhk-salt-lake-rent-legacy-1',
      projectId: null,
      locationId: '00000000-0000-0000-0000-000000000001',
      propertyType: 'APARTMENT',
      configuration: '2 BHK Semi Furnished',
      bedroomCount: 2,
      monthlyRent: 28000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'EAST',
      floorCategory: 'MID_FLOOR',
      possession: 'READY',
      availabilityDate: new Date('2026-09-01T00:00:00.000Z'),
      listingPartyType: 'OWNER',
      lifecycleStatus: 'DRAFT',
      verificationStatus: 'UNVERIFIED',
    });

    // Two queries executed: (1) primary full-schema INSERT -> rejected by 42703, (2) legacy INSERT -> succeeds
    assert.equal(harness.queries.length, 2, 'Expected 1 primary attempt + 1 legacy fallback attempt');

    const primarySql = harness.queries[0].sql;
    const legacySql = harness.queries[1].sql;
    const legacyParams = harness.queries[1].params;

    // Primary SQL remains unchanged (still targets full schema with Phase 1 columns)
    assert.ok(primarySql.includes('insert into "rental_listings"'), 'Primary SQL must target rental_listings');
    for (const col of PHASE1_SQL_COLUMNS) {
      assert.ok(primarySql.includes(`"${col}"`), `Primary post-0012 SQL must still include "${col}"`);
    }

    // Legacy SQL must strictly exclude all 3 Phase 1 columns everywhere (INSERT column list + RETURNING)
    const parsedLegacy = parseInsertSql(legacySql);
    assert.ok(parsedLegacy, `Expected valid INSERT SQL, got: ${legacySql}`);
    assert.equal(parsedLegacy.tableName, 'rental_listings');
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(
        !legacySql.toLowerCase().includes(forbiddenCol),
        `Legacy Rental INSERT SQL must NOT contain "${forbiddenCol}", got: ${legacySql}`
      );
      assert.ok(
        !parsedLegacy.columns.includes(forbiddenCol),
        `Legacy Rental INSERT column list must NOT include "${forbiddenCol}"`
      );
      assert.ok(
        !parsedLegacy.returningCols.includes(forbiddenCol),
        `Legacy Rental RETURNING list must NOT include "${forbiddenCol}"`
      );
    }

    // Verify expected legacy columns, parameterization, and RETURNING behavior
    for (const requiredLegacyCol of [
      'id',
      'slug',
      'project_id',
      'property_type',
      'configuration',
      'bedroom_count',
      'monthly_rent',
      'furnishing',
      'facing',
      'floor_category',
      'possession',
      'availability_date',
      'listing_party_type',
      'lifecycle_status',
      'verification_status',
      'location_id',
      'latitude',
      'longitude',
      'geometry',
      'created_at',
      'updated_at',
    ]) {
      assert.ok(
        parsedLegacy.columns.includes(requiredLegacyCol),
        `Legacy Rental INSERT must include "${requiredLegacyCol}"`
      );
      assert.ok(
        parsedLegacy.returningCols.includes(requiredLegacyCol),
        `Legacy Rental RETURNING must include "${requiredLegacyCol}"`
      );
    }
    assert.ok(legacySql.includes('$1') && legacyParams.length >= 20, 'Legacy INSERT must use parameterized bind values');
    assert.ok(!legacySql.includes('2-bhk-salt-lake-rent-legacy-1'), 'User values must be parameterized, not interpolated');
    assert.ok(legacyParams.includes('2-bhk-salt-lake-rent-legacy-1'));

    assert.ok(created.id.startsWith('rent_'));
    assert.equal(created.monthlyRent, 28000);
    assert.equal(created.availabilityDate?.toISOString(), '2026-09-01T00:00:00.000Z');

    // Subsequent create goes directly to legacy INSERT (only 1 query, no repeated 42703)
    const countBeforeSecond = harness.queries.length;
    await repo.create({
      slug: '2-bhk-salt-lake-rent-legacy-2',
      projectId: null,
      locationId: '00000000-0000-0000-0000-000000000001',
      propertyType: 'APARTMENT',
      configuration: '2 BHK Standard',
      bedroomCount: 2,
      monthlyRent: 30000,
      furnishing: 'UNFURNISHED',
      facing: 'NORTH',
      floorCategory: 'LOWER_FLOOR',
      possession: 'READY',
      listingPartyType: 'OWNER',
      lifecycleStatus: 'DRAFT',
      verificationStatus: 'UNVERIFIED',
    });
    assert.equal(harness.queries.length, countBeforeSecond + 1, 'Cached legacy mode must bypass failing primary attempt');

    // Verify legacy UPDATE and DELETE also emit valid SQL without Phase 1 columns
    const updated = await repo.update(created.id, {
      monthlyRent: 31000,
      availabilityDate: null,
    });
    assert.equal(updated.monthlyRent, 31000);
    assert.equal(updated.availabilityDate, undefined);
    const updateSql = harness.queries[harness.queries.length - 1].sql;
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(!updateSql.toLowerCase().includes(forbiddenCol), `Legacy UPDATE SQL must NOT contain "${forbiddenCol}"`);
    }

    const deleted = await repo.delete(created.id);
    assert.equal(deleted, true);
    const deleteSql = harness.queries[harness.queries.length - 1].sql;
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(!deleteSql.toLowerCase().includes(forbiddenCol), `Legacy DELETE SQL must NOT contain "${forbiddenCol}"`);
    }
  });

  // 3. Real Drizzle 0.39.3 SQL Generation Tests — RESALE LEGACY & PRIMARY
  await runTest('6. Resale legacy INSERT SQL (real Drizzle 0.39.3) excludes plot_area, custom_locality_display, custom_project_display', async () => {
    const harness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: false,
    });
    const repo = new ResaleListingRepositoryPostgres(() => harness.db as any);

    const created = await repo.create({
      slug: '3-bhk-ballygunge-resale-legacy-1',
      projectId: null,
      locationId: '00000000-0000-0000-0000-000000000002',
      propertyType: 'APARTMENT',
      configuration: '3 BHK Executive',
      bedroomCount: 3,
      askingPrice: 12500000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'NORTH_EAST',
      floorCategory: 'HIGH_FLOOR',
      possession: 'UNDER_CONSTRUCTION',
      possessionDate: new Date('2027-03-15T00:00:00.000Z'),
      listingPartyType: 'OWNER',
      lifecycleStatus: 'DRAFT',
      verificationStatus: 'UNVERIFIED',
    });

    assert.equal(harness.queries.length, 2, 'Expected 1 primary attempt + 1 legacy fallback attempt');

    const primarySql = harness.queries[0].sql;
    const legacySql = harness.queries[1].sql;
    const legacyParams = harness.queries[1].params;

    // Primary SQL remains unchanged (still targets full schema with Phase 1 columns)
    assert.ok(primarySql.includes('insert into "resale_listings"'), 'Primary SQL must target resale_listings');
    for (const col of PHASE1_SQL_COLUMNS) {
      assert.ok(primarySql.includes(`"${col}"`), `Primary post-0012 SQL must still include "${col}"`);
    }

    // Legacy SQL must strictly exclude all 3 Phase 1 columns everywhere (INSERT column list + RETURNING)
    const parsedLegacy = parseInsertSql(legacySql);
    assert.ok(parsedLegacy, `Expected valid INSERT SQL, got: ${legacySql}`);
    assert.equal(parsedLegacy.tableName, 'resale_listings');
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(
        !legacySql.toLowerCase().includes(forbiddenCol),
        `Legacy Resale INSERT SQL must NOT contain "${forbiddenCol}", got: ${legacySql}`
      );
      assert.ok(
        !parsedLegacy.columns.includes(forbiddenCol),
        `Legacy Resale INSERT column list must NOT include "${forbiddenCol}"`
      );
      assert.ok(
        !parsedLegacy.returningCols.includes(forbiddenCol),
        `Legacy Resale RETURNING list must NOT include "${forbiddenCol}"`
      );
    }

    // Verify expected legacy columns, parameterization, and RETURNING behavior
    for (const requiredLegacyCol of [
      'id',
      'slug',
      'project_id',
      'property_type',
      'configuration',
      'bedroom_count',
      'asking_price',
      'furnishing',
      'facing',
      'floor_category',
      'possession',
      'possession_date',
      'listing_party_type',
      'lifecycle_status',
      'verification_status',
      'location_id',
      'latitude',
      'longitude',
      'geometry',
      'created_at',
      'updated_at',
    ]) {
      assert.ok(
        parsedLegacy.columns.includes(requiredLegacyCol),
        `Legacy Resale INSERT must include "${requiredLegacyCol}"`
      );
      assert.ok(
        parsedLegacy.returningCols.includes(requiredLegacyCol),
        `Legacy Resale RETURNING must include "${requiredLegacyCol}"`
      );
    }
    assert.ok(legacySql.includes('$1') && legacyParams.length >= 20, 'Legacy INSERT must use parameterized bind values');
    assert.ok(!legacySql.includes('3-bhk-ballygunge-resale-legacy-1'), 'User values must be parameterized, not interpolated');
    assert.ok(legacyParams.includes('3-bhk-ballygunge-resale-legacy-1'));

    assert.ok(created.id.startsWith('resale_'));
    assert.equal(created.askingPrice, 12500000);
    assert.equal(created.possessionDate?.toISOString(), '2027-03-15T00:00:00.000Z');

    // Verify legacy UPDATE and DELETE also emit valid SQL without Phase 1 columns
    const updated = await repo.update(created.id, {
      askingPrice: 13000000,
      possessionDate: null,
    });
    assert.equal(updated.askingPrice, 13000000);
    assert.equal(updated.possessionDate, undefined);
    const updateSql = harness.queries[harness.queries.length - 1].sql;
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(!updateSql.toLowerCase().includes(forbiddenCol), `Legacy UPDATE SQL must NOT contain "${forbiddenCol}"`);
    }

    const deleted = await repo.delete(created.id);
    assert.equal(deleted, true);
    const deleteSql = harness.queries[harness.queries.length - 1].sql;
    for (const forbiddenCol of PHASE1_SQL_COLUMNS) {
      assert.ok(!deleteSql.toLowerCase().includes(forbiddenCol), `Legacy DELETE SQL must NOT contain "${forbiddenCol}"`);
    }
  });

  // 4. Populated Phase 1 Fields Must Never Be Silently Discarded
  await runTest('7. Rental & Resale reject populated Phase 1 fields on pre-0012 schema with ValidationError (never silently dropped)', async () => {
    const rentalHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: false,
    });
    const rentalRepo = new RentalListingRepositoryPostgres(() => rentalHarness.db as any);

    await assert.rejects(
      () =>
        rentalRepo.create({
          slug: 'villa-rent-phase1-fail',
          projectId: null,
          locationId: '00000000-0000-0000-0000-000000000001',
          propertyType: 'VILLA',
          configuration: '4 BHK Villa',
          bedroomCount: 4,
          plotArea: 2200,
          monthlyRent: 85000,
          furnishing: 'FULLY_FURNISHED',
          facing: 'NORTH',
          floorCategory: 'LOWER_FLOOR',
          possession: 'READY',
          listingPartyType: 'OWNER',
          lifecycleStatus: 'DRAFT',
          verificationStatus: 'UNVERIFIED',
        }),
      (err: any) => err.name === 'ValidationError' && /plotArea/i.test(err.message)
    );
    assert.equal(rentalHarness.rows.size, 0, 'Rejected Phase 1 rental must not be persisted');

    const resaleHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: false,
    });
    const resaleRepo = new ResaleListingRepositoryPostgres(() => resaleHarness.db as any);

    await assert.rejects(
      () =>
        resaleRepo.create({
          slug: 'resale-phase1-fail',
          projectId: null,
          locationId: '00000000-0000-0000-0000-000000000002',
          propertyType: 'INDEPENDENT_HOUSE',
          configuration: '4 BHK House',
          bedroomCount: 4,
          askingPrice: 25000000,
          customLocalityDisplay: 'Ballygunge Circular Road',
          customProjectDisplay: 'Heritage Villa',
          furnishing: 'UNFURNISHED',
          facing: 'SOUTH',
          floorCategory: 'LOWER_FLOOR',
          possession: 'READY',
          listingPartyType: 'OWNER',
          lifecycleStatus: 'DRAFT',
          verificationStatus: 'UNVERIFIED',
        }),
      (err: any) =>
        err.name === 'ValidationError' &&
        /customLocalityDisplay/i.test(err.message) &&
        /customProjectDisplay/i.test(err.message)
    );
    assert.equal(resaleHarness.rows.size, 0, 'Rejected Phase 1 resale must not be persisted');
  });

  // 5. Fallback Must NOT Trigger on Unrelated Database Errors
  await runTest('8. Unrelated DB errors (connection drop / non-Phase-1 42703) do NOT trigger legacy fallback', async () => {
    const rentalHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: true,
      injectErrorOnNextQuery: makePgError('08006', 'connection failure'),
    });
    const rentalRepo = new RentalListingRepositoryPostgres(() => rentalHarness.db as any);

    await assert.rejects(
      () =>
        rentalRepo.create({
          slug: 'unrelated-conn-err',
          projectId: null,
          locationId: '00000000-0000-0000-0000-000000000001',
          propertyType: 'APARTMENT',
          configuration: '2 BHK',
          bedroomCount: 2,
          monthlyRent: 25000,
          furnishing: 'SEMI_FURNISHED',
          facing: 'EAST',
          floorCategory: 'MID_FLOOR',
          possession: 'READY',
          listingPartyType: 'OWNER',
          lifecycleStatus: 'DRAFT',
          verificationStatus: 'UNVERIFIED',
        }),
      (err: any) => isPersistenceUnavailableError(err) && err instanceof PersistenceUnavailableError
    );
    assert.equal(rentalHarness.queries.length, 1, 'Connection error must NOT retry via legacy fallback');

    const resaleHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: true,
      injectErrorOnNextQuery: makePgError('42703', 'column "some_unrelated_column" of relation "resale_listings" does not exist'),
    });
    const resaleRepo = new ResaleListingRepositoryPostgres(() => resaleHarness.db as any);

    await assert.rejects(
      () =>
        resaleRepo.create({
          slug: 'unrelated-42703-err',
          projectId: null,
          locationId: '00000000-0000-0000-0000-000000000002',
          propertyType: 'APARTMENT',
          configuration: '3 BHK',
          bedroomCount: 3,
          askingPrice: 9000000,
          furnishing: 'SEMI_FURNISHED',
          facing: 'NORTH',
          floorCategory: 'MID_FLOOR',
          possession: 'READY',
          listingPartyType: 'OWNER',
          lifecycleStatus: 'DRAFT',
          verificationStatus: 'UNVERIFIED',
        }),
      (err: any) => isPersistenceUnavailableError(err)
    );
    assert.equal(resaleHarness.queries.length, 1, 'Non-Phase-1 42703 must NOT retry via legacy fallback');
  });

  // 6. Post-0012 Primary Path Remains Intact
  await runTest('9. Both repositories persist Phase 1 fields via primary post-0012 INSERT SQL with single query', async () => {
    const rentalHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: true,
    });
    const rentalRepo = new RentalListingRepositoryPostgres(() => rentalHarness.db as any);
    const createdRental = await rentalRepo.create({
      slug: 'villa-rent-post-0012',
      projectId: null,
      locationId: '00000000-0000-0000-0000-000000000001',
      propertyType: 'VILLA',
      configuration: '4 BHK Villa',
      bedroomCount: 4,
      plotArea: 2400,
      customLocalityDisplay: 'Action Area IIB',
      customProjectDisplay: 'Green Enclave',
      monthlyRent: 75000,
      furnishing: 'FULLY_FURNISHED',
      facing: 'EAST',
      floorCategory: 'LOWER_FLOOR',
      possession: 'READY',
      listingPartyType: 'OWNER',
      lifecycleStatus: 'DRAFT',
      verificationStatus: 'UNVERIFIED',
    });
    assert.equal(rentalHarness.queries.length, 1, 'Post-0012 Rental insert must succeed in 1 query');
    for (const col of PHASE1_SQL_COLUMNS) {
      assert.ok(rentalHarness.queries[0].sql.includes(`"${col}"`), `Post-0012 Rental SQL must include "${col}"`);
    }
    assert.equal(createdRental.plotArea, 2400);
    assert.equal(createdRental.customLocalityDisplay, 'Action Area IIB');
    assert.equal(createdRental.customProjectDisplay, 'Green Enclave');

    const resaleHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: true,
    });
    const resaleRepo = new ResaleListingRepositoryPostgres(() => resaleHarness.db as any);
    const createdResale = await resaleRepo.create({
      slug: 'villa-resale-post-0012',
      projectId: null,
      locationId: '00000000-0000-0000-0000-000000000002',
      propertyType: 'VILLA',
      configuration: '4 BHK Villa',
      bedroomCount: 4,
      plotArea: 3000,
      customLocalityDisplay: 'Action Area IIC',
      customProjectDisplay: 'Palm Groves',
      askingPrice: 32000000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'NORTH',
      floorCategory: 'LOWER_FLOOR',
      possession: 'READY',
      listingPartyType: 'OWNER',
      lifecycleStatus: 'DRAFT',
      verificationStatus: 'UNVERIFIED',
    });
    assert.equal(resaleHarness.queries.length, 1, 'Post-0012 Resale insert must succeed in 1 query');
    for (const col of PHASE1_SQL_COLUMNS) {
      assert.ok(resaleHarness.queries[0].sql.includes(`"${col}"`), `Post-0012 Resale SQL must include "${col}"`);
    }
    assert.equal(createdResale.plotArea, 3000);
    assert.equal(createdResale.customLocalityDisplay, 'Action Area IIC');
    assert.equal(createdResale.customProjectDisplay, 'Palm Groves');
  });

  // 7. End-to-End Service Tests against Pre-0012 Legacy Drizzle SQL Harness
  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();

  const projectService = new ProjectIntelligenceService(
    projectRepo,
    configRepo,
    mediaRepo,
    reraRepo,
    amenityRepo,
    faqRepo,
    devRepo,
    locRepo
  );

  const developer = await devRepo.create({
    name: 'Test Group',
    slug: 'test-group',
    description: 'Test developer',
    shortDescription: 'Test',
    websiteUrl: 'https://example.com',
    status: 'PUBLISHED',
    featured: false,
  });
  const location = await locRepo.create({
    name: 'New Town',
    slug: 'new-town',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: false,
  });
  const project = await projectService.createProject({
    developerId: developer.id,
    locationId: location.id,
    name: 'Merlin Rise',
    slug: 'merlin-rise',
    status: 'READY_TO_MOVE',
    propertyType: 'APARTMENT',
    lifecycleStatus: 'PUBLISHED',
  });

  await runTest('10. ResaleListingService create/update/lifecycle/verify/delete on real Drizzle pre-0012 SQL harness', async () => {
    const harness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: false,
    });
    const repo = new ResaleListingRepositoryPostgres(() => harness.db as any);
    const service = new ResaleListingService(repo, projectService);

    const createdEmpty = await service.createListing({
      projectId: project.id,
      propertyType: 'APARTMENT',
      configuration: '3 BHK Ready',
      bedroomCount: 3,
      askingPrice: 9500000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'EAST',
      floorCategory: 'MID_FLOOR',
      possession: 'READY',
      possessionDate: '' as any,
      listingPartyType: 'OWNER',
    });
    assert.equal(createdEmpty.possessionDate ?? null, null);

    const createdIso = await service.createListing({
      projectId: project.id,
      propertyType: 'APARTMENT',
      configuration: '3 BHK Under Construction',
      bedroomCount: 3,
      askingPrice: 11200000,
      furnishing: 'UNFURNISHED',
      facing: 'NORTH',
      floorCategory: 'HIGH_FLOOR',
      possession: 'UNDER_CONSTRUCTION',
      possessionDate: '2027-06-15T00:00:00.000Z' as any,
      listingPartyType: 'OWNER',
    });
    assert.equal(createdIso.possessionDate, '2027-06-15T00:00:00.000Z');

    const updatedDate = await service.updateListing(createdIso.id, {
      possessionDate: '2027-09-20' as any,
    });
    assert.equal(updatedDate.possessionDate, '2027-09-20T00:00:00.000Z');

    const clearedDate = await service.updateListing(createdIso.id, {
      possessionDate: '' as any,
    });
    assert.equal(clearedDate.possessionDate ?? null, null);

    await assert.rejects(
      () =>
        service.createListing({
          projectId: project.id,
          propertyType: 'APARTMENT',
          configuration: '2 BHK Bad Date',
          bedroomCount: 2,
          askingPrice: 6500000,
          furnishing: 'UNFURNISHED',
          facing: 'EAST',
          floorCategory: 'MID_FLOOR',
          possession: 'UNDER_CONSTRUCTION',
          possessionDate: '2026-02-31' as any,
          listingPartyType: 'OWNER',
        }),
      (err: any) => err instanceof ResaleValidationError
    );

    const verified = await service.setVerificationStatus(createdIso.id, 'VERIFIED', 'Admin');
    assert.equal(verified.verificationStatus, 'VERIFIED');

    const submitted = await service.transitionLifecycle(createdIso.id, 'SUBMITTED');
    assert.equal(submitted.lifecycleStatus, 'SUBMITTED');

    const deleted = await service.deleteListing(createdIso.id);
    assert.equal(deleted, true);
  });

  await runTest('11. RentalService create/update/lifecycle/verify/delete on real Drizzle pre-0012 SQL harness', async () => {
    const harness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: false,
    });
    const repo = new RentalListingRepositoryPostgres(() => harness.db as any);
    const service = new RentalService(repo, projectService);

    const created = await service.createListing({
      projectId: project.id,
      propertyType: 'APARTMENT',
      configuration: '2 BHK Furnished',
      bedroomCount: 2,
      monthlyRent: 32000,
      furnishing: 'FULLY_FURNISHED',
      facing: 'SOUTH',
      floorCategory: 'MID_FLOOR',
      possession: 'READY',
      availabilityDate: '2026-10-01' as any,
      listingPartyType: 'OWNER',
    });
    assert.equal(created.availabilityDate, '2026-10-01T00:00:00.000Z');

    const cleared = await service.updateListing(created.id, {
      availabilityDate: null,
    });
    assert.equal(cleared.availabilityDate ?? null, null);

    await assert.rejects(
      () =>
        service.updateListing(created.id, {
          availabilityDate: 'not-a-date' as any,
        }),
      (err: any) => err instanceof RentalValidationError
    );

    const verified = await service.updateVerification(created.id, 'VERIFIED', 'Admin');
    assert.equal(verified.verificationStatus, 'VERIFIED');

    const submitted = await service.transitionLifecycle(created.id, 'SUBMITTED');
    assert.equal(submitted.lifecycleStatus, 'SUBMITTED');

    const deleted = await service.deleteListing(created.id);
    assert.equal(deleted, true);
  });

  // 8. Secondary NOT NULL Compatibility Tests (Plot & Independent House on pre-0012)
  await runTest('12. Plot & Independent House pre-0012 NOT NULL handling (no fake data fabrication, clean ValidationError)', async () => {
    // Independent House with all Admin form fields populated succeeds on pre-0012
    const resaleHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'resale_listings',
      hasPhase1Columns: false,
      enforcePre0012NotNull: true,
    });
    const resaleRepo = new ResaleListingRepositoryPostgres(() => resaleHarness.db as any);
    const resaleService = new ResaleListingService(resaleRepo, projectService);

    const validHouse = await resaleService.createListing({
      projectId: project.id,
      propertyType: 'INDEPENDENT_HOUSE',
      configuration: '4 BHK Independent House',
      bedroomCount: 4,
      askingPrice: 28000000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'NORTH_EAST',
      floorCategory: 'MID_FLOOR',
      possession: 'READY',
      listingPartyType: 'OWNER',
    });
    assert.equal(validHouse.propertyType, 'INDEPENDENT_HOUSE');
    assert.equal(validHouse.floorCategory, 'MID_FLOOR');

    // Independent House omitting floorCategory (null) on pre-0012 hits 23502 -> mapped to ValidationError (NOT 503, NOT fake data)
    await assert.rejects(
      () =>
        resaleService.createListing({
          projectId: project.id,
          propertyType: 'INDEPENDENT_HOUSE',
          configuration: '4 BHK Independent House',
          bedroomCount: 4,
          askingPrice: 28000000,
          furnishing: 'SEMI_FURNISHED',
          facing: 'NORTH_EAST',
          floorCategory: null,
          possession: 'READY',
          listingPartyType: 'OWNER',
        }),
      (err: any) => err.name === 'ValidationError' && /floorCategory/i.test(err.message) && !isPersistenceUnavailableError(err)
    );

    // Rental Independent House omitting floorCategory (null) on pre-0012 -> mapped to ValidationError (NOT 503)
    const rentalHarness = createDrizzleSqlCapturingPgDb({
      tableName: 'rental_listings',
      hasPhase1Columns: false,
      enforcePre0012NotNull: true,
    });
    const rentalRepo = new RentalListingRepositoryPostgres(() => rentalHarness.db as any);
    const rentalService = new RentalService(rentalRepo, projectService);

    await assert.rejects(
      () =>
        rentalService.createListing({
          projectId: project.id,
          propertyType: 'INDEPENDENT_HOUSE',
          configuration: '3 BHK House',
          bedroomCount: 3,
          monthlyRent: 55000,
          furnishing: 'SEMI_FURNISHED',
          facing: 'EAST',
          floorCategory: null,
          possession: 'READY',
          listingPartyType: 'OWNER',
        }),
      (err: any) => err.name === 'ValidationError' && /floorCategory/i.test(err.message) && !isPersistenceUnavailableError(err)
    );

    // Plot requires plotArea (>0), which is rejected cleanly on pre-0012 with ValidationError mentioning plotArea
    await assert.rejects(
      () =>
        resaleService.createListing({
          projectId: project.id,
          propertyType: 'PLOT',
          plotArea: 1800,
          askingPrice: 9000000,
          facing: 'EAST',
          possession: 'READY',
          listingPartyType: 'OWNER',
        }),
      (err: any) => err.name === 'ValidationError' && /plotArea/i.test(err.message) && !isPersistenceUnavailableError(err)
    );
  });

  // 9. Frontend Safe API Fetch Error Handling Tests
  const originalFetch = globalThis.fetch;

  await runTest('13. safeFetchJson parses valid JSON 201 and handles HTML 200 / HTML 503 without JSON parse crashes', async () => {
    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { id: 'abc-123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })) as any;
      const okRes = await safeFetchJson<{ data: { id: string } }>('/api/rent', { method: 'POST' });
      assert.equal(okRes.ok, true);
      assert.equal(okRes.status, 201);
      assert.equal(okRes.data?.data.id, 'abc-123');
      assert.equal(okRes.errorCategory, null);

      globalThis.fetch = (async () =>
        new Response('<!doctype html><html><body>Starting preview...</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })) as any;
      const html200 = await safeFetchJson('/api/rent', { method: 'POST' });
      assert.equal(html200.ok, false);
      assert.equal(html200.errorCategory, 'unexpected_format');
      assert.equal(getSafeApiErrorTitle(html200.errorCategory), 'Unexpected Server Response');
      assert.ok(!/Unexpected token/i.test(html200.error || ''));
      assert.notEqual(getSafeApiErrorTitle(html200.errorCategory), 'Validation Error');

      globalThis.fetch = (async () =>
        new Response('<!doctype html><html><body>503 Service Unavailable</body></html>', {
          status: 503,
          headers: { 'content-type': 'text/html' },
        })) as any;
      const html503 = await safeFetchJson('/api/resale', { method: 'POST' });
      assert.equal(html503.ok, false);
      assert.equal(html503.errorCategory, 'persistence_unavailable');
      assert.equal(getSafeApiErrorTitle(html503.errorCategory), 'Service Temporarily Unavailable');
      assert.ok(!/Unexpected token/i.test(html503.error || ''));
      assert.notEqual(getSafeApiErrorTitle(html503.errorCategory), 'Validation Error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest('14. safeFetchJson classifies 400, 401, 403, 404, 500, 503 JSON, empty 502, and network failures accurately', async () => {
    try {
      const cases: Array<{
        status: number;
        body: string;
        contentType: string;
        expectedCategory: string;
        expectedTitle: string;
      }> = [
        {
          status: 400,
          body: JSON.stringify({ error: 'Monthly rent must be positive' }),
          contentType: 'application/json',
          expectedCategory: 'validation',
          expectedTitle: 'Validation Error',
        },
        {
          status: 401,
          body: JSON.stringify({ error: 'Authentication required' }),
          contentType: 'application/json',
          expectedCategory: 'authentication',
          expectedTitle: 'Authentication Required',
        },
        {
          status: 403,
          body: JSON.stringify({ error: 'Insufficient permissions' }),
          contentType: 'application/json',
          expectedCategory: 'authorization',
          expectedTitle: 'Access Denied',
        },
        {
          status: 404,
          body: JSON.stringify({ error: 'Listing not found' }),
          contentType: 'application/json',
          expectedCategory: 'not_found',
          expectedTitle: 'Not Found',
        },
        {
          status: 503,
          body: JSON.stringify({ error: 'Database unavailable', code: 'PERSISTENCE_UNAVAILABLE' }),
          contentType: 'application/json',
          expectedCategory: 'persistence_unavailable',
          expectedTitle: 'Service Temporarily Unavailable',
        },
        {
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
          contentType: 'application/json',
          expectedCategory: 'server',
          expectedTitle: 'Server Error',
        },
        {
          status: 502,
          body: '',
          contentType: 'text/plain',
          expectedCategory: 'server',
          expectedTitle: 'Server Error',
        },
      ];

      for (const tc of cases) {
        globalThis.fetch = (async () =>
          new Response(tc.body, {
            status: tc.status,
            headers: { 'content-type': tc.contentType },
          })) as any;
        const result = await safeFetchJson('/api/rent');
        assert.equal(result.ok, false);
        assert.equal(result.errorCategory, tc.expectedCategory);
        assert.equal(getSafeApiErrorTitle(result.errorCategory), tc.expectedTitle);
      }

      globalThis.fetch = (async () => {
        throw new TypeError('Failed to fetch');
      }) as any;
      const netErr = await safeFetchJson('/api/rent');
      assert.equal(netErr.ok, false);
      assert.equal(netErr.errorCategory, 'network');
      assert.equal(getSafeApiErrorTitle(netErr.errorCategory), 'Network Error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
