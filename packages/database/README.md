# @fivvi/database

PostgreSQL schema, versioned SQL migrations, seed data and the typed database client (ADR-005). Drizzle ORM on `node-postgres`.

```ts
import { createDatabaseFromEnv, findSystemGreeting } from '@fivvi/database';

const { db, close } = createDatabaseFromEnv(); // reads DATABASE_URL; one per process
const greeting = await findSystemGreeting(db, 'hello'); // { slug: 'hello', i18nKey: 'hello.title' }
```

Entry points: `@fivvi/database` (client, schema, queries, `pingDatabase`, `HELLO_GREETING`), `@fivvi/database/migrate` (`runMigrations`), `@fivvi/database/seed` (`seed`). Server-side only.

## Local setup

1. Start Postgres 18 (the same major version as Railway, ADR-011) from the repo root:

   ```bash
   pnpm db:up
   ```

   `compose.yaml` runs `postgres:18-alpine` on `127.0.0.1:5432` (`POSTGRES_PORT` changes the port). All worktrees share one container and volume. Without Docker, any local Postgres 18 works.

2. Point the package at it. `.env` is git-ignored, so every worktree needs its own copy:

   ```bash
   cp packages/database/.env.example packages/database/.env
   ```

3. Migrate and seed:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

`pnpm db:down` stops the container and keeps the data. `docker compose down --volumes` deletes it.

## Scripts

| Script | Where | What |
|---|---|---|
| `db:up` / `db:down` | root | Start / stop local Postgres |
| `db:generate` | root or package | Write a new SQL migration from the schema diff (`pnpm db:generate --name <what>`) |
| `db:migrate` | root or package | Apply pending migrations to `DATABASE_URL` |
| `db:seed` | root or package | Insert demo data into `DATABASE_URL` (idempotent; never in production) |
| `db:reset-rate-limits` | root or package | Delete every sign-in rate limit counter (F001) so a Maestro run isn't limited by an earlier one; refuses any `DATABASE_URL` that is not a local Postgres |
| `db:check` | package | Check the migration history for conflicts (`drizzle-kit check`) |
| `test` | turbo | Unit tests, no database. Includes the schema ↔ migrations drift check |
| `test:integration` | turbo | Migrations, seed, queries and schema conventions against real Postgres (below) |

## Changing the schema

1. Edit `src/schema/`. Export every table from `src/schema/index.ts`.
2. `pnpm db:generate --name <what-changed>` and **read the generated SQL**. It gets reviewed in the PR like code.
3. Commit the schema, `migrations/*.sql` and `migrations/meta/` together. `pnpm test` fails if the schema and the committed migrations drift apart.

Rules:

- **Forward-only.** Never edit or delete a migration that has been merged; fix mistakes with a new one. Destructive changes go expand → migrate → contract.
- **Plain SQL** for what Drizzle can't express (RLS policies, triggers, functions): `pnpm --filter @fivvi/database exec drizzle-kit generate --custom --name <what>` creates an empty migration to write it in.
- `migrations/` is generated: Biome skips it; never hand-edit `meta/`.
- Migrations run from one process at a time (the Railway pre-deploy step, `src/scripts/release.ts`), never from app instances on start-up.

## Conventions

- **Ids:** every table has `id uuid primary key default gen_random_uuid()`. Use `id()` from `src/schema/columns.ts`.
- **Time:** every instant is `timestamptz`, stored in UTC (ADR-012). Use `instant()` / `timestamps()` from `columns.ts`; never `timestamp` without time zone. The client sets `TimeZone=UTC` on every session, so `now()` and text output never depend on the server. Rendering in the workspace/user time zone (default `Europe/Amsterdam`) happens in the apps, not here.
- **Names:** `snake_case` tables and columns in SQL, `camelCase` in TypeScript, named explicitly in the schema.
- **Executors:** queries, repositories and the seed take a `DatabaseExecutor` (the database or a transaction on it), never a pool of their own, so they run inside a request's transaction (RLS context, E011) and inside `withRollback` in tests.
- **Tenancy:** every business table has a non-null `organization_id` (`PRODUCT.md §77`, ADR-006). Business data is read and written only through repository functions that take a tenant context; route handlers don't query business tables. A non-business table (system data such as `system_greetings`) must be added to `NON_BUSINESS_TABLES` in the integration test, with the reason in the PR.
- **Row-Level Security** is added in **E011** (M2): RLS enabled on every business table, per-request transaction-local `set_config`, an app role without `BYPASSRLS`, and a separate privileged role for migrations. Until then there are no business tables.
- **Copy stays out of the database.** Rows store i18n keys (`hello.title`), and clients translate them from `packages/i18n`. User-entered content is stored as typed.
- **Seed data** is demo data for local development, previews and tests, never production. It is idempotent and never contains real personal data (`@example.com`, obviously fake names). Data every environment needs is a data migration (see [Environments](#environments)).

The integration test enforces the id, timestamp and `organization_id` conventions on every table.

## Tests

```bash
pnpm db:up
TEST_DATABASE_URL=postgres://fivvi:fivvi@localhost:5432/fivvi pnpm test:integration
```

`TEST_DATABASE_URL` falls back to `DATABASE_URL`, and both are also read from `packages/database/.env`. The tests only accept a server on `localhost` and need `CREATEDB`. CI runs them against a Postgres 18 service container.

Isolation follows `docs/engineering/TESTING.md §5.3` with the helpers from `@fivvi/testing/database`: `test/global-setup.ts` migrates a template database once per run, the test file clones it, and each test runs in `withRollback`. Migration tests start from an empty database per test instead. Everything the run created is dropped afterwards, so tests never touch the dev database. They run with `TZ=UTC`.

## Environments

Preview and production get `DATABASE_URL` from Railway (ADR-011, [`ENVIRONMENTS.md`](../../docs/engineering/ENVIRONMENTS.md)). On every deploy, Railway runs the release step before the new version gets traffic:

```bash
node src/scripts/release.ts          # production: migrations only
node src/scripts/release.ts --seed   # development and previews: migrations, then the seed
```

### System data vs. seed data (decided in E003)

**Rows that every environment needs, production included, are data migrations.** The `hello` greeting is inserted by `migrations/0001_system_greeting_hello.sql` (`INSERT … ON CONFLICT DO NOTHING`), not by the seed. `HELLO_GREETING` in `src/system-data.ts` holds the same values, and the integration test checks that a migrated database contains exactly that row.

**The seed is demo data only, and production never runs it.** Today it creates the account `owner@example.com` (F001), so every preview has an account to sign in with; `seed()` also creates nothing when `RAILWAY_ENVIRONMENT_NAME` is `production` (a second lock). The rest comes with the first business tables (M2).

Why not run an idempotent seed in production as well: the seed is going to fill up with demo workspaces, fake clients and test bookings. If production ran it, one missed check would put demo data next to real client data. A data migration runs exactly once per database, in order with the schema it depends on, is reviewed as SQL like any other migration, and needs no extra deploy step.

To add system data: `pnpm --filter @fivvi/database exec drizzle-kit generate --custom --name <what>`, write an idempotent `INSERT … ON CONFLICT DO NOTHING`, and add a test.

Open point: ids use `gen_random_uuid()` (v4). Switching the default to Postgres 18's `uuidv7()` is a default-only change, once every environment (including CI) runs Postgres 18.
