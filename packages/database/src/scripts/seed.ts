import { openPrivilegedDatabase } from '../privileged.ts';
import { isProductionEnvironment, seed } from '../seed.ts';

const { db, close } = openPrivilegedDatabase('local-setup');
try {
  await seed(db, { production: isProductionEnvironment() });
  console.log('Seed data inserted.');
} finally {
  await close();
}
