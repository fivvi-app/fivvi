import { createAddressLookup, createApiHandler } from '@fivvi/api';
import {
  clientAddressKey,
  createPublicRequestLimits,
  createTurnstileVerifier,
  defaultRequireClientIp,
  type PublicRequestLimits,
  readTurnstileSecret,
  type TurnstileVerifier,
} from '@fivvi/auth';
import {
  consumeRateLimit,
  createTenantScopes,
  deleteExpiredRateLimits,
  findSystemGreeting,
  pingDatabase,
} from '@fivvi/database';
import {
  createClassCancelledSender,
  createDemoRequestSender,
  createPrivateSessionSender,
  createSubstitutionSender,
  createTrainerChangeSender,
  createTrainerInvitationSender,
} from '@fivvi/email';
import { inProcessApiClient } from './api-client';
import { auth, readAuthConfig, signUpAllowlist } from './auth';
import { database } from './database';
import { demoRequestRecipient } from './demo-request-recipient';
import { errorReporter } from './error-reporter';
import { productEvents } from './product-events';
import { sendEmail } from './send-email';

// packages/api with the real dependencies. Routes, validation and the contract live in
// packages/api; this file only wires in the database and observability.
// Unhandled route errors go to the shared error reporter (Sentry when SENTRY_DSN is set, E009).

let turnstile: TurnstileVerifier | undefined;

/**
 * The bot check of the public forms (E013): Cloudflare's siteverify with `TURNSTILE_SECRET_KEY`
 * (Cloudflare's test keys outside production). Created on first use, so `next build` runs without
 * the variable. A Cloudflare that does not answer is reported to Sentry once a minute at most.
 */
function verifyTurnstile(...[token, headers]: Parameters<TurnstileVerifier['verify']>) {
  turnstile ??= createTurnstileVerifier({
    secret: readTurnstileSecret(process.env),
    reportNoAnswer: (error) => errorReporter.captureError(error, { level: 'warning' }),
    clock: { now: () => new Date() },
  });
  return turnstile.verify(token, headers);
}

let limits: PublicRequestLimits | undefined;

/**
 * The counters of join requests and booking churn (E013), over the rate-limit table. Created on
 * first use, so `next build` runs without a database or a secret.
 */
function publicRequestLimits(): PublicRequestLimits {
  limits ??= createPublicRequestLimits({
    db: database(),
    secret: readAuthConfig(process.env).secret,
    clock: { now: () => new Date() },
    // One line per limited request: the rule, never an address.
    log: (line) => console.warn(line),
    requireClientIp: defaultRequireClientIp(process.env),
  });
  return limits;
}

let invitationSender: ReturnType<typeof createTrainerInvitationSender> | undefined;

/**
 * EM-09, the trainer invitation (F011): sent through the provider of the environment (Lettermint
 * or the log for `@example.com` outside production), linking to the invitation page of
 * this app. Created on first use, so `next build` runs without the email settings.
 */
function sendTrainerInvitation(
  ...[mail]: Parameters<ReturnType<typeof createTrainerInvitationSender>>
) {
  invitationSender ??= createTrainerInvitationSender({
    sendEmail: sendEmail(),
    appBaseUrl: () => readAuthConfig(process.env).baseURL,
  });
  return invitationSender(mail);
}

let privateSessionSender: ReturnType<typeof createPrivateSessionSender> | undefined;

/**
 * EM-11, the confirmation of a private session (F020): sent through the provider of the environment
 * (Lettermint or the log for `@example.com` outside production). Created on first use, so
 * `next build` runs without the email settings.
 */
function sendPrivateSession(...[mail]: Parameters<ReturnType<typeof createPrivateSessionSender>>) {
  privateSessionSender ??= createPrivateSessionSender({ sendEmail: sendEmail() });
  return privateSessionSender(mail);
}

let classCancelledSender: ReturnType<typeof createClassCancelledSender> | undefined;

/**
 * EM-05, the class variant: the notice that a class date is cancelled (F026), sent through the
 * provider of the environment (Lettermint or the log for `@example.com` outside production). Created
 * on first use, so `next build` runs without the email settings.
 */
function sendClassCancelled(...[mail]: Parameters<ReturnType<typeof createClassCancelledSender>>) {
  classCancelledSender ??= createClassCancelledSender({ sendEmail: sendEmail() });
  return classCancelledSender(mail);
}

let trainerChangeSender: ReturnType<typeof createTrainerChangeSender> | undefined;

/**
 * EM-13, the notice of a new trainer (F023): sent through the provider of the environment (Lettermint
 * or the log for `@example.com` outside production). Created on first use, so `next build` runs
 * without the email settings.
 */
function sendTrainerChange(...[mail]: Parameters<ReturnType<typeof createTrainerChangeSender>>) {
  trainerChangeSender ??= createTrainerChangeSender({ sendEmail: sendEmail() });
  return trainerChangeSender(mail);
}

let substitutionSender: ReturnType<typeof createSubstitutionSender> | undefined;

/**
 * EM-10, the notice to the trainer who covers a class date (F024): sent through the provider of the
 * environment (Lettermint or the log for `@example.com` outside production). Created on first use,
 * so `next build` runs without the email settings.
 */
function sendSubstitution(...[mail]: Parameters<ReturnType<typeof createSubstitutionSender>>) {
  substitutionSender ??= createSubstitutionSender({ sendEmail: sendEmail() });
  return substitutionSender(mail);
}

let demoRequestSender: ReturnType<typeof createDemoRequestSender> | undefined;

/**
 * The demo request of the public website (F064), emailed in Dutch to `demoRequestRecipient()`:
 * the support address in production, an `@example.com` address (logged, not sent) elsewhere.
 * Nothing goes to the visitor. Created on first use, so `next build` runs without the email
 * settings. The mailbox is an alias of the owner's Zoho mailbox (Q2).
 */
function sendDemoRequest(...[mail]: Parameters<ReturnType<typeof createDemoRequestSender>>) {
  demoRequestSender ??= createDemoRequestSender({
    sendEmail: sendEmail(),
    to: demoRequestRecipient(),
  });
  return demoRequestSender(mail);
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
  // Changing one's own email address with a code sent to the new one (F005, spec #610).
  requestEmailChange: (input) => auth().requestEmailChange(input),
  confirmEmailChange: (input) => auth().confirmEmailChange(input),
  // Who may create a workspace builds on who may sign up (F002): the allowlist sign-in parsed.
  signUpAllowlist: { allows: (email) => signUpAllowlist().allows(email) },
  // Emails the trainer invitation (F011).
  sendTrainerInvitation,
  // Emails the confirmation of a private session (F020), after the session is committed.
  sendPrivateSession,
  // Emails the notice that a class date is cancelled to its participants (F026), after it is committed.
  sendClassCancelled,
  // Emails the notice of a new trainer to the clients (F023), after the change is committed.
  sendTrainerChange,
  // Emails the notice to the trainer who covers a class date (F024), after the substitution is committed.
  sendSubstitution,
  // Emails the website's demo requests to Fivvi's support address (F064).
  sendDemoRequest,
  // Where "now" comes from: the expiry and the daily limit of an invitation (F011), the past of a session (F020).
  clock: { now: () => new Date() },
  // The address links to the app start with, the one the emailed links use: the join link (F029).
  appBaseUrl: () => readAuthConfig(process.env).baseURL,
  // The request transaction of workspace and account routes, with its tenant context (E011).
  tenantScopes: createTenantScopes(database),
  // Fixed-window counters in Postgres (the sign-in's), outside the request transaction.
  consumeRateLimit: (key, rule) => consumeRateLimit(database(), key, rule, new Date()),
  // The client's IP address as a keyed hash, IPv6 per /64, as sign-in counts it (F064).
  clientAddressKey: (headers) =>
    clientAddressKey(
      readAuthConfig(process.env).secret,
      headers,
      defaultRequireClientIp(process.env),
    ),
  deleteExpiredRateLimits: () => deleteExpiredRateLimits(database(), new Date()),
  // The public request guard (E013): the bot check and the join-request and booking-churn counters.
  verifyTurnstile,
  publicRequestLimits: {
    joinRequestFromIp: (headers) => publicRequestLimits().joinRequestFromIp(headers),
    joinRequestFromAccount: (accountId) => publicRequestLimits().joinRequestFromAccount(accountId),
    bookingAction: (accountId) => publicRequestLimits().bookingAction(accountId),
  },
  // PDOK in the production environment, the in-memory fake elsewhere; ADDRESS_LOOKUP overrides
  // (ENVIRONMENTS.md §7). Created here, once, so its cache lives as long as the process (F015).
  addressLookup: createAddressLookup(process.env),
  errorReporter,
  // Sends product events to PostHog, at POSTHOG_HOST, when POSTHOG_KEY is set (E009).
  productEvents,
});

/** The generated client for server components, calling `apiHandler` in this process (#94). */
export const apiClient = inProcessApiClient(apiHandler);
