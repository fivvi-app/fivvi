import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  authSessions,
  authUsers,
  createDatabase,
  organizations,
  teamMembers,
} from '@fivvi/database';
import type { Locale } from '@fivvi/i18n';
import { databaseUrl } from '@fivvi/testing/database/server';
import type { BrowserContext } from '@playwright/test';
import { eq } from 'drizzle-orm';
import {
  ALLOWED_SIGN_UP_DOMAIN,
  appServer,
  E2E_AUTH_SECRET,
  UNLISTED_SIGN_UP_DOMAIN,
} from './servers';

/**
 * A new synthetic address for one spec. Not `@example.com`: outside production that mail goes to
 * the server log, while this one is sent through Brevo, i.e. to the fake Brevo server. The default
 * domain is not on the e2e server's sign-up allowlist, so it needs `createAccount`; `newAllowedAddress` is on it.
 */
export function newAddress(label: string, domain = UNLISTED_SIGN_UP_DOMAIN): string {
  return `${label}-${randomUUID().slice(0, 8)}@${domain}`;
}

/** A new synthetic address that may sign up without an account (the allowlist covers its domain). */
export function newAllowedAddress(label: string): string {
  return newAddress(label, ALLOWED_SIGN_UP_DOMAIN);
}

/**
 * A new documentation-range IPv6 address (RFC 3849, `2001:db8::/32`), for the client IP headers of
 * a spec. The rate limits group IPv6 addresses by /64, so the random part is the first 32 bits of the
 * network prefix.
 */
export function newIpAddress(): string {
  return `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
}

/**
 * The client IP header of one spec's visitor: a new address in `x-real-ip`, the only header the
 * sign-in rate limits read (#134, `ENVIRONMENTS.md §7`). Without a valid one, the standalone
 * server (`NODE_ENV=production`) counts a request in one shared "unknown IP" bucket, which the
 * specs would exhaust together.
 */
export function clientIpHeaders(): Record<string, string> {
  return { 'x-real-ip': newIpAddress() };
}

/** Creates the account `email` on the e2e app server's database; the sign-in page has no sign-up. */
export async function createAccount(email: string, preferredLocale?: Locale): Promise<void> {
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    await client.db.insert(authUsers).values({
      email,
      name: 'E2E',
      emailVerified: true,
      ...(preferredLocale ? { preferredLocale } : {}),
    });
  } finally {
    await client.close();
  }
}

/**
 * Makes `email` (an existing account, see `createAccount`) a Trainer (or, with `role`, the Owner)
 * of a new workspace named `name`, on the e2e app server's database, and returns the workspace's
 * URL name. With the default role the workspace has no Owner: the spec is about what a Trainer
 * sees. The URL name is made unique, so specs and retries never share a workspace.
 */
export async function createGymWithTrainer(
  email: string,
  name: string,
  role: 'owner' | 'trainer' = 'trainer',
): Promise<string> {
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    const user = (await client.db.select().from(authUsers).where(eq(authUsers.email, email)))[0];
    if (!user) throw new Error(`No account ${email} on the e2e database.`);
    const slug = `trainer-gym-${randomUUID().slice(0, 8)}`;
    const [gym] = await client.db
      .insert(organizations)
      .values({ name, slug, defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' })
      .returning({ id: organizations.id });
    if (!gym) throw new Error('The workspace was not created.');
    await client.db
      .insert(teamMembers)
      .values({ organizationId: gym.id, accountId: user.id, role });
    return slug;
  } finally {
    await client.close();
  }
}

/**
 * Signs the existing account `email` in without the emailed code: a sign-in session on the e2e
 * app server's database and its signed cookie in the browser context. For the seeded account
 * (`owner@example.com`), which every spec shares: an address has one live code and three
 * sign-ins per 15 minutes, so specs and projects that signed it in by email would replace each
 * other's code and run out of attempts. The sign-in itself is proven with accounts of a spec's own.
 */
export async function signInWithSession(context: BrowserContext, email: string): Promise<void> {
  const token = randomBytes(24).toString('base64url');
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    const user = (await client.db.select().from(authUsers).where(eq(authUsers.email, email)))[0];
    if (!user) throw new Error(`No account ${email} on the e2e database.`);
    await client.db
      .insert(authSessions)
      .values({ userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  } finally {
    await client.close();
  }
  // Better Auth's signed cookie: the token, a dot and the base64 HMAC-SHA256 of the token.
  const signature = createHmac('sha256', E2E_AUTH_SECRET).update(token).digest('base64');
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: encodeURIComponent(`${token}.${signature}`),
      url: appServer.baseURL,
    },
  ]);
}

/** The pool behind the Drizzle client, which the `Database` type doesn't show. */
interface PoolLike {
  query(text: string, values: unknown[]): Promise<{ rows: Array<{ expires_at: Date }> }>;
}

const SESSION_OWNER = '(select id from auth_users where email = $1)';

async function withPool<T>(run: (pool: PoolLike) => Promise<T>): Promise<T> {
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    return await run((client.db as unknown as { $client: PoolLike }).$client);
  } finally {
    await client.close();
  }
}

/**
 * Sets when the sign-in sessions of the account `email` end, on the e2e app server's database.
 * Used to age a session without waiting for days.
 */
export async function setSessionExpiry(email: string, expiresAt: Date): Promise<void> {
  await withPool((pool) =>
    pool.query(`update auth_sessions set expires_at = $2 where user_id = ${SESSION_OWNER}`, [
      email,
      expiresAt,
    ]),
  );
}

/** When each sign-in session of the account `email` ends, on the e2e app server's database. */
export function sessionExpiries(email: string): Promise<Date[]> {
  return withPool(async (pool) => {
    const { rows } = await pool.query(
      `select expires_at from auth_sessions where user_id = ${SESSION_OWNER}`,
      [email],
    );
    return rows.map((row) => row.expires_at);
  });
}
