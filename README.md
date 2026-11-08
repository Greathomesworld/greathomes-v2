# Great Homes V2

Residential property discovery and assisted home-buying web application.

## Development State
- **Persistence Architecture (Locked)**: PostgreSQL + PostGIS + Drizzle ORM.
- **Current Environment**: PostgreSQL/PostGIS connection is unavailable.
- **Temporary Solution**: In-memory repository used for development and domain validation.

## Architecture
- **Domain/Application Layer**: Agnostic of storage implementation.
- **Repository Pattern**: Domain services interact with storage via interfaces, allowing seamless transition to PostgreSQL once environment permits.
- **Drizzle Schema**: Defined in `src/db/schema.ts` as the canonical production model.

## Phase 03: Location Intelligence & Discovery Architecture
[COMPLETE] Canonical location entity, location hierarchy validation, location REST API, location service, location path resolver, temporary memory repository, PostGIS spatial definition.
[BLOCKED BY ENVIRONMENT] Live PostgreSQL/PostGIS connection.

## Development State
- **Persistence Architecture (Locked)**: PostgreSQL + PostGIS + Drizzle ORM.
- **Current Environment**: PostgreSQL/PostGIS connection is unavailable.
- **Temporary Solution**: In-memory repository used for development and domain validation.
- **Hierarchy Hierarchy**: STATE -> DISTRICT -> CITY -> DISCOVERY_REGION -> AREA -> NEIGHBOURHOOD.
