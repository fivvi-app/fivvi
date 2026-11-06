import type { Locale } from '@fivvi/i18n';

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

/** What EM-11 (a new session) and EM-04 (a session that moved) need; the private session routes of `packages/api` decide every field (F020). */
export interface PrivateSessionMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`confirmationLanguage` in `@fivvi/domain`). */
  locale: Locale;
  workspaceName: string;
  /** The workspace's IANA time zone: the date and the times are shown in it. */
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  location: { name: string; address: PrivateSessionMailAddress | null };
  /** The trainer's name as the account has it; `null` when the account has none (the line is left out). */
  trainerName: string | null;
  /**
   * Where the session was before, when the mail says it moved (EM-04, a reschedule); `startsAt` and
   * `endsAt` are then the new time. Left out for a new session (EM-11).
   */
  previous?: { startsAt: Date; endsAt: Date };
  /** One key per session and version, so the same send repeated goes out once. */
  idempotencyKey: string;
}
