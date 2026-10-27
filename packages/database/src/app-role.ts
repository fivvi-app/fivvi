import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import { APP_ROLE } from './schema/tenant-policies.ts';

type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
const ALL: readonly Privilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/**
 * The table privileges the app role has in `public`, per table (ADR-006, AC4): only what the app
 * needs, never `TRUNCATE` (it ignores RLS), `REFERENCES` or `TRIGGER`, and nothing on the
 * migration history (`drizzle` schema). A table that is not listed gets nothing, so a new table
 * is unusable by the app until someone decides what it needs; the integration test fails until
 * the table is listed here.
 *
 * Granted by `grantAppPrivileges`, which `runMigrations` runs after the migrations: every place
 * that migrates (the release step, local `db:migrate`, the test template) gets the same grants.
 */
export const APP_TABLE_PRIVILEGES: Readonly<Record<string, readonly Privilege[]>> = {
  // Sign-in (F001): Better Auth creates, updates and clears these.
  auth_identities: ALL,
  auth_rate_limits: ALL,
  auth_sessions: ALL,
  auth_users: ALL,
  auth_verifications: ALL,
  // System data: read by every workspace, changed only by migrations.
  system_greetings: ['SELECT'],
  // Tenancy core and business tables: reached through RLS (the policies decide which rows).
  organizations: ALL,
  team_members: ALL,
  clients: ALL,
};

/**
 * Resets the app role's table privileges in `public` to `APP_TABLE_PRIVILEGES`, in one
 * transaction, so there is no moment without them. Idempotent. Tables that don't exist yet (a
 * partly migrated database) are skipped.
 */
export async function grantAppPrivileges(db: DatabaseExecutor): Promise<void> {
  const role = sql.identifier(APP_ROLE);
  const tables = (
    await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )
  ).rows.map((row) => String(row.tablename));
  await db.transaction(async (tx) => {
    await tx.execute(sql`revoke all on all tables in schema public from ${role}`);
    for (const table of tables) {
      const privileges = APP_TABLE_PRIVILEGES[table];
      if (!privileges?.length) continue;
      await tx.execute(
        sql`grant ${sql.raw(privileges.join(', '))} on ${sql.identifier(table)} to ${role}`,
      );
    }
  });
}

export interface AppRoleOptions {
  /** The environment's secret for the role. Unset: the role's login and password stay as they are. */
  password?: string;
  /** The role to configure. Only tests use another name, so they don't touch the real one. */
  role?: string;
}

export interface AppRoleState {
  /** Whether the role can log in now. */
  login: boolean;
  /** Whether this call set the password. */
  passwordSet: boolean;
}

const MINIMUM_PASSWORD_LENGTH = 16;
const SAFE_ATTRIBUTES = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT';

/**
 * Creates or updates the app role, idempotently (ADR-006, AC18). The role never gets a
 * privilege beyond the ones the app needs: no superuser, no `BYPASSRLS`, no database or role
 * creation, no replication, and it inherits nothing.
 *
 * - With a `password`: the role can log in and has that password.
 * - Without one (the secret is not set in this environment yet): a missing role is created
 *   without a login, and an existing one is left exactly as it is. The release step still
 *   succeeds, so a preview deploys before the owner has set the secret.
 *
 * Needs the privileged role (`CREATEROLE` or superuser). The error for a short password never
 * contains the password.
 */
export async function ensureAppRole(
  db: DatabaseExecutor,
  options: AppRoleOptions = {},
): Promise<AppRoleState> {
  const { password, role = APP_ROLE } = options;
  if (password !== undefined && password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `The app role password must be at least ${MINIMUM_PASSWORD_LENGTH} characters (the value is not shown).`,
    );
  }
  const name = sql.identifier(role);
  const exists = (await db.execute(sql`select 1 from pg_roles where rolname = ${role}`)).rows
    .length;

  if (!exists) await db.execute(sql`create role ${name} nologin`);
  // Whatever the role was before, it ends without any privilege beyond logging in.
  await db.execute(sql`alter role ${name} ${sql.raw(SAFE_ATTRIBUTES)}`);
  if (password === undefined) {
    const [current] = (
      await db.execute(sql`select rolcanlogin from pg_roles where rolname = ${role}`)
    ).rows;
    return { login: current?.rolcanlogin === true, passwordSet: false };
  }
  // DDL takes no parameters: let Postgres quote the password as a literal.
  const [statement] = (
    await db.execute(
      sql`select format('alter role %I with login password %L', ${role}::text, ${password}::text) as statement`,
    )
  ).rows;
  await db.execute(sql.raw(String(statement?.statement)));
  return { login: true, passwordSet: true };
}
