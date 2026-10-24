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
// that variable is checked: the build runs this too, and has no secret.
export async function register(): Promise<void> {
  checkPageViewsConfig(errorReporter);
  // Not in the edge runtime, which cannot load the sign-in code.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkSignUpAllowlist } = await import('./server/auth');
    checkSignUpAllowlist(process.env);
  }
}
