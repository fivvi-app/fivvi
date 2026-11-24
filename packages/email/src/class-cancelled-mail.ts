import type { EmailLanguage } from '@fivvi/i18n';
import type { PrivateSessionMailAddress } from './private-session-mail.ts';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./class-cancelled-mail` export, and the API cannot load or type-check the `.tsx` templates.

/**
 * What the class variant of EM-05 (a class date is cancelled, F026) needs; the cancel route of
 * `packages/api` decides every field. One mail for each booked participant of a cancelled date. It
 * names no other participant, no trainer and no email address.
 */
export interface ClassCancelledMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`confirmationLanguage` in `@fivvi/domain`). */
  locale: EmailLanguage;
  workspaceName: string;
  /** The workspace's IANA time zone: the date and the times are shown in it. */
  timeZone: string;
  /** The class: the Dutch name and, when the Owner wrote one, the English name. */
  class: { nameNl: string; nameEn: string | null };
  /** The time the date had. */
  startsAt: Date;
  endsAt: Date;
  location: { name: string; address: PrivateSessionMailAddress | null };
  /**
   * What the Owner typed for the participants, kept exactly as typed and never translated; `null`
   * when they typed none.
   */
  message: string | null;
  /**
   * The event behind the mail, `{sessionId}:{version}:{clientId}`: one per class date, version and
   * participant, so the same send repeated reaches the provider with one idempotency key and goes
   * out once (F049).
   */
  event: string;
}
