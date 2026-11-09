import { AMSTERDAM, dstTransitions, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  decidePersonalRange,
  mergePersonalDay,
  PERSONAL_RANGE_MAX_DAYS,
  type PersonalSessionTimes,
} from './personal-day.ts';

// F013 (spec #457): the personal day of a trainer who works in several workspaces. Synthetic
// people: Sarah is a Trainer at John's Gym and the Owner of Sarah Personal Training; Tom trains
// at John's Gym only. Tuesday 22 September 2026, Europe/Amsterdam (summer time).

interface Item extends PersonalSessionTimes {
  readonly workspace: string;
  readonly label: string;
}

const PT = 'sarah-personal-training';
const GYM = 'johns-gym';

function item(
  workspace: string,
  label: string,
  start: string,
  end: string,
  status: Item['status'] = 'scheduled',
): Item {
  return {
    sessionId: `${label}@${start}`,
    workspace,
    label,
    startsAt: zonedTime(start),
    endsAt: zonedTime(end),
    status,
  };
}

/** Sarah's Tuesday: Anna 09:00, Mark 11:00, Kracht 15:00 and a cancelled Kracht 18:00. */
const SARAH_PT = [item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00')];
const SARAH_GYM = [
  item(GYM, 'Kracht', '2026-09-22T18:00', '2026-09-22T19:00', 'cancelled'),
  item(GYM, 'Kracht', '2026-09-22T15:00', '2026-09-22T16:00'),
  item(GYM, 'Mark', '2026-09-22T11:00', '2026-09-22T12:00'),
];

const labels = (items: readonly Item[]) => items.map((entry) => entry.label);

describe('F013 the personal day', () => {
  it('AC1: next-up card and today’s items in order', () => {
    const day = mergePersonalDay([SARAH_GYM, SARAH_PT], zonedTime('2026-09-22T08:35'), AMSTERDAM);

    // Every workspace's items in one list, by time: the cancelled Kracht stays, last.
    expect(labels(day.items)).toEqual(['Anna', 'Mark', 'Kracht', 'Kracht']);
    expect(day.items.map((entry) => entry.status)).toEqual([
      'scheduled',
      'scheduled',
      'scheduled',
      'cancelled',
    ]);
    expect(day.date).toBe('2026-09-22');
    // "4 sessies · 09:00–19:00": the cancelled class counts, and its end closes the range.
    expect(day.summary).toEqual({
      count: 4,
      firstStartsAt: zonedTime('2026-09-22T09:00'),
      lastEndsAt: zonedTime('2026-09-22T19:00'),
    });
    // "Straks · over 25 min": Anna.
    expect(day.next).toEqual({
      sessionId: 'Anna@2026-09-22T09:00',
      state: 'upcoming',
      startsInMinutes: 25,
    });
  });

  it('AC1: says "Nu bezig" while an item runs, and moves on once it has ended', () => {
    const running = mergePersonalDay(
      [SARAH_GYM, SARAH_PT],
      zonedTime('2026-09-22T09:30'),
      AMSTERDAM,
    );
    const between = mergePersonalDay(
      [SARAH_GYM, SARAH_PT],
      zonedTime('2026-09-22T10:00'),
      AMSTERDAM,
    );

    expect(running.next).toEqual({
      sessionId: 'Anna@2026-09-22T09:00',
      state: 'in-progress',
      startsInMinutes: 0,
    });
    // Anna ended at 10:00 sharp: Mark is next, in 60 minutes.
    expect(between.next).toEqual({
      sessionId: 'Mark@2026-09-22T11:00',
      state: 'upcoming',
      startsInMinutes: 60,
    });
  });

  it('AC1: rounds the countdown up, so "over 0 min" is never shown for an item that has not begun', () => {
    const day = mergePersonalDay(
      [SARAH_PT],
      new Date(zonedTime('2026-09-22T08:59').getTime() + 30_000),
      AMSTERDAM,
    );

    expect(day.next).toMatchObject({ state: 'upcoming', startsInMinutes: 1 });
  });

  it('AC1: never offers a cancelled item as next, and offers nothing after the last item', () => {
    const afterKracht = mergePersonalDay(
      [SARAH_GYM, SARAH_PT],
      zonedTime('2026-09-22T16:30'),
      AMSTERDAM,
    );
    const evening = mergePersonalDay(
      [SARAH_GYM, SARAH_PT],
      zonedTime('2026-09-22T20:00'),
      AMSTERDAM,
    );

    // Only the cancelled 18:00 is left: nothing to be at.
    expect(afterKracht.next).toBeNull();
    expect(evening.next).toBeNull();
    // The list and the summary still hold all four.
    expect(evening.items).toHaveLength(4);
    expect(evening.summary.count).toBe(4);
  });

  it('lists overlapping items in order, with no warning', () => {
    const overlapping = [
      item(GYM, 'B', '2026-09-22T09:30', '2026-09-22T10:30'),
      item(PT, 'A', '2026-09-22T09:00', '2026-09-22T10:00'),
    ];

    const day = mergePersonalDay(
      [overlapping.slice(0, 1), overlapping.slice(1)],
      zonedTime('2026-09-22T08:00'),
      AMSTERDAM,
    );

    expect(labels(day.items)).toEqual(['A', 'B']);
  });

  it('puts items that start together in a fixed order, whatever order they came in', () => {
    const a = item(GYM, 'A', '2026-09-22T09:00', '2026-09-22T10:00');
    const b = item(PT, 'B', '2026-09-22T09:00', '2026-09-22T09:45');
    const now = zonedTime('2026-09-22T08:00');

    expect(labels(mergePersonalDay([[a], [b]], now, AMSTERDAM).items)).toEqual(['B', 'A']);
    expect(labels(mergePersonalDay([[b], [a]], now, AMSTERDAM).items)).toEqual(['B', 'A']);
  });

  it('the day to show is a parameter; the next-up card belongs to today only', () => {
    const tomorrow = mergePersonalDay(
      [SARAH_GYM, SARAH_PT],
      zonedTime('2026-09-21T20:00'),
      AMSTERDAM,
      {
        date: '2026-09-22',
      },
    );

    expect(tomorrow.date).toBe('2026-09-22');
    expect(tomorrow.items).toHaveLength(4);
    expect(tomorrow.next).toBeNull();
  });

  it('refuses a date that is none', () => {
    expect(() =>
      mergePersonalDay([], zonedTime('2026-09-22T08:00'), AMSTERDAM, { date: '2026-02-30' }),
    ).toThrow(RangeError);
  });
});

describe('F013 empty states and the tomorrow line', () => {
  const NOW = zonedTime('2026-09-22T08:35');

  it('AC5: an empty day has no summary range, no next item and no tomorrow line', () => {
    const day = mergePersonalDay([[], []], NOW, AMSTERDAM);

    expect(day.items).toEqual([]);
    expect(day.summary).toEqual({ count: 0, firstStartsAt: null, lastEndsAt: null });
    expect(day.next).toBeNull();
    expect(day.tomorrow).toBeNull();
  });

  it('AC5: with 3 sessions from 07:00 tomorrow the footer says 3 sessions, the first at 07:00', () => {
    const wednesday = [
      item(GYM, 'Late', '2026-09-23T17:00', '2026-09-23T18:00'),
      item(GYM, 'Early', '2026-09-23T07:00', '2026-09-23T08:00'),
      item(PT, 'Mid', '2026-09-23T12:00', '2026-09-23T13:00'),
    ];

    const day = mergePersonalDay([wednesday, SARAH_PT], NOW, AMSTERDAM);

    expect(day.tomorrow).toEqual({
      date: '2026-09-23',
      count: 3,
      firstStartsAt: zonedTime('2026-09-23T07:00'),
    });
    // Tomorrow's items are not today's.
    expect(labels(day.items)).toEqual(['Anna']);
  });

  it('AC5: tomorrow’s cancelled sessions are not something to prepare for: the line counts the ones that take place', () => {
    const wednesday = [
      item(GYM, 'Cancelled', '2026-09-23T07:00', '2026-09-23T08:00', 'cancelled'),
      item(GYM, 'Kracht', '2026-09-23T09:00', '2026-09-23T10:00'),
    ];

    const day = mergePersonalDay([wednesday], NOW, AMSTERDAM);

    expect(day.tomorrow).toEqual({
      date: '2026-09-23',
      count: 1,
      firstStartsAt: zonedTime('2026-09-23T09:00'),
    });
  });

  it('AC5: only cancelled sessions tomorrow is no tomorrow line', () => {
    const wednesday = [item(GYM, 'Cancelled', '2026-09-23T07:00', '2026-09-23T08:00', 'cancelled')];

    expect(mergePersonalDay([wednesday], NOW, AMSTERDAM).tomorrow).toBeNull();
  });

  it('AC5: sessions of the day after tomorrow or of yesterday are neither today’s nor tomorrow’s', () => {
    const others = [
      item(GYM, 'Yesterday', '2026-09-21T09:00', '2026-09-21T10:00'),
      item(GYM, 'Thursday', '2026-09-24T09:00', '2026-09-24T10:00'),
    ];

    const day = mergePersonalDay([others], NOW, AMSTERDAM);

    expect(day.items).toEqual([]);
    expect(day.tomorrow).toBeNull();
  });
});

describe('F013 midnight', () => {
  it('AC5: the day rolls over at local midnight, not at midnight UTC', () => {
    const tuesday = [item(PT, 'Late', '2026-09-22T23:30', '2026-09-23T00:30')];
    const wednesday = [item(PT, 'Early', '2026-09-23T00:15', '2026-09-23T01:00')];
    const items = [[...tuesday, ...wednesday]];

    const justBefore = mergePersonalDay(items, zonedTime('2026-09-22T23:59'), AMSTERDAM);
    const justAfter = mergePersonalDay(items, zonedTime('2026-09-23T00:00'), AMSTERDAM);

    expect(justBefore.date).toBe('2026-09-22');
    expect(labels(justBefore.items)).toEqual(['Late']);
    expect(justBefore.tomorrow?.firstStartsAt).toEqual(zonedTime('2026-09-23T00:15'));
    // At 00:00 it is Wednesday: the session that began on Tuesday evening belongs to Tuesday.
    expect(justAfter.date).toBe('2026-09-23');
    expect(labels(justAfter.items)).toEqual(['Early']);
  });

  it('AC5: a session that starts at midnight belongs to the new day', () => {
    const items = [[item(PT, 'Midnight', '2026-09-23T00:00', '2026-09-23T01:00')]];

    expect(mergePersonalDay(items, zonedTime('2026-09-22T12:00'), AMSTERDAM).items).toEqual([]);
    expect(mergePersonalDay(items, zonedTime('2026-09-23T12:00'), AMSTERDAM).items).toHaveLength(1);
  });
});

describe('F013 daylight saving time', () => {
  it('AC6: wall-clock times across 25 October 2026: a class at 18:00 is at 18:00 on 20 October and 27 October', () => {
    const { fallBack } = dstTransitions(2026);
    expect(fallBack.date).toBe('2026-10-25');
    const weekly = [
      item(GYM, 'Kracht', '2026-10-20T18:00', '2026-10-20T19:00'),
      item(GYM, 'Kracht', '2026-10-27T18:00', '2026-10-27T19:00'),
    ];

    // The stored instants differ by 7 days and one hour; the wall clock does not.
    expect(weekly[1]?.startsAt.getTime()).toBe(
      (weekly[0]?.startsAt.getTime() ?? 0) + (7 * 24 + 1) * 3_600_000,
    );
    for (const [date, utc] of [
      ['2026-10-20', '2026-10-20T16:00:00.000Z'],
      ['2026-10-27', '2026-10-27T17:00:00.000Z'],
    ] as const) {
      const day = mergePersonalDay([weekly], zonedTime(`${date}T08:00`), AMSTERDAM);
      expect(day.items).toHaveLength(1);
      expect(day.items[0]?.startsAt.toISOString()).toBe(utc);
    }
  });

  it('AC6: the 25-hour day of 25 October holds its early and its late sessions, and the neighbours stay out', () => {
    const items = [
      [
        item(GYM, 'Saturday', '2026-10-24T23:30', '2026-10-25T00:30'),
        item(GYM, 'Early', '2026-10-25T00:30', '2026-10-25T01:30'),
        // 02:30 happens twice that night; the second one is an hour after the first.
        {
          sessionId: 'second-02:30',
          workspace: GYM,
          label: 'Second 02:30',
          status: 'scheduled' as const,
          startsAt: new Date('2026-10-25T01:30:00.000Z'),
          endsAt: new Date('2026-10-25T02:30:00.000Z'),
        },
        item(GYM, 'Evening', '2026-10-25T23:30', '2026-10-26T00:30'),
        item(GYM, 'Monday', '2026-10-26T00:00', '2026-10-26T01:00'),
      ],
    ];

    const day = mergePersonalDay(items, zonedTime('2026-10-25T08:00'), AMSTERDAM);

    expect(labels(day.items)).toEqual(['Early', 'Second 02:30', 'Evening']);
    expect(day.tomorrow?.date).toBe('2026-10-26');
    expect(day.tomorrow?.firstStartsAt).toEqual(zonedTime('2026-10-26T00:00'));
  });

  it('AC6: counts the minutes to the next item in elapsed time across the change', () => {
    // 01:30 Amsterdam (summer time) to 03:30 (winter time) on 25 October is 3 hours of elapsed time.
    const items = [[item(GYM, 'Dawn', '2026-10-25T03:30', '2026-10-25T04:30')]];
    const now = new Date('2026-10-24T23:30:00.000Z');

    const day = mergePersonalDay(items, now, AMSTERDAM);

    expect(day.next).toMatchObject({ state: 'upcoming', startsInMinutes: 180 });
  });
});

describe('F013 the range of the week and month views', () => {
  it('AC6: a week is its first day to the start of the day after its last', () => {
    expect(decidePersonalRange('2026-10-19', '2026-10-25', AMSTERDAM)).toEqual({
      outcome: 'range',
      days: 7,
      start: new Date('2026-10-18T22:00:00.000Z'),
      // 25 October is 25 hours long: the range ends at midnight in winter time.
      end: new Date('2026-10-25T23:00:00.000Z'),
    });
  });

  it('allows one day and 42 days, and no more', () => {
    expect(decidePersonalRange('2026-09-22', '2026-09-22', AMSTERDAM)).toMatchObject({ days: 1 });
    expect(PERSONAL_RANGE_MAX_DAYS).toBe(42);
    expect(decidePersonalRange('2026-09-01', '2026-10-12', AMSTERDAM)).toMatchObject({ days: 42 });
    expect(decidePersonalRange('2026-09-01', '2026-10-13', AMSTERDAM)).toEqual({
      outcome: 'refused',
      reason: 'too-long',
    });
  });

  it('refuses dates that are none and a range that ends before it starts', () => {
    expect(decidePersonalRange('2026-02-30', '2026-03-05', AMSTERDAM)).toEqual({
      outcome: 'refused',
      reason: 'invalid-from',
    });
    expect(decidePersonalRange('2026-03-01', '2026-13-05', AMSTERDAM)).toEqual({
      outcome: 'refused',
      reason: 'invalid-to',
    });
    expect(decidePersonalRange('2026-09-22', '2026-09-21', AMSTERDAM)).toEqual({
      outcome: 'refused',
      reason: 'to-before-from',
    });
  });
});
