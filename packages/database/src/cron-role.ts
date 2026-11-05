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
};

/**
 * Resets the cron role's table privileges in `public` to `CRON_TABLE_PRIVILEGES`, in one
 * transaction, so there is no moment without them. Idempotent; `runMigrations` runs it after the
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
