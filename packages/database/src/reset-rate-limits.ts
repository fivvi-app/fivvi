// @fivvi/testing is test-only, but this script runs only in local development (the Maestro run), and reusing its
// local-host check makes every script that deletes data refuse a Railway database the same way.
import { localServerUrl } from '@fivvi/testing/database/server';
import type { DatabaseExecutor } from './client.ts';
import { authRateLimits } from './schema/index.ts';

/**
 * `DATABASE_URL`, only when it is a local Postgres (TESTING.md §5.3). Throws otherwise, before
 * anything connects, and never echoes the URL, which holds the password. Not
 * `TEST_DATABASE_URL`: this checks the database the script clears.
 */
export function readLocalDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. For local development, copy packages/database/.env.example to .env.',
    );
  }
  return localServerUrl(url, 'DATABASE_URL', 'Clearing the sign-in rate limits only runs against');
}

/**
 * Deletes every sign-in rate limit counter (F001), expired or not, so a Maestro run isn't
 * limited by an earlier one (3 emails per address in 15 minutes). Local development only:
 * the script (`src/scripts/reset-rate-limits.ts`) refuses any other host.
 */
export async function resetRateLimits(db: DatabaseExecutor): Promise<void> {
  await db.delete(authRateLimits);
}
