import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  type CalendarFilters,
  capOverlaps,
  clockChangeOn,
  filterCalendarItems,
  layoutOverlaps,
  mondayOf,
  placeInDay,
  weekAxis,
  weekDates,
} from './calendar-grid.ts';

// F013 (spec #457, ticket #523): the rules behind the week grid of *Mijn agenda*, shared with the
// workspace calendar of F014 (WC-02): Monday first, the day a block sits in and where, blocks that
// overlap, the DST day headers and the filters. Pure, in the wall clock of the zone (ADR-012).

describe('F013 week: Monday first', () => {
  it('finds the Monday of any day of the week, a Sunday included', () => {
    expect(mondayOf('2026-09-22')).toBe('2026-09-21');
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });

  it('lists the seven dates of the week of a day, over a month end and the clock change', () => {
    expect(weekDates('2026-10-25')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(weekDates('2026-09-30')[6]).toBe('2026-10-04');
  });
});

describe('F013 AC6: the day header of a clock change', () => {
  it('names Sunday 25 October 2026 as the day the clocks go back, 29 March as forward', () => {
    expect(clockChangeOn('2026-10-25', AMSTERDAM)).toBe('back');
    expect(clockChangeOn('2027-03-28', AMSTERDAM)).toBe('forward');
  });

  it('names no other day', () => {
    expect(clockChangeOn('2026-10-24', AMSTERDAM)).toBeUndefined();
    expect(clockChangeOn('2026-10-26', AMSTERDAM)).toBeUndefined();
    expect(clockChangeOn('2026-10-25', 'Asia/Tokyo')).toBeUndefined();
  });
});

describe('F013 AC10: where a block sits', () => {
  it('puts a session on the wall clock of the zone: day, start and end in minutes', () => {
    // 09:00 summer time in Amsterdam is 07:00 UTC.
    expect(
      placeInDay(new Date('2026-09-22T07:00:00Z'), new Date('2026-09-22T08:00:00Z'), AMSTERDAM),
    ).toEqual({ date: '2026-09-22', startMinute: 540, endMinute: 600 });
  });

  it('keeps the wall-clock time after the clocks go back', () => {
    // 18:00 on 27 October is winter time: 17:00 UTC.
    expect(
      placeInDay(new Date('2026-10-27T17:00:00Z'), new Date('2026-10-27T18:00:00Z'), AMSTERDAM),
    ).toEqual({ date: '2026-10-27', startMinute: 1080, endMinute: 1140 });
  });

  it('ends a session that runs past midnight at the end of its own day', () => {
    expect(
      placeInDay(new Date('2026-09-22T21:30:00Z'), new Date('2026-09-22T22:30:00Z'), AMSTERDAM),
    ).toEqual({ date: '2026-09-22', startMinute: 1410, endMinute: 1440 });
  });
});

describe('F013 AC10: blocks that overlap sit side by side', () => {
  const block = (id: string, startMinute: number, endMinute: number) => ({
    id,
    startMinute,
    endMinute,
  });

  it('leaves blocks that do not touch full width', () => {
    expect(layoutOverlaps([block('a', 540, 600), block('b', 600, 660)])).toEqual([
      { id: 'a', startMinute: 540, endMinute: 600, lane: 0, lanes: 1 },
      { id: 'b', startMinute: 600, endMinute: 660, lane: 0, lanes: 1 },
    ]);
  });

  it('puts two overlapping blocks in two lanes, in the order they start', () => {
    const placed = layoutOverlaps([block('b', 570, 630), block('a', 540, 600)]);
    expect(placed.map(({ id, lane, lanes }) => [id, lane, lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  it('shares the lane count inside a chain of overlaps and not with the block after it', () => {
    const placed = layoutOverlaps([
      block('a', 540, 600),
      block('b', 570, 660),
      block('c', 630, 700),
      block('d', 720, 780),
    ]);
    expect(placed.map(({ id, lane, lanes }) => [id, lane, lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
      ['d', 0, 1],
    ]);
  });
});

describe('F013 AC10: the filters', () => {
  const item = (
    id: string,
    type: 'private' | 'group',
    workspaceId: string,
    status: 'scheduled' | 'cancelled' = 'scheduled',
  ) => ({ id, type, workspace: { id: workspaceId }, status });
  const items = [
    item('anna', 'private', 'personal'),
    item('mark', 'private', 'gym'),
    item('kracht', 'group', 'gym'),
    item('kracht-cancelled', 'group', 'gym', 'cancelled'),
  ];
  const all: CalendarFilters = { hiddenTypes: [], hiddenWorkspaceIds: [], showCancelled: true };
  const ids = (shown: readonly { id: string }[]) => shown.map(({ id }) => id);

  it('shows everything by default, the cancelled ones too', () => {
    expect(ids(filterCalendarItems(items, all))).toEqual([
      'anna',
      'mark',
      'kracht',
      'kracht-cancelled',
    ]);
  });

  it('with only Groepsles left the two Kracht blocks stay', () => {
    expect(ids(filterCalendarItems(items, { ...all, hiddenTypes: ['private'] }))).toEqual([
      'kracht',
      'kracht-cancelled',
    ]);
  });

  it('with Geannuleerde tonen off the cancelled one goes', () => {
    expect(ids(filterCalendarItems(items, { ...all, showCancelled: false }))).toEqual([
      'anna',
      'mark',
      'kracht',
    ]);
  });

  it('with only the personal workspace left Anna stays; a workspace that is new is shown', () => {
    expect(ids(filterCalendarItems(items, { ...all, hiddenWorkspaceIds: ['gym'] }))).toEqual([
      'anna',
    ]);
    expect(ids(filterCalendarItems(items, { ...all, hiddenWorkspaceIds: ['gone'] }))).toHaveLength(
      4,
    );
  });
});

// F014 (spec #458, ticket #529): the hour axis of a week with a clock change, and the cap on
// blocks side by side.
describe('F014 AC13: repeated and skipped hours', () => {
  const at = (iso: string) => new Date(iso);

  it('an ordinary week has the wall clock as its axis', () => {
    const axis = weekAxis(weekDates('2026-09-22'), AMSTERDAM);
    expect(axis.minute('2026-09-22', at('2026-09-22T08:00:00Z'))).toBe(600);
    expect(axis.labelHour(10)).toBe(10);
    expect(axis.totalMinutes).toBe(1440);
  });

  it('a week that ends with the clocks going back shows 02:00 twice, on 25 October', () => {
    const axis = weekAxis(weekDates('2026-10-25'), AMSTERDAM);
    expect(axis.totalMinutes).toBe(1500);
    // 02:30 summer time (00:30Z), 02:30 winter time (01:30Z), then 03:00 (02:00Z).
    expect(axis.minute('2026-10-25', at('2026-10-25T00:30:00Z'))).toBe(150);
    expect(axis.minute('2026-10-25', at('2026-10-25T01:30:00Z'))).toBe(210);
    expect(axis.minute('2026-10-25', at('2026-10-25T02:00:00Z'))).toBe(240);
    expect([2, 3, 4].map(axis.labelHour)).toEqual([2, 2, 3]);
    // The other days keep their hours, one row lower from 03:00 on: Tuesday 10:00 is 09:00Z.
    expect(axis.minute('2026-10-20', at('2026-10-20T08:00:00Z'))).toBe(660);
    expect(axis.labelHour(11)).toBe(10);
  });

  it('a week that ends with the clocks going forward skips 02:00, on 28 March', () => {
    const axis = weekAxis(weekDates('2027-03-28'), AMSTERDAM);
    expect(axis.totalMinutes).toBe(1380);
    // 01:30 (00:30Z), then 03:30 summer time (01:30Z) comes straight after 02:30's row would have.
    expect(axis.minute('2027-03-28', at('2027-03-28T00:30:00Z'))).toBe(90);
    expect(axis.minute('2027-03-28', at('2027-03-28T01:30:00Z'))).toBe(150);
    expect([1, 2].map(axis.labelHour)).toEqual([1, 3]);
    expect(axis.minute('2027-03-23', at('2027-03-23T09:00:00Z'))).toBe(540);
    expect(axis.labelHour(9)).toBe(10);
  });

  it('a session that runs past midnight ends at the end of its own day', () => {
    const axis = weekAxis(weekDates('2026-10-25'), AMSTERDAM);
    expect(axis.minute('2026-10-25', at('2026-10-25T23:30:00Z'))).toBe(1500);
    expect(axis.minute('2026-10-20', at('2026-10-20T23:30:00Z'))).toBe(1500);
  });
});

describe('F014 WC-06, WC-07: the wall-clock time of a place in the grid', () => {
  it('an ordinary week reads the grid minute as the wall clock', () => {
    const axis = weekAxis(weekDates('2026-09-22'), AMSTERDAM);
    expect(axis.wallTime('2026-09-22', 0)).toBe('00:00');
    expect(axis.wallTime('2026-09-22', 14 * 60 + 15)).toBe('14:15');
    expect(axis.wallTime('2026-09-22', 1440)).toBeUndefined();
  });

  it('turns the repeated hour of 25 October back into the wall clock and finds none in the other days gap', () => {
    const axis = weekAxis(weekDates('2026-10-25'), AMSTERDAM);
    // The changing day counts elapsed time: 03:00 winter time is the 241st minute after the second 02:00.
    expect(axis.wallTime('2026-10-25', 150)).toBe('02:30');
    expect(axis.wallTime('2026-10-25', 240)).toBe('03:00');
    expect(axis.wallTime('2026-10-25', 600)).toBe('09:00');
    // The other days sit one row lower from 03:00 on, and the extra row (03:00-04:00 of the grid) holds nothing.
    expect(axis.wallTime('2026-10-20', 660)).toBe('10:00');
    expect(axis.wallTime('2026-10-20', 120)).toBe('02:00');
    expect(axis.wallTime('2026-10-20', 200)).toBeUndefined();
  });

  it('skips 02:00 on 28 March', () => {
    const axis = weekAxis(weekDates('2027-03-28'), AMSTERDAM);
    expect(axis.wallTime('2027-03-28', 90)).toBe('01:30');
    expect(axis.wallTime('2027-03-28', 120)).toBe('03:00');
    expect(axis.wallTime('2027-03-23', 540)).toBe('10:00');
    expect(axis.wallTime('2027-03-23', 60)).toBe('01:00');
  });

  it('is the inverse of minute() for every quarter hour of an ordinary day', () => {
    const axis = weekAxis(weekDates('2026-09-22'), AMSTERDAM);
    for (let minute = 0; minute < 1440; minute += 15) {
      const time = axis.wallTime('2026-09-22', minute) ?? '';
      const instant = new Date(
        Date.UTC(2026, 8, 22, Number(time.slice(0, 2)) - 2, Number(time.slice(3, 5))),
      );
      expect(axis.minute('2026-09-22', instant)).toBe(minute);
    }
  });
});

describe('F014 WC-02: up to 3 overlapping blocks, then +{n} meer', () => {
  const block = (startMinute: number, endMinute: number) => ({ startMinute, endMinute });

  it('leaves a group of up to 3 as it is', () => {
    const placed = layoutOverlaps([block(600, 660), block(600, 660), block(600, 660)]);
    expect(capOverlaps(placed, 3)).toEqual({ shown: placed, more: [] });
  });

  it('shows 3 lanes of a bigger group and counts the rest in a lane of their own', () => {
    const placed = layoutOverlaps([
      block(600, 660),
      block(600, 660),
      block(600, 660),
      block(615, 660),
      block(630, 700),
      block(800, 860),
    ]);
    const { shown, more } = capOverlaps(placed, 3);
    expect(shown.filter((entry) => entry.startMinute === 600)).toHaveLength(3);
    expect(shown.filter((entry) => entry.lanes === 4)).toHaveLength(3);
    expect(more).toEqual([{ startMinute: 615, endMinute: 700, count: 2, lane: 3, lanes: 4 }]);
    // The block that overlaps nothing keeps the whole width.
    expect(shown.find((entry) => entry.startMinute === 800)).toMatchObject({ lane: 0, lanes: 1 });
  });
});
