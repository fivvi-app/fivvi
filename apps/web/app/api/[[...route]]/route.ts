import { createApiHandler } from '@trainer-hub/api';
import { pingDatabase } from '@trainer-hub/database';
import { createErrorReporter } from '@trainer-hub/observability';
import { database } from '../../../server/database';

// Serves packages/api under /api. Routes, validation and the contract live in packages/api;
// this file only wires in the real dependencies. Next.js answers HEAD and OPTIONS itself.
const handler = createApiHandler({
  pingDatabase: () => pingDatabase(database()),
  // Reports unhandled route errors to Sentry when SENTRY_DSN is set (E009).
  errorReporter: createErrorReporter(),
});

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
