import type {
  RateLimitRule,
  SignedInAccount,
  SystemGreetingView,
  TenantScopes,
} from '@fivvi/database';
import type { SignUpAllowlist } from '@fivvi/domain';
import type { DemoRequestMail } from '@fivvi/email/demo-request-mail';
import type { PrivateSessionMail } from '@fivvi/email/private-session-mail';
import type { TrainerInvitationMail } from '@fivvi/email/trainer-invitation-mail';
import type { Locale } from '@fivvi/i18n';
import {
  createErrorReporter,
  createProductEvents,
  type ErrorReporter,
  type ProductEvents,
} from '@fivvi/observability';
import { type AddressLookup, createFakeAddressLookup } from './address-lookup/index.ts';
import type { PublicRequestGuardDependencies } from './public-request-guard.ts';

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
  /**
   * An app's request for a sign-in email (spec #168): the web's request, with its verification,
   * email, allowlist and rate limits. The same outcome for every address. `headers` are the
   * request's, for the client IP and language.
   */
  requestSignIn(input: { email: string; locale: Locale; headers: Headers }): Promise<void>;
  /** Exchanges the emailed code for a bearer token; `undefined` for every failure. */
  exchangeSignInCode(input: {
    email: string;
    code: string;
    headers: Headers;
  }): Promise<string | undefined>;
  /**
   * Asks for the code that confirms a new email address of the signed-in account (F005, spec
   * #610): `@fivvi/auth`'s `requestEmailChange`. The same outcome for every address, over a rate
   * limit or not; the email follows after the answer. `newEmail` is trimmed and lower case.
   */
  requestEmailChange(input: {
    accountId: string;
    newEmail: string;
    headers: Headers;
  }): Promise<void>;
  /**
   * Confirms that code and changes the account's address; `undefined` for every failure.
   * `@fivvi/auth`'s `confirmEmailChange`.
   */
  confirmEmailChange(input: {
    accountId: string;
    code: string;
    headers: Headers;
  }): Promise<{ email: string } | undefined>;
  /** Ends the sign-in session of the request's bearer token; `false` without a valid one. */
  signOutBearer(headers: Headers): Promise<boolean>;
  /**
   * Who may sign up (`SIGN_UP_ALLOWED_EMAILS`, F001): the rule for who may create a workspace
   * builds on it (F002). apps/web passes the one `@fivvi/auth` parsed, so the two never read the
   * variable twice.
   */
  signUpAllowlist: SignUpAllowlist;
  /**
   * Opens the request transaction with its tenant scope (E011): the only way a route reaches
   * business data. apps/web wires it over the app's database connection.
   */
  tenantScopes: TenantScopes;
  /**
   * Counts one request under `key` in the rate limits (Postgres, outside the request's
   * transaction, so a refused request still counts) and says whether it is within `rule`.
   * apps/web wires `consumeRateLimit` of `@fivvi/database` over the app's connection.
   */
  consumeRateLimit(key: string, rule: RateLimitRule): Promise<{ allowed: boolean }>;
  /**
   * The rate-limit key of the request's client IP address (public routes, F064): a keyed hash of
   * the address with IPv6 grouped by /64, as sign-in counts it, so the counter table never holds
   * an address; `null` when there is no usable address and no proxy is in front (local, tests):
   * no per-address limit. apps/web wires `clientAddressKey` of `@fivvi/auth`.
   */
  clientAddressKey(headers: Headers): string | null;
  /**
   * Deletes the rate-limit counters whose window has ended. A public route calls it after it
   * counts, as sign-in does (`deleteExpiredRateLimits` of `@fivvi/database`).
   */
  deleteExpiredRateLimits(): Promise<void>;
  /**
   * The bot check of the public forms (E013): asks Cloudflare whether a Turnstile token is good,
   * with the client IP address of the request; `no_answer` when Cloudflare does not answer in 3
   * seconds. apps/web wires `createTurnstileVerifier` of `@fivvi/auth`. Routes call it through
   * `createPublicRequestGuard`, not directly.
   */
  verifyTurnstile: PublicRequestGuardDependencies['verifyTurnstile'];
  /**
   * The counters of the public request guard (E013): join requests per IP address and per account,
   * booking churn per account, in the rate-limit table under keyed hashes. apps/web wires
   * `createPublicRequestLimits` of `@fivvi/auth`.
   */
  publicRequestLimits: PublicRequestGuardDependencies['publicRequestLimits'];
  /**
   * The address lookup by postcode and house number (F015, spec #424): PDOK in production, an
   * in-memory fake elsewhere (`createAddressLookup`, from `ADDRESS_LOOKUP`).
   */
  addressLookup: AddressLookup;
  /**
   * Emails EM-09 to the person invited (F011): the template, the sending and the link are the
   * email package's (`createTrainerInvitationSender`, wired by apps/web); the route decides who,
   * in which language and with which token. A failed send throws, and the request fails with
   * nothing stored.
   */
  sendTrainerInvitation(mail: TrainerInvitationMail): Promise<void>;
  /**
   * Emails EM-11 to the client of a private session (F020): the template and the sending are the
   * email package's (`createPrivateSessionSender`, wired by apps/web); the route decides whether,
   * to whom, in which language and with which key. It runs after the request's transaction has
   * committed; a failed send is reported and does not fail the request (the session is stored).
   */
  sendPrivateSession(mail: PrivateSessionMail): Promise<void>;
  /**
   * Emails a demo request of the public website to Fivvi's support address (F064): the template,
   * the sending and the address are the email package's (`createDemoRequestSender`, wired by
   * apps/web). A failed send throws; the route answers 503 and stores nothing.
   */
  sendDemoRequest(mail: DemoRequestMail): Promise<void>;
  /**
   * The address the app is served at, without a trailing slash (`https://fivvi.app`): what a link
   * to a page of the app starts with, today the join link `/j/{code}` (F029). apps/web passes the
   * base URL it is configured with (`BETTER_AUTH_URL`, ENVIRONMENTS.md), as the emailed links use.
   */
  appBaseUrl(): string;
  /** Where "now" comes from: the expiry and the daily limit of an invitation (F011), the past of a session (F020). Tests pass a manual clock. */
  clock: { now(): Date };
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
  // Sign-up is closed: nobody may create a workspace.
  signUpAllowlist: { allows: () => false },
  requestSignIn: () => Promise.resolve(),
  exchangeSignInCode: () => Promise.resolve(undefined),
  signOutBearer: () => Promise.resolve(false),
  requestEmailChange: () => Promise.resolve(),
  confirmEmailChange: () => Promise.resolve(undefined),
  // Nothing is sent.
  sendTrainerInvitation: () => Promise.reject(new Error('No email configured.')),
  sendPrivateSession: () => Promise.reject(new Error('No email configured.')),
  sendDemoRequest: () => Promise.reject(new Error('No email configured.')),
  clock: { now: () => new Date() },
  appBaseUrl: () => 'https://fivvi.app',
  tenantScopes: {
    inAccountScope: () => Promise.reject(new Error('No database configured.')),
    inWorkspaceScope: () => Promise.reject(new Error('No database configured.')),
    inInvitationScope: () => Promise.reject(new Error('No database configured.')),
  },
  consumeRateLimit: () => Promise.reject(new Error('No database configured.')),
  // No address is told apart, and there are no counters to clear.
  clientAddressKey: () => null,
  deleteExpiredRateLimits: () => Promise.resolve(),
  verifyTurnstile: () => Promise.reject(new Error('No Turnstile configured.')),
  publicRequestLimits: {
    joinRequestFromIp: () => Promise.reject(new Error('No database configured.')),
    joinRequestFromAccount: () => Promise.reject(new Error('No database configured.')),
    bookingAction: () => Promise.reject(new Error('No database configured.')),
  },
  // The fake: no test or document build reaches PDOK.
  addressLookup: createFakeAddressLookup(),
  errorReporter,
  productEvents: createProductEvents({ env: {}, errorReporter }),
};
