import { createDatabase } from '../client.ts';
import { readLocalDatabaseUrl, resetRateLimits } from '../reset-rate-limits.ts';

// Local development only (scripts/maestro.sh): refuses a DATABASE_URL that is not on localhost.
const { db, close } = createDatabase({ url: readLocalDatabaseUrl(), maxConnections: 1 });
try {
  await resetRateLimits(db);
  console.log('Sign-in rate limits cleared.');
} finally {
  await close();
}
