import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  type CalendarFilters,
  clockChangeOn,
  filterCalendarItems,
  layoutOverlaps,
  mondayOf,
  placeInDay,
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
