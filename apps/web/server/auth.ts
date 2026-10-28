import { type Auth, createAuth, parseSignUpAllowlist, type SignUpAllowlist } from '@fivvi/auth';
import { createEnvironmentSendEmail } from '@fivvi/email';
import { database } from './database';
import { errorReporter } from './error-reporter';
import { productEvents } from './product-events';

export interface AuthConfig {
  secret: string;
  baseURL: string;
  /** Addresses that may create an account at their first sign-in (`SIGN_UP_ALLOWED_EMAILS`). */
  signUpAllowlist: SignUpAllowlist;
}

const MIN_SECRET_LENGTH = 32;
const LOCAL_BASE_URL = 'http://localhost:3000';

/**
 * Reads `BETTER_AUTH_SECRET` (a secret per environment), `BETTER_AUTH_URL` (the public
 * address of this environment, which the links in sign-in emails point at) and
 * `SIGN_UP_ALLOWED_EMAILS` (who may sign up; nobody when empty); ENVIRONMENTS.md §7.
 * Errors never include the secret or an address. Only local development may leave the address out.
 */
export function readAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set (ENVIRONMENTS.md §7).');
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  const signUpAllowlist = parseSignUpAllowlist(env.SIGN_UP_ALLOWED_EMAILS);
  const url = env.BETTER_AUTH_URL?.trim();
  if (!url) {
    if (env.NODE_ENV === 'production') {
      throw new Error('BETTER_AUTH_URL is not set (ENVIRONMENTS.md §7).');
    }
    return { secret, baseURL: LOCAL_BASE_URL, signUpAllowlist };
  }
  if (!URL.canParse(url)) throw new Error('BETTER_AUTH_URL is not a URL.');
  return { secret, baseURL: url.replace(/\/+$/, ''), signUpAllowlist };
}

let allowlist: SignUpAllowlist | undefined;

/**
 * The sign-up allowlist of this process (`SIGN_UP_ALLOWED_EMAILS`), as sign-in parsed it: the API
 * builds the rule "who may create a workspace" (F002) on it, so the variable is read by one parser.
 * Created on first use, like `auth()`, so `next build` runs without the environment.
 */
export function signUpAllowlist(): SignUpAllowlist {
  allowlist ??= readAuthConfig(process.env).signUpAllowlist;
  return allowlist;
}

let instance: Auth | undefined;

/**
 * Sign-in for this process, created on first use, so `next build` runs without a database or a
 * secret. Sends sign-in emails through Brevo, or to the log for `@example.com` outside
 * production (packages/email).
 */
export function auth(): Auth {
  instance ??= createAuth({
    db: database(),
    ...readAuthConfig(process.env),
    sendEmail: createEnvironmentSendEmail(),
    // Failures of the work after a sign-in request's answer (a failed email) go to the shared
    // reporter (Sentry when SENTRY_DSN is set, E009), whose scrubber masks email addresses in
    // error messages and drops query strings from request and breadcrumb URLs.
    reportError: (error) => errorReporter.captureError(error),
    // sign_in_requested and signed_in, without personal data (OBSERVABILITY.md §4.3).
    productEvents,
  });
  return instance;
}
