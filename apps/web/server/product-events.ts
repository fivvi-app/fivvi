import { createProductEvents } from '@fivvi/observability';
import { errorReporter } from './error-reporter';

/**
 * The one product event sender of the web server, shared by the API and sign-in so they use a
 * single PostHog client. Sends to PostHog when POSTHOG_KEY is set (E009).
 */
export const productEvents = createProductEvents({ errorReporter });
