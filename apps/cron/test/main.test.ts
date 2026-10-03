import { describe, expect, it } from 'vitest';
import { runMain } from './run-main.ts';

// Each test starts a Node process that type-strips the database package. On a loaded CI
// runner that takes 4–5 s, so Vitest's 5 s default made these tests time out. Give them
// the same budget as runMain's own 20 s process timeout, plus margin.
describe('E003 cron entrypoint', { timeout: 30_000 }, () => {
  it('exits 1 with a clear message when DATABASE_URL is missing', async () => {
    const result = await runMain({});

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Daily cron started.');
    expect(result.stderr).toContain('Daily cron failed: DATABASE_URL is not set');
  });

  it('exits 1 without printing the password when Postgres is unreachable', async () => {
    // Port 1 on localhost refuses connections immediately.
    const result = await runMain({ DATABASE_URL: 'postgres://app:hunter2@127.0.0.1:1/none' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Daily cron failed:');
    expect(result.stdout + result.stderr).not.toContain('hunter2');
  });
});
