import { describe, expect, it } from 'vitest';
import { startFakeSentry } from './fake-sentry.ts';
import { runMain, SPAWN_TEST_TIMEOUT_MS } from './run-main.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('E003 cron entrypoint', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
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

describe('E009 cron error reporting', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  it('AC3: failing job is captured and flushed before exit 1', async () => {
    const sentry = await startFakeSentry();
    try {
      const result = await runMain({
        DATABASE_URL: 'postgres://postgres:hunter2@127.0.0.1:1/none',
        SENTRY_DSN: sentry.dsn,
        RAILWAY_ENVIRONMENT_NAME: 'production',
        RAILWAY_GIT_COMMIT_SHA: SHA,
      });

      expect(result.exitCode).toBe(1);
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({
        environment: 'production',
        release: SHA,
        level: 'error',
        exception: {
          values: expect.arrayContaining([
            expect.objectContaining({
              type: 'Error',
              value: expect.stringContaining('127.0.0.1:1'),
            }),
          ]),
        },
      });
      expect(JSON.stringify(sentry.events)).not.toContain('hunter2');
    } finally {
      await sentry.close();
    }
  });
});
