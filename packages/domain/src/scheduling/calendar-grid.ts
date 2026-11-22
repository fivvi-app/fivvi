// Module: The rules behind a calendar grid with days in columns: Monday first, where a session sits in its day, overlapping blocks, the day the clocks change and the filters.
// Spec: F013, F014 (workspace calendar WC-02)

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

/** The blocks shown, and for each stretch with more blocks side by side than fit, the ones left out. */
export interface CappedOverlaps<T> {
  readonly shown: (T & { readonly lane: number; readonly lanes: number })[];
  /** *+{n} meer*: a lane of its own beside the shown ones, from the first hidden block to the last. */
  readonly more: readonly {
    readonly startMinute: number;
    readonly endMinute: number;
    readonly count: number;
    readonly lane: number;
    readonly lanes: number;
  }[];
}

/**
 * Up to `max` blocks side by side (WC-02: 3), then *+{n} meer*: of a group of overlapping blocks
 * (as `layoutOverlaps` laid them out) that needs more lanes, the first `max` lanes stay and the
 * others are counted in one more lane, which the shown blocks leave room for.
 */
export function capOverlaps<T extends OverlapBlock & { lane: number; lanes: number }>(
  placed: readonly T[],
  max: number,
): CappedOverlaps<T> {
  const shown: CappedOverlaps<T>['shown'] = [];
  const more: {
    startMinute: number;
    endMinute: number;
    count: number;
    lane: number;
    lanes: number;
  }[] = [];
  const groups: T[][] = [];
  let groupEnd = -1;
  for (const block of placed) {
    if (groups.length === 0 || block.startMinute >= groupEnd) groups.push([]);
    groups[groups.length - 1]?.push(block);
    groupEnd = Math.max(groupEnd, block.endMinute);
  }
  for (const group of groups) {
    const hidden = group.filter(({ lane }) => lane >= max);
    if (hidden.length === 0) {
      shown.push(...group);
      continue;
    }
    for (const block of group) if (block.lane < max) shown.push({ ...block, lanes: max + 1 });
    more.push({
      startMinute: Math.min(...hidden.map(({ startMinute }) => startMinute)),
      endMinute: Math.max(...hidden.map(({ endMinute }) => endMinute)),
      count: hidden.length,
      lane: max,
      lanes: max + 1,
    });
  }
  return { shown, more };
}

/**
 * The hours of a week's grid (WC-02, AC13): rows follow the clock, except that a week with a clock
 * change has the hour that is repeated (25 October) as a second row, and the hour that is skipped
 * (28 March) as none, so a block's height is its real duration. A grid minute counts from the
 * start of the day: on the changing day in elapsed time, on the other days in wall-clock time
 * moved by the change from 03:00 on.
 */
export interface WeekAxis {
  /** The grid minute of `instant` in the column of `date`; the end of the column for a later day. */
  minute(date: string, instant: Date): number;
  /** The wall-clock hour the row of grid hour `gridHour` is marked with. */
  labelHour(gridHour: number): number;
  /** The length of a column: 1440, or 1500 / 1380 in a week with a clock change. */
  readonly totalMinutes: number;
}

export function weekAxis(dates: readonly string[], timeZone: string): WeekAxis {
  const changing = dates.find((date) => clockChangeOn(date, timeZone));
  const back = changing !== undefined && clockChangeOn(changing, timeZone) === 'back';
  const shift = changing === undefined ? 0 : back ? 60 : -60;
  const totalMinutes = MINUTES_PER_DAY + shift;
  // The wall clock of the other days moves from 03:00 on; the skipped hour (02:00–03:00) has no row.
  const gridOf = (wall: number) =>
    back ? (wall < 180 ? wall : wall + 60) : wall < 120 ? wall : wall < 180 ? 120 : wall - 60;
  return {
    totalMinutes,
    labelHour: (hour) =>
      back ? (hour < 3 ? hour : hour - 1) : shift === 0 || hour < 2 ? hour : hour + 1,
    minute(date, instant) {
      const wall = instantToWallClock(instant, timeZone);
      if (wall.date !== date) return totalMinutes;
      if (date === changing) {
        const start = localDayBounds(date, timeZone)?.start.getTime() ?? 0;
        return Math.round((instant.getTime() - start) / 60_000);
      }
      return shift === 0 ? minutesOf(wall.time) : gridOf(minutesOf(wall.time));
    },
  };
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
