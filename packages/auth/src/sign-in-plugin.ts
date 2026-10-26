import { randomBytes, randomInt } from 'node:crypto';
import { type Database, recordWrongSignInCode } from '@fivvi/database';
import { type SendEmail, signInEmail } from '@fivvi/email';
import { isLocale, parseAcceptLanguage, resolveSignInCommunicationLanguage } from '@fivvi/i18n';
import { anonymousDistinctId, type ProductEvents } from '@fivvi/observability';
import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { SignUpAllowlist } from './allowlist.ts';
import { hashesEqual, hashSecretValue } from './hash.ts';
import { maskEmail } from './mask-email.ts';
import { MAX_RETURN_PATH_LENGTH, RETURN_PATH_PARAM, safeReturnPath } from './return-path.ts';

/** How long the emailed code and link work (AC5). */
export const SIGN_IN_EXPIRES_IN_MINUTES = 15;

/** The wrong codes after which a verification is dead, the right code included (AC6). */
export const MAX_WRONG_CODES = 5;

/** Twice the longest path `safeReturnPath` keeps: longer than `MAX_RETURN_PATH_LENGTH` and up to this: dropped; longer: 400. */
const MAX_RETURN_TO_LENGTH = 2 * MAX_RETURN_PATH_LENGTH;

/** The sign-in page's confirm step (TW-10), which the emailed link opens: a page, not an endpoint. */
const CONFIRM_PAGE_PATH = '/login/confirm';

/** The shape of the injected clock; `@fivvi/testing/clock` builds fixed and manual ones. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface SignInWithEmailOptions {
  /** Counts wrong codes in one atomic statement, which Better Auth's adapter has no call for. */
  db: Database;
  /** `BETTER_AUTH_SECRET`: the key of the hashes. */
  secret: string;
  sendEmail: SendEmail;
  /** Where "now" comes from: it sets and checks the expiry of a code. */
  clock: Clock;
  /** Addresses without an account that may create one by signing in (`PRODUCT.md §27`). */
  signUpAllowlist: SignUpAllowlist;
  /**
   * Holds the work that follows a sign-in request's answer (see `requestSignInCode`). The task
   * never rejects. Tests keep the promise to wait for the email.
   */
  runInBackground: (task: Promise<void>) => void;
  /**
   * Gets the failures of that work. Never put the address, code or link in what is logged. If it
   * throws, that is swallowed: the task handed to `runInBackground` never rejects.
   */
  reportError: (error: unknown) => void;
  /**
   * Records `sign_in_requested` and `signed_in` (OBSERVABILITY.md §4.3), without the address, the
   * code, the link, the IP address or, before sign-in, any account ID. Nothing when left out.
   */
  productEvents?: ProductEvents;
}

const PLUGIN_ID = 'sign-in-with-email';

/** The path (under `/api/auth`) of the request endpoint, which the rate limits guard. */
export const REQUEST_PATH = '/sign-in/code/request';

const IDENTIFIER_PREFIX = 'sign-in:';

/** `sign-in:<email>`: one verification per address, so a new request replaces the old one. */
const identifierFor = (email: string) => `${IDENTIFIER_PREFIX}${email}`;

/** The endpoints (under `/api/auth`) of the confirm step: what the link is for, and the button. */
const LINK_PREVIEW_ENDPOINT = '/sign-in/link/preview';
const LINK_CONFIRM_ENDPOINT = '/sign-in/link/confirm';

/** A link token is 32 random bytes in base64url (43 characters); anything longer is no token. */
const MAX_TOKEN_LENGTH = 512;

/** The address from a verification's identifier, or `undefined` if it is not one of ours. */
const emailOf = (identifier: string) =>
  identifier.startsWith(IDENTIFIER_PREFIX) ? identifier.slice(IDENTIFIER_PREFIX.length) : undefined;

/**
 * The row of `auth_verifications` as the plugin reads it: Better Auth's types lack the plugin's
 * own columns, which are optional here because they are read from untyped storage.
 */
type Verification = NonNullable<
  Awaited<ReturnType<GenericEndpointContext['context']['internalAdapter']['findVerificationValue']>>
> & { codeHash?: unknown; locale?: unknown; failedAttempts?: unknown };

/** One answer for a wrong, expired, used or never issued code: no message says which. */
const rejectedCode = () =>
  new APIError('UNAUTHORIZED', {
    code: 'INVALID_OR_EXPIRED_CODE',
    message: 'The code is incorrect or has expired.',
  });

/** The same for a link: expired, used, replaced or killed by wrong codes, nothing says which. */
const rejectedLink = () =>
  new APIError('UNAUTHORIZED', {
    code: 'INVALID_OR_EXPIRED_LINK',
    message: 'The link no longer works.',
  });

/** The address as every sign-in rule sees it: trimmed, lower case, a valid email. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** The same answer for every outcome of a request, so nobody can tell who has an account. */
export const REQUESTED = { status: true } as const;

/**
 * Sign in with one emailed verification that holds both a link token and a 6-digit code
 * (ADR-007, F001). Better Auth's magic-link and email-OTP plugins each send their own email
 * with their own token; here one request creates one `auth_verifications` row whose link
 * token and code are stored only as keyed hashes, and using either consumes it.
 *
 * - `POST /sign-in/code/request` `{ email, locale?, returnTo? }`: an existing account, or an
 *   address on the sign-up allowlist, gets one EM-08 email: in the account's stored language, else
 *   in the page's (ADR-019). Every other address gets the same answer and no email. A `returnTo`
 *   that is a path of this site (`safeReturnPath`) goes on the link, so the link ends on that
 *   page (#207); anything else is dropped.
 * - `POST /sign-in/code/verify` `{ email, code }`: the right code signs this browser in. For an
 *   allowlisted address without an account, the account is created first.
 * - `POST /sign-in/link/preview` `{ token }` (consumes nothing) and `POST /sign-in/link/confirm`
 *   `{ token }` (the same rules and consume as the code): the confirm step of the emailed link.
 */
export function signInWithEmail({
  db,
  secret,
  sendEmail,
  clock,
  signUpAllowlist,
  runInBackground,
  reportError,
  productEvents,
}: SignInWithEmailOptions) {
  /**
   * The newest verification of `identifier` if it can still be used: not expired by the injected
   * clock and under the wrong-code limit. There is no unique index on the identifier (a request
   * replaces by delete and insert), so two parallel requests can leave two rows: the newest one
   * is the verification, for the code and for the link.
   */
  async function findLiveVerification(
    ctx: GenericEndpointContext,
    identifier: string,
  ): Promise<Verification | null> {
    const verification: Verification | null =
      await ctx.context.internalAdapter.findVerificationValue(identifier);
    if (!verification) return null;
    if (verification.expiresAt.getTime() <= clock.now().getTime()) return null;
    const { failedAttempts } = verification;
    if (typeof failedAttempts === 'number' && failedAttempts >= MAX_WRONG_CODES) return null;
    return verification;
  }

  /** The live verification a link token belongs to, found by the hash of the token, with its address. */
  async function findLinkVerification(ctx: GenericEndpointContext, token: string) {
    const row = await ctx.context.adapter.findOne<{ id: string; identifier: string }>({
      model: 'verification',
      where: [{ field: 'value', value: hashSecretValue(secret, 'link-token', token) }],
    });
    const email = row ? emailOf(row.identifier) : undefined;
    if (!row || !email) return null;
    // A replaced link is not the newest verification of its address any more.
    const verification = await findLiveVerification(ctx, row.identifier);
    return verification?.id === row.id ? { verification, email } : null;
  }

  /**
   * Uses up the checked verification and signs this browser in, for the code and the link alike.
   * `rejected` is the answer when it was already used or can not create the account.
   */
  async function signInWithVerification(
    ctx: GenericEndpointContext,
    verification: Verification,
    email: string,
    method: 'code' | 'link',
    rejected: () => APIError,
  ) {
    // Single use: the first caller to consume it wins, also against a parallel request.
    // It consumes the row that was checked, not "the verification of this address": a new
    // request that landed in between has replaced it, and the old code or link must not use that
    // one up. (Better Auth's own consume works by identifier and by the real clock.)
    // This is the raw adapter, so it bypasses Better Auth's verification hooks, its consume
    // lock and secondary storage. That is fine here: the plugin configures none of them
    // and a single atomic `DELETE ... RETURNING` on the primary key is what makes the code
    // single use. If `databaseHooks` or `secondaryStorage` are ever added for
    // verifications, this path has to be wired in by hand.
    const consumed = await ctx.context.adapter.consumeOne({
      model: 'verification',
      // Also not past the limit: the 5th wrong code may still be on its way to delete it.
      where: [
        { field: 'id', value: verification.id },
        { field: 'failedAttempts', operator: 'lt', value: MAX_WRONG_CODES },
      ],
    });
    if (!consumed) throw rejected();

    // Holding the code or the link proves the address. The first sign-in of an allowed address
    // creates its account (sign-up is closed otherwise) with the language of the page that asked
    // for the email (ADR-019); every later one signs in to the same account.
    const found = await ctx.context.internalAdapter.findUserByEmail(email);
    let user: NonNullable<typeof found>['user'];
    let newAccount = false;
    if (found) {
      user = found.user.emailVerified
        ? found.user
        : ((await ctx.context.internalAdapter.updateUser(found.user.id, {
            emailVerified: true,
          })) ?? found.user);
    } else if (signUpAllowlist.allows(email)) {
      newAccount = true;
      const { locale } = verification;
      user = await ctx.context.internalAdapter.createUser(
        {
          email,
          name: '',
          emailVerified: true,
          preferredLocale: isLocale(locale) ? locale : null,
        },
        { method: PLUGIN_ID },
      );
    } else {
      throw rejected();
    }
    const session = await ctx.context.internalAdapter.createSession(user.id);
    await setSessionCookie(ctx, { session, user });
    // The account's own UUID is the pseudonymous ID of the event; nothing else about the person.
    productEvents?.track({
      event: 'signed_in',
      distinctId: user.id,
      properties: { method, new_account: newAccount },
    });
  }

  return {
    id: PLUGIN_ID,
    schema: {
      verification: {
        fields: {
          // The hash of the code. The base field `value` holds the hash of the link token.
          codeHash: { type: 'string', required: true },
          // The language of the email, which the first sign-in stores on a new account (ADR-019).
          locale: { type: 'string', required: false },
          // How many wrong codes were entered for this verification (AC6).
          failedAttempts: { type: 'number', required: false, defaultValue: 0 },
        },
      },
    },
    endpoints: {
      requestSignInCode: createAuthEndpoint(
        REQUEST_PATH,
        {
          method: 'POST',
          body: z.object({
            email: emailSchema,
            locale: z.string().max(35).optional(),
            // The page asked for before sign-in (web only: the apps' route has no such field).
            // It is checked, not trusted: see `safeReturnPath`.
            returnTo: z.string().max(MAX_RETURN_TO_LENGTH).optional(),
          }),
        },
        (ctx) => {
          const { email, locale, returnTo } = ctx.body;
          // For every address alike, before the account is looked up. No account ID exists yet:
          // the event gets a random ID for this request.
          productEvents?.track({
            event: 'sign_in_requested',
            distinctId: anonymousDistinctId(),
            properties: {},
          });
          const acceptLanguage = ctx.headers?.get('accept-language');
          const origin = new URL(ctx.context.baseURL).origin;

          // Answers first and does the rest after, for every address alike: an account takes a
          // database write and an email, a stranger nothing, so waiting for them would show how
          // long the answer takes and so who has an account (AC8). The same body and status for
          // all is the other half.
          runInBackground(
            (async () => {
              const found = await ctx.context.internalAdapter.findUserByEmail(email);
              // Sign-up is closed: only an account, or an allowed address, gets an email.
              if (!found && !signUpAllowlist.allows(email)) return;

              const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
              const token = randomBytes(32).toString('base64url');
              const identifier = identifierFor(email);
              // ADR-019: the stored language, else the language of the page that asked. A new
              // account stores the latter at its first sign-in.
              const emailLocale = resolveSignInCommunicationLanguage({
                recipientPreference: (
                  found?.user as { preferredLocale?: string | null } | undefined
                )?.preferredLocale,
                page: { explicit: locale, requested: parseAcceptLanguage(acceptLanguage) },
              });
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
              // Better Auth's types don't know the fields this plugin adds to the row.
              const row = {
                identifier,
                value: hashSecretValue(secret, 'link-token', token),
                codeHash: hashSecretValue(secret, 'code', `${email}:${code}`),
                locale: emailLocale,
                expiresAt: new Date(clock.now().getTime() + SIGN_IN_EXPIRES_IN_MINUTES * 60_000),
              };
              await ctx.context.internalAdapter.createVerificationValue(row);

              const url = new URL(CONFIRM_PAGE_PATH, origin);
              url.searchParams.set('token', token);
              // Only a path of this site, checked here as the page checks it: the link is the
              // only place it goes (not stored, logged or sent anywhere else), and is the one
              // thing a forged request could have steered to another site.
              const returnPath = safeReturnPath(returnTo);
              if (returnPath) url.searchParams.set(RETURN_PATH_PARAM, returnPath);
              await sendEmail({
                template: signInEmail,
                props: { code, url: url.toString(), expiresInMinutes: SIGN_IN_EXPIRES_IN_MINUTES },
                to: { email },
                locale: emailLocale,
              });
            })().catch((error: unknown) => {
              try {
                reportError(error);
              } catch {
                // Reporting must never turn into a second failure: the task never rejects.
              }
            }),
          );
          return ctx.json(REQUESTED);
        },
      ),

      verifySignInCode: createAuthEndpoint(
        '/sign-in/code/verify',
        {
          method: 'POST',
          body: z.object({ email: emailSchema, code: z.string().trim().max(32) }),
        },
        async (ctx) => {
          const { email, code } = ctx.body;
          const verification = await findLiveVerification(ctx, identifierFor(email));
          if (!verification) throw rejectedCode();
          const stored = verification.codeHash;
          if (
            typeof stored !== 'string' ||
            !hashesEqual(hashSecretValue(secret, 'code', `${email}:${code}`), stored)
          ) {
            await recordWrongSignInCode(db, verification.id, MAX_WRONG_CODES);
            throw rejectedCode();
          }
          await signInWithVerification(ctx, verification, email, 'code', rejectedCode);
          return ctx.json(REQUESTED);
        },
      ),

      // Opening the link in the email lands on the confirm step (TW-10), which asks what the link
      // is for. This consumes nothing, so an email scanner that opens the link does not use it up
      // (R1); only `confirmSignInLink`, the button's POST, does.
      previewSignInLink: createAuthEndpoint(
        LINK_PREVIEW_ENDPOINT,
        { method: 'POST', body: z.object({ token: z.string().max(MAX_TOKEN_LENGTH) }) },
        async (ctx) => {
          const found = await findLinkVerification(ctx, ctx.body.token);
          if (!found) throw rejectedLink();
          return ctx.json({ email: maskEmail(found.email) });
        },
      ),

      // The confirm step's button: the same rules as entering the code (one atomic consume of
      // the checked row, the injected clock, the wrong-code limit, the allowlist and the language
      // of the email for a new account), signing in the browser that sends it.
      confirmSignInLink: createAuthEndpoint(
        LINK_CONFIRM_ENDPOINT,
        { method: 'POST', body: z.object({ token: z.string().max(MAX_TOKEN_LENGTH) }) },
        async (ctx) => {
          const found = await findLinkVerification(ctx, ctx.body.token);
          if (!found) throw rejectedLink();
          await signInWithVerification(ctx, found.verification, found.email, 'link', rejectedLink);
          return ctx.json(REQUESTED);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
