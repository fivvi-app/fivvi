import { createDatabaseFromEnv } from '../client.ts';
import { runMigrations } from '../migrate.ts';

const { db, close } = createDatabaseFromEnv();
try {
  await runMigrations(db);
  console.log('Migrations applied.');
} finally {
  await close();
}
