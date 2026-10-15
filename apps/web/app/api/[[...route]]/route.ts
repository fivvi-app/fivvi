import { createApiHandler } from '@trainer-hub/api';
import { pingDatabase } from '@trainer-hub/database';
import { createErrorReporter, createProductEvents } from '@trainer-hub/observability';
import { database } from '../../../server/database';

// Serves packages/api under /api. Routes, validation and the contract live in packages/api;
// this file only wires in the real dependencies. Next.js answers HEAD and OPTIONS itself.
// Reports unhandled route errors to Sentry when SENTRY_DSN is set (E009).
const errorReporter = createErrorReporter();
const handler = createApiHandler({
  pingDatabase: () => pingDatabase(database()),
  errorReporter,
  // Sends product events to PostHog EU when POSTHOG_KEY is set (E009).
  productEvents: createProductEvents({ errorReporter }),
});

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
