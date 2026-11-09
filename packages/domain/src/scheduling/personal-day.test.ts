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
      done: 0,
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
    expect(day.summary).toEqual({
      count: 0,
      done: 0,
      firstStartsAt: null,
      lastEndsAt: null,
    });
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

// TD-01 (tickets #524, #525): the three facts the summary line and the *Mijn dag* card show, so the
// apps count and pick nothing themselves. Sarah's Tuesday, 22 September 2026, summer time.

describe('TD-01: the done count leaves cancelled items out', () => {
  const day = [
    item(GYM, 'Cancelled', '2026-09-22T08:00', '2026-09-22T09:00', 'cancelled'),
    item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
    item(GYM, 'Mark', '2026-09-22T10:30', '2026-09-22T11:30'),
  ];

  it('counts the items that take place and have ended', () => {
    expect(mergePersonalDay([day], zonedTime('2026-09-22T10:05'), AMSTERDAM).summary.done).toBe(1);
    expect(mergePersonalDay([day], zonedTime('2026-09-22T08:00'), AMSTERDAM).summary.done).toBe(0);
  });

  it('counts an item that ends at this very minute, and not one that still runs', () => {
    expect(mergePersonalDay([day], zonedTime('2026-09-22T10:00'), AMSTERDAM).summary.done).toBe(1);
    expect(mergePersonalDay([day], zonedTime('2026-09-22T09:59'), AMSTERDAM).summary.done).toBe(0);
  });

  it('never counts a cancelled item, however long ago it was', () => {
    const evening = mergePersonalDay([day], zonedTime('2026-09-22T23:00'), AMSTERDAM);

    expect(evening.summary.done).toBe(2);
    expect(evening.summary.count).toBe(3);
  });

  it('counts a past day whole and a coming day not at all', () => {
    expect(
      mergePersonalDay([day], zonedTime('2026-09-23T08:00'), AMSTERDAM, { date: '2026-09-22' })
        .summary.done,
    ).toBe(2);
    expect(
      mergePersonalDay([day], zonedTime('2026-09-21T20:00'), AMSTERDAM, { date: '2026-09-22' })
        .summary.done,
    ).toBe(0);
  });
});

describe('TD-01: the next free gap of 30 minutes or more', () => {
  const NOW = zonedTime('2026-09-22T08:35');
  const sessions = [
    item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
    item(GYM, 'Mark', '2026-09-22T11:00', '2026-09-22T12:00'),
  ];

  it('is the first stretch of 30 minutes or more between now and the last session', () => {
    const { freeGap } = mergePersonalDay([sessions], NOW, AMSTERDAM);

    // 08:35–09:00 is 25 minutes: too short. 10:00–11:00 is the gap (08:00–09:00 UTC).
    expect(freeGap).toEqual({
      startsAt: zonedTime('2026-09-22T10:00'),
      endsAt: zonedTime('2026-09-22T11:00'),
    });
    expect(freeGap?.startsAt.toISOString()).toBe('2026-09-22T08:00:00.000Z');
    expect(freeGap?.endsAt.toISOString()).toBe('2026-09-22T09:00:00.000Z');
  });

  it('starts now when the time before the first session is long enough', () => {
    const { freeGap } = mergePersonalDay([sessions], zonedTime('2026-09-22T08:00'), AMSTERDAM);

    expect(freeGap).toEqual({
      startsAt: zonedTime('2026-09-22T08:00'),
      endsAt: zonedTime('2026-09-22T09:00'),
    });
  });

  it('takes exactly 30 minutes, and not 29', () => {
    const exact = mergePersonalDay([sessions], zonedTime('2026-09-22T08:30'), AMSTERDAM);
    const short = mergePersonalDay([sessions], zonedTime('2026-09-22T08:31'), AMSTERDAM);

    expect(exact.freeGap?.startsAt).toEqual(zonedTime('2026-09-22T08:30'));
    expect(short.freeGap?.startsAt).toEqual(zonedTime('2026-09-22T10:00'));
  });

  it('is none when only 20 minutes lie between the sessions', () => {
    const tight = [
      item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
      item(GYM, 'Mark', '2026-09-22T10:20', '2026-09-22T11:00'),
    ];

    expect(mergePersonalDay([tight], NOW, AMSTERDAM).freeGap).toBeNull();
  });

  it('is none after the last session, and none for an empty day', () => {
    expect(
      mergePersonalDay([sessions], zonedTime('2026-09-22T12:00'), AMSTERDAM).freeGap,
    ).toBeNull();
    expect(
      mergePersonalDay([sessions], zonedTime('2026-09-22T15:00'), AMSTERDAM).freeGap,
    ).toBeNull();
    expect(mergePersonalDay([[]], NOW, AMSTERDAM).freeGap).toBeNull();
  });

  it('is none while a session runs and the next one follows at once', () => {
    const back = [
      item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
      item(GYM, 'Mark', '2026-09-22T10:00', '2026-09-22T11:00'),
    ];

    expect(mergePersonalDay([back], zonedTime('2026-09-22T09:30'), AMSTERDAM).freeGap).toBeNull();
  });

  it('starts at the end of the running session when the gap follows it', () => {
    const { freeGap } = mergePersonalDay([sessions], zonedTime('2026-09-22T09:30'), AMSTERDAM);

    expect(freeGap).toEqual({
      startsAt: zonedTime('2026-09-22T10:00'),
      endsAt: zonedTime('2026-09-22T11:00'),
    });
  });

  it('reads overlapping sessions as one block', () => {
    const overlapping = [
      item(PT, 'Long', '2026-09-22T09:00', '2026-09-22T12:00'),
      item(GYM, 'Inside', '2026-09-22T10:00', '2026-09-22T11:00'),
      item(GYM, 'After', '2026-09-22T12:15', '2026-09-22T13:00'),
      item(GYM, 'Last', '2026-09-22T14:00', '2026-09-22T15:00'),
    ];

    expect(mergePersonalDay([overlapping], NOW, AMSTERDAM).freeGap).toEqual({
      startsAt: zonedTime('2026-09-22T13:00'),
      endsAt: zonedTime('2026-09-22T14:00'),
    });
  });

  it('lets a cancelled session leave its time free', () => {
    const withCancelled = [
      item(PT, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
      item(GYM, 'Gone', '2026-09-22T10:00', '2026-09-22T11:00', 'cancelled'),
      item(GYM, 'Mark', '2026-09-22T11:00', '2026-09-22T12:00'),
    ];

    expect(mergePersonalDay([withCancelled], NOW, AMSTERDAM).freeGap).toEqual({
      startsAt: zonedTime('2026-09-22T10:00'),
      endsAt: zonedTime('2026-09-22T11:00'),
    });
  });

  it('belongs to today only: any other date leaves it out', () => {
    expect(
      mergePersonalDay([sessions], zonedTime('2026-09-21T20:00'), AMSTERDAM, {
        date: '2026-09-22',
      }).freeGap,
    ).toBeNull();
    expect(
      mergePersonalDay([sessions], zonedTime('2026-09-23T08:00'), AMSTERDAM, {
        date: '2026-09-22',
      }).freeGap,
    ).toBeNull();
  });

  it('measures the gap in elapsed time across the change to winter time on 25 October', () => {
    // 02:00–03:00 happens twice that night: wall clock 01:30 to 03:30 holds three hours.
    const night = [
      item(GYM, 'Early', '2026-10-25T01:00', '2026-10-25T01:30'),
      item(GYM, 'Dawn', '2026-10-25T03:30', '2026-10-25T04:30'),
    ];
    const now = new Date('2026-10-24T22:45:00.000Z');

    const { freeGap } = mergePersonalDay([night], now, AMSTERDAM);

    expect(freeGap?.startsAt.toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(freeGap?.endsAt.toISOString()).toBe('2026-10-25T02:30:00.000Z');
  });
});

describe('TD-01: the places still ahead, each once in a row', () => {
  const NOW = zonedTime('2026-09-22T08:35');
  const PARK = 'park';
  const JOHNS_GYM = 'johns-gym-location';

  function at(
    place: string,
    label: string,
    start: string,
    end: string,
    status: Item['status'] = 'scheduled',
  ): Item & { readonly placeId: string } {
    return { ...item(place === PARK ? PT : GYM, label, start, end, status), placeId: place };
  }

  it('lists the park, John’s Gym, the park for a private session, two classes and a private session', () => {
    const day = [
      at(PARK, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00'),
      at(JOHNS_GYM, 'Kracht', '2026-09-22T11:00', '2026-09-22T12:00'),
      at(JOHNS_GYM, 'Mobility', '2026-09-22T12:00', '2026-09-22T13:00'),
      at(PARK, 'Mark', '2026-09-22T15:00', '2026-09-22T16:00'),
    ];

    expect(mergePersonalDay([day], NOW, AMSTERDAM).placesAhead).toEqual([PARK, JOHNS_GYM, PARK]);
  });

  it('lists a place once when every remaining session is there', () => {
    const day = [
      at(JOHNS_GYM, 'Kracht', '2026-09-22T11:00', '2026-09-22T12:00'),
      at(JOHNS_GYM, 'Mobility', '2026-09-22T13:00', '2026-09-22T14:00'),
    ];

    expect(mergePersonalDay([day], NOW, AMSTERDAM).placesAhead).toEqual([JOHNS_GYM]);
  });

  it('adds no place for a cancelled session or one that has ended', () => {
    const day = [
      at(PARK, 'Done', '2026-09-22T07:00', '2026-09-22T08:00'),
      at(PARK, 'Gone', '2026-09-22T09:00', '2026-09-22T10:00', 'cancelled'),
      at(JOHNS_GYM, 'Kracht', '2026-09-22T11:00', '2026-09-22T12:00'),
    ];

    expect(mergePersonalDay([day], NOW, AMSTERDAM).placesAhead).toEqual([JOHNS_GYM]);
  });

  it('keeps the place of a session that is running now', () => {
    const day = [
      at(PARK, 'Running', '2026-09-22T08:00', '2026-09-22T09:00'),
      at(JOHNS_GYM, 'Kracht', '2026-09-22T11:00', '2026-09-22T12:00'),
    ];

    expect(mergePersonalDay([day], NOW, AMSTERDAM).placesAhead).toEqual([PARK, JOHNS_GYM]);
  });

  it('is an empty list when nothing is left today, and left out for any other date', () => {
    const day = [at(PARK, 'Anna', '2026-09-22T09:00', '2026-09-22T10:00')];

    expect(mergePersonalDay([day], zonedTime('2026-09-22T18:00'), AMSTERDAM).placesAhead).toEqual(
      [],
    );
    expect(
      mergePersonalDay([day], zonedTime('2026-09-21T20:00'), AMSTERDAM, { date: '2026-09-22' })
        .placesAhead,
    ).toBeNull();
  });

  it('skips an item that names no place', () => {
    const day = [
      item(PT, 'No place', '2026-09-22T09:00', '2026-09-22T10:00'),
      at(PARK, 'Anna', '2026-09-22T11:00', '2026-09-22T12:00'),
    ];

    expect(mergePersonalDay([day], NOW, AMSTERDAM).placesAhead).toEqual([PARK]);
  });
});
