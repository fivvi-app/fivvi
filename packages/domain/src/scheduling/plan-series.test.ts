import { AMSTERDAM } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { planWeeklySeries } from './plan-series.ts';

// Monday 28 September 2026, 12:00 in Amsterdam.
const NOW = new Date('2026-09-28T10:00:00.000Z');
const facts = { localStart: '18:00', durationMinutes: 60, timeZone: AMSTERDAM, now: NOW };

describe('F022 AC1, AC7: planWeeklySeries', () => {
  it('plans every Tuesday from 6 October: the rule, 12 dates and the end of the 12 weeks', () => {
    const plan = planWeeklySeries({ ...facts, localDate: '2026-10-06' });
    if (plan.outcome !== 'planned') throw new Error('expected a plan');
    expect(plan.facts).toMatchObject({
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      localStartTime: '18:00',
      startsOn: '2026-10-06',
      endsOn: null,
    });
    expect(plan.occurrences).toHaveLength(12);
    expect(plan.occurrences[0]?.startsAt.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(plan.materializedUntil).toBe('2026-12-28');
  });

  it('refuses a first date before today and allows today', () => {
    expect(planWeeklySeries({ ...facts, localDate: '2026-09-27' })).toEqual({
      outcome: 'refused',
      reason: 'date-in-past',
    });
    expect(planWeeklySeries({ ...facts, localDate: '2026-09-28' }).outcome).toBe('planned');
  });

  it('refuses a date that is none', () => {
    expect(planWeeklySeries({ ...facts, localDate: '2026-11-31' })).toEqual({
      outcome: 'refused',
      reason: 'invalid-date',
    });
  });

  it('refuses a Sunday 02:30 from 14 March 2027 with the date it fails on', () => {
    expect(planWeeklySeries({ ...facts, localStart: '02:30', localDate: '2027-03-14' })).toEqual({
      outcome: 'refused',
      reason: 'time-does-not-exist',
      date: '2027-03-28',
    });
  });
});
