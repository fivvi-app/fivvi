import { createApiHandler } from '@fivvi/api';
import { findSystemGreeting, pingDatabase } from '@fivvi/database';
import { createProductEvents } from '@fivvi/observability';
import { inProcessApiClient } from './api-client';
import { auth } from './auth';
import { database } from './database';
import { errorReporter } from './error-reporter';

// packages/api with the real dependencies. Routes, validation and the contract live in
// packages/api; this file only wires in the database and observability.
// Unhandled route errors go to the shared error reporter (Sentry when SENTRY_DSN is set, E009).

/** The API, served under `/api` by app/api/[[...route]]/route.ts. */
export const apiHandler = createApiHandler({
  pingDatabase: () => pingDatabase(database()),
  findSystemGreeting: (slug) => findSystemGreeting(database(), slug),
  // The account of the sign-in session cookie (F001).
  findSignedInAccount: (headers) => auth().findAccount(headers),
  errorReporter,
  // Sends product events to PostHog, at POSTHOG_HOST, when POSTHOG_KEY is set (E009).
  productEvents: createProductEvents({ errorReporter }),
});

/** The generated client for server components, calling `apiHandler` in this process (#94). */
export const apiClient = inProcessApiClient(apiHandler);
