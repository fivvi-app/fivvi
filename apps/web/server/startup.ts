import { verifyStartup } from '@fivvi/api';
import { createAppDatabaseFromEnv, inspectConnectionRole } from '@fivvi/database';

/**
 * The start-up check of the API (E011, AC4): the web refuses to start when its database
 * connection logs in as a role RLS does not bind. It runs on a connection of its own, from the
 * same `APP_DATABASE_URL` as `database()`, and closes it. Throws without the connection string.
 */
export async function verifyApiStartup(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { db, close } = createAppDatabaseFromEnv(env, { maxConnections: 1 });
  try {
    await verifyStartup({ inspectDatabaseRole: () => inspectConnectionRole(db) });
  } finally {
    await close();
  }
}
