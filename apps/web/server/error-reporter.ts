import { createErrorReporter } from '@fivvi/observability';

/**
 * The one error reporter of the web server's request handling (the API and sign-in), so they
 * share a single Sentry client. Reports to Sentry when SENTRY_DSN is set (E009).
 */
export const errorReporter = createErrorReporter();
