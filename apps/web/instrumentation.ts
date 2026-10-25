import {
  checkPageViewsConfig,
  createErrorReporter,
  createRequestErrorHandler,
} from '@fivvi/observability';
import type { Instrumentation } from 'next';

const errorReporter = createErrorReporter();

// Reports errors thrown while rendering a page (server components, server actions) to Sentry
// when SENTRY_DSN is set (E009, docs/engineering/OBSERVABILITY.md). API errors are reported by
// the API itself (app/api/[[...route]]/route.ts).
export const onRequestError: Instrumentation.onRequestError =
  createRequestErrorHandler(errorReporter);

// Runs once when the server starts. A page views key with a missing or wrong POSTHOG_HOST is
// reported here, once, instead of on every request the layout reads it (OBSERVABILITY.md §5).
// A malformed SIGN_UP_ALLOWED_EMAILS stops the server here, so a bad deploy fails its health
// check instead of answering every sign-in request with a 500 (F001, ENVIRONMENTS.md §7). Only
// that variable is checked here: the secret and BETTER_AUTH_URL are still read on the first
// sign-in request (server/auth.ts), as before this check existed. It imports only the light
// `@fivvi/auth/allowlist` entry, never the whole sign-in code (packages/auth/README.md, #200).
export async function register(): Promise<void> {
  checkPageViewsConfig(errorReporter);
  // Not in the edge runtime, which cannot load the sign-in code.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { parseSignUpAllowlist } = await import('@fivvi/auth/allowlist');
    parseSignUpAllowlist(process.env.SIGN_UP_ALLOWED_EMAILS);
  }
}
