import type { Locale } from '@fivvi/i18n';
import { eq } from 'drizzle-orm';
import { authUsers } from '../schema/index.ts';
import { executorOf, type TenantScope } from '../tenant-scope.ts';

/**
 * Stores the language the scope's account chose for the interface and its emails (F010,
 * ADR-017). Only the account of the scope is changed. The caller has checked the value is a
 * catalog locale; the table's check constraint holds the same line.
 */
export async function setPreferredLocale(scope: TenantScope, locale: Locale): Promise<void> {
  await executorOf(scope)
    .update(authUsers)
    .set({ preferredLocale: locale })
    .where(eq(authUsers.id, scope.context.accountId));
}

/**
 * Stores the name the scope's account gave itself (F005). One name per account, so every
 * workspace shows it. Only the account of the scope is changed. The caller has trimmed it and
 * checked its length.
 */
export async function setAccountName(scope: TenantScope, name: string): Promise<void> {
  await executorOf(scope)
    .update(authUsers)
    .set({ name })
    .where(eq(authUsers.id, scope.context.accountId));
}

/**
 * The ID of the account that signs in with the email address (lower case), if there is one. Only
 * the ID, and only to link a client to it (F006 AC4): nothing else of the account is read, so
 * nothing of it can reach an answer.
 */
export async function findAccountIdByEmail(
  scope: TenantScope,
  email: string,
): Promise<string | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);
  return row?.id;
}

/**
 * The language the account with the email address (lower case) chose for its emails, if there is
 * such an account and it chose one (F011 AC2). Only the language is read, and only to pick the
 * language of an email: nothing else of the account is read, so nothing of it can reach an answer.
 */
export async function findPreferredLocaleByEmail(
  scope: TenantScope,
  email: string,
): Promise<Locale | undefined> {
  const [row] = await executorOf(scope)
    .select({ preferredLocale: authUsers.preferredLocale })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);
  return row?.preferredLocale ?? undefined;
}
