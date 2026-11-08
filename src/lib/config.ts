export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  persistenceProvider: 'memory' | 'postgres';
  databaseUrl: string | null;
  appUrl: string;
  geminiApiKey: string | null;
  cartoApiKey: string | null;
  cartoStyle: string;
  roadRoutingProvider: 'none' | 'openrouteservice' | 'osrm' | 'google_routes';
  openRouteServiceApiKey: string | null;
  openRouteServiceBaseUrl: string;
  osrmBaseUrl: string | null;
  googleRoutesApiKey: string | null;
  roadRoutingTimeoutMs: number;
  roadRoutingCacheTtlSeconds: number | null;
  roadRoutingDailyBudget: number;
}

let cachedConfig: AppConfig | null = null;

export function resetConfigCacheForTesting(): void {
  cachedConfig = null;
}

export function validateAndGetConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawNodeEnv = process.env.NODE_ENV || 'development';
  const nodeEnv = (['development', 'test', 'staging', 'production'].includes(rawNodeEnv)
    ? rawNodeEnv
    : 'development') as AppConfig['nodeEnv'];

  const rawPersistence = process.env.PERSISTENCE_PROVIDER || 'memory';
  const persistenceProvider = (rawPersistence === 'postgres' ? 'postgres' : 'memory') as AppConfig['persistenceProvider'];

  const databaseUrl = process.env.DATABASE_URL || null;
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const geminiApiKey = process.env.GEMINI_API_KEY || null;
  const cartoApiKey = process.env.NEXT_PUBLIC_CARTO_API_KEY || null;
  const cartoStyle = process.env.NEXT_PUBLIC_CARTO_BASEMAP_STYLE || 'voyager';

  // Default to 'none' even when an API key is present so live routing is never enabled implicitly
  const rawRoutingProvider = (process.env.ROAD_ROUTING_PROVIDER || 'none').toLowerCase().trim();
  const roadRoutingProvider = (
    ['none', 'openrouteservice', 'osrm', 'google_routes'].includes(rawRoutingProvider)
      ? rawRoutingProvider
      : 'none'
  ) as AppConfig['roadRoutingProvider'];

  const openRouteServiceApiKey =
    process.env.OPENROUTESERVICE_API_KEY && process.env.OPENROUTESERVICE_API_KEY.trim().length > 0
      ? process.env.OPENROUTESERVICE_API_KEY.trim()
      : null;
  const openRouteServiceBaseUrl =
    process.env.OPENROUTESERVICE_BASE_URL && process.env.OPENROUTESERVICE_BASE_URL.trim().length > 0
      ? process.env.OPENROUTESERVICE_BASE_URL.trim()
      : 'https://api.heigit.org';
  const osrmBaseUrl = process.env.OSRM_BASE_URL || null;
  const googleRoutesApiKey = process.env.GOOGLE_ROUTES_API_KEY || null;

  const rawTimeout = Number(process.env.ROAD_ROUTING_TIMEOUT_MS);
  const roadRoutingTimeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 500 && rawTimeout <= 30000 ? rawTimeout : 2000;

  const rawCacheTtl =
    process.env.ROAD_ROUTING_CACHE_TTL ?? process.env.ROAD_ROUTING_CACHE_TTL_SECONDS;
  const parsedCacheTtl =
    rawCacheTtl !== undefined && rawCacheTtl.trim() !== '' ? Number(rawCacheTtl) : null;
  const roadRoutingCacheTtlSeconds =
    parsedCacheTtl !== null && Number.isFinite(parsedCacheTtl) && parsedCacheTtl >= 0
      ? Math.floor(parsedCacheTtl)
      : 86400;

  const rawDailyBudget = Number(process.env.ROAD_ROUTING_DAILY_BUDGET);
  const roadRoutingDailyBudget =
    Number.isFinite(rawDailyBudget) && rawDailyBudget >= 0
      ? Math.floor(rawDailyBudget)
      : 1500;

  // Fail loud in production mode if postgres persistence is required but DATABASE_URL is missing
  if (nodeEnv === 'production' && persistenceProvider === 'postgres' && !databaseUrl) {
    throw new Error('FATAL CONFIG ERROR: PERSISTENCE_PROVIDER is set to "postgres" in production, but DATABASE_URL is missing.');
  }

  // Prevent using the public OSRM demo server in production (strictly forbidden by OSRM API Usage Policy)
  if (
    nodeEnv === 'production' &&
    roadRoutingProvider === 'osrm' &&
    osrmBaseUrl &&
    osrmBaseUrl.toLowerCase().includes('router.project-osrm.org')
  ) {
    throw new Error(
      'FATAL CONFIG ERROR: OSRM public demo server (router.project-osrm.org) is strictly forbidden for commercial production use. Configure a self-hosted OSRM_BASE_URL.'
    );
  }

  // Audit for sensitive keys mistakenly prefixed with NEXT_PUBLIC_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('database_url') ||
          lowerKey.includes('openrouteservice_api_key') ||
          lowerKey.includes('google_routes_api_key')) &&
        value &&
        value.trim() !== ''
      ) {
        throw new Error(`SECURITY VIOLATION: Sensitive environment variable '${key}' exposed through NEXT_PUBLIC_ prefix.`);
      }
    }
  }

  cachedConfig = {
    nodeEnv,
    persistenceProvider,
    databaseUrl,
    appUrl,
    geminiApiKey,
    cartoApiKey,
    cartoStyle,
    roadRoutingProvider,
    openRouteServiceApiKey,
    openRouteServiceBaseUrl,
    osrmBaseUrl,
    googleRoutesApiKey,
    roadRoutingTimeoutMs,
    roadRoutingCacheTtlSeconds,
    roadRoutingDailyBudget,
  };

  return cachedConfig;
}

export function isProduction(): boolean {
  return validateAndGetConfig().nodeEnv === 'production';
}

export function isPostgresPersistence(): boolean {
  return validateAndGetConfig().persistenceProvider === 'postgres';
}
