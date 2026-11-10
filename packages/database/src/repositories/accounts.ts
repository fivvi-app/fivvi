import type { Locale } from '@fivvi/i18n';
import { and, eq, sql } from 'drizzle-orm';
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
 * Stores whether the scope's account gets the emails about bookings in the classes it teaches
 * (F050). One setting per account, for every workspace. Only the account of the scope is changed.
 */
export async function setBookingEmails(scope: TenantScope, bookingEmails: boolean): Promise<void> {
  await executorOf(scope)
    .update(authUsers)
    .set({ bookingEmails })
    .where(eq(authUsers.id, scope.context.accountId));
}

/** Whether the scope's account gets the emails about bookings in its classes (F050); on by default. */
export async function findBookingEmails(scope: TenantScope): Promise<boolean> {
  const [row] = await executorOf(scope)
    .select({ bookingEmails: authUsers.bookingEmails })
    .from(authUsers)
    .where(eq(authUsers.id, scope.context.accountId));
  return row?.bookingEmails ?? true;
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

/**
 * Gives the scope's account a name, but only when it has none (F011 AC3): an invitation's name
 * never replaces the one a person gave themselves. Returns whether the name was set.
 */
export async function nameAccountIfEmpty(scope: TenantScope, name: string): Promise<boolean> {
  const rows = await executorOf(scope)
    .update(authUsers)
    .set({ name })
    .where(and(eq(authUsers.id, scope.context.accountId), sql`btrim(${authUsers.name}) = ''`))
    .returning({ id: authUsers.id });
  return rows.length > 0;
}

/**
 * The address of the scope's account and whether it is verified: what an invitation is accepted
 * with (F011). Nothing else of the account is read.
 */
export async function findAccountForInvitation(
  scope: TenantScope,
): Promise<{ email: string; emailVerified: boolean } | undefined> {
  const [row] = await executorOf(scope)
    .select({ email: authUsers.email, emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, scope.context.accountId))
    .limit(1);
  return row;
}
