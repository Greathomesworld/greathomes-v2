# Great Homes production cutover checklist

This runbook is a gate, not proof that production has been changed. Keep the PR in draft until every applicable check is complete.

## Dependency security baseline

- `next` must remain on the patched 15.5.28-or-later 15.x security line (do not use 15.5.27 or earlier for a production release).
- `sharp` must be 0.35.5 or later to pair with the patched Next.js image-optimization path.
- `drizzle-orm` and `drizzle-kit` have been upgraded to the security-fixed releases `0.45.4` and `0.31.11` respectively; keep the lockfile synchronized and rerun CI after future upgrades.
- CI blocks high/critical npm audit findings and performs TypeScript, authentication tests, and a build smoke test. Passing CI still does not prove live SMS delivery or production database readiness.
- The regenerated npm lockfile pins Next.js 15.5.28, Sharp 0.35.5, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, UUID 11.1.1, and a global PostCSS 8.5.28+ override.

## 1. Preview gate

- Confirm the latest Vercel Preview deployment is successful for `fix/staff-login-logout-session`.
- Complete the real SMS flow with a test phone: send OTP, reject an incorrect OTP, reject an expired/reused OTP, sign in to an existing verified account, complete a new profile (name + email), refresh a protected page, and log out.
- Run the repository CI checks (TypeScript, staff-auth tests, customer-OTP tests). A successful Vercel build alone does not establish that these tests passed.
- Verify the Preview `DATABASE_URL` points to a separate non-production database.

## 2. Production environment gate

Before the production deployment, configure the following in Vercel **Production** (the Preview-only values do not carry over automatically):

- `TWOFACTOR_API_KEY` — secret value, server-side only.
- `TWOFACTOR_OTP_TEMPLATE=Greathomes`.
- `TWOFACTOR_OTP_LENGTH=4`.
- `CUSTOMER_AUTH_SECRET` — independent random secret of at least 32 characters (do not reuse the 2Factor API key or staff secret).
- `GH_STAFF_SESSION_SECRET` — independent random secret of at least 32 characters.
- `DATABASE_URL` — verified production database connection.
- `PERSISTENCE_PROVIDER=postgres`.
- `ROAD_ROUTING_PROVIDER=openrouteservice` — activates global road-route distance and driving-time enrichment for verified project coordinates.
- `OPENROUTESERVICE_API_KEY` — server-side secret key for HeiGIT / OpenRouteService Standard Plan (`2,000 req/day`, `40 req/min`).
- `OPENROUTESERVICE_BASE_URL=https://api.heigit.org` — canonical HeiGIT V2 gateway endpoint.
- `ROAD_ROUTING_TIMEOUT_MS=2000` — 2,000 ms per-request provider timeout (within the 2,500 ms SSR connectivity deadline).
- `ROAD_ROUTING_CACHE_TTL_SECONDS=86400` — 24-hour route cache TTL.
- `ROAD_ROUTING_DAILY_BUDGET=1500` — conservative per-instance daily request ceiling.

Never use a `NEXT_PUBLIC_` prefix for any secret (`OPENROUTESERVICE_API_KEY` or `GOOGLE_ROUTES_API_KEY` with `NEXT_PUBLIC_` will throw a fatal security error at startup). Do not configure `GH_STAFF_BOOTSTRAP_ENABLED` or `GH_SUPER_ADMIN_BOOTSTRAP_TOKEN` in Production.

## 3. Database readiness

1. Take or verify a restorable backup and confirm which production database is targeted before running SQL.
2. Check whether existing customer rows have duplicate mobile numbers after normalizing to the last 10 digits. Do not auto-merge or overwrite duplicate accounts; resolve them deliberately.
3. Apply `drizzle/0002_customer_auth_otp.sql` against the verified target database before switching production traffic to this code. It creates the OTP challenge, rate-limit, and opaque-session tables/indexes idempotently. Confirm all three tables and indexes exist.
4. The application still has legacy runtime schema-extension logic in `src/db/client.ts`. The SQL migration is the explicit pre-deployment step; do not rely only on runtime DDL for the release.

## 4. Staff admin readiness

This branch replaces the previous staff login model with database-backed staff accounts. Before release, establish that at least one active `SUPER_ADMIN` with a working password exists in the **production** `staff_users` table. Do not use the Preview database, Preview bootstrap token, or Preview password. Production web bootstrap is intentionally disabled. Use a reviewed operator-controlled provisioning procedure; never expose a production bootstrap endpoint.

Also verify that staff login, page refresh, logout, disabled-account denial, role changes, and last-super-admin protections work against the Preview environment first.

## 5. Release and rollback

- Review all PR changes. The branch currently contains many changes beyond customer OTP, so do not infer that the whole PR is safe solely from one working login flow.
- Confirm CI green, latest Vercel Preview success, separate Preview/Production databases, Production env variables, schema migration, and production Super Admin readiness.
- Merge only after these gates pass. Verify the live production URL and smoke-test public pages, admin login, customer OTP, protected customer actions, and enquiry forms after deployment.
- If a smoke test fails, roll back the Vercel deployment to the previous known-good build and investigate before retrying. Database schema changes are additive, but still verify rollback compatibility.

## Current known limitation

This checklist does not claim any Production environment variables, database migration, or Super Admin provisioning have been applied. Those require verification in the hosting/database consoles.
