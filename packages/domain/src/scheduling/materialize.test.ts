import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { materialize } from './materialize.ts';
import { horizonEnd, type SeriesFacts } from './series-rule.ts';

const KRACHT: SeriesFacts = {
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  localStartTime: '18:00',
  durationMinutes: 60,
  timeZone: AMSTERDAM,
  startsOn: '2026-10-06',
  endsOn: null,
};

const week = (from: string) => ({ from, to: horizonEnd(from) });
const TWELVE = [
  '2026-10-06',
  '2026-10-13',
  '2026-10-20',
  '2026-10-27',
  '2026-11-03',
  '2026-11-10',
  '2026-11-17',
  '2026-11-24',
  '2026-12-01',
  '2026-12-08',
  '2026-12-15',
  '2026-12-22',
];

describe('F022 AC3: materialize adds only missing dates', () => {
  it('AC3: a new series gets its 12 dates', () => {
    const { toInsert } = materialize(KRACHT, [], week('2026-10-06'));
    expect(toInsert.map((o) => o.occurrenceDate)).toEqual(TWELVE);
  });

  it('AC3: on 13 October the date of 29 December is added so the horizon is 12 weeks ahead again', () => {
    const existing = TWELVE.map((occurrenceDate) => ({ occurrenceDate }));
    const { toInsert } = materialize(KRACHT, existing, week('2026-10-13'));
    expect(toInsert.map((o) => [o.occurrenceDate, o.startsAt.toISOString()])).toEqual([
      ['2026-12-29', '2026-12-29T17:00:00.000Z'],
    ]);
  });

  it('AC3: running it again on what it made adds nothing', () => {
    const first = materialize(KRACHT, [], week('2026-10-13'));
    const existing = first.toInsert.map((o) => ({ occurrenceDate: o.occurrenceDate }));
    expect(materialize(KRACHT, existing, week('2026-10-13')).toInsert).toEqual([]);
  });

  it('AC3: a cancelled or changed date is never re-created or reset: any existing date is left alone', () => {
    // 20 October was changed on its own, 27 October cancelled and 3 November moved: all exist.
    const existing = ['2026-10-20', '2026-10-27', '2026-11-03'].map((occurrenceDate) => ({
      occurrenceDate,
    }));
    const { toInsert } = materialize(KRACHT, existing, week('2026-10-06'));
    expect(toInsert.map((o) => o.occurrenceDate)).toEqual(
      TWELVE.filter((d) => !['2026-10-20', '2026-10-27', '2026-11-03'].includes(d)),
    );
  });

  it('leaves out a date whose start the clocks skip, and says which', () => {
    const sunday: SeriesFacts = {
      ...KRACHT,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      localStartTime: '02:30',
      startsOn: '2027-03-14',
    };
    const result = materialize(sunday, [], week('2027-03-14'));
    expect(result.skipped).toEqual(['2027-03-28']);
    expect(result.toInsert.map((o) => o.occurrenceDate)).not.toContain('2027-03-28');
    expect(result.toInsert).toHaveLength(11);
  });

  it('adds nothing past the end of a stopped series', () => {
    const ended = { ...KRACHT, endsOn: '2026-10-20' };
    expect(
      materialize(ended, [], week('2026-10-06')).toInsert.map((o) => o.occurrenceDate),
    ).toEqual(['2026-10-06', '2026-10-13', '2026-10-20']);
  });
});
