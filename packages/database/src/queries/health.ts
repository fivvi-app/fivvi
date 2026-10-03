import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';

/** Runs a trivial query, so it fails when Postgres can't be reached or refuses the login. */
export async function pingDatabase(db: DatabaseExecutor): Promise<void> {
  await db.execute(sql`select 1`);
}
