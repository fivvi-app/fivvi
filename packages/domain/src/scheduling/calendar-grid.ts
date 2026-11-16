import { addDays, instantToWallClock, localDayBounds } from './zoned-time.ts';

// The rules behind a calendar grid with days in columns (F013 *Mijn agenda*, spec #457, and
// F014's workspace calendar WC-02, which shares the grid): Monday first, where a session sits in
// its day, blocks that overlap, the day the clocks change and the filters. Pure and in the wall
// clock of a zone (ADR-012): the screens draw what this answers and decide none of it.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The Monday of the week `date` (`YYYY-MM-DD`) is in: weeks start on Monday in the Netherlands. */
export function mondayOf(date: string): string {
  const day = DATE.exec(date);
  if (!day) throw new RangeError(`Not a date: ${date}`);
  const weekday = new Date(
    Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])),
  ).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The seven dates of the week `date` is in, Monday first. */
export function weekDates(date: string): string[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** `forward`: the day has 23 hours (spring); `back`: it has 25 (autumn). */
export type ClockChange = 'forward' | 'back';

/** Whether the clocks change on `date` in `timeZone`: its length in hours tells (23 or 25). */
export function clockChangeOn(date: string, timeZone: string): ClockChange | undefined {
  const bounds = localDayBounds(date, timeZone);
  if (!bounds) return undefined;
  const hours = Math.round((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000);
  if (hours === 23) return 'forward';
  if (hours === 25) return 'back';
  return undefined;
}

const MINUTES_PER_DAY = 1440;

/** Where a session sits in a day grid: the calendar day and the minutes from midnight on its wall clock. */
export interface PlacedInDay {
  readonly date: string;
  readonly startMinute: number;
  /** At most 1440: a session that runs past midnight ends its block at the end of its own day. */
  readonly endMinute: number;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The day and minutes of `startsAt` to `endsAt` on the wall clock of `timeZone`. */
export function placeInDay(startsAt: Date, endsAt: Date, timeZone: string): PlacedInDay {
  const start = instantToWallClock(startsAt, timeZone);
  const end = instantToWallClock(endsAt, timeZone);
  const startMinute = minutesOf(start.time);
  const endMinute = end.date === start.date ? minutesOf(end.time) : MINUTES_PER_DAY;
  return { date: start.date, startMinute, endMinute: Math.max(endMinute, startMinute) };
}

/** A block in one day column, to be laid side by side with the ones it overlaps. */
export interface OverlapBlock {
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * Gives every block of one day column its lane and the number of lanes of the group it overlaps
 * with, so overlapping blocks share the width and the others keep all of it. The blocks come back
 * in the order they start. Blocks that only touch (one ends when the next starts) do not overlap.
 */
export function layoutOverlaps<T extends OverlapBlock>(
  blocks: readonly T[],
): (T & { readonly lane: number; readonly lanes: number })[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const placed: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const block of sorted) {
    if (group.length > 0 && block.startMinute >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= block.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.endMinute;
    const withLane = { ...block, lane, lanes: 1 };
    group.push(withLane);
    placed.push(withLane);
    groupEnd = Math.max(groupEnd, block.endMinute);
  }
  closeGroup();
  return placed;
}

/** The filters of a personal calendar: what is switched off, so what is new is shown. */
export interface CalendarFilters {
  readonly hiddenTypes: readonly ('private' | 'group')[];
  readonly hiddenWorkspaceIds: readonly string[];
  /** *Geannuleerde tonen*: on by default. */
  readonly showCancelled: boolean;
}

/** What a filter needs of an item. */
export interface FilterableItem {
  readonly type: 'private' | 'group';
  readonly status: 'scheduled' | 'cancelled';
  readonly workspace: { readonly id: string };
}

/** The items the filters leave, in their order. */
export function filterCalendarItems<T extends FilterableItem>(
  items: readonly T[],
  filters: CalendarFilters,
): T[] {
  return items.filter(
    (item) =>
      !filters.hiddenTypes.includes(item.type) &&
      !filters.hiddenWorkspaceIds.includes(item.workspace.id) &&
      (filters.showCancelled || item.status !== 'cancelled'),
  );
}
