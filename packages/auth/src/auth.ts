import type { Database } from '@fivvi/database';
import { authIdentities, authSessions, authUsers, authVerifications } from '@fivvi/database';
import type { SendEmail } from '@fivvi/email';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { clientIpOptions, defaultRequireClientIp, signInRateLimits } from './rate-limit.ts';
import { type Clock, REQUEST_PATH, signInWithCode, systemClock } from './sign-in-plugin.ts';

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
}

/**
 * What the rest of the code base uses of Better Auth. Only this package imports it
 * (ADR-007), so a different library, or Better Auth's own API, never leaks out.
 */
export interface Auth {
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
      // First, so the limits hold before the endpoint does anything (AC10).
      signInRateLimits({ db, secret, clock, log, requireClientIp }),
      signInWithCode({ db, secret, sendEmail, clock }),
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
  return { handler: (request) => auth.handler(request) };
}
