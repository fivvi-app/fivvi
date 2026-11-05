import { createApiHandler } from '@fivvi/api';
import { createTenantScopes, findSystemGreeting, pingDatabase } from '@fivvi/database';
import {
  createEnvironmentSendEmail,
  createPrivateSessionSender,
  createTrainerInvitationSender,
} from '@fivvi/email';
import { inProcessApiClient } from './api-client';
import { auth, readAuthConfig, signUpAllowlist } from './auth';
import { database } from './database';
import { errorReporter } from './error-reporter';
import { productEvents } from './product-events';

// packages/api with the real dependencies. Routes, validation and the contract live in
// packages/api; this file only wires in the database and observability.
// Unhandled route errors go to the shared error reporter (Sentry when SENTRY_DSN is set, E009).

let invitationSender: ReturnType<typeof createTrainerInvitationSender> | undefined;

/**
 * EM-09, the trainer invitation (F011): sent through the provider of the environment (Lettermint,
 * Brevo, or the log for `@example.com` outside production), linking to the invitation page of
 * this app. Created on first use, so `next build` runs without the email settings.
 */
function sendTrainerInvitation(
  ...[mail]: Parameters<ReturnType<typeof createTrainerInvitationSender>>
) {
  invitationSender ??= createTrainerInvitationSender({
    sendEmail: createEnvironmentSendEmail(),
    appBaseUrl: () => readAuthConfig(process.env).baseURL,
  });
  return invitationSender(mail);
}

let privateSessionSender: ReturnType<typeof createPrivateSessionSender> | undefined;

/**
 * EM-11, the confirmation of a private session (F020): sent through the provider of the environment
 * (Lettermint, Brevo, or the log for `@example.com` outside production). Created on first use, so
 * `next build` runs without the email settings.
 */
function sendPrivateSession(...[mail]: Parameters<ReturnType<typeof createPrivateSessionSender>>) {
  privateSessionSender ??= createPrivateSessionSender({ sendEmail: createEnvironmentSendEmail() });
  return privateSessionSender(mail);
}

/** The API, served under `/api` by app/api/[[...route]]/route.ts. */
export const apiHandler = createApiHandler({
  pingDatabase: () => pingDatabase(database()),
  findSystemGreeting: (slug) => findSystemGreeting(database(), slug),
  // The account of the sign-in session cookie or bearer token (F001).
  findSignedInAccount: (headers) => auth().findAccount(headers),
  // The native apps' sign-in routes, over the same sign-in as the web (spec #168).
  requestSignIn: (input) => auth().requestSignIn(input),
  exchangeSignInCode: (input) => auth().exchangeSignInCode(input),
  signOutBearer: (headers) => auth().signOutBearer(headers),
  // Who may create a workspace builds on who may sign up (F002): the allowlist sign-in parsed.
  signUpAllowlist: { allows: (email) => signUpAllowlist().allows(email) },
  // Emails the trainer invitation (F011).
  sendTrainerInvitation,
  // Emails the confirmation of a private session (F020), after the session is committed.
  sendPrivateSession,
  // Where "now" comes from: the expiry and the daily limit of an invitation (F011), the past of a session (F020).
  clock: { now: () => new Date() },
  // The request transaction of workspace and account routes, with its tenant context (E011).
  tenantScopes: createTenantScopes(database),
  errorReporter,
  // Sends product events to PostHog, at POSTHOG_HOST, when POSTHOG_KEY is set (E009).
  productEvents,
});

/** The generated client for server components, calling `apiHandler` in this process (#94). */
export const apiClient = inProcessApiClient(apiHandler);
