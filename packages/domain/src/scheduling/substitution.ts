// Module: Substituting a trainer on one class date (F024): `isSubstitution` says which request is
//        one (a class date that has a trainer, *Alleen deze les*), `substitute` decides who teaches
//        and whom the date remembers as the original, `endSubstitution` gives the date back, and
//        `sendsSubstitutionNotice` says whether the substitute is emailed (EM-10)
// Spec: F024 AC1, AC2, AC5, AC6, AC8, AC12

import { type EmailLanguage, type Locale, resolveCommunicationLanguage } from '@fivvi/i18n';
import { DETACHABLE_FIELDS, type DetachedField } from './apply-following.ts';

// Substituting a trainer (F024, spec #461, ticket #552). Pure: the caller reads the date and what
// its series says, and writes what this decides. A substitution changes the trainer of one date
// only; the class, the series and the bookings stay (`PRODUCT.md §19`). Who may (`session.assign`,
// the Owner only, decision of 4 November 2026) is the route's access, not decided here.

/** What the rules need to know of the class date; the caller reads it all. */
export interface SubstitutionDate {
  readonly type: 'private' | 'group' | 'open_gym';
  readonly status: 'scheduled' | 'cancelled';
  readonly startsAt: Date;
  /** The trainer profile now; `null` for *Trainer nodig* and for a trainer whose profile ended. */
  readonly trainerProfileId: string | null;
  /** The trainer this date's trainer replaces; `null` while the date is no substitution. */
  readonly substituteForTrainerProfileId: string | null;
  /** The weekly series of the date (F022), `undefined` for a date on its own. */
  readonly series:
    | {
        /** The usual trainer of the series' dates. */
        readonly trainerProfileId: string | null;
        /** What was changed on this date alone. */
        readonly detachedFields: readonly DetachedField[];
      }
    | undefined;
}

export type SubstitutionRefusal =
  /** The date was cancelled: it stays as it is. */
  | 'not-scheduled'
  /** The date has no trainer: there is nobody to substitute, the trainer is assigned (F023). */
  | 'no-trainer'
  /** The chosen trainer teaches the date already. */
  | 'same-trainer'
  /** A private session's trainer is changed with F023's *Trainer wijzigen*. */
  | 'private-session'
  /** `endSubstitution` on a date that is no substitution. */
  | 'not-a-substitution';

/**
 * What happened to the date: `started` (Mike for Sarah), `replaced` (Lisa for Mike: the original
 * stays Sarah) or `ended` (Sarah teaches again).
 */
export type SubstitutionChange = 'started' | 'replaced' | 'ended';

export type SubstitutionDecision =
  | {
      readonly outcome: 'applied';
      readonly change: SubstitutionChange;
      /** The trainer profile that teaches the date from now on. */
      readonly trainerProfileId: string;
      /** The trainer the date's trainer replaces; `null` once the substitution has ended. */
      readonly substituteForTrainerProfileId: string | null;
      /** What the date differs in from its series after the change; `[]` for a date on its own. */
      readonly detachedFields: readonly DetachedField[];
    }
  | { readonly outcome: 'refused'; readonly reason: SubstitutionRefusal };

/**
 * Whether a trainer request is a substitution (F024): *Alleen deze les* on a class date that has a
 * trainer. A date without one is assigned (F023), a private session's trainer is changed, and
 * *Deze en alle volgende lessen* changes the series.
 */
export function isSubstitution(
  session: Pick<SubstitutionDate, 'type' | 'trainerProfileId'>,
  scope: 'this' | 'following',
): boolean {
  return session.type === 'group' && session.trainerProfileId !== null && scope === 'this';
}

/**
 * What a date of a series keeps of its own after the change: the fields it had, with `trainer` added
 * for a substitution and taken away again once the original teaches, unless that trainer is not the
 * series' own either (then the date still has a trainer of its own).
 */
function detachedAfter(
  session: SubstitutionDate,
  trainer: { readonly marked: boolean },
): readonly DetachedField[] {
  const { series } = session;
  if (!series) return [];
  return DETACHABLE_FIELDS.filter((field) =>
    field === 'trainer' ? trainer.marked : series.detachedFields.includes(field),
  );
}

/**
 * Whether the date is a substitution that ends: the chosen trainer is the one the date's trainer
 * replaces.
 */
function endsSubstitution(session: SubstitutionDate, newTrainerProfileId: string): boolean {
  return session.substituteForTrainerProfileId === newTrainerProfileId;
}

/**
 * Whether the date's substitute is told (EM-10): the Owner left the box checked, the substitution
 * is not over and the date has not started. A date that started never emails, whatever the box
 * says.
 */
export function sendsSubstitutionNotice(input: {
  notify: boolean;
  change: SubstitutionChange;
  startsAt: Date;
  now: Date;
}): boolean {
  return input.notify && input.change !== 'ended' && input.startsAt.getTime() > input.now.getTime();
}

/**
 * Decides who teaches a class date after the Owner picks a trainer for this date alone (F024 AC1,
 * AC5, AC8):
 * - a date that has a trainer gets the chosen one, who replaces the date's trainer, and the date
 *   is marked as having a trainer of its own in its series, so a later change of the series (F022,
 *   *Deze en alle volgende lessen*) leaves it alone (AC6);
 * - a date that is a substitution already keeps the first original: Lisa for Mike's date is Lisa
 *   for Sarah;
 * - choosing the original again ends the substitution (`endSubstitution`);
 * - a date in the past is recorded all the same (who actually taught); whether anyone is told is
 *   `sendsSubstitutionNotice`'s rule, the only place the date's time is looked at.
 */
export function substitute(
  session: SubstitutionDate,
  newTrainerProfileId: string,
): SubstitutionDecision {
  if (session.type === 'private') return { outcome: 'refused', reason: 'private-session' };
  if (session.status !== 'scheduled') return { outcome: 'refused', reason: 'not-scheduled' };
  if (session.trainerProfileId === null) return { outcome: 'refused', reason: 'no-trainer' };
  if (session.trainerProfileId === newTrainerProfileId) {
    return { outcome: 'refused', reason: 'same-trainer' };
  }
  if (endsSubstitution(session, newTrainerProfileId)) {
    return endSubstitution(session);
  }
  return {
    outcome: 'applied',
    change: session.substituteForTrainerProfileId === null ? 'started' : 'replaced',
    trainerProfileId: newTrainerProfileId,
    substituteForTrainerProfileId:
      session.substituteForTrainerProfileId ?? session.trainerProfileId,
    detachedFields: detachedAfter(session, { marked: true }),
  };
}

/**
 * Gives the date back to the trainer it was taken from (F024 AC5): the substitution and its mark in
 * the series are cleared and nobody is told. The date keeps its own trainer in the series only when
 * the original is not the series' trainer (it was given to them on its own before).
 */
export function endSubstitution(session: SubstitutionDate): SubstitutionDecision {
  const original = session.substituteForTrainerProfileId;
  if (original === null) return { outcome: 'refused', reason: 'not-a-substitution' };
  return {
    outcome: 'applied',
    change: 'ended',
    trainerProfileId: original,
    substituteForTrainerProfileId: null,
    detachedFields: detachedAfter(session, {
      marked: session.series !== undefined && session.series.trainerProfileId !== original,
    }),
  };
}

/**
 * The language of EM-10 (ADR-017, F024 AC2): the substitute's stored preference, then the
 * workspace's default communication language. A value that is no catalog language is skipped.
 */
export function substitutionLanguage(sources: {
  accountPreference?: string | null;
  workspaceDefault: Locale;
}): EmailLanguage {
  return resolveCommunicationLanguage({
    recipientPreference: sources.accountPreference,
    workspaceDefault: sources.workspaceDefault,
  });
}
