import { createTestDatabase } from '@trainer-hub/testing/database';
import { describe, expect, it } from 'vitest';
import { runMain, SPAWN_TEST_TIMEOUT_MS } from './run-main.ts';

describe('E003 cron entrypoint', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  it('connects to the database, logs and exits 0', async () => {
    const database = await createTestDatabase();
    try {
      const result = await runMain({ DATABASE_URL: database.url });

      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(
        /^Daily cron started\.\nDatabase reachable\.\nDaily cron finished in \d+ ms\.\n$/,
      );
    } finally {
      await database.drop();
    }
  });
});
