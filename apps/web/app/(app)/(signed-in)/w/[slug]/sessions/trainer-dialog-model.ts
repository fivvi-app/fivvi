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
 * class date that has one is substituted (*Trainer vervangen*: *Alleen deze les* is F024's
 * substitution, *Deze en alle volgende lessen* of a series sets its regular trainer from that date
 * on), and a cancelled session or an Open Gym block never is offered it.
 */
export function assignKind(session: Assignable): AssignKind | null {
  if (session.status !== 'scheduled') return null;
  if (session.type === 'private') return 'change';
  if (session.type !== 'group') return null;
  return session.trainer ? 'substitute' : 'assign';
}

/**
 * The dates the chosen trainer can be given, *Alleen deze les* first (the default): a private
 * session has no *Voor*; a class date in a series offers both, with a trainer too (*Alleen deze
 * les* there is F024's substitution); a one-off date only itself.
 */
export function scopesOffered(session: Assignable): AssignScope[] {
  if (session.type !== 'group') return [];
  return session.series ? ['this', 'following'] : ['this'];
}

/**
 * Whether choosing a trainer for `scope` is a substitution (F024): *Alleen deze les* on a class
 * date that has a trainer. The API decides the same way (`isSubstitution`); this words the dialog.
 */
export function substitutionOf(session: Assignable, scope: AssignScope | undefined): boolean {
  return session.type === 'group' && Boolean(session.trainer) && scope === 'this';
}

/**
 * The name of the regular trainer the save replaced, or `null` when it was no substitution (F024):
 * the done text "{substitute} vervangt {original}" is for *Alleen deze les* on a date that had a
 * trainer. *Deze en alle volgende lessen* on an already substituted date leaves that date
 * substituted (the API keeps it) but changes the series, so it gets the plain done text.
 */
export function substitutedFor(
  session: Assignable,
  scope: AssignScope | undefined,
  saved: Pick<Session, 'substituteFor'>,
): string | null {
  return substitutionOf(session, scope) ? (saved.substituteFor?.name ?? null) : null;
}

/**
 * The candidates in the order the dialog lists them: on a substituted date the regular trainer, the
 * one the date's trainer replaces, comes first (*(vaste trainer)*); the API's order otherwise.
 */
export function orderedCandidates<T extends { id: string }>(
  trainers: readonly T[],
  { substituteFor }: { substituteFor?: { id: string } | undefined },
): T[] {
  const regular = trainers.filter(({ id }) => id === substituteFor?.id);
  return [...regular, ...trainers.filter(({ id }) => id !== substituteFor?.id)];
}

/** Whether the class date has started: nothing is emailed for it, and the email boxes are hidden (F024 AC8). */
export function startedBy({ startsAt }: Pick<Session, 'startsAt'>, now: Date): boolean {
  return new Date(startsAt).getTime() <= now.getTime();
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
