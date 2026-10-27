# @fivvi/database

PostgreSQL schema, versioned SQL migrations, seed data and the typed database client (ADR-005). Drizzle ORM on `node-postgres`.

```ts
import { createDatabaseFromEnv, findSystemGreeting } from '@fivvi/database';

const { db, close } = createDatabaseFromEnv(); // reads DATABASE_URL; one per process
const greeting = await findSystemGreeting(db, 'hello'); // { slug: 'hello', i18nKey: 'hello.title' }
```

Entry points: `@fivvi/database` (client, schema, queries, `pingDatabase`, `HELLO_GREETING`), `@fivvi/database/migrate` (`runMigrations`), `@fivvi/database/seed` (`seed`), `@fivvi/database/testing` (factories and the isolation factory registry, tests only). Server-side only.

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
- **Tenancy:** every business table has a non-null `organization_id` (`PRODUCT.md §77`, ADR-006) and is declared with `businessTable()` (below). Business data is read and written only through repository functions that take a tenant context; route handlers don't query business tables. A non-business table (system data such as `system_greetings`, the global `auth_*` tables) goes on the non-business allow-list (below).
- **Row-Level Security (E011, ADR-006):** every table in `public` is protected by the database itself; see [Tenant isolation](#tenant-isolation).
- **Copy stays out of the database.** Rows store i18n keys (`hello.title`), and clients translate them from `packages/i18n`. User-entered content is stored as typed.
- **Seed data** is demo data for local development, previews and tests, never production. It is idempotent and never contains real personal data (`@example.com`, obviously fake names). Data every environment needs is a data migration (see [Environments](#environments)).

The integration test enforces the id and timestamp conventions and the tenancy conventions of [Tenant isolation](#tenant-isolation) on every table.

## Tests

```bash
pnpm db:up
TEST_DATABASE_URL=postgres://fivvi:fivvi@localhost:5432/fivvi pnpm test:integration
```

`TEST_DATABASE_URL` falls back to `DATABASE_URL`, and both are also read from `packages/database/.env`. The tests only accept a server on `localhost` and need `CREATEDB`. CI runs them against a Postgres 18 service container.

Isolation follows `docs/engineering/TESTING.md §5.3` with the helpers from `@fivvi/testing/database`: `test/global-setup.ts` migrates a template database once per run, the test file clones it, and each test runs in `withRollback`. Migration tests start from an empty database per test instead. Everything the run created is dropped afterwards, so tests never touch the dev database. They run with `TZ=UTC`.

## Tenant isolation

A workspace is a row of `organizations`; every business table points at it with `organization_id`. Three tables exist so far: `organizations` (only `id` and timestamps), `team_members` (account, role Owner or Trainer; at most one per account and workspace) and `clients` (optional account link; at most one per account and workspace). A team role and a client relationship of one account in one workspace are two rows side by side.

**The context.** The API sets the tenant context at the start of each transaction with `set_config(name, value, true)`, so it ends with the transaction and never leaks between pooled requests: `app.account_id`, `app.workspace_ids` (comma-separated workspace ids) and, on a client route only, `app.client_id`. Three `STABLE` SQL functions read them and return `NULL` when unset: `app_account_id()`, `app_workspace_ids()` and `app_client_id()`. A query with no context matches no row. All SQL is in the migrations `0007` (role, functions) and `0009` (forced RLS); the policies are in `0008`, generated from the schema.

**`businessTable(name, columns, extraConfig?, options?)`** (`src/schema/business-table.ts`) is the only way a business table gets its `id`, `organization_id` (not null, references `organizations`), an index that starts with `organization_id`, `unique (organization_id, id)` and RLS with the standard workspace policy for the role `fivvi_app`: `organization_id = ANY (app_workspace_ids())` for every command, as `USING` and `WITH CHECK`. Options add the variants:

- `clientColumn`: the client variant (Q2). A restrictive policy: when the context names a client, a row must belong to it. `clients` uses `id`; a later table with a `client_id` uses that column.
- `accountColumn`: an account reads its own rows in any workspace (`team_members`, `clients`), which is how the API finds out what an account is in a workspace.

```ts
export const bookings = businessTable(
  'bookings',
  { clientId: uuid('client_id').notNull(), ...timestamps() },
  (table) => [
    // Foreign keys between business tables are composite, so a row of workspace A can never
    // point at a row of workspace B.
    foreignKey({
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
  ],
  { clientColumn: 'clientId' },
);
```

After `pnpm db:generate`, add `ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;` in a custom migration (`pnpm --filter @fivvi/database exec drizzle-kit generate --custom --name <what>`); Drizzle can't express `FORCE`, and `ENABLE` alone exempts the table's owner. Nothing hand-writes a policy. A role added to `team_role` later (Admin) is one additive `ALTER TYPE team_role ADD VALUE`, documented at the enum.

**The conventions check** (`test/conventions.ts`, run by the `AC1` and `AC2` tests in `database.integration.test.ts`) fails with every violation it finds, each naming the table and what is missing. Every table in `public` must be `organizations` (policy on `id`), on the non-business allow-list, or a business table with: a non-null `organization_id` referencing `organizations`, RLS enabled and forced, the standard workspace policy for `fivvi_app` covering select, insert, update and delete, no other permissive policy that is not reviewed, and an index that starts with `organization_id` (the `unique (organization_id, id)` that `businessTable` adds is one). Foreign keys between business tables include `organization_id` on both sides; a view on a business table is `security_invoker`; a `SECURITY DEFINER` function is on the reviewed list (`schema.name` outside `public`). Views and functions are checked in every schema except the system ones, and extension-owned objects are skipped.

**The non-business allow-list** (`NON_BUSINESS_TABLES` in `test/tenancy-rules.ts`) maps each table without `organization_id` to the reason. Today: `system_greetings` (system data for everyone) and the `auth_*` tables (an account is global and shared by every workspace of its person, F001). A new entry needs a reason in the PR. The reviewed `SECURITY DEFINER` functions (`DEFINER_FUNCTIONS`, none) and the extra permissive policies (`EXTRA_POLICIES`, the own-account read of `team_members` and `clients`) are next to it.

**The client policy** is required too (AC20): a business table with a client column (`client_id`, a foreign key to `clients`, or `id` of `clients`) needs the restrictive `<table>_client` policy for `fivvi_app`, covering all commands with `USING` and `WITH CHECK`, which `businessTable({ clientColumn })` gives it. The check fails without it, naming the table.

**Roles (AC4, AC18).**

- **`fivvi_app`**, the app role: logs in, no superuser, no `BYPASSRLS`, no `CREATEROLE`/`CREATEDB`, owns nothing, not a member of the privileged role, and only the table privileges in `APP_TABLE_PRIVILEGES` (`src/app-role.ts`): select, insert, update and delete (select only on system data), never `TRUNCATE` (it ignores RLS), `REFERENCES` or `TRIGGER`, and nothing on the migration history. A table missing from that list gets no privilege, and the release integration test fails until it is listed.
- **The privileged role**, the user of `DATABASE_URL`: owns the tables, runs the migrations and the release step.
- Migration `0007` creates `fivvi_app` without a login if it doesn't exist, so the policies can name it and every migrated database has it. `runMigrations` then resets its table privileges to the list (so the release step, `pnpm db:migrate` and the test template end with the same grants). The release step (`ensureAppRole`) finishes the role: with `APP_DATABASE_PASSWORD` set it gives the role a login and that password, idempotently; **without it** (a preview before the owner has set the secret) it still succeeds, leaves the login and password as they are and says so in the release log. The password needs 16 characters or more and is never logged. The web runtime keeps connecting with `DATABASE_URL` until the next ticket (#255).
- **Tests** connect as `fivvi_app` through `TestDatabase.appUrl`; the test setup (`setupTemplateDatabase`) creates the role with a fake password once per server, before it migrates the template.

**Factories** (`@fivvi/database/testing`, next to the schema because `@fivvi/testing` cannot import the database package): `createWorkspace()`, `createAccount()`, `addTeamRole()` and `addClient()` take an executor, create a valid record and carry a unique marker (`uniqueMarker()`) or, where a record has no text column yet, its own uuid. **`isolationFactories`** registers one factory per table (`organizations`, `team_members`, `clients`) that creates a valid row in a given workspace; the RLS suite (`test/rls.integration.test.ts`) runs every check over every table in `public` that is not on the allow-list, and fails naming the table when one has no factory (AC15). A new business table adds its factory in `src/testing/isolation-factories.ts` and its line in `APP_TABLE_PRIVILEGES`.

## Environments

Preview and production get `DATABASE_URL` from Railway (ADR-011, [`ENVIRONMENTS.md`](../../docs/engineering/ENVIRONMENTS.md)). On every deploy, Railway runs the release step before the new version gets traffic:

```bash
node src/scripts/release.ts          # production: migrations only
node src/scripts/release.ts --seed   # development and previews: migrations, then the seed
```

Either way the step ends by creating or updating the app role `fivvi_app`: with `APP_DATABASE_PASSWORD` set in the environment it gets a login and that password; without it the role is left as it is and the log says so (`App role fivvi_app: APP_DATABASE_PASSWORD is not set …`). The owner sets the secret per environment (a distinct value for `development` and `production`; previews take `development`'s).

### System data vs. seed data (decided in E003)

**Rows that every environment needs, production included, are data migrations.** The `hello` greeting is inserted by `migrations/0001_system_greeting_hello.sql` (`INSERT … ON CONFLICT DO NOTHING`), not by the seed. `HELLO_GREETING` in `src/system-data.ts` holds the same values, and the integration test checks that a migrated database contains exactly that row.

**The seed is demo data only, and production never runs it.** Today it creates the account `owner@example.com` (F001), so every preview has an account to sign in with; `seed()` also creates nothing when `RAILWAY_ENVIRONMENT_NAME` is `production` (a second lock). The rest comes with the first business tables (M2).

Why not run an idempotent seed in production as well: the seed is going to fill up with demo workspaces, fake clients and test bookings. If production ran it, one missed check would put demo data next to real client data. A data migration runs exactly once per database, in order with the schema it depends on, is reviewed as SQL like any other migration, and needs no extra deploy step.

To add system data: `pnpm --filter @fivvi/database exec drizzle-kit generate --custom --name <what>`, write an idempotent `INSERT … ON CONFLICT DO NOTHING`, and add a test.

Open point: ids use `gen_random_uuid()` (v4). Switching the default to Postgres 18's `uuidv7()` is a default-only change, once every environment (including CI) runs Postgres 18.
