// Module: Assigning a trainer (F023): `assignTrainer` decides who teaches a session after the Owner
//        picks someone, for a private session, one class date (*Alleen deze les*, only while the
//        date has no trainer: one that has one is F024's `substitute`) and a class date with everything after it
//        (*Deze en alle volgende lessen*, F022's `applyThisAndFollowing` with `{ trainer }`);
//        `sendsTrainerChangeNotice` says whether the clients are told
// Spec: F023 AC1, AC2, AC8, AC17

import {
  type ApplyFollowingDecision,
  applyThisAndFollowing,
  DETACHABLE_FIELDS,
  type DetachedField,
  type SeriesDate,
  type SeriesState,
} from './apply-following.ts';

// Assigning a trainer (F023, spec #459, ticket #536). Pure: the caller reads the session, its
// series and dates, and writes what this decides. Who may assign (`session.assign`, the Owner only,
// decision of 4 November 2026) is the route's access, not decided here.

/** What the rules need to know of the session; the caller reads it all. */
export interface AssignTrainerSession {
  readonly id: string;
  readonly type: 'private' | 'group' | 'open_gym';
  readonly status: 'scheduled' | 'cancelled';
  readonly startsAt: Date;
  /** The trainer profile now; `null` for *Trainer nodig* and for a trainer whose profile ended. */
  readonly trainerProfileId: string | null;
  /** The weekly series of a class date (F022), `undefined` for a date on its own and for a private session. */
  readonly series:
    | {
        readonly state: SeriesState;
        /** The local date in the series' rule this session stands for. */
        readonly occurrenceDate: string;
        /** What was changed on this date alone. */
        readonly detachedFields: readonly DetachedField[];
        /** Every date the series has, whatever its status. */
        readonly dates: readonly SeriesDate[];
      }
    | undefined;
}

export interface AssignTrainerFacts {
  readonly session: AssignTrainerSession;
  /** The trainer profile chosen (not a team-member ID). */
  readonly trainerProfileId: string;
  /** *Alleen deze les* or *Deze en alle volgende lessen*; ignored for a private session. */
  readonly scope: 'this' | 'following';
  /** Today in the workspace's time zone, `YYYY-MM-DD`: a series is not changed from a past date. */
  readonly today: string;
}

export type AssignTrainerRefusal =
  /** The session was cancelled: it stays as it is. */
  | 'not-scheduled'
  /** The chosen trainer is the session's trainer already. */
  | 'same-trainer'
  /** *Alleen deze les* on a class date that has a trainer is F024's substitution (`substitute`), which the route decides first. */
  | 'has-trainer'
  /** *Deze en alle volgende lessen* on a class date that is in no series. */
  | 'not-in-series'
  /** *Deze en alle volgende lessen* from a date before today. */
  | 'date-in-past'
  /** A refusal of F022's rules for the dates a series change reaches. */
  | 'time-does-not-exist'
  | 'invalid-rule'
  | 'invalid-date'
  | 'invalid-time'
  | 'invalid-duration';

export type AssignTrainerDecision =
  | {
      readonly outcome: 'applied';
      /** One session gets the trainer. */
      readonly kind: 'date';
      readonly trainerProfileId: string;
      /** What the date differs in from its series after the change; `[]` for a session on its own. */
      readonly detachedFields: readonly DetachedField[];
    }
  | {
      readonly outcome: 'applied';
      /** The series changes from the date on: F022's decision, written as it is. */
      readonly kind: 'series';
      readonly change: Extract<ApplyFollowingDecision, { outcome: 'applied' }>;
    }
  | { readonly outcome: 'refused'; readonly reason: AssignTrainerRefusal };

/**
 * Decides who teaches after an assignment (F023 AC1, AC2, AC8):
 * - a private session takes the trainer whatever the scope says;
 * - *this* on a class date that has none sets the trainer and marks it as the date's own in its
 *   series (`detached_fields`), so a later change of the series leaves it alone; one that already
 *   has a trainer is F024's substitution (`isSubstitution`, `substitute`) and is refused here;
 * - *following* changes the series from the date on with `{ trainer }` (F022): dates with a trainer
 *   of their own and cancelled ones keep what they are, earlier dates keep the old trainer.
 */
export function assignTrainer(facts: AssignTrainerFacts): AssignTrainerDecision {
  const { session, trainerProfileId, scope, today } = facts;
  if (session.status !== 'scheduled') return { outcome: 'refused', reason: 'not-scheduled' };
  if (session.trainerProfileId === trainerProfileId) {
    return { outcome: 'refused', reason: 'same-trainer' };
  }
  if (session.type === 'private') {
    return { outcome: 'applied', kind: 'date', trainerProfileId, detachedFields: [] };
  }

  if (scope === 'this') {
    if (session.trainerProfileId !== null) return { outcome: 'refused', reason: 'has-trainer' };
    const own = session.series?.detachedFields ?? [];
    return {
      outcome: 'applied',
      kind: 'date',
      trainerProfileId,
      detachedFields: session.series
        ? DETACHABLE_FIELDS.filter((field) => field === 'trainer' || own.includes(field))
        : [],
    };
  }

  const { series } = session;
  if (!series) return { outcome: 'refused', reason: 'not-in-series' };
  const applied = applyThisAndFollowing(
    series.state,
    series.occurrenceDate,
    { trainerProfileId },
    series.dates,
    today,
  );
  if (applied.outcome === 'refused') return { outcome: 'refused', reason: applied.reason };
  return { outcome: 'applied', kind: 'series', change: applied };
}

/**
 * Whether the clients get the trainer-change email for a session (F023 AC8, AC17): the Owner left
 * the box checked and the session has not started. A session that started never emails, whatever
 * the box says.
 */
export function sendsTrainerChangeNotice(input: {
  notify: boolean;
  startsAt: Date;
  now: Date;
}): boolean {
  return input.notify && input.startsAt.getTime() > input.now.getTime();
}
