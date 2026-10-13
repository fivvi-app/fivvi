import type { DatabaseExecutor } from './client.ts';

/**
 * Inserts demo data for local development, previews and tests. Production never runs it.
 * Must stay idempotent: previews run it on every deploy (E003). Never put real client data
 * here (ADR-005).
 *
 * Empty until the first business tables (M2). Rows that every environment needs, like the
 * `hello` greeting, are data migrations instead (`src/system-data.ts`).
 */
export async function seed(_db: DatabaseExecutor): Promise<void> {}
