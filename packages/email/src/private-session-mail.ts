import type { EmailLanguage, TrainerWord } from '@fivvi/i18n';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./private-session-mail` export, and the API cannot load or type-check the `.tsx` templates.

/** A location's address as the API holds it: complete, the postcode as `1234 AB`. */
export interface PrivateSessionMailAddress {
  street: string;
  houseNumber: string;
  houseNumberAddition: string | null;
  postcode: string;
  city: string;
}

/** What every private-session mail carries, whatever it says about the session. */
interface PrivateSessionMailBase {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`confirmationLanguage` in `@fivvi/domain`). */
  locale: EmailLanguage;
  workspaceName: string;
  /** The workspace's IANA time zone: the date and the times are shown in it. */
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  location: { name: string; address: PrivateSessionMailAddress | null };
  /** The trainer's name as the account has it; `null` when the account has none (the line is left out). */
  trainerName: string | null;
  /** The workspace's word for the people who teach, as it is when the email is sent (F068). */
  trainerWord: TrainerWord;
  /**
   * The event behind the mail, `{sessionId}:{version}`, with `:{clientId}` added for the client of a duo: one per session, version and client, so the same
   * send repeated reaches the provider with one idempotency key and goes out once (F049).
   */
  event: string;
}

/**
 * What EM-11 (a new session), EM-04 (a session that moved) and the private-session variant of EM-05
 * (a session that is cancelled, F026) need; the private session routes of `packages/api` decide
 * every field (F020, F026). `kind` says which of the three it is:
 *
 * - `planned` (EM-11): `togetherWith` names the other client of a duo (F066), by first name only:
 *   never a surname, an email address or any other detail. Left out for a one-client session.
 * - `moved` (EM-04): `previous` is where the session was before; `startsAt` and `endsAt` are then
 *   the new time. It names no other client.
 * - `cancelled` (EM-05): `startsAt` and `endsAt` are the time the session had. It names no other
 *   client either: a cancellation names no other participant.
 */
export type PrivateSessionMail = PrivateSessionMailBase &
  (
    | { kind: 'planned'; togetherWith?: string }
    | { kind: 'moved'; previous: { startsAt: Date; endsAt: Date } }
    | { kind: 'cancelled' }
  );
