import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config';
import { vitestTestNamePattern } from '../../../scripts/quarantine.mjs';

/**
 * Shared Vitest presets (TESTING.md §5). Every package's `vitest.config.ts` uses
 * `unitConfig()`, and packages with database tests add a `vitest.integration.config.ts`
 * with `integrationConfig()`. Overrides are merged in; arrays such as `exclude` are
 * appended to the preset's.
 *
 * File naming decides the suite:
 * - `*.test.ts(x)`: unit (`pnpm test`). No database, no network.
 * - `*.integration.test.ts`: integration (`pnpm test:integration`). Real Postgres.
 * - `e2e/**`: Playwright (`pnpm test:e2e`), never Vitest.
 *
 * Both presets read the quarantine list `quarantine/vitest.txt` (ADR-025, TESTING.md §8; scripts/quarantine.mjs): a listed
 * test is left out, which is what the required CI jobs and every local run do, and with `FIVVI_QUARANTINE=only` (the
 * `Quarantine` job) exactly the listed tests run. A test is named by its full name, the titles of its describe blocks and
 * its own joined by a space. The list is empty unless a flaky test is in quarantine; turbo takes it as an input of the
 * test tasks (turbo.json).
 */

const alwaysExcluded = ['**/node_modules/**', '**/.next/**', '**/dist/**', 'e2e/**'];

const shared = defineConfig({
  test: {
    environment: 'node',
    // The machine's time zone must never leak into a test (TESTING.md §5.4).
    env: { TZ: 'UTC' },
    // Undo vi.spyOn / vi.stubEnv / vi.stubGlobal after every test, so tests can't
    // leak state into each other.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // Retries hide flaky tests; they are off for Vitest suites (TESTING.md §8).
    retry: 0,
    // The quarantine list: undefined (no filter) while it is empty.
    testNamePattern: vitestTestNamePattern(),
  },
});

/** Unit tests: `**\/*.test.ts(x)` without `*.integration.test.ts`. */
export function unitConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  return mergeConfig(
    mergeConfig(shared, {
      test: {
        include: ['**/*.test.{ts,tsx}'],
        exclude: [...alwaysExcluded, '**/*.integration.test.{ts,tsx}'],
      },
    }),
    overrides,
  );
}

/**
 * Integration tests against real Postgres: `**\/*.integration.test.ts`. Pass the
 * package's global setup (see `setupTemplateDatabase` in `@fivvi/testing/database`)
 * as `test.globalSetup` when the tests use the migrated template database.
 */
export function integrationConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  return mergeConfig(
    mergeConfig(shared, {
      test: {
        include: ['**/*.integration.test.{ts,tsx}'],
        exclude: alwaysExcluded,
        testTimeout: 30_000,
        hookTimeout: 60_000,
      },
    }),
    overrides,
  );
}
