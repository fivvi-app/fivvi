import type { EmailLanguage } from '@fivvi/i18n';
import type { PrivateSessionMailAddress } from './private-session-mail.ts';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./substitution-mail` export, and the API cannot load or type-check the `.tsx` templates.

/**
 * What EM-10 (a trainer covers a class date, F024) needs; the assignment route of `packages/api`
 * decides every field. One mail to the substitute for one date. It carries no participant name and
 * no email address of the trainer it replaces.
 */
export interface SubstitutionMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`substitutionLanguage` in `@fivvi/domain`). */
  locale: EmailLanguage;
  workspaceName: string;
  /** The workspace's URL name: the button opens the class date's page, `/w/{slug}/sessions/{id}`. */
  workspaceSlug: string;
  /** The workspace's IANA time zone: the date and the times are shown in it. */
  timeZone: string;
  /** The class date: its ID (for the button) and the class's Dutch and English name. */
  session: { id: string; nameNl: string; nameEn: string | null };
  startsAt: Date;
  endsAt: Date;
  location: { name: string; address: PrivateSessionMailAddress | null };
  /** The name of the trainer the person covers for as the account has it; `null` when it has none (the line is left out). */
  originalName: string | null;
  /**
   * The event behind the mail: one per date and substitute, so the same send repeated reaches the
   * provider with one idempotency key and goes out once (F049).
   */
  event: string;
}
