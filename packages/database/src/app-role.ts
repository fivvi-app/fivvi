import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
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
const SCRAM_ITERATIONS = 4096;

/**
 * A SCRAM-SHA-256 verifier for a password (RFC 5802, the form Postgres stores:
 * `SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>`). Postgres accepts it in place of a
 * password and keeps it as it is, so the cleartext never reaches a statement, the server log or a
 * query error. Computed over the UTF-8 bytes of the password, which is what Postgres computes for
 * an ASCII password and what the Node driver sends for any.
 */
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations: number = SCRAM_ITERATIONS,
): string {
  const hmac = (key: Buffer, message: string) => createHmac('sha256', key).update(message).digest();
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256').update(hmac(saltedPassword, 'Client Key')).digest();
  const serverKey = hmac(saltedPassword, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/** The SQLSTATE of a failed query, however Drizzle wrapped it. */
function sqlState(error: unknown): string {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return 'unknown';
}

/**
 * Runs a statement on the role. A failure is rethrown with only the SQLSTATE: Drizzle's error
 * carries the query and its parameters, and a statement that sets the password must never put
 * them (or the driver's message) in a deploy log.
 */
async function roleStatement(db: DatabaseExecutor, statement: ReturnType<typeof sql>) {
  try {
    return await db.execute(statement);
  } catch (error) {
    throw new Error(`The app role could not be set up (SQLSTATE ${sqlState(error)}).`);
  }
}

/**
 * Creates or updates the app role, idempotently (ADR-006, AC18). The role never gets a
 * privilege beyond the ones the app needs: no superuser, no `BYPASSRLS`, no database or role
 * creation, no replication, it inherits nothing, and it is a member of no other role.
 *
 * - With a `password`: the role can log in and has that password.
 * - Without one (the secret is not set in this environment yet): a missing role is created
 *   without a login, and an existing one keeps its login and password. Either way the role ends
 *   with the safe attributes above and no memberships. The release step still succeeds, so a
 *   preview deploys before the owner has set the secret.
 *
 * Needs the privileged role (`CREATEROLE` or superuser). The password reaches Postgres only as a
 * SCRAM-SHA-256 verifier, and no error contains the password: a short password is refused
 * without it, a failed statement is reported by SQLSTATE only.
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
  const exists = (await roleStatement(db, sql`select 1 from pg_roles where rolname = ${role}`)).rows
    .length;

  if (!exists) await roleStatement(db, sql`create role ${name} nologin`);
  // Whatever the role was before, it ends without any privilege beyond logging in.
  await roleStatement(db, sql`alter role ${name} ${sql.raw(SAFE_ATTRIBUTES)}`);
  const memberships = await roleStatement(
    db,
    sql`select p.rolname as parent from pg_auth_members m
        join pg_roles p on p.oid = m.roleid
        join pg_roles c on c.oid = m.member
        where c.rolname = ${role}`,
  );
  for (const membership of memberships.rows) {
    await roleStatement(db, sql`revoke ${sql.identifier(String(membership.parent))} from ${name}`);
  }
  if (password === undefined) {
    const [current] = (
      await roleStatement(db, sql`select rolcanlogin from pg_roles where rolname = ${role}`)
    ).rows;
    return { login: current?.rolcanlogin === true, passwordSet: false };
  }
  // DDL takes no parameters: the verifier is base64 text, so quoting it is all it needs.
  const verifier = scramSha256Verifier(password).replaceAll("'", "''");
  await roleStatement(db, sql`alter role ${name} with login password ${sql.raw(`'${verifier}'`)}`);
  return { login: true, passwordSet: true };
}
