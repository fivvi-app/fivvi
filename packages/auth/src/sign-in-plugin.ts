import { randomBytes, randomInt } from 'node:crypto';
import { authVerifications, type Database } from '@fivvi/database';
import { type SendEmail, signInEmail } from '@fivvi/email';
import { parseAcceptLanguage, resolveInterfaceLanguage } from '@fivvi/i18n';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashesEqual, hashSecretValue } from './hash.ts';

/** How long the emailed code and link work (AC5). */
export const SIGN_IN_EXPIRES_IN_MINUTES = 15;

/** The wrong codes after which a verification is dead, the right code included (AC6). */
export const MAX_WRONG_CODES = 5;

/** The path of the sign-in page's confirm step (TW-10), which the emailed link opens. */
export const CONFIRM_PATH = '/login/confirm';

/** The shape of the injected clock; `@fivvi/testing/clock` builds fixed and manual ones. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface SignInWithCodeOptions {
  /** Counts wrong codes in one atomic statement, which Better Auth's adapter has no call for. */
  db: Database;
  /** `BETTER_AUTH_SECRET`: the key of the hashes. */
  secret: string;
  sendEmail: SendEmail;
  /** Where "now" comes from: it sets and checks the expiry of a code. */
  clock: Clock;
}

/** `sign-in:<email>`: one verification per address, so a new request replaces the old one. */
const identifierFor = (email: string) => `sign-in:${email}`;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** The same answer for every outcome of a request, so nobody can tell who has an account. */
const REQUESTED = { status: true } as const;

/**
 * Sign in with one emailed verification that holds both a link token and a 6-digit code
 * (ADR-007, F001). Better Auth's magic-link and email-OTP plugins each send their own email
 * with their own token; here one request creates one `auth_verifications` row whose link
 * token and code are stored only as keyed hashes, and using either consumes it.
 *
 * - `POST /sign-in/code/request` `{ email, locale? }`: an existing account gets one EM-08
 *   email in the page's language. Every other address gets the same answer and no email.
 * - `POST /sign-in/code/verify` `{ email, code }`: the right code signs this browser in.
 */
export function signInWithCode({ db, secret, sendEmail, clock }: SignInWithCodeOptions) {
  /**
   * Counts one wrong code against a verification and deletes it at the limit, which kills the
   * link and the code. The count goes up in one statement, so guesses made in parallel are all
   * counted.
   */
  async function recordWrongCode(verificationId: string) {
    const [counted] = await db
      .update(authVerifications)
      .set({ failedAttempts: sql`${authVerifications.failedAttempts} + 1` })
      .where(eq(authVerifications.id, verificationId))
      .returning({ failedAttempts: authVerifications.failedAttempts });
    if (counted && counted.failedAttempts >= MAX_WRONG_CODES) {
      await db.delete(authVerifications).where(eq(authVerifications.id, verificationId));
    }
  }

  return {
    id: 'sign-in-with-code',
    schema: {
      verification: {
        fields: {
          // The hash of the code. The base field `value` holds the hash of the link token.
          codeHash: { type: 'string', required: true },
          // How many wrong codes were entered for this verification (AC6).
          failedAttempts: { type: 'number', required: false, defaultValue: 0 },
        },
      },
    },
    endpoints: {
      requestSignInCode: createAuthEndpoint(
        '/sign-in/code/request',
        {
          method: 'POST',
          body: z.object({ email: emailSchema, locale: z.string().max(35).optional() }),
        },
        async (ctx) => {
          const { email, locale } = ctx.body;
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!found) return ctx.json(REQUESTED);

          const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
          const token = randomBytes(32).toString('base64url');
          const identifier = identifierFor(email);
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
          // Better Auth's types don't know the `codeHash` field this plugin adds to the row.
          const row = {
            identifier,
            value: hashSecretValue(secret, 'link-token', token),
            codeHash: hashSecretValue(secret, 'code', `${email}:${code}`),
            expiresAt: new Date(clock.now().getTime() + SIGN_IN_EXPIRES_IN_MINUTES * 60_000),
          };
          await ctx.context.internalAdapter.createVerificationValue(row);

          const url = new URL(CONFIRM_PATH, new URL(ctx.context.baseURL).origin);
          url.searchParams.set('token', token);
          await sendEmail({
            template: signInEmail,
            props: { code, url: url.toString(), expiresInMinutes: SIGN_IN_EXPIRES_IN_MINUTES },
            to: { email },
            // ADR-019 will add the stored preference before the page's language.
            locale: resolveInterfaceLanguage({
              explicit: locale,
              requested: parseAcceptLanguage(ctx.headers?.get('accept-language')),
            }),
          });
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
          // One answer for a wrong, expired, used or never issued code: no message says which.
          const rejected = () =>
            new APIError('UNAUTHORIZED', {
              code: 'INVALID_OR_EXPIRED_CODE',
              message: 'The code is incorrect or has expired.',
            });

          const identifier = identifierFor(email);
          const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
          const { codeHash: stored, failedAttempts } = (verification ?? {}) as {
            codeHash?: unknown;
            failedAttempts?: unknown;
          };
          if (
            !verification ||
            typeof stored !== 'string' ||
            verification.expiresAt.getTime() <= clock.now().getTime() ||
            (typeof failedAttempts === 'number' && failedAttempts >= MAX_WRONG_CODES)
          ) {
            throw rejected();
          }
          if (!hashesEqual(hashSecretValue(secret, 'code', `${email}:${code}`), stored)) {
            await recordWrongCode(verification.id);
            throw rejected();
          }

          // Single use: the first caller to consume it wins, also against a parallel request.
          // It consumes the row that was checked, not "the verification of this address": a new
          // request that landed in between has replaced it, and the old code must not use that
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
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!consumed || !found) throw rejected();

          // Holding the code proves the address.
          const user = found.user.emailVerified
            ? found.user
            : ((await ctx.context.internalAdapter.updateUser(found.user.id, {
                emailVerified: true,
              })) ?? found.user);
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json(REQUESTED);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
