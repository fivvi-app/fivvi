import type { Database, SignedInAccount } from '@fivvi/database';
import { authIdentities, authSessions, authUsers, authVerifications } from '@fivvi/database';
import { EmailSendError, type SendEmail } from '@fivvi/email';
import { isLocale, type Locale } from '@fivvi/i18n';
import type { ProductEvents } from '@fivvi/observability';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { bearer } from 'better-auth/plugins';
import { closedSignUp, type SignUpAllowlist } from './allowlist.ts';
import { AUTH_TOKEN_HEADER, bearerOnly, withoutAuthorization, withoutAuthToken } from './bearer.ts';
import {
  CLIENT_IP_HEADER,
  clientIpOptions,
  defaultRequireClientIp,
  signInRateLimits,
  signInTokenRateLimit,
} from './rate-limit.ts';
import { type Clock, REQUEST_PATH, signInWithEmail, systemClock } from './sign-in-plugin.ts';

const DAY_SECONDS = 24 * 60 * 60;

export interface CreateAuthOptions {
  db: Database;
  /** `BETTER_AUTH_SECRET`. A secret per environment; at least 32 characters. */
  secret: string;
  /** The public address of the app, e.g. `https://fivvi.app`. Links in emails point to it. */
  baseURL: string;
  sendEmail: SendEmail;
  /** Where "now" comes from; the system clock when left out. Tests pass a manual one. */
  clock?: Clock;
  /**
   * Gets one line for every rate-limited sign-in request (AC10), without the email address or
   * the IP address. The server log (`console.warn`) when left out.
   */
  log?: (line: string) => void;
  /**
   * Whether a proxy always sets the client IP header, so a sign-in request without a usable one
   * counts against one shared IP limit (AC10). When left out: `defaultRequireClientIp()`
   * (`ENVIRONMENTS.md §7`).
   */
  requireClientIp?: boolean;
  /**
   * Who may create an account by signing in for the first time: `parseSignUpAllowlist` of
   * `SIGN_UP_ALLOWED_EMAILS`. Nobody when left out, so sign-up stays closed.
   */
  signUpAllowlist?: SignUpAllowlist;
  /**
   * Receives the failure of the work that follows a sign-in request's answer (a failed email, a
   * database error), e.g. for Sentry. Called in addition to a safe log line. It must not put the
   * address, a code or a link anywhere.
   */
  reportError?: (error: unknown) => void;
  /**
   * Holds that work, which runs after the answer so that the answer's timing is the same for
   * every address (AC8). It never rejects. Left out, it simply runs on in this process, which
   * is what a long-running Node server wants; tests pass a function that keeps the promise.
   */
  runInBackground?: (task: Promise<void>) => void;
  /**
   * Records the product events `sign_in_requested` and `signed_in` (OBSERVABILITY.md §4.3). The
   * handler flushes them before it returns. Without it, nothing is recorded.
   */
  productEvents?: ProductEvents;
}

/** What `Auth.readSession` found in a request. */
export interface SessionRead {
  account: SignedInAccount | undefined;
  /** `Set-Cookie` header values for the response: the renewed sign-in session cookie. */
  setCookies: string[];
}

/**
 * What the rest of the code base uses of Better Auth. Only this package imports it
 * (ADR-007), so a different library, or Better Auth's own API, never leaks out.
 */
export interface Auth {
  /**
   * The account of the sign-in session in the request's cookie, or `undefined` for an
   * anonymous request, an unknown or expired session. A request with an `Authorization` header
   * is a bearer request: only its token counts, never a cookie next to it (spec #168).
   */
  findAccount(headers: Headers): Promise<SignedInAccount | undefined>;
  /**
   * The sign-in request of an app (spec #168): the same request as the web's, with the same
   * verification, email, allowlist and rate limits. It answers the same for every address, and
   * the email follows after the answer.
   */
  requestSignIn(input: { email: string; locale: Locale; headers: Headers }): Promise<void>;
  /**
   * Exchanges the emailed code for a bearer token: a sign-in session of the account, which the
   * web's cookie would hold too. `undefined` for every failure (wrong, used, replaced, expired
   * or killed code, or a client IP over its limit), so nothing tells which. It sets no cookie.
   */
  exchangeSignInCode(input: {
    email: string;
    code: string;
    headers: Headers;
  }): Promise<string | undefined>;
  /**
   * Ends the sign-in session of the bearer token in the request, and only that one. `false`
   * when there is no valid bearer token.
   */
  signOutBearer(headers: Headers): Promise<boolean>;
  /**
   * Like `findAccount`, and also the `Set-Cookie` headers the answer must pass on to the browser.
   * Using a sign-in session renews it, at most once a day (AC12): the stored expiry moves forward
   * and the browser gets a new 30-day cookie, which only the response to the browser can carry,
   * so the route guard (apps/web `proxy.ts`) calls this. Only cookies count here, never an
   * `Authorization` header. An expired or unknown session comes
   * with the header that clears its cookie.
   */
  readSession(headers: Headers): Promise<SessionRead>;
  /** Serves Better Auth's endpoints under `/api/auth/*` (mounted by apps/web). */
  handler(request: Request): Promise<Response>;
}

/**
 * Better Auth on our Postgres tables (`auth_users`, `auth_sessions`, `auth_identities`,
 * `auth_verifications`), with sign-in by one emailed link and code (F001, ADR-007). Sign-up
 * is closed and there are no passwords.
 */
export function createAuth({
  db,
  secret,
  baseURL,
  sendEmail,
  clock = systemClock,
  log = (line) => console.warn(line),
  requireClientIp = defaultRequireClientIp(),
  signUpAllowlist = closedSignUp,
  reportError,
  runInBackground = () => {},
  productEvents,
}: CreateAuthOptions): Auth {
  const auth = betterAuth({
    appName: 'Fivvi',
    baseURL,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      // Our table names for Better Auth's models (spec #128, Implementation Decisions).
      schema: {
        user: authUsers,
        session: authSessions,
        account: authIdentities,
        verification: authVerifications,
      },
    }),
    plugins: [
      // Lets an app send its sign-in session as `Authorization: Bearer` (spec #168). Only the
      // signed value counts, which the browser's cookie holds too: the raw `session.token` that
      // `get-session` and `list-sessions` show to page script is no credential.
      bearer({ requireSignature: true }),
      // First, so the limits hold before the endpoint does anything (AC10), including the
      // background work that follows its answer.
      signInRateLimits({ db, secret, clock, log, requireClientIp }),
      signInWithEmail({
        db,
        secret,
        sendEmail,
        clock,
        signUpAllowlist,
        runInBackground,
        reportError: (error) => {
          logFailure(error);
          reportError?.(error);
        },
        productEvents,
      }),
    ],
    // Better Auth's own limiter (production only) answers 429 and keeps its counts in memory.
    // The sign-in request has its own limits in Postgres with the neutral answer (rate-limit.ts).
    rateLimit: { customRules: { [REQUEST_PATH]: false } },
    user: {
      additionalFields: {
        // The language of the screen of the first sign-in (ADR-019).
        preferredLocale: { type: 'string', required: false, input: false },
      },
    },
    session: {
      // 30 days after the last use: the expiry moves forward once a day while it is used (AC12).
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    advanced: {
      // The client IP address comes from the header Railway's proxy sets (rate-limit.ts).
      ...clientIpOptions,
      // Postgres generates the uuid primary keys.
      database: {
        generateId: 'uuid',
        // Our tables are migrated with Drizzle (packages/database). Sign-in with a code never
        // writes Better Auth's columns for passwords, OAuth tokens or images, so the tables
        // don't have them, which its start-up check would reject. The API integration tests
        // sign in against the real migrated tables instead.
        validateSchema: false,
      },
      // `Secure` unless the app runs on plain http, i.e. outside local (AC2).
      useSecureCookies: new URL(baseURL).protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    emailAndPassword: { enabled: false },
    // Nothing leaves the process: no usage reports.
    telemetry: { enabled: false },
  });
  const tokenIpLimited = signInTokenRateLimit({ db, secret, clock, log, requireClientIp });
  async function sessionOf(headers: Headers): Promise<SessionRead> {
    const { headers: answer, response } = await auth.api.getSession({
      headers,
      returnHeaders: true,
    });
    const setCookies = answer.getSetCookie();
    if (!response) return { account: undefined, setCookies };
    const { id, email, name, preferredLocale } = response.user;
    return {
      account: {
        id,
        email,
        name,
        preferredLocale: isLocale(preferredLocale) ? preferredLocale : null,
      },
      setCookies,
    };
  }
  return {
    async handler(request) {
      try {
        return withoutAuthToken(await auth.handler(request));
      } finally {
        // Sends what the sign-in recorded; never throws and waits at most a second.
        await productEvents?.flush();
      }
    },
    async requestSignIn({ email, locale, headers }) {
      await auth.api.requestSignInCode({
        body: { email, locale },
        headers: forwardedHeaders(headers),
      });
    },
    async exchangeSignInCode({ email, code, headers }) {
      // The web's per-IP limiter is the HTTP router's, which `auth.api` skips.
      if (await tokenIpLimited(headers)) return undefined;
      try {
        const { headers: answer } = await auth.api.verifySignInCode({
          body: { email, code },
          headers: forwardedHeaders(headers),
          returnHeaders: true,
        });
        // The session cookie of the answer is dropped: the app holds the token.
        return answer.get(AUTH_TOKEN_HEADER) ?? undefined;
      } catch (error) {
        if (error instanceof APIError && error.statusCode === 401) return undefined;
        throw error;
      }
    },
    async signOutBearer(headers) {
      const bearerHeaders = bearerOnly(headers);
      if (!bearerHeaders || !(await auth.api.getSession({ headers: bearerHeaders }))) return false;
      await auth.api.signOut({ headers: bearerHeaders });
      return true;
    },
    // Cookies only: a page request never signs in with a token.
    readSession: (headers) => sessionOf(withoutAuthorization(headers)),
    // A request with an `Authorization` header is judged by its token alone, never a cookie.
    findAccount: async (headers) => (await sessionOf(bearerOnly(headers) ?? headers)).account,
  };
}

/**
 * One log line for a failed sign-in request. The email's own error says only the provider, status
 * and error code (`EmailSendError`); anything else is logged by name alone, because a database
 * error can quote the address.
 */
function logFailure(error: unknown): void {
  const what =
    error instanceof EmailSendError ? error.message : error instanceof Error ? error.name : 'Error';
  console.error(`Sign-in request failed after its answer: ${what}`);
}

/**
 * What an app's sign-in routes pass on to Better Auth: the proxy's client IP address (rate
 * limits, the session's address), the user agent and the language. Nothing else, so a cookie
 * or token in the request can't change what the call does.
 */
function forwardedHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  for (const name of [CLIENT_IP_HEADER, 'user-agent', 'accept-language']) {
    const value = headers.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  return forwarded;
}
