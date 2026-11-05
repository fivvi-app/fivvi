import type { SignedInAccount, SystemGreetingView, TenantScopes } from '@fivvi/database';
import type { SignUpAllowlist } from '@fivvi/domain';
import type { PrivateSessionMail } from '@fivvi/email/private-session-mail';
import type { TrainerInvitationMail } from '@fivvi/email/trainer-invitation-mail';
import type { Locale } from '@fivvi/i18n';
import {
  createErrorReporter,
  createProductEvents,
  type ErrorReporter,
  type ProductEvents,
} from '@fivvi/observability';

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
  // Nothing is sent.
  sendTrainerInvitation: () => Promise.reject(new Error('No email configured.')),
  sendPrivateSession: () => Promise.reject(new Error('No email configured.')),
  clock: { now: () => new Date() },
  tenantScopes: {
    inAccountScope: () => Promise.reject(new Error('No database configured.')),
    inWorkspaceScope: () => Promise.reject(new Error('No database configured.')),
  },
  errorReporter,
  productEvents: createProductEvents({ env: {}, errorReporter }),
};
