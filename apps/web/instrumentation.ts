import { createErrorReporter, createRequestErrorHandler } from '@trainer-hub/observability';
import type { Instrumentation } from 'next';

// Reports errors thrown while rendering a page (server components, server actions) to Sentry
// when SENTRY_DSN is set (E009, docs/engineering/OBSERVABILITY.md). API errors are reported by
// the API itself (app/api/[[...route]]/route.ts).
export const onRequestError: Instrumentation.onRequestError = createRequestErrorHandler(
  createErrorReporter(),
);
