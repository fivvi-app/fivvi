import { randomBytes, randomInt } from 'node:crypto';
import { type SendEmail, signInEmail } from '@fivvi/email';
import { parseAcceptLanguage, resolveInterfaceLanguage } from '@fivvi/i18n';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { hashesEqual, hashSecretValue } from './hash.ts';

/** How long the emailed code and link work (AC5). */
export const SIGN_IN_EXPIRES_IN_MINUTES = 15;

/** The path of the sign-in page's confirm step (TW-10), which the emailed link opens. */
export const CONFIRM_PATH = '/login/confirm';

export interface SignInWithCodeOptions {
  /** `BETTER_AUTH_SECRET`: the key of the hashes. */
  secret: string;
  sendEmail: SendEmail;
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
export function signInWithCode({ secret, sendEmail }: SignInWithCodeOptions) {
  return {
    id: 'sign-in-with-code',
    schema: {
      verification: {
        fields: {
          // The hash of the code. The base field `value` holds the hash of the link token.
          codeHash: { type: 'string', required: true },
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
            expiresAt: new Date(Date.now() + SIGN_IN_EXPIRES_IN_MINUTES * 60_000),
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
          const stored = (verification as { codeHash?: unknown } | null)?.codeHash;
          if (
            !verification ||
            typeof stored !== 'string' ||
            verification.expiresAt.getTime() <= Date.now() ||
            !hashesEqual(hashSecretValue(secret, 'code', `${email}:${code}`), stored)
          ) {
            throw rejected();
          }

          // Single use: the first caller to consume it wins, also against a parallel request.
          const consumed = await ctx.context.internalAdapter.consumeVerificationValue(identifier);
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
