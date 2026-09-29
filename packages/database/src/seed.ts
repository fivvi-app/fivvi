import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { systemGreetings } from './schema/index.ts';

/** The greeting the M1 "hello" slice reads. `system.hello` must exist in `packages/i18n`. */
export const HELLO_GREETING = { slug: 'hello', i18nKey: 'system.hello' } as const;

/**
 * Inserts demo and system data for local development, previews and tests.
 * Idempotent: running it again updates the rows instead of duplicating them.
 * Never put real client data here (ADR-005).
 */
export async function seed(db: Database): Promise<void> {
  await db
    .insert(systemGreetings)
    .values([HELLO_GREETING])
    .onConflictDoUpdate({
      target: systemGreetings.slug,
      set: { i18nKey: sql`excluded.i18n_key` },
    });
}
