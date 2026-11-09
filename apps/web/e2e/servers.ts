// The production servers the e2e tests run against (playwright.config.ts). Both serve the same
// build; only their runtime variables differ. Each reads its own migrated database on the local
// test server (e2e/serve.ts), named after its port so worktrees never share one.

const port = Number(process.env.E2E_PORT ?? 3100);

/** The domain the e2e servers allow to sign up (`SIGN_UP_ALLOWED_EMAILS`, playwright.config.ts). */
export const ALLOWED_SIGN_UP_DOMAIN = 'allowed.e2e.test';

/** A domain the sign-up allowlist does not cover (the default of `newAddress`): its addresses need `createAccount`. */
export const UNLISTED_SIGN_UP_DOMAIN = 'fivvi.e2e.test';

/** The secret of the e2e servers (`BETTER_AUTH_SECRET`): synthetic, and known to `signInWithSession`. */
export const E2E_AUTH_SECRET = 'e2e-secret-that-is-at-least-thirty-two-characters-long';

/** Synthetic app-link values in the real formats (E017 AC5): neither belongs to a real account or key. */
export const TEST_APPLE_TEAM_ID = 'ABCDE12345';
export const TEST_ANDROID_CERT_SHA256 = Array.from({ length: 32 }, (_, i) =>
  (i * 7 + 3).toString(16).padStart(2, '0'),
)
  .join(':')
  .toUpperCase();

/**
 * The app as in CI and local development: no Sentry DSN and no PostHog key. It is the one server
 * with the app-link values, as production has; the others have none, as previews do.
 */
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

/**
 * Where the e2e servers send the demo requests of the website (`DEMO_REQUEST_TO`, F064): a fake
 * mailbox on the fake Lettermint server. Production sends them to the support address; every other
 * environment logs mail to an `@example.com` address instead of sending it.
 */
export const DEMO_REQUEST_ADDRESS = 'support@fivvi.e2e.test';

const lettermintPort = port + 2000;

/**
 * The fake Lettermint server (F001, E006): the app sends its emails to it (`LETTERMINT_API_URL`)
 * instead of to Lettermint, and the specs read the sign-in code and link from it (e2e/lettermint.ts). 2000 up, outside
 * the range of every worktree's own E2E_PORT and of the analytics server.
 */
export const lettermintServer = {
  port: lettermintPort,
  baseURL: `http://localhost:${lettermintPort}`,
  /** Where the app posts emails, like Lettermint's `POST /v1/send`. */
  apiUrl: `http://localhost:${lettermintPort}/v1/send`,
};

function server(serverPort: number) {
  return {
    port: serverPort,
    baseURL: `http://localhost:${serverPort}`,
    database: `fivvi_test_e2e_${serverPort}`,
  };
}
