import { createTestDatabase } from '@fivvi/testing/database';
import { describe, expect, it } from 'vitest';
import { startFakeLettermintTeamApi } from './fake-lettermint-team-api.ts';
import { startFakeSentry } from './fake-sentry.ts';
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

describe('E006 cron Lettermint usage alert', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  const TEAM_TOKEN = 'lm_team_not-a-real-token';

  it('reports usage at 70% to Sentry and still finishes the daily jobs', async () => {
    const database = await createTestDatabase();
    const sentry = await startFakeSentry();
    const teamApi = await startFakeLettermintTeamApi({ included: 300, used: 250 });
    try {
      const result = await runMain({
        DATABASE_URL: database.url,
        SENTRY_DSN: sentry.dsn,
        LETTERMINT_TEAM_TOKEN: TEAM_TOKEN,
        LETTERMINT_TEAM_API_URL: teamApi.url,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Database reachable.');
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({ level: 'warning' });
      expect(JSON.stringify(sentry.events)).toContain('250 of 300 emails this month (83%)');
      expect(teamApi.authorizations).toEqual([`Bearer ${TEAM_TOKEN}`, `Bearer ${TEAM_TOKEN}`]);
      expect(JSON.stringify(sentry.events)).not.toContain(TEAM_TOKEN);
    } finally {
      await Promise.all([database.drop(), sentry.close(), teamApi.close()]);
    }
  });

  it('reports a failing Team API once and still exits 0 after the other jobs', async () => {
    const database = await createTestDatabase();
    const sentry = await startFakeSentry();
    const teamApi = await startFakeLettermintTeamApi({ included: 300, used: 0, status: 503 });
    try {
      const result = await runMain({
        DATABASE_URL: database.url,
        SENTRY_DSN: sentry.dsn,
        LETTERMINT_TEAM_TOKEN: TEAM_TOKEN,
        LETTERMINT_TEAM_API_URL: teamApi.url,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Database reachable.');
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({ level: 'error' });
      expect(JSON.stringify(sentry.events)).toContain('lettermint: HTTP 503 UNAVAILABLE');
    } finally {
      await Promise.all([database.drop(), sentry.close(), teamApi.close()]);
    }
  });
});
