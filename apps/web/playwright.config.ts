import { defineConfig, devices } from '@playwright/test';
import { defaultTimeZone, formattingLocales, locales } from '@trainer-hub/i18n';
import type { E2EOptions } from './e2e/fixtures';

// Web e2e tests (TESTING.md §2). Every spec runs once per catalog locale: one project
// per locale, with the browser language set to it. `pnpm test:e2e` from the repo root
// builds the app first (turbo); this config only starts the production server.

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const ci = Boolean(process.env.CI);

export default defineConfig<E2EOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  // One retry in CI; a test that only passes on retry is reported as flaky (TESTING.md §8).
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    timezoneId: defaultTimeZone,
    trace: 'retain-on-first-failure',
  },
  projects: locales.map((locale) => ({
    name: locale,
    use: {
      ...devices['Desktop Chrome'],
      appLocale: locale,
      // Sets navigator.language and Accept-Language, like a real browser in this language.
      locale: formattingLocales[locale],
    },
  })),
  // The standalone server, as in production (Dockerfile), not `next start`.
  webServer: {
    command: 'node .next/standalone/apps/web/server.js',
    env: { PORT: String(port), HOSTNAME: 'localhost' },
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
