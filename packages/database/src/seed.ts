import type { DatabaseExecutor } from './client.ts';
import { authUsers } from './schema/index.ts';

export interface SeedOptions {
  /**
   * The `production` environment: the seed creates nothing. Production never runs it (E003);
   * this is the second lock.
   */
  production?: boolean;
}

/** Whether this process runs in the Railway environment `production` (ENVIRONMENTS.md). */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME?.trim() === 'production';
}

/**
 * Inserts demo data for local development, previews and tests. Production never runs it.
 * Must stay idempotent: previews run it on every deploy (E003). Never put real client data
 * here (ADR-005).
 *
 * Today: the account `owner@example.com` (F001), so every preview has an account to sign in
 * with; its sign-in email is written to the server log (`@example.com`, packages/email).
 * Rows that every environment needs, like the `hello` greeting, are data migrations instead
 * (`src/system-data.ts`).
 */
export async function seed(db: DatabaseExecutor, options: SeedOptions = {}): Promise<void> {
  if (options.production) return;
  await db
    .insert(authUsers)
    .values({
      email: 'owner@example.com',
      name: 'Owner',
      emailVerified: true,
      preferredLocale: 'nl-NL',
    })
    .onConflictDoNothing({ target: authUsers.email });
}
