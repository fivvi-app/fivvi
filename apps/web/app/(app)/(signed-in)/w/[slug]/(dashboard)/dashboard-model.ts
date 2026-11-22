import type { Schemas } from '@fivvi/contract';
import { layoutOverlaps, weekAxis } from '@fivvi/domain/calendar-grid';

/** A session of the day as the API answers it (`GET /v1/workspaces/{workspaceId}/day`). */
export type DaySession = Schemas['WorkspaceCalendarSession'];

const taking = (item: DaySession) => item.status === 'scheduled' && item.type !== 'open_gym';

/**
 * The numbers of the tiles *Sessies vandaag* and *Groepsplekken* (WC-01): what is planned today
 * (a cancelled session does not count) and how much of it is over; the places of the classes of
 * the day. Open Gym comes later (`PRODUCT.md §53`) and is in no count.
 */
export function dayFigures(items: readonly DaySession[], now: Date) {
  const planned = items.filter(taking);
  const classes = planned.filter((item) => item.type === 'group');
  return {
    done: planned.filter((item) => new Date(item.endsAt) <= now).length,
    total: planned.length,
    groupBooked: classes.reduce((sum, item) => sum + (item.booked ?? 0), 0),
    groupCapacity: classes.reduce((sum, item) => sum + item.capacity, 0),
    hasGroup: classes.length > 0,
  };
}

/** *Nog vandaag*: what has not ended yet, in the API's time order; cancelled sessions are not. */
export function stillToday(items: readonly DaySession[], now: Date): DaySession[] {
  return items.filter((item) => taking(item) && new Date(item.endsAt) > now);
}

/** Whether the day has more than one kind of session: only then are the types said in words. */
export function hasMixedKinds(items: readonly DaySession[]): boolean {
  return new Set(items.filter(taking).map((item) => item.type)).size > 1;
}

/**
 * Whether the Owner gets the toggle *Mijn dag | {workspace}*: the Owner has a trainer profile
 * (*Mijn dag* is the list of the sessions they teach) and somebody else trains in the workspace.
 * A solo PT has no toggle.
 */
export function toggleShown(input: {
  trains: boolean;
  trainerIds: readonly string[];
  ownId: string;
}): boolean {
  return input.trains && input.trainerIds.some((id) => id !== input.ownId);
}

export interface LaneBlock {
  item: DaySession;
  /** Where the block starts and how long it is, as a share of the hours shown (0–100). */
  left: number;
  width: number;
  /** The row of the lane the block sits in: sessions at the same time sit under each other. */
  row: number;
}

export interface Lane {
  key: string;
  /** None for the lane of the sessions that have no trainer. */
  trainer?: { id: string; name: string };
  /** The lane of the signed-in Owner (*Jij*). */
  own: boolean;
  blocks: LaneBlock[];
  /** The rows the sessions at the same time need. */
  rows: number;
}

export interface LaneTimeline {
  firstHour: number;
  endHour: number;
  /** A mark for every full hour, `hour` being its place on the axis. */
  hours: { hour: number; label: string; left: number }[];
  lanes: Lane[];
}

const NO_TRAINER = 'none';
const MIN_HOURS = 4;
const pad = (hour: number) => String(hour).padStart(2, '0');

/**
 * The lanes of *Vandaag bij {workspace}* (WC-01): one per trainer, the signed-in person's first
 * and the sessions without a trainer last, on one time axis from the first full hour of the day's
 * first session to the last full hour of its last (at least four hours). Sessions of one trainer
 * at the same time are laid under each other in the lane (`layoutOverlaps`). The axis is the
 * day's (`date`, `YYYY-MM-DD`) and follows the clock of `timeZone`, also on the day the
 * clocks change (`weekAxis`).
 */
export function laneTimeline(
  items: readonly DaySession[],
  date: string,
  timeZone: string,
  ownTeamMemberId: string,
): LaneTimeline | undefined {
  const shown = items.filter((item) => item.type !== 'open_gym');
  if (shown.length === 0) return undefined;
  const axis = weekAxis([date], timeZone);
  const placed = shown.map((item) => ({
    item,
    startMinute: axis.minute(date, new Date(item.startsAt)),
    endMinute: axis.minute(date, new Date(item.endsAt)),
  }));
  const firstHour = Math.floor(Math.min(...placed.map((entry) => entry.startMinute)) / 60);
  const lastHour = Math.ceil(Math.max(...placed.map((entry) => entry.endMinute)) / 60);
  const endHour = Math.min(
    Math.max(lastHour, firstHour + MIN_HOURS),
    Math.ceil(axis.totalMinutes / 60),
  );
  const range = (endHour - firstHour) * 60;
  const share = (minute: number) => ((minute - firstHour * 60) / range) * 100;

  const keys = [...new Set(shown.map((item) => item.trainer?.id ?? NO_TRAINER))];
  const lanes = keys.map((key): Lane => {
    const inLane = placed.filter((entry) => (entry.item.trainer?.id ?? NO_TRAINER) === key);
    const blocks = layoutOverlaps(inLane).map(
      (entry): LaneBlock => ({
        item: entry.item,
        left: share(entry.startMinute),
        width: share(entry.endMinute) - share(entry.startMinute),
        row: entry.lane,
      }),
    );
    const trainer = inLane[0]?.item.trainer;
    return {
      key,
      ...(trainer ? { trainer } : {}),
      own: key === ownTeamMemberId,
      blocks,
      rows: Math.max(1, ...blocks.map((block) => block.row + 1)),
    };
  });
  const order = (lane: Lane) => (lane.own ? 0 : lane.trainer ? 1 : 2);
  lanes.sort(
    (a, b) => order(a) - order(b) || (a.trainer?.name ?? '').localeCompare(b.trainer?.name ?? ''),
  );
  return {
    firstHour,
    endHour,
    hours: Array.from({ length: endHour - firstHour + 1 }, (_, index) => ({
      hour: firstHour + index,
      label: `${pad(axis.labelHour(firstHour + index))}:00`,
      left: (index / (endHour - firstHour)) * 100,
    })),
    lanes,
  };
}
