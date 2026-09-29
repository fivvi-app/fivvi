import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Local convenience: pick up TEST_DATABASE_URL / DATABASE_URL from packages/database/.env.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Integration tests against a real Postgres (TESTING.md §5.3). Each test file
// creates its own throwaway databases, so files can run in parallel.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    env: { TZ: 'UTC' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
