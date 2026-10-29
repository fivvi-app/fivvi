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
