import { createDatabaseFromEnv } from '../client.ts';
import { seed } from '../seed.ts';

const { db, close } = createDatabaseFromEnv();
try {
  await seed(db);
  console.log('Seed data inserted.');
} finally {
  await close();
}
