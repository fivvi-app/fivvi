---
name: 'Database schema and migrations'
description: 'Use when changing the Drizzle schema, writing SQL migrations, RLS policies, seed or system data, queries or repositories in packages/database.'
applyTo: 'packages/database/**'
---
# Database schema and migrations

Full rules: [packages/database/README.md](../../packages/database/README.md), ADR-005, ADR-006, ADR-012.

- Every table: `id()` (uuid) and `timestamps()` from `src/schema/columns.ts`. Every instant is `timestamptz` in UTC; never `timestamp` without time zone.
- Every business table has a non-null `organization_id` and, from E011, RLS. A non-business table goes in `NON_BUSINESS_TABLES` in the integration test, with the reason in the PR.
- `snake_case` in SQL, `camelCase` in TypeScript, named explicitly. Export every table from `src/schema/index.ts`.
- Queries and repositories take a `DatabaseExecutor` (database or transaction), never their own pool.
- Store i18n keys, not copy. Store user-entered content as typed.
- Schema change: edit `src/schema/`, run `pnpm db:generate --name <what>`, **read the SQL**, commit schema + `migrations/*.sql` + `migrations/meta/` together. Use `drizzle-kit generate --custom` for RLS, triggers and functions.
- Migrations are forward-only. Never edit or delete a merged migration. Destructive changes go expand → migrate → contract.
- Rows every environment needs are idempotent data migrations (`INSERT … ON CONFLICT DO NOTHING`), not seed data. The seed is demo data only, never production, with obviously fake names and `@example.com`.
- Never point tests or scripts at Railway databases; integration tests only accept `localhost`.
