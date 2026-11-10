import { type Database, recordWrongSignInCode } from '@fivvi/database';
import { emailChangeCodeEmail, type SendEmail } from '@fivvi/email';
import { parseAcceptLanguage, resolveSignInCommunicationLanguage } from '@fivvi/i18n';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';
import { generateCode, runSettled } from './background.ts';
import { hashesEqual, hashSecretValue } from './hash.ts';
import {
  type Clock,
  emailSchema,
  findLiveVerification,
  MAX_WRONG_CODES,
  REQUESTED,
  rejectedCode,
  SIGN_IN_EXPIRES_IN_MINUTES,
  identifierFor as signInIdentifierFor,
} from './sign-in-plugin.ts';

export interface ChangeEmailWithCodeOptions {
  /** Counts wrong codes in one atomic statement, which Better Auth's adapter has no call for. */
  db: Database;
  /** `BETTER_AUTH_SECRET`: the key of the code's hash. */
  secret: string;
  sendEmail: SendEmail;
  /** Where "now" comes from: it sets and checks the expiry of a code. */
  clock: Clock;
  /** Holds the work that follows a request's answer; it never rejects (see `requestSignInCode`). */
  runInBackground: (task: Promise<void>) => void;
  /** Gets the failures of that work. Never put the address or the code in what is logged. */
  reportError: (error: unknown) => void;
}

const PLUGIN_ID = 'change-email-with-code';

const IDENTIFIER_PREFIX = 'change-email:';

/** `change-email:<account ID>`: one pending change per account, so a new request replaces it. */
const identifierFor = (accountId: string) => `${IDENTIFIER_PREFIX}${accountId}`;

/** The hash of a code, bound to the account and the address it was sent for. */
const codeHashOf = (secret: string, accountId: string, newEmail: string, code: string) =>
  hashSecretValue(secret, 'email-change-code', `${accountId}:${newEmail}:${code}`);

/**
 * Changing the address of one's own account, verified by a code sent to the new address (F005,
 * spec #610; F033 reuses it). The sign-in code's machinery, in the same table: one
 * `auth_verifications` row per account, `change-email:<account ID>`, which holds the new address
 * (`value`) and the keyed hash of the code, expires with the sign-in code (15 minutes) and dies
 * after `MAX_WRONG_CODES` wrong codes. Better Auth's own `change-email` endpoint is not used: it
 * confirms with a link, and with the setting that skips that it would change an address without
 * our code.
 *
 * Both endpoints are `SERVER_ONLY`: they are not served under `/api/auth`, only `createAuth`'s
 * methods call them, for an account the API already authenticated (cookie or bearer token), so an
 * account can only ever change its own address.
 *
 * - `requestEmailChangeCode` `{ userId, newEmail }`: always the same answer. A free address gets
 *   the code (EM-34); an address that already has an account, or is the account's own, gets
 *   nothing (the notice to its owner is the next ticket).
 * - `confirmEmailChangeCode` `{ userId, code }`: the right code changes the address, keeps every
 *   session, and ends the sign-in codes and links of the old address.
 */
export function changeEmailWithCode({
  db,
  secret,
  sendEmail,
  clock,
  runInBackground,
  reportError,
}: ChangeEmailWithCodeOptions) {
  return {
    id: PLUGIN_ID,
    endpoints: {
      requestEmailChangeCode: createAuthEndpoint(
        '/change-email/code/request',
        {
          method: 'POST',
          metadata: { SERVER_ONLY: true },
          body: z.object({ userId: z.string(), newEmail: emailSchema }),
        },
        (ctx) => {
          const { userId, newEmail } = ctx.body;
          const acceptLanguage = ctx.headers?.get('accept-language');
          // Answers first and works after, for every address alike: looking an address up and
          // sending to it must not show, by the time it takes, who has an account (AC8).
          runSettled(runInBackground, reportError, async () => {
            const { internalAdapter } = ctx.context;
            const identifier = identifierFor(userId);
            // Replaced whatever the address turns out to be, so asking for a taken address
            // ends the earlier code just as asking for a free one does.
            await internalAdapter.deleteVerificationByIdentifier(identifier);
            const user = await internalAdapter.findUserById(userId);
            if (!user || user.email === newEmail) return;
            if (await internalAdapter.findUserByEmail(newEmail)) return;

            const code = generateCode();
            const locale = resolveSignInCommunicationLanguage({
              recipientPreference: (user as { preferredLocale?: string | null }).preferredLocale,
              page: { requested: parseAcceptLanguage(acceptLanguage) },
            });
            // Better Auth's types don't know the fields the sign-in plugin adds to the row.
            const row = {
              identifier,
              value: newEmail,
              codeHash: codeHashOf(secret, userId, newEmail, code),
              locale,
              expiresAt: new Date(clock.now().getTime() + SIGN_IN_EXPIRES_IN_MINUTES * 60_000),
            };
            await internalAdapter.createVerificationValue(row);
            await sendEmail({
              template: emailChangeCodeEmail,
              props: { code, expiresInMinutes: SIGN_IN_EXPIRES_IN_MINUTES },
              to: { email: newEmail },
              locale,
            });
          });
          return ctx.json(REQUESTED);
        },
      ),

      confirmEmailChangeCode: createAuthEndpoint(
        '/change-email/code/confirm',
        {
          method: 'POST',
          metadata: { SERVER_ONLY: true },
          body: z.object({ userId: z.string(), code: z.string().trim().max(32) }),
        },
        async (ctx) => {
          const { userId, code } = ctx.body;
          const { internalAdapter, adapter } = ctx.context;
          const verification = await findLiveVerification(ctx, identifierFor(userId), clock);
          if (!verification) throw rejectedCode();
          const newEmail = verification.value;
          const stored = verification.codeHash;
          if (
            typeof stored !== 'string' ||
            !hashesEqual(codeHashOf(secret, userId, newEmail, code), stored)
          ) {
            await recordWrongSignInCode(db, verification.id, MAX_WRONG_CODES);
            throw rejectedCode();
          }
          // Single use, as for the sign-in code: the first caller to consume the checked row wins.
          const consumed = await adapter.consumeOne({
            model: 'verification',
            where: [
              { field: 'id', value: verification.id },
              { field: 'failedAttempts', operator: 'lt', value: MAX_WRONG_CODES },
            ],
          });
          if (!consumed) throw rejectedCode();

          const user = await internalAdapter.findUserById(userId);
          // An address that got an account while the code was out can't be taken over.
          if (!user || (await internalAdapter.findUserByEmail(newEmail))) throw rejectedCode();
          const oldEmail = user.email;
          try {
            await internalAdapter.updateUser(userId, { email: newEmail, emailVerified: true });
          } catch (error) {
            // Lost a race for the address (the unique index): the same answer.
            if (await internalAdapter.findUserByEmail(newEmail)) throw rejectedCode();
            throw error;
          }
          // The codes and links sent to the old address before the change stop working (AC4).
          await internalAdapter.deleteVerificationByIdentifier(signInIdentifierFor(oldEmail));
          return ctx.json({ email: newEmail });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
