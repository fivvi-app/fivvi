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

// Runs once when the server starts: a page views key with a missing or wrong POSTHOG_HOST is
// reported here, once, instead of on every request the layout reads it (OBSERVABILITY.md §5).
export function register(): void {
  checkPageViewsConfig(errorReporter);
}
