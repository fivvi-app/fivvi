import { existsSync } from 'node:fs';
import { defaultTimeZone, formattingLocales, type Locale, locales } from '@fivvi/i18n';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import type { E2EOptions } from './e2e/fixtures';
import {
  ALLOWED_SIGN_UP_DOMAIN,
  analyticsServer,
  appServer,
  DEMO_REQUEST_ADDRESS,
  lettermintServer,
  TEST_ANDROID_CERT_SHA256,
  TEST_APPLE_TEAM_ID,
  TEST_POSTHOG_HOST,
  TEST_POSTHOG_KEY,
} from './e2e/servers';
import { budgetsTarget } from './test/budgets';
import { e2eRun } from './test/e2e-run';

// Web e2e tests (TESTING.md §2). Every spec runs once per catalog locale: one project
// per locale, with the browser language set to it. `pnpm test:e2e` from the repo root
// builds the app first (turbo); this config only starts the production server.

const ci = Boolean(process.env.CI);

/** The Lighthouse budgets of the public website (F064 AC15): a run of their own, `pnpm test:budgets`. */
const BUDGET_SPEC = /site-budgets\.spec\.ts$/;

/**
 * `pnpm test:budgets` sets E2E_BUDGETS: the run is the `budgets-*` projects and nothing else. The
 * default run (`pnpm test:e2e`) has the other projects and leaves the budgets out, so their
 * Lighthouse runs, which want a quiet machine and a time of their own, do not lengthen it (TESTING.md §2).
 *
 * `BUDGETS_BASE_URL` (a deployed site, such as a PR's Railway preview) points the budgets at that
 * address instead of the local build: no web server and no database start, the go-live proxy
 * (e2e/go-live-proxy.ts) sits in front of the address. It implies the budgets run.
 */
const budgetsTargetUrl = budgetsTarget(process.env.BUDGETS_BASE_URL);
const budgets = Boolean(process.env.E2E_BUDGETS) || budgetsTargetUrl !== undefined;

/** The browser of a project: Desktop Chrome with the project's language (sets navigator.language and Accept-Language). */
function localeUse(locale: Locale) {
  return {
    ...devices['Desktop Chrome'],
    appLocale: locale,
    locale: formattingLocales[locale],
  };
}

// Local convenience: the servers' databases go on the Postgres in packages/database/.env
// (`pnpm db:up`), unless TEST_DATABASE_URL says otherwise. CI sets TEST_DATABASE_URL.
if (existsSync('../../packages/database/.env')) {
  process.loadEnvFile('../../packages/database/.env');
}

const reporter: ReporterDescription[] = ci
  ? [['github'], ['list'], ['html', { open: 'never' }]]
  : [['list']];
// A run that hits the global limit says so (e2e/timeout-reporter.ts), not only through the tests it cut off.
if (ci) reporter.push(['./e2e/timeout-reporter.ts']);
// The budgets end with one table of their numbers, to paste on the PR.
if (budgets) reporter.push(['./e2e/budgets-reporter.ts']);

export default defineConfig<E2EOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  // The CI job of the e2e tests has 15 minutes in all (setup and build included, .github/workflows/ci.yml).
  // The suite stops itself earlier, with the results so far and the names of the tests still running,
  // instead of the job being cancelled without a word (turbo only prints a task's output when it ends).
  // The workers and the limit, and why, are in test/e2e-run.ts. The budgets are not a CI gate: they
  // run by hand, with `--workers=1`, which overrides the workers here.
  ...e2eRun(ci),
  // One retry in CI; a test that only passes on retry is reported as flaky (TESTING.md §8).
  retries: ci ? 1 : 0,
  reporter,
  use: {
    baseURL: budgetsTargetUrl ?? appServer.baseURL,
    timezoneId: defaultTimeZone,
    trace: 'retain-on-first-failure',
  },
  projects: budgets
    ? // The speed budgets (F064 AC15), one project per language. Lighthouse simulates the slow phone
      // from a trace, calibrated to the speed of the host (e2e/lighthouse.ts).
      locales.map((locale) => ({
        name: `budgets-${locale}`,
        testMatch: BUDGET_SPEC,
        use: localeUse(locale),
      }))
    : locales.map((locale) => ({
        name: locale,
        testIgnore: BUDGET_SPEC,
        use: localeUse(locale),
      })),
  // The standalone server, as in production (Dockerfile), not `next start`, each on its own
  // migrated database (e2e/serve.ts). A second one runs the same build with a PostHog key and
  // host, which it reads at runtime, for the page view tests (E009). Both send their emails to the
  // fake Lettermint server (F001), which the third web server runs.
  webServer: budgetsTargetUrl
    ? []
    : [
        {
          command: 'node e2e/fake-lettermint.ts',
          env: { PORT: String(lettermintServer.port) },
          url: lettermintServer.baseURL,
          reuseExistingServer: !ci,
          timeout: 60_000,
        },
        standaloneServer(appServer, {
          // Like production: the app-link files are served (E017 AC5).
          APPLE_TEAM_ID: TEST_APPLE_TEAM_ID,
          ANDROID_CERT_SHA256: TEST_ANDROID_CERT_SHA256,
        }),
        standaloneServer(analyticsServer, {
          NEXT_PUBLIC_POSTHOG_KEY: TEST_POSTHOG_KEY,
          POSTHOG_HOST: TEST_POSTHOG_HOST,
        }),
      ],
});

function standaloneServer(
  { port, baseURL, database }: { port: number; baseURL: string; database: string },
  env: Record<string, string> = {},
) {
  return {
    command: 'node e2e/serve.ts',
    env: {
      // Empty unless the caller sets them, whatever the developer's shell holds: like a preview,
      // a server serves no app-link files (E017 AC5).
      APPLE_TEAM_ID: '',
      ANDROID_CERT_SHA256: '',
      ...env,
      E2E_DATABASE: database,
      PORT: String(port),
      HOSTNAME: 'localhost',
      // Synthetic: the fake Lettermint server accepts any token, and `.test` never resolves. The
      // address is set explicitly, so a token in the developer's shell never reaches real Lettermint.
      LETTERMINT_API_URL: lettermintServer.apiUrl,
      LETTERMINT_API_TOKEN: 'e2e-synthetic-lettermint-token',
      LETTERMINT_ROUTE_SIGN_IN: 'e2e-sign-in',
      LETTERMINT_ROUTE_MAIL: 'e2e-mail',
      // The demo form's email goes to the fake mailbox, not the support address (F064).
      DEMO_REQUEST_TO: DEMO_REQUEST_ADDRESS,
      EMAIL_FROM_ADDRESS: 'noreply@fivvi.e2e.test',
      EMAIL_FROM_NAME: 'Fivvi',
      // Closed sign-up (F001): only this domain gets an account at its first sign-in.
      SIGN_UP_ALLOWED_EMAILS: `@${ALLOWED_SIGN_UP_DOMAIN}`,
    },
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 60_000,
  };
}
