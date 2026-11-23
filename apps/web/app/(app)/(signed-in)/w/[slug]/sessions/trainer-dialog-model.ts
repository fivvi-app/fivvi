import type { Session } from './sessions-client';
import type { TrainerCandidates } from './trainer-assignment-client';

/** Which of the trainer dialogs a session gets: CO-02's two titles, or *Trainer wijzigen* of a private session. */
export type AssignKind = 'assign' | 'substitute' | 'change';

/** The dates the dialog is for (*Voor*): *Alleen deze les* or *Deze en alle volgende lessen*. */
export type AssignScope = 'this' | 'following';

type Assignable = Pick<Session, 'type' | 'status'> & {
  trainer?: Session['trainer'];
  series?: Session['series'];
};

/**
 * The dialog a session is offered, or `null` when it is offered none (F023): a private session is
 * changed (*Trainer wijzigen*); a class date without a trainer gets one (*Trainer toewijzen*); a
 * class date of a series that has one is substituted (*Trainer vervangen*, which sets the series'
 * regular trainer from that date on). A one-off class date that has a trainer is not offered it
 * before F024's substitution, and a cancelled session or an Open Gym block never is.
 */
export function assignKind(session: Assignable): AssignKind | null {
  if (session.status !== 'scheduled') return null;
  if (session.type === 'private') return 'change';
  if (session.type !== 'group') return null;
  if (!session.trainer) return 'assign';
  return session.series ? 'substitute' : null;
}

/**
 * The dates the chosen trainer can be given: a private session has no *Voor*; a date in a series
 * that has no trainer offers both; a date that has one only *Deze en alle volgende lessen* (*Alleen
 * deze les* there is F024's substitution); a one-off date only itself.
 */
export function scopesOffered(session: Assignable): AssignScope[] {
  if (session.type !== 'group') return [];
  if (!session.series) return ['this'];
  return session.trainer ? ['following'] : ['this', 'following'];
}

/** How many clients the trainer-change email reaches for `scope` (`undefined`: a private session). */
export function notifyCount(
  { participantsToNotify }: Pick<TrainerCandidates, 'participantsToNotify'>,
  scope: AssignScope | undefined,
): number {
  return scope === 'following'
    ? participantsToNotify.forFollowingDates
    : participantsToNotify.forThisDate;
}
