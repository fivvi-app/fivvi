import { randomBytes, randomUUID } from 'node:crypto';
import { authUsers, createDatabase } from '@fivvi/database';
import { databaseUrl } from '@fivvi/testing/database/server';
import { ALLOWED_SIGN_UP_DOMAIN, appServer, UNLISTED_SIGN_UP_DOMAIN } from './servers';

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
export async function createAccount(email: string): Promise<void> {
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    await client.db.insert(authUsers).values({ email, name: 'E2E', emailVerified: true });
  } finally {
    await client.close();
  }
}

/** The pool behind the Drizzle client, which the `Database` type doesn't show. */
interface PoolLike {
  query(text: string, values: unknown[]): Promise<{ rows: Array<{ expires_at: Date }> }>;
}

/**
 * Sets when the sign-in sessions of the account `email` end, on the e2e app server's database, and
 * returns the expiry each of them has afterwards. Used to age a session without waiting for days.
 */
export async function setSessionExpiry(email: string, expiresAt?: Date): Promise<Date[]> {
  const client = createDatabase({ url: databaseUrl(appServer.database), maxConnections: 1 });
  try {
    const pool = (client.db as unknown as { $client: PoolLike }).$client;
    const owner = '(select id from auth_users where email = $1)';
    if (expiresAt) {
      await pool.query(`update auth_sessions set expires_at = $2 where user_id = ${owner}`, [
        email,
        expiresAt,
      ]);
    }
    const { rows } = await pool.query(
      `select expires_at from auth_sessions where user_id = ${owner}`,
      [email],
    );
    return rows.map((row) => row.expires_at);
  } finally {
    await client.close();
  }
}
