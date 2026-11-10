import { existsSync } from 'node:fs';
import { integrationConfig } from '@fivvi/testing/vitest';

// Local convenience: pick up TEST_DATABASE_URL / DATABASE_URL from packages/database/.env.
if (existsSync('../database/.env')) {
  process.loadEnvFile('../database/.env');
}

// Integration tests against a real Postgres (TESTING.md §5.3), for the import's dry-run CLI (E015).
export default integrationConfig({
  test: { globalSetup: ['./test/global-setup.ts'] },
});
