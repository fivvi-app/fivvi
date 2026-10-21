import { existsSync } from 'node:fs';
import { integrationConfig } from '@fivvi/testing/vitest';

// Local convenience: pick up TEST_DATABASE_URL / DATABASE_URL from packages/database/.env.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Integration tests against a real Postgres (TESTING.md §5.3). The global setup
// migrates one template database per run; test files clone it.
export default integrationConfig({
  test: { globalSetup: ['./test/global-setup.ts'] },
});
