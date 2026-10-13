import { existsSync } from 'node:fs';
import { integrationConfig } from '@trainer-hub/testing/vitest';

// Local convenience: pick up TEST_DATABASE_URL / DATABASE_URL from packages/database/.env.
if (existsSync('../../packages/database/.env')) {
  process.loadEnvFile('../../packages/database/.env');
}

// Runs the job entrypoint against a real Postgres (TESTING.md §5.3).
export default integrationConfig();
