// Module: The rules of the workspace calendar: the filters of the week, the rows of one day and the open item "a session without a trainer".
// Spec: F014

import { orderPersonalSessions } from './personal-day.ts';
import { addDays, localDateOf, localDayBounds } from './zoned-time.ts';

// The workspace calendar (F014, spec #458): the read routes of a workspace's sessions read them
// from the database, one workspace at a time (ADR-006), and hand them here. What the filters
// leave, which sessions make a day, and which sessions need a trainer are rules, so they are
// here: pure, no I/O, no clock of their own ("now" is an argument), in the wall clock of the
// workspace's zone (ADR-012). F023 and F025 extend the open items from this one place.

/** *Aandacht nodig* looks this many days ahead: today and the days after it. */
export const ATTENTION_DAYS = 14;

/** What the rules need of a session; the rest of it rides along untouched. */
export interface WorkspaceCalendarSession {
  readonly sessionId: string;
  readonly type: 'private' | 'group' | 'open_gym';
  readonly status: 'scheduled' | 'cancelled';
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The trainer's team-member ID (what the API calls a trainer); `null` for *Trainer nodig*. */
  readonly trainerId: string | null;
}

/** The filters of the calendar; a filter left out, or empty, narrows nothing. */
export interface WorkspaceCalendarFilters {
  /** Team-member IDs. A session without a trainer matches none of them. */
  readonly trainerIds?: readonly string[];
  readonly types?: readonly ('private' | 'group')[];
  /** *Geannuleerde tonen*: on unless `false`. */
  readonly includeCancelled?: boolean;
}

/** The sessions the filters leave, in their order. */
export function filterWorkspaceCalendar<T extends WorkspaceCalendarSession>(
  sessions: readonly T[],
  filters: WorkspaceCalendarFilters,
): T[] {
  const { trainerIds = [], types = [], includeCancelled = true } = filters;
  return sessions.filter(
    (session) =>
      (trainerIds.length === 0 ||
        (session.trainerId !== null && trainerIds.includes(session.trainerId))) &&
      (types.length === 0 || (session.type !== 'open_gym' && types.includes(session.type))) &&
      (includeCancelled || session.status !== 'cancelled'),
  );
}

/**
 * The sessions that start on `date` (`YYYY-MM-DD`) on the wall clock of `timeZone`, in time order,
 * cancelled ones included: a session that crosses midnight is the day it began. `undefined` when
 * `date` is no calendar date.
 */
export function sessionsOfDay<T extends WorkspaceCalendarSession>(
  sessions: readonly T[],
  date: string,
  timeZone: string,
): T[] | undefined {
  const day = localDayBounds(date, timeZone);
  if (!day) return undefined;
  return orderPersonalSessions(
    sessions.filter((session) => session.startsAt >= day.start && session.startsAt < day.end),
  );
}

/**
 * The time *Aandacht nodig* looks at: from `now` to the end of the `ATTENTION_DAYS`-th day, today
 * counted, on the wall clock of `timeZone`. `undefined` for a zone the runtime does not know.
 */
export function attentionWindow(
  now: Date,
  timeZone: string,
): { readonly from: Date; readonly to: Date } | undefined {
  const last = localDayBounds(addDays(localDateOf(now, timeZone), ATTENTION_DAYS - 1), timeZone);
  return last ? { from: now, to: last.end } : undefined;
}

/**
 * The sessions that need a trainer (*Aandacht nodig*, the owner's decision of 9 November 2026 on
 * #540): a class date or a private session that takes place, has no trainer (a class date made
 * without one, or a private session whose trainer was removed) and starts inside
 * `attentionWindow`, in time order. A session that has begun is no longer one to assign; Open Gym
 * has no trainer to assign.
 */
export function sessionsWithoutTrainer<T extends WorkspaceCalendarSession>(
  sessions: readonly T[],
  now: Date,
  timeZone: string,
): T[] {
  const window = attentionWindow(now, timeZone);
  if (!window) return [];
  return orderPersonalSessions(
    sessions.filter(
      (session) =>
        (session.type === 'group' || session.type === 'private') &&
        session.status === 'scheduled' &&
        session.trainerId === null &&
        session.startsAt >= window.from &&
        session.startsAt < window.to,
    ),
  );
}
