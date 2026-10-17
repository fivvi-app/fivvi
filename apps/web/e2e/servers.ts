// The production servers the e2e tests run against (playwright.config.ts). Both serve the same
// build; only their runtime variables differ. Each reads its own migrated database on the local
// test server (e2e/serve.ts), named after its port so worktrees never share one.

const port = Number(process.env.E2E_PORT ?? 3100);

/** The app as in CI and local development: no Sentry DSN and no PostHog key. */
export const appServer = server(port);

/** A synthetic PostHog project key: the page view tests (E009) never reach PostHog. */
export const TEST_POSTHOG_KEY = 'phc_e2e_synthetic_project_key';

/**
 * A synthetic PostHog host (`.test` never resolves), which the page view tests intercept: page
 * views go to whatever POSTHOG_HOST says, never to a built-in address.
 */
export const TEST_POSTHOG_HOST = 'https://posthog.e2e.test';

/**
 * The same build with a PostHog key and host, so it sends page views (E009 AC6). 1000 up, outside the
 * range of every worktree's own E2E_PORT (scripts/_lib.sh), so it never reuses another's server.
 */
export const analyticsServer = server(port + 1000);

function server(serverPort: number) {
  return {
    port: serverPort,
    baseURL: `http://localhost:${serverPort}`,
    database: `trainer_hub_test_e2e_${serverPort}`,
  };
}
