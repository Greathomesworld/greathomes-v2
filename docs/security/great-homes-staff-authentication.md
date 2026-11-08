# Great Homes staff authentication setup

## Required server-side variables

- `GH_STAFF_SESSION_SECRET`: a random secret with at least 32 characters. Keep it server-only; do not prefix it with `NEXT_PUBLIC_`.
- `GH_SUPER_ADMIN_BOOTSTRAP_TOKEN`: an independent random token with at least 32 characters used only for the initial setup flow.
- `GH_STAFF_BOOTSTRAP_ENABLED=true`: enables the one-time bootstrap flow for an isolated development or Preview environment only. The API refuses bootstrap when `VERCEL_ENV=production`.
- `GH_SUPER_ADMIN_EMAIL=superadmin@greathomes.co.in` (the default is this address).
- Optional `GH_SUPER_ADMIN_NAME`.

Generate distinct values with a secure password manager or a cryptographically secure generator. Do not copy secrets into source files, commits, screenshots, or chat.

## Safe Preview setup

1. In Vercel Project Settings → Environment Variables, configure these variables for **Preview only**. Do not enable bootstrap in Production.
2. Confirm the Preview `DATABASE_URL` points to a dedicated non-production database. Do not run bootstrap if Preview uses the production database.
3. Deploy the branch and open `/admin/login` → **First-time Super Admin setup**.
4. Use the email `superadmin@greathomes.co.in`, the bootstrap token configured on the Preview deployment, and choose a password of at least 12 characters.
5. After setup succeeds, remove `GH_STAFF_BOOTSTRAP_ENABLED` and `GH_SUPER_ADMIN_BOOTSTRAP_TOKEN` from Preview. Keep `GH_STAFF_SESSION_SECRET` configured.

The bootstrap endpoint only initializes an account whose password hash is empty; it refuses to reset an initialized account. Staff passwords are stored using salted scrypt hashes. Sessions are signed, `HttpOnly`, and checked against the current account, role, enabled status and session version on each protected API request. Logout increments the session version.

## Production

This code change does not create a staff account or modify any production database. Production bootstrap through the web endpoint is intentionally disabled. After a separately approved production release, provision `superadmin@greathomes.co.in` through a reviewed operator-controlled procedure against the verified production database, with a unique password and session secret. Do not reuse Preview secrets or the Preview database.

## Role model

- `SUPER_ADMIN`: all defined capabilities; can manage all staff and assign roles.
- `ADMIN`: core day-to-day operations and read access to the staff registry, but cannot grant itself elevated staff permissions.
- `CONTENT_MANAGER`: project content, media and SEO workflows.
- `PROPERTY_MANAGER`: project configuration, RERA and property listing operations.
- `SALES`: enquiries, assignment, follow-up and permitted listing submissions.

The API resolves the role from the database; browser-supplied role headers are not trusted.