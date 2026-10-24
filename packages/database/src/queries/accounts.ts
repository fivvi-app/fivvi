import type { Locale } from '@fivvi/i18n';

/** The account behind a request's sign-in session (spec #128). */
export interface SignedInAccount {
  id: string;
  email: string;
  /** The language stored on the account (ADR-019); `null` until one is stored. */
  preferredLocale: Locale | null;
}
