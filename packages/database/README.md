# @fivvi/database

PostgreSQL schema, versioned SQL migrations, seed data and the typed database client (ADR-005). Drizzle ORM on `node-postgres`.

```ts
import { createAppDatabaseFromEnv, findSystemGreeting } from '@fivvi/database';

const { db, close } = createAppDatabaseFromEnv(); // reads APP_DATABASE_URL (the app role); one per process
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
   cp apps/web/.env.example apps/web/.env
   ```

   `DATABASE_URL` is the privileged user (it owns the tables); `APP_DATABASE_URL` and `APP_DATABASE_PASSWORD` are the app role `fivvi_app`, which the web server (`pnpm dev`) connects as; `CRON_DATABASE_URL` and `CRON_DATABASE_PASSWORD` are the cron role `fivvi_cron` (E012), which the cron's tasks connect as. The first file holds all five, the second only `APP_DATABASE_URL` for `next dev`. A `.env` copied before E011 needs the two app lines from the example, one copied before E012 the two cron lines.

3. Migrate (this also gives `fivvi_app` and `fivvi_cron` their logins, with the passwords of `APP_DATABASE_PASSWORD` and `CRON_DATABASE_PASSWORD`) and seed:

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
| `db:migrate` | root or package | Apply pending migrations to `DATABASE_URL`, then give the app role `fivvi_app` its login with `APP_DATABASE_PASSWORD` (like the release step) |
| `db:seed` | root or package | Insert demo data into `DATABASE_URL` (idempotent; never in production) |
| `db:reset-rate-limits` | root or package | Delete every sign-in rate limit counter (F001) so a Maestro run isn't limited by an earlier one; connects as the app role and refuses any `APP_DATABASE_URL` that is not a local Postgres |
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
TEST_DATABASE_URL=postgres://fivvi:fake-local-db-password@localhost:5432/fivvi pnpm test:integration
```

`TEST_DATABASE_URL` falls back to `DATABASE_URL`, and both are also read from `packages/database/.env`. The tests only accept a server on `localhost` and need `CREATEDB`. CI runs them against a Postgres 18 service container.

Isolation follows `docs/engineering/TESTING.md §5.3` with the helpers from `@fivvi/testing/database`: `test/global-setup.ts` migrates a template database once per run, the test file clones it, and each test runs in `withRollback`. Migration tests start from an empty database per test instead. Everything the run created is dropped afterwards, so tests never touch the dev database. They run with `TZ=UTC`.

## Tenant isolation

A workspace is a row of `organizations`; every business table points at it with `organization_id`. Eight tables exist so far: `organizations` (the workspace: `name`, `slug` (unique, never changed by a rename), `default_locale` (`nl-NL` or `en`), `time_zone` (an IANA name) and timestamps; F002), `team_members` (account, role Owner or Trainer; at most one per account and workspace) and `clients` (a name, an optional lower case email address and language for emails, F006; an optional account link, never shown to the team; at most one per account, and one per email address, and workspace; the search ignores accents with Postgres’s `unaccent`). A team role and a client relationship of one account in one workspace are two rows side by side. And `trainer_profiles` (F005: `organization_id`, a unique `team_member_id` and timestamps; a row means "this team member trains here"): every Trainer has one, an Owner has one when they also train and switches it themselves, and the creator of a workspace gets one with the workspace. A composite foreign key `(organization_id, team_member_id)` to `team_members` with `ON DELETE CASCADE` removes it with the team-member record, and the account and its name stay. And `locations` (F015: `organization_id`, `name`, `type` (the six kinds of `PRODUCT.md §12`; only `organization_location` is written), an optional Dutch address (`postcode` stored as `1234 AB`, `house_number`, `house_number_addition`, `street`, `city`, all or nothing by a check), `is_default` and timestamps): every workspace has exactly one, its default, made in the same transaction as the workspace (`createWorkspaceWithOwner`) and, for workspaces that existed before, by `migrations/0018_locations_backfill.sql`; a partial unique index lets only one location per workspace be the default. The routes read and change it; there is no function to create or delete another until M7. And `trainer_invitations` (F011, spec #422) holds the Owner's invitations to join the team as a Trainer: a name, a lower case address, the email language chosen or empty, the inviter's team-member record, the hash of the link token (the token is never stored), the sending time, the expiry and a status `pending | accepted | declined | withdrawn`; one pending invitation per workspace and address (a partial unique index). And the session engine (F020, spec #425), the one scheduling record that private sessions, group classes (F021) and Open Gym (F034) share: `sessions` (`type` `private | group | open_gym`, `status` `scheduled | cancelled`, an optional `trainer_profile_id`, the `location_id`, `starts_at` and `ends_at` as UTC instants, `capacity`, an empty `series_id` for F022, a `version` for optimistic concurrency, an optional `created_by_team_member_id`, and `updated_by_team_member_id`, who changed a private session last (group dates don't set it), so a stale save can name them; a check keeps the end after the start and a private session at capacity 1) and `session_participants` (the session, the client, an `attendance_status` `booked | attended | cancelled | no_show` that starts `booked`, an empty `agreement_id` for M11, one place per session and client; it has the client policy). Composite foreign keys `(organization_id, <x>_id)` keep the trainer, location, creator and clients inside the session's workspace. A session is never deleted: removing a trainer's profile or their team-member record clears `trainer_profile_id`, `created_by_team_member_id` and `updated_by_team_member_id` of their sessions (`ON DELETE SET NULL (column)`, which migrations `0021_sessions.sql` and `0024_sessions_updated_by.sql` write by hand because Drizzle cannot) and keeps the session, so removing someone is never blocked by their sessions; a client with a place is not removed. The repository (`src/repositories/sessions.ts`) stores and reads a session with its participants, moves one (`rescheduleSession`: one statement that matches the version, so of two changes from the same version one is stored) and lists a client's upcoming sessions; the rules are `planPrivateSession` in `packages/domain`. And `group_classes` (F021, spec #427; `PRODUCT.md §76` calls it `group_templates`): a Dutch `name_nl`, optional `name_en` and descriptions (an empty text is stored as `NULL`), the usual `default_trainer_profile_id` (`NULL` is *Trainer nodig*; `ON DELETE SET NULL (default_trainer_profile_id)` written by hand in `0023_group_classes.sql`), `capacity` 1–100, `duration_minutes` 15–240 in steps of 5 (checks repeat `GROUP_CLASS_LIMITS`), an unused `archived_at`. A class on a date is a `sessions` row of type `group` with a `group_class_id` (a check demands it for `group`) that copied the class's trainer, capacity and duration; the repository (`src/repositories/group-classes.ts`) stores classes and dates and changes one date from the version the writer read. The seed adds three classes of John's Gym (one with an English name, one *Trainer nodig*) and their dates in the seeded week. The `sessions` table has no client policy yet: a client-facing read (F033) adds it together with the route.

**The context.** The API sets the tenant context at the start of each transaction with `set_config(name, value, true)`, so it ends with the transaction and never leaks between pooled requests: `app.account_id`, `app.workspace_ids` (comma-separated workspace ids) and, on a client route only, `app.client_id`. Three `STABLE` SQL functions read them and return `NULL` when unset: `app_account_id()`, `app_workspace_ids()` and `app_client_id()`. A query with no context matches no row. All SQL is in the migrations `0007` (role, functions) and `0009` (forced RLS); the policies are in `0008`, generated from the schema.

**The tenant scope** (`src/tenant-scope.ts`, #254). The API never sets the context itself: `createTenantScopes(database)` gives it `inWorkspaceScope` and `inAccountScope`, which open the request transaction, set the context and hand `run` a `TenantScope`. `inWorkspaceScope` first sets only the account, reads the account's own place in the workspace (`team_members` and `clients`, through the own-account policies), asks `admit(place)` whether the route allows it and as what (`'team'` or `'client'`), and only then sets the workspace (and, acting as a client, the client id, which narrows client tables to the caller's own rows, Q2). No place gives `no-place` and a place the route doesn't allow gives `refused`; the workspace is never set for either. `inAccountScope` sets the workspaces where the account has the asked relationship (`team`, `client` or `any`). `inInvitationScope` (F011) is the way in for someone holding an invitation's link, who is not on the team and may not be signed in: the first step sets only the hash of the token (and the account, if any), which is the one door of the policy `trainer_invitations_by_token`, and reads the invitation by that hash and the account's address; then `admit(facts)` decides, `enter`, `closed` or `refused` (`unknown` for a hash nobody has), and only after `enter` is the invitation's workspace set in the context, so that the standard policies apply from there. A caller that is not admitted never gets the workspace. `run` locks the invitation (`FOR UPDATE`) and decides again on the locked row. Without an account the transaction is read-only. `hasPendingInvitation(db, email, now)`, the sign-in gate's yes or no, takes a raw executor, not a scope, because it runs before any account exists, and its door is the address in `app.invitation_email` (`trainer_invitations_by_email`), which only it sets. The transaction commits when `run` returns and rolls back when it throws. Repositories (`src/repositories/`) take a `TenantScope` (a raw executor doesn't type-check; the executor behind a scope is reachable only inside this package) and name the scope's workspace in their own filter as well as relying on RLS. Tests read the context back with `readTenantContext(scope)` from `@fivvi/database/testing`.

**Creating a workspace** (`src/repositories/workspaces.ts`, F002, ADR-022). The policy `organizations_workspace` checks `id = ANY (app_workspace_ids())`, so a create has to put the new workspace in the context before its row exists. `createWorkspaceWithOwner(scope, input)` chooses the id, adds it to the transaction's context, inserts the workspace with `ON CONFLICT (slug) DO NOTHING` (the app role can't see other people's workspaces, so the unique index decides which slugs are taken; `undefined` means taken, the caller tries the next one), the account's Owner role and, when given, the account's name. All of it is in the request's transaction, so a failure later in the request leaves nothing behind. The rule who may create one (the sign-up allowlist; an account may create several, F012), the slug and the defaults are in `packages/domain`.

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

**The non-business allow-list** (`NON_BUSINESS_TABLES` in `test/tenancy-rules.ts`) maps each table without `organization_id` to the reason. Today: `system_greetings` (system data for everyone), `job_runs` (the cron's run records, platform data with no workspace and no row security; only the cron role reads and writes it) and the `auth_*` tables (an account is global and shared by every workspace of its person, F001). A new entry needs a reason in the PR. A new table of any kind is also declared in the privacy registry (`packages/domain/src/privacy`, E014) in the same PR; a domain test reads this schema and fails naming the table that is missing. The reviewed `SECURITY DEFINER` functions (`DEFINER_FUNCTIONS`, none) and the extra permissive policies (`EXTRA_POLICIES`: the own-account read of `team_members` and `clients`, and the two read-only doors of `trainer_invitations`, `trainer_invitations_by_token` and `trainer_invitations_by_email`, migration `0020`) are next to it.

**The client policy** is required too (AC20): a business table with a client column (`client_id`, a foreign key to `clients`, or `id` of `clients`) needs the restrictive `<table>_client` policy for `fivvi_app`, covering all commands with `USING` and `WITH CHECK`, which `businessTable({ clientColumn })` gives it. The check fails without it, naming the table.

**Roles (AC4, AC18).**

- **`fivvi_app`**, the app role: logs in, no superuser, no `BYPASSRLS`, no `CREATEROLE`/`CREATEDB`, owns nothing, not a member of the privileged role, and only the table privileges in `APP_TABLE_PRIVILEGES` (`src/app-role.ts`): select, insert, update and delete (select only on system data), never `TRUNCATE` (it ignores RLS), `REFERENCES` or `TRIGGER`, and nothing on the migration history. A table missing from that list gets no privilege, and the release integration test fails until it is listed. A table listed with an empty list (`job_runs: []`) is listed on purpose and gets no privilege either: the app role never touches it (the cron role does), and the release test skips the grants comparison for it.
- **The privileged role**, the user of `DATABASE_URL`: owns the tables, runs the migrations and the release step. It is reached only through `openPrivilegedDatabase(reason)` (`src/privileged.ts`): the reason is one of a fixed list (`PRIVILEGED_USES`), is logged without the connection and without personal data, and the calling file is on the reviewed allow-list (`PRIVILEGED_ALLOW_LIST`: the release step, `db:migrate`/`db:seed` and, for the reason `restore`, the restore drill's helper `src/scripts/restore.ts`; the cron's tasks have their own role, below). The unit test `AC17: privileged access only from the allow-list, with a reason` fails for a call from another file, for an unknown or non-literal reason, for an allow-list entry nobody uses any more, and for any other source file that mentions `DATABASE_URL` (tests and test setup are exempt). A new use is a change to that list, reviewed like the schema. `createAppDatabaseFromEnv()` is the app connection and never falls back to the privileged one.
- Migration `0007` creates `fivvi_app` without a login if it doesn't exist, so the policies can name it and every migrated database has it. `runMigrations` then resets its table privileges to the list (so the release step, `pnpm db:migrate` and the test template end with the same grants). The release step (`ensureAppRole`) finishes the role: with `APP_DATABASE_PASSWORD` set it gives the role a login and that password, idempotently; **without it** (a preview before the owner has set the secret) it still succeeds, leaves the login and password as they are and says so in the release log. The password needs 16 characters or more, printable ASCII only (the Node driver normalises any other password before it logs in, so a verifier of it would never match), and is never logged or put in a statement (the role gets a SCRAM-SHA-256 verifier). The step also strips the role's unsafe attributes and revokes every membership, and fails if a membership granted by another role remains. The web runtime connects as this role through `APP_DATABASE_URL`, never with `DATABASE_URL` (see below).
- **`fivvi_cron`**, the cron role (E012, ADR-006, ADR-027): what the cron's tasks connect as, through `createCronDatabase()` (`CRON_DATABASE_URL`, no fallback to `DATABASE_URL`). It logs in, is no superuser, has no `BYPASSRLS`, no `CREATEROLE`/`CREATEDB`, owns nothing and sets no tenant context. It can use only the tables in `CRON_TABLE_PRIVILEGES` (`src/cron-role.ts`): today `job_runs` (select, insert, delete). A table a task needs is added there **and** gets a policy for `fivvi_cron` in the task's own migration: the business tables force RLS and have policies for the app role only, so the cron role sees no row of them until its own policy says which. Migration `0022` creates the role without a login; `runMigrations` resets its privileges; the release step (`ensureCronRole`) gives it its login with `CRON_DATABASE_PASSWORD`, and **without it** still succeeds and says so. Only `apps/cron/src/main.ts` calls `createCronDatabase` and only this package reads its variable (a unit test, `E012 the cron handle`); `packages/api` cannot import it (`packages/api/lint/repository-only-imports.grit`). `TestDatabase.cronUrl` connects as the role in tests.
- **Start-up check (AC4).** `inspectConnectionRole(db)` reads what the connection's login role may do: superuser, `BYPASSRLS`, `CREATEROLE`/`CREATEDB`/replication, owning a table or view, membership of any role. The API refuses to start when anything is on the list (`verifyStartup` in `packages/api`, wired in `apps/web/instrumentation.ts`), says why and never prints the connection string. A role that cannot log in (the secret is not set yet) is a refusal too.
- **Tests** connect as `fivvi_app` through `TestDatabase.appUrl`; the test setup (`setupTemplateDatabase`) creates the role with a fake password once per server, before it migrates the template.

**Factories** (`@fivvi/database/testing`, next to the schema because `@fivvi/testing` cannot import the database package): `createWorkspace()` (with its location, F015; `location: false` leaves it out), `createAccount()`, `addTeamRole()` (a Trainer gets a trainer profile, an Owner only with `trainsHere: true`), `addTrainerProfile()`, `addTrainerInvitation()` (F011), `addSession()` (F020: a session with one participant; a group session gets a class of its own unless `groupClassId` is given) and `addGroupClass()` (F021), `addPayment()` / `addPaymentCustomer()` (E019) and `addClient()` take an executor, create a valid record and carry a unique marker (`uniqueMarker()`) or, where a record has no text column yet, its own uuid. **`isolationFactories`** registers one factory per table (`organizations`, `team_members`, `clients`, `trainer_profiles`, `locations`, `trainer_invitations`, `group_classes`, `sessions`, `session_participants`) that creates a valid row in a given workspace; the RLS suite (`test/rls.integration.test.ts`) runs every check over every table in `public` that is not on the allow-list, and fails naming the table when one has no factory (AC15). A new business table adds its factory in `src/testing/isolation-factories.ts` and its line in `APP_TABLE_PRIVILEGES`.

**The payment ledger** (`src/schema/payments.ts`, `src/repositories/payments.ts`, E019, ADR-020). Three business tables, all with RLS, the client policy and an entry in `APP_TABLE_PRIVILEGES`: `payment_customers` (the provider's customer of a client, one per client), `payments` (kind `first | recurring | oneoff`, purpose and its reference, `business_key` unique per workspace, `amount_cents` an integer above zero, `currency` `EUR`, the `supplied` snapshot of what it pays for, the provider's payment and mandate IDs, the current `status`, `testmode`) and `payment_status_changes` (one line per status a payment has been in, unique on payment and status, so a status is applied once). The status lines are append-only: a trigger (migration `0026`, an `AFTER` trigger so RLS answers first) refuses every update and delete, for every role. `paymentLedger(inScope)` is the domain's `PaymentLedger` port over a tenant scope; each call runs in a transaction of its own, so the row the engine inserts is committed before the provider is called. `recordStatusChange` moves the payment and appends the line in one statement, only while the payment is still at the status the caller read. Mandates, refunds, chargebacks and settlements are stored by the specs that own them (F057, F060, F061).

## Environments

Preview and production get `DATABASE_URL` (privileged, for the release step) and `APP_DATABASE_URL` (the app role, built from the owner's `APP_DATABASE_PASSWORD`) on `web`, and `CRON_DATABASE_URL` (the cron role, built from the owner's `CRON_DATABASE_PASSWORD`) on `cron`, from Railway (ADR-011, [`ENVIRONMENTS.md`](../../docs/engineering/ENVIRONMENTS.md)). On every deploy, Railway runs the release step before the new version gets traffic:

```bash
node src/scripts/release.ts          # production: migrations only
node src/scripts/release.ts --seed   # development and previews: migrations, then the seed
```

Either way the step ends by creating or updating the app role `fivvi_app`: with `APP_DATABASE_PASSWORD` set in the environment it gets a login and that password; without it the role's login and password stay untouched, its attributes are reset to the safe set, every membership is revoked, and the log says so (`App role fivvi_app: APP_DATABASE_PASSWORD is not set …`). The owner sets the secret per environment (a distinct value for `development` and `production`; previews take `development`'s).

### The restore drill's helper (E016)

`src/scripts/restore.ts` (`pnpm --filter @fivvi/database db:restore <command>`) is the database side of `scripts/restore-drill.sh`, and the one file allowed to open the privileged connection for the reason `restore`. A connection is named by the environment variable that holds its URL (`--database-url-env <VAR>`), never given as an argument; `APP_…` and `CRON_…` variables are refused. It prints environment names, times, table names and counts only, never a row value.

```bash
restore markers write --database-url-env VAR --kind before|after --at <RFC3339>   # a marker row in the drill table
restore markers check --database-url-env VAR     # before found and after absent: exit 0, else 1
restore markers remove --database-url-env VAR    # drops the drill table
restore counts --source-url-env VAR --restored-url-env VAR --at <RFC3339> [--source-name n] [--restored-name n]
```

`counts` counts the rows of every table of both databases (`count(*)`, table names from `information_schema`, the drill table left out) and compares them. A table passes when the counts are equal or differ by no more than the source's rows created or changed after the point (`created_at` or `updated_at`); otherwise the command lists the tables and exits 1. Exit code 2 is a mistake in the arguments or a failed run. The connection must be a superuser or `BYPASSRLS`, because the tables force row-level security; otherwise the command refuses.

`--at` must carry its offset (`Z` or `±hh:mm`); a time without one is refused rather than read in the local time zone. An error prints its own message only when it is one of ours (an unset variable, a refused variable name, a connection that RLS would hide rows from); any other error prints the helper's generic line and the five-character Postgres code, never the driver's message.

**What the counts do not tolerate.** The comparison allows the source to hold *more* rows than the restored database, by at most the rows created or changed after the point. A row *deleted* from the source after the point makes the restored count bigger than the source's, and nothing excuses that: the table reports `differs`. Rows that are deleted routinely are the `job_runs` cleanup, the removal of a team member or a trainer profile, and Better Auth's expired verification rows. Whether the drill script avoids them (a quiet source), subtracts them, or lists the tables to skip is for the drill-script ticket (`scripts/restore-drill.sh`) to decide; this helper counts every table and excuses nothing else.

### System data vs. seed data (decided in E003)

**Rows that every environment needs, production included, are data migrations.** The `hello` greeting is inserted by `migrations/0001_system_greeting_hello.sql` (`INSERT … ON CONFLICT DO NOTHING`), not by the seed. `HELLO_GREETING` in `src/system-data.ts` holds the same values, and the integration test checks that a migrated database contains exactly that row.

**The seed is demo data only, and production never runs it.** Today it creates the account `owner@example.com` (F001), so every preview has an account to sign in with, and the workspace "John's Gym" (`johns-gym`, `nl-NL`, `Europe/Amsterdam`) that account owns (F002), so previews and e2e start with a workspace. It also creates `trainer@example.com` ("Sarah", F003): Trainer of John's Gym and Owner of a second workspace, "Sarah Personal Training" (`sarah-personal-training`), the multi-workspace and two-role cases of `PRODUCT.md §9`. John and Sarah train in John's Gym and Sarah in her own workspace: they have trainer profiles (F005). `seed()` also creates nothing when `RAILWAY_ENVIRONMENT_NAME` is `production` (a second lock). John's Gym's location has a synthetic address (`Voorbeeldstraat 1, 1234 AB Amsterdam`, F015), so previews show the filled-in card; each seeded workspace has its location, and the address is given only while the location has none. It also creates `tom@example.com` ("Tom"), a second Trainer of John's Gym with a trainer profile, and a synthetic week of private sessions in John's Gym (F020 AC15): Monday to Friday of the current week in the workspace's time zone, nine one-to-one sessions for John, Sarah and Tom with the seeded clients, so previews and the M4 calendars have data. A week that has any session already is left alone, and the seed of a later week adds that week's own; `seed(db, { now })` takes the clock for tests. It also creates the people and the day of the personal calendar (F013): `lisa@example.com` ("Lisa"), an account that is only a client of John's Gym, `mike@example.com` ("Mike"), the Owner of a third workspace, "Fit Studio" (`fit-studio`), who does not train, Anna de Vries as a client of Sarah Personal Training, and Tuesday 22 September 2026: Sarah has Anna at 09:00 (Sarah Personal Training), Mark at 11:00 (John's Gym), a "Kracht" group class at 15:00 (0 of 8 places) and a cancelled one at 18:00, while John and Tom have a session that day too. The rest comes with the next business tables.

`migrations/0014_trainer_profiles_backfill.sql` is the other kind of data migration: it gives the Trainers that already exist, and the creator of each workspace (the Owner whose `created_at` equals the workspace's, as F002 inserts both in one transaction; a creator who was removed or demoted gets nobody in their place), the trainer profile that F005 introduced, so a database with workspaces (`development` now, production later) matches what the API promises. On an empty database it does nothing.

Why not run an idempotent seed in production as well: the seed is going to fill up with demo workspaces, fake clients and test bookings. If production ran it, one missed check would put demo data next to real client data. A data migration runs exactly once per database, in order with the schema it depends on, is reviewed as SQL like any other migration, and needs no extra deploy step.

To add system data: `pnpm --filter @fivvi/database exec drizzle-kit generate --custom --name <what>`, write an idempotent `INSERT … ON CONFLICT DO NOTHING`, and add a test.

Open point: ids use `gen_random_uuid()` (v4). Switching the default to Postgres 18's `uuidv7()` is a default-only change, once every environment (including CI) runs Postgres 18.
