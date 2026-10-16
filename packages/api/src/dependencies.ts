import type { SystemGreetingView } from '@trainer-hub/database';
import {
  createErrorReporter,
  createProductEvents,
  type ErrorReporter,
  type ProductEvents,
} from '@trainer-hub/observability';

/** What the API needs from the outside world. apps/web wires the real ones; tests pass fakes. */
export interface ApiDependencies {
  /** Resolves when Postgres answers a trivial query; rejects otherwise. */
  pingDatabase(): Promise<void>;
  /** Reads a system greeting by slug from Postgres; `undefined` when the row is missing. */
  findSystemGreeting(slug: string): Promise<SystemGreetingView | undefined>;
  /** Reports unhandled route errors to Sentry (E009). Off without a DSN. */
  errorReporter: ErrorReporter;
  /** Sends product events to PostHog EU (E009); flushed after every request. Off without a key. */
  productEvents: ProductEvents;
}

/**
 * For code that only needs the routes, not a running API: the OpenAPI document and tests of
 * routes without dependencies. The health check reports the database as unavailable, routes
 * that read from it fail, and errors and product events are not sent.
 */
const errorReporter = createErrorReporter({ env: {} });
export const NO_DEPENDENCIES: ApiDependencies = {
  pingDatabase: () => Promise.reject(new Error('No database configured.')),
  findSystemGreeting: () => Promise.reject(new Error('No database configured.')),
  errorReporter,
  productEvents: createProductEvents({ env: {}, errorReporter }),
};
