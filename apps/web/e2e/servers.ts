// The production servers the e2e tests run against (playwright.config.ts). Both serve the same
// build; only their runtime variables differ.

const port = Number(process.env.E2E_PORT ?? 3100);

/** The app as in CI and local development: no Sentry DSN and no PostHog key. */
export const appServer = { port, baseURL: `http://localhost:${port}` };

/** A synthetic PostHog project key: the page view tests (E009) never reach PostHog. */
export const TEST_POSTHOG_KEY = 'phc_e2e_synthetic_project_key';

/**
 * The same build with a PostHog key, so it sends page views (E009 AC6). 1000 up, outside the
 * range of every worktree's own E2E_PORT (scripts/_lib.sh), so it never reuses another's server.
 */
const analyticsPort = port + 1000;
export const analyticsServer = {
  port: analyticsPort,
  baseURL: `http://localhost:${analyticsPort}`,
};
