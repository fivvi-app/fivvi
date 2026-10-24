import { createDatabaseFromEnv } from '../client.ts';
import { isProductionEnvironment, seed } from '../seed.ts';

const { db, close } = createDatabaseFromEnv();
try {
  await seed(db, { production: isProductionEnvironment() });
  console.log('Seed data inserted.');
} finally {
  await close();
}
