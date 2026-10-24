import type { SystemGreetingView } from '@fivvi/database';
import type { Locale } from '@fivvi/i18n';
import {
  createErrorReporter,
  createProductEvents,
  type ErrorReporter,
  type ProductEvents,
} from '@fivvi/observability';

/** The account behind a request's sign-in session (spec #128). */
export interface SignedInAccount {
  id: string;
  email: string;
  /** The language stored on the account (ADR-019); `null` until one is stored. */
  preferredLocale: Locale | null;
}

/** What the API needs from the outside world. apps/web wires the real ones; tests pass fakes. */
export interface ApiDependencies {
  /** Resolves when Postgres answers a trivial query; rejects otherwise. */
  pingDatabase(): Promise<void>;
  /** Reads a system greeting by slug from Postgres; `undefined` when the row is missing. */
  findSystemGreeting(slug: string): Promise<SystemGreetingView | undefined>;
  /**
   * The account of the sign-in session in the request's cookie; `undefined` when the request is
   * anonymous or the session is unknown or expired (F001). apps/web wires `@fivvi/auth`.
   */
  findSignedInAccount(headers: Headers): Promise<SignedInAccount | undefined>;
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
  // Nobody is signed in.
  findSignedInAccount: () => Promise.resolve(undefined),
  errorReporter,
  productEvents: createProductEvents({ env: {}, errorReporter }),
};
