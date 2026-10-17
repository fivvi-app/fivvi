import { createDatabase } from '@trainer-hub/database';
import { runMigrations } from '@trainer-hub/database/migrate';
import { setupTemplateDatabase } from '@trainer-hub/testing/database/setup';

// Migrates the run's template database once; test files clone it (TESTING.md §5.3).
export default setupTemplateDatabase(async (url) => {
  const client = createDatabase({ url, maxConnections: 1 });
  try {
    await runMigrations(client.db);
  } finally {
    await client.close();
  }
});
