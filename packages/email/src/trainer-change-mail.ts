import type { EmailLanguage, TrainerWord } from '@fivvi/i18n';
import type { PrivateSessionMailAddress } from './private-session-mail.ts';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./trainer-change-mail` export, and the API cannot load or type-check the `.tsx` templates.

/** One date the new trainer takes over, with the location it is held at. */
export interface TrainerChangeMailDate {
  startsAt: Date;
  endsAt: Date;
  location: { name: string; address: PrivateSessionMailAddress | null };
}

/**
 * What EM-13 (a new trainer, F023; F024 sends the same email for a substitution) needs; the
 * assignment route of `packages/api` decides every field. One mail per recipient: a private session
 * has one date, a class lists every date the recipient is booked on that the change reaches. It
 * carries no other participant and no email address of the trainer.
 */
export interface TrainerChangeMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`confirmationLanguage` in `@fivvi/domain`). */
  locale: EmailLanguage;
  workspaceName: string;
  /** The workspace's IANA time zone: the dates and the times are shown in it. */
  timeZone: string;
  /** A private session, or the dates of a class. */
  session: { kind: 'private' } | { kind: 'class'; nameNl: string; nameEn: string | null };
  /** The affected dates, soonest first; at least one. */
  dates: readonly [TrainerChangeMailDate, ...TrainerChangeMailDate[]];
  /** The new trainer's name as the account has it; `null` when it has none (the line is left out). */
  trainerName: string | null;
  /** The workspace's word for the people who teach, as it is when the email is sent (F068). */
  trainerWord: TrainerWord;
  /**
   * The event behind the mail: one per session, version, new trainer and recipient, so the same
   * send repeated reaches the provider with one idempotency key and goes out once (F049). With
   * several dates, one part per date.
   */
  event: string;
}
