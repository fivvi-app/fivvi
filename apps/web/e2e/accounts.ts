import { randomBytes, randomUUID } from 'node:crypto';
import { authUsers, createDatabase } from '@fivvi/database';
import { databaseUrl } from '@fivvi/testing/database/server';
import { ALLOWED_SIGN_UP_DOMAIN, appServer } from './servers';

/**
 * A new synthetic address for one spec. Not `@example.com`: outside production that mail goes to
 * the server log, while this one is sent through Brevo, i.e. to the fake Brevo server. The default
 * domain is not on the e2e server's sign-up allowlist, so it needs `createAccount`; `newAllowedAddress` is on it.
 */
export function newAddress(label: string, domain = 'fivvi.e2e.test'): string {
  return `${label}-${randomUUID().slice(0, 8)}@${domain}`;
}

/** A new synthetic address that may sign up without an account (the allowlist covers its domain). */
export function newAllowedAddress(label: string): string {
  return newAddress(label, ALLOWED_SIGN_UP_DOMAIN);
}

/**
 * A new documentation-range IPv6 address (RFC 3849, `2001:db8::/32`), for the client IP headers of
 * a spec. Better Auth groups IPv6 addresses by /64, so the random part is the first 32 bits of the
 * network prefix.
 *
 * Send it as both `x-forwarded-for` and `x-real-ip`: today Better Auth reads the first, and once
 * the rate limits (#134) trust `X-Real-IP` it reads the second (under `next start`, a request
 * without it shares one "unknown IP" bucket). `x-forwarded-for` can go once #134 is on main.
 */
export function newIpAddress(): string {
  return `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
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
