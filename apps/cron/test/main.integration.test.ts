import { createTestDatabase } from '@fivvi/testing/database';
import { describe, expect, it } from 'vitest';
import { runMain, SPAWN_TEST_TIMEOUT_MS } from './run-main.ts';

describe('E003 cron entrypoint', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  it('connects to the database, logs and exits 0', async () => {
    const database = await createTestDatabase();
    try {
      const result = await runMain({ DATABASE_URL: database.url });

      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      // The privileged connection logs its reason (E011, AC17), and never the connection.
      expect(result.stdout).toMatch(
        /^Daily cron started\.\nPrivileged database access: daily-cron \(.+\)\.\nDatabase reachable\.\nDaily cron finished in \d+ ms\.\n$/,
      );
      expect(result.stdout).not.toContain(database.url);
    } finally {
      await database.drop();
    }
  });
});
