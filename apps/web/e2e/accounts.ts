import { randomBytes, randomUUID } from 'node:crypto';
import { authUsers, createDatabase } from '@fivvi/database';
import { databaseUrl } from '@fivvi/testing/database/server';
import { appServer } from './servers';

/**
 * A new synthetic address for one spec. Not `@example.com`: outside production that mail goes to
 * the server log, while this one is sent through Brevo, i.e. to the fake Brevo server.
 */
export function newAddress(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@fivvi.e2e.test`;
}

/**
 * A new documentation-range IPv6 address (RFC 3849, `2001:db8::/32`), for the `x-forwarded-for`
 * header of a spec. Better Auth groups IPv6 addresses by /64, so the random part is the first 32
 * bits of the network prefix.
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
