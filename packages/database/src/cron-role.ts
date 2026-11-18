import { sql } from 'drizzle-orm';
import { type AppRoleOptions, type AppRoleState, ensureAppRole } from './app-role.ts';
import type { DatabaseExecutor } from './client.ts';

/**
 * The database role of the cron's tasks (E012, ADR-006, ADR-027). It is the privileged path the
 * tasks use instead of the connection that owns the tables: it owns nothing, cannot bypass RLS,
 * sets no tenant context, and can use only the tables listed in `CRON_TABLE_PRIVILEGES`. The role
 * is created by migration `0022` (without a login) and finished by the release step (login and
 * password, `ensureCronRole`), like the app role.
 */
export const CRON_ROLE = 'fivvi_cron';

type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * The tables the cron role may use in `public`, and how: the tables a task declares. A table that
 * is not listed gets nothing (`TRUNCATE`, which ignores RLS, is never granted). The integration
 * test `cron-role.integration.test.ts` fails for a table that is granted and not listed here,
 * and for a listed table that does not exist.
 *
 * A task that touches business data (F022, F062, E014) adds its table here **and** a policy for
 * `fivvi_cron` on it in its own migration: the business tables force RLS and have policies for
 * the app role only, so without its own policy the cron role sees no row, whatever it is
 * granted. Only the policy decides which rows; this list decides which tables at all.
 */
export const CRON_TABLE_PRIVILEGES: Readonly<Record<string, readonly Privilege[]>> = {
  // The record of the cron's runs, and its 90-day retention (platform data, no RLS).
  job_runs: ['SELECT', 'INSERT', 'DELETE'],
  // The deletion log (E014): the retention tasks write it and delete entries after 30 days. It
  // is platform data, but it has RLS on all the same (`deletion_log_cron` lets this role in).
  deletion_log: ['SELECT', 'INSERT', 'DELETE'],
  // The retention tasks of E014 (`retention.*`): they find rows past their period and delete them,
  // nothing else. Platform data (no RLS) ... The tables that hold tokens, addresses or IP
  // addresses have DELETE here and SELECT on single columns only (`CRON_SELECT_COLUMNS`).
  auth_verifications: ['DELETE'],
  auth_sessions: ['DELETE'],
  auth_rate_limits: ['SELECT', 'DELETE'],
  // ... and business tables, which also have a policy for `fivvi_cron` (the migration that ends
  // `retention_cron_policies`): closed trainer invitations (R3) and access-log entries (R12).
  trainer_invitations: ['DELETE'],
  access_log: ['SELECT', 'DELETE'],
  // The task that keeps class series 12 weeks ahead (F022): it reads the series (rule, time zone,
  // defaults; no personal data), moves `materialized_until` (`CRON_UPDATE_COLUMNS`) and inserts the
  // missing dates, which it never reads back: a date that exists is the unique key's to refuse.
  // Their policies are in the migration `cron_class_series_policies`.
  class_series: ['SELECT'],
  sessions: ['INSERT'],
};

/**
 * The columns the cron role may read of a table that has no table-level `SELECT` in
 * `CRON_TABLE_PRIVILEGES`: the key and the columns a retention task's `WHERE` and `RETURNING`
 * read, so a task can find and delete the rows past their period and learn nothing else. A
 * session's token, IP address and user agent, a sign-in request's address and hashes and an
 * invitation's address and token hash are not here, and the role is refused when it asks for
 * them. A table listed here is also listed in `CRON_TABLE_PRIVILEGES`, without `SELECT`,
 * except `locations`, where these columns are all the role has.
 */
export const CRON_SELECT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  auth_verifications: ['id', 'expires_at'],
  auth_sessions: ['id', 'expires_at', 'updated_at'],
  // `organization_id` comes back with the deleted row for the deletion log (IDs only).
  trainer_invitations: ['id', 'organization_id', 'status', 'expires_at', 'updated_at'],
  // The default location of a workspace, which the dates of a class series take (F022): the key
  // columns only, never a name or an address.
  locations: ['id', 'organization_id', 'is_default'],
};

/**
 * The columns the cron role may change of a table that has no table-level `UPDATE` in
 * `CRON_TABLE_PRIVILEGES`. The task of F022 moves the day a series is filled to, and nothing else
 * of it (not the rule, the trainer, the capacity or the version, which are the Owner's to change).
 */
export const CRON_UPDATE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  class_series: ['materialized_until', 'updated_at'],
};

/**
 * Resets the cron role's table privileges in `public` to `CRON_TABLE_PRIVILEGES` and
 * `CRON_SELECT_COLUMNS`, in one transaction, so there is no moment without them. Idempotent; `runMigrations` runs it after the
 * migrations, next to `grantAppPrivileges`. Tables that don't exist yet are skipped.
 */
export async function grantCronPrivileges(db: DatabaseExecutor): Promise<void> {
  const role = sql.identifier(CRON_ROLE);
  const tables = (
    await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )
  ).rows.map((row) => String(row.tablename));
  await db.transaction(async (tx) => {
    await tx.execute(sql`revoke all on all tables in schema public from ${role}`);
    for (const table of tables) {
      const privileges = CRON_TABLE_PRIVILEGES[table];
      if (!privileges?.length) continue;
      await tx.execute(
        sql`grant ${sql.raw(privileges.join(', '))} on ${sql.identifier(table)} to ${role}`,
      );
    }
    for (const table of tables) {
      const columns = CRON_SELECT_COLUMNS[table];
      if (!columns?.length) continue;
      const list = sql.join(
        columns.map((column) => sql.identifier(column)),
        sql`, `,
      );
      await tx.execute(sql`grant select (${list}) on ${sql.identifier(table)} to ${role}`);
    }
    for (const table of tables) {
      const columns = CRON_UPDATE_COLUMNS[table];
      if (!columns?.length) continue;
      const list = sql.join(
        columns.map((column) => sql.identifier(column)),
        sql`, `,
      );
      await tx.execute(sql`grant update (${list}) on ${sql.identifier(table)} to ${role}`);
    }
  });
}

/**
 * Creates or updates the cron role, idempotently, the way `ensureAppRole` does the app role:
 * the safe attributes, no memberships, and a login only with the environment's password.
 * Needs the privileged role.
 */
export function ensureCronRole(
  db: DatabaseExecutor,
  options: Pick<AppRoleOptions, 'password'> = {},
): Promise<AppRoleState> {
  return ensureAppRole(db, { ...options, role: CRON_ROLE });
}
