import { describe, expect, it } from 'vitest';
import type { CreditPlanOffer, MembershipOffer, ValidOffer } from './offers.ts';
import {
  type AgreementClock,
  agreementClock,
  anchorDay,
  calendarDateIn,
  dueDates,
  dueDayPhrase,
  effectiveEnd,
  noticeEnd,
  periodEnd,
  stopAtTermEnd,
} from './schedule.ts';

const membership: MembershipOffer = {
  kind: 'membership',
  priceCents: 7900,
  vatRateBasisPoints: 2100,
  classesPerWeek: 2,
  termMonths: 6,
  billingCycle: 'month',
  endOfTerm: 'stop',
  makeupsPerMonth: 2,
  cutoffMinutes: 720,
  renewalWindowDays: 30,
};

const creditPlan: CreditPlanOffer = {
  kind: 'credit_plan',
  priceCents: 26000,
  vatRateBasisPoints: 2100,
  creditKind: 'private',
  credits: 4,
  billingCycle: 'four_weeks',
  minimumTermMonths: 3,
  endOfTerm: 'continue',
  carryOverLimit: 4,
  cutoffMinutes: 720,
  renewalWindowDays: 30,
};

function clockOf(offer: ValidOffer, startsOn: string): AgreementClock {
  const clock = agreementClock(offer, startsOn);
  if (!clock) throw new Error('expected a recurring offer');
  return clock;
}

describe('periodEnd', () => {
  it('ends a term on the day before the same day months later', () => {
    expect(periodEnd('2027-02-01', 6)).toBe('2027-07-31');
    expect(periodEnd('2027-02-01', 3)).toBe('2027-04-30');
    expect(periodEnd('2027-02-01', 1)).toBe('2027-02-28');
    expect(periodEnd('2027-02-15', 12)).toBe('2028-02-14');
  });

  it('clamps to the last day of a shorter month, then takes the day before', () => {
    expect(periodEnd('2027-01-31', 1)).toBe('2027-02-27');
    expect(periodEnd('2027-08-31', 6)).toBe('2028-02-28');
    // 2028 is a leap year: 29 February exists.
    expect(periodEnd('2027-01-31', 13)).toBe('2028-02-28');
    expect(periodEnd('2028-01-31', 1)).toBe('2028-02-28');
  });

  it('rolls over the year', () => {
    expect(periodEnd('2026-12-15', 2)).toBe('2027-02-14');
    expect(periodEnd('2027-01-01', 12)).toBe('2027-12-31');
  });

  it('refuses a date that is no calendar date', () => {
    expect(() => periodEnd('2027-02-30', 1)).toThrow(RangeError);
    expect(() => periodEnd('1 February 2027', 1)).toThrow(RangeError);
  });
});

describe('agreementClock', () => {
  it('gives a membership its fixed term end', () => {
    expect(clockOf(membership, '2027-02-01')).toEqual({
      kind: 'membership',
      startsOn: '2027-02-01',
      billingCycle: 'month',
      endOfTerm: 'stop',
      termEndsOn: '2027-07-31',
      endsOn: null,
    });
  });

  it('gives a credit plan the end of its minimum term', () => {
    expect(clockOf(creditPlan, '2027-02-01')).toMatchObject({
      kind: 'credit_plan',
      billingCycle: 'four_weeks',
      endOfTerm: 'continue',
      termEndsOn: '2027-04-30',
      endsOn: null,
    });
  });

  it('gives a credit plan without a minimum term no term end', () => {
    const clock = clockOf({ ...creditPlan, minimumTermMonths: 0 }, '2027-02-01');
    expect(clock.termEndsOn).toBeNull();
  });

  it('has no schedule for an offer that is paid once', () => {
    expect(
      agreementClock(
        {
          kind: 'credit_pack',
          priceCents: 15000,
          vatRateBasisPoints: 2100,
          creditKind: 'group',
          credits: 10,
          validity: { amount: 3, unit: 'month' },
          cutoffMinutes: 720,
          renewalWindowDays: 30,
        },
        '2027-02-01',
      ),
    ).toBeNull();
    expect(
      agreementClock(
        {
          kind: 'single_class_pass',
          priceCents: 2000,
          vatRateBasisPoints: 2100,
          cutoffMinutes: 720,
        },
        '2027-02-01',
      ),
    ).toBeNull();
  });
});

describe('dueDates', () => {
  it('AC6: a monthly agreement from the 31st clamps to the end of shorter months', () => {
    const clock = clockOf({ ...membership, termMonths: 12, endOfTerm: 'continue' }, '2027-01-31');
    expect(dueDates(clock, '2027-01-01', '2027-06-30')).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
    ]);
  });

  it('AC6: a monthly agreement from the 1st is due on the 1st', () => {
    const clock = clockOf({ ...membership, termMonths: 12 }, '2027-02-01');
    expect(dueDates(clock, '2027-02-01', '2027-05-31')).toEqual([
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
    ]);
  });

  it('keeps the start day where the month has it, and never drifts after a clamp', () => {
    const clock = clockOf({ ...membership, termMonths: 24, endOfTerm: 'continue' }, '2027-01-30');
    expect(dueDates(clock, '2027-02-01', '2027-04-30')).toEqual([
      '2027-02-28',
      '2027-03-30',
      '2027-04-30',
    ]);
    const from29 = clockOf({ ...membership, termMonths: 24, endOfTerm: 'continue' }, '2027-01-29');
    expect(dueDates(from29, '2027-02-01', '2027-03-31')).toEqual(['2027-02-28', '2027-03-29']);
  });

  it('uses 29 February in a leap year', () => {
    const clock = clockOf({ ...membership, termMonths: 24, endOfTerm: 'continue' }, '2027-12-31');
    expect(dueDates(clock, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
    const from29 = clockOf({ ...membership, termMonths: 24, endOfTerm: 'continue' }, '2027-01-29');
    expect(dueDates(from29, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('AC7: every 4 weeks is every 28 days on the same weekday, 13 a year', () => {
    const clock = clockOf({ ...creditPlan, minimumTermMonths: 0 }, '2027-02-01'); // a Monday
    expect(dueDates(clock, '2027-02-01', '2027-04-30')).toEqual([
      '2027-03-01',
      '2027-03-29',
      '2027-04-26',
    ]);
    const year = dueDates(clock, '2027-02-01', '2028-01-31');
    expect(year).toHaveLength(13);
    for (const date of year) {
      expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it('keeps the 28-day steps over the clock changes of Amsterdam', () => {
    // The clocks go forward on 28 March 2027 and back on 31 October 2027; dates do not care.
    const clock = clockOf({ ...creditPlan, minimumTermMonths: 0 }, '2027-02-01');
    const dates = dueDates(clock, '2027-02-01', '2027-12-31');
    expect(dates).toContain('2027-03-29');
    expect(dates).toContain('2027-10-11');
    expect(dates).toContain('2027-11-08');
    dates.forEach((date, index) => {
      const days =
        (Date.parse(`${date}T00:00:00Z`) - Date.parse('2027-02-01T00:00:00Z')) / 86_400_000;
      expect(days).toBe(28 * (index + 1));
    });
  });

  it('never includes the start date: the first payment covers it', () => {
    const clock = clockOf({ ...membership, termMonths: 12 }, '2027-02-01');
    expect(dueDates(clock, '2027-02-01', '2027-02-28')).toEqual([]);
  });

  it('returns only the dates inside the asked range, both ends included', () => {
    const clock = clockOf({ ...membership, termMonths: 12 }, '2027-02-01');
    expect(dueDates(clock, '2027-04-01', '2027-06-01')).toEqual([
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
    ]);
    expect(dueDates(clock, '2027-04-02', '2027-04-30')).toEqual([]);
    expect(dueDates(clock, '2027-06-01', '2027-04-01')).toEqual([]);
  });

  it('has no due date on or after the end of a fixed term that stops', () => {
    const clock = clockOf(membership, '2027-02-01');
    expect(dueDates(clock, '2027-02-01', '2028-12-31')).toEqual([
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
    ]);
    expect(dueDates(clock, '2027-08-01', '2027-12-31')).toEqual([]);
  });

  it('continues per cycle past the term when the offer says so', () => {
    const clock = clockOf({ ...membership, endOfTerm: 'continue' }, '2027-02-01');
    expect(dueDates(clock, '2027-07-15', '2027-09-30')).toEqual(['2027-08-01', '2027-09-01']);
  });

  it('has no due date on or after an end set by notice or the owner', () => {
    const clock: AgreementClock = {
      ...clockOf({ ...membership, endOfTerm: 'continue' }, '2027-02-01'),
      endsOn: '2027-07-09',
    };
    expect(dueDates(clock, '2027-06-01', '2027-12-31')).toEqual(['2027-06-01', '2027-07-01']);
    // A due date on the end day itself is not collected either.
    const onTheDay: AgreementClock = { ...clock, endsOn: '2027-07-01' };
    expect(dueDates(onTheDay, '2027-06-01', '2027-12-31')).toEqual(['2027-06-01']);
  });

  it('refuses a range that is no calendar dates', () => {
    const clock = clockOf(membership, '2027-02-01');
    expect(() => dueDates(clock, '2027-13-01', '2027-12-31')).toThrow(RangeError);
  });
});

describe('stopAtTermEnd and effectiveEnd', () => {
  it('Stopt: the agreement ends with its term', () => {
    const clock = clockOf(membership, '2027-02-01');
    expect(stopAtTermEnd(clock)).toBe('2027-07-31');
    expect(effectiveEnd(clock)).toBe('2027-07-31');
  });

  it('Loopt door: nothing ends it but notice', () => {
    const clock = clockOf({ ...membership, endOfTerm: 'continue' }, '2027-02-01');
    expect(stopAtTermEnd(clock)).toBeNull();
    expect(effectiveEnd(clock)).toBeNull();
  });

  it('a credit plan that stops ends with its minimum term; without one it has no end', () => {
    expect(stopAtTermEnd(clockOf({ ...creditPlan, endOfTerm: 'stop' }, '2027-02-01'))).toBe(
      '2027-04-30',
    );
    expect(
      stopAtTermEnd(
        clockOf({ ...creditPlan, endOfTerm: 'stop', minimumTermMonths: 0 }, '2027-02-01'),
      ),
    ).toBeNull();
  });

  it('takes the earlier of the set end and the end of the term', () => {
    const clock = clockOf(membership, '2027-02-01');
    expect(effectiveEnd({ ...clock, endsOn: '2027-05-15' })).toBe('2027-05-15');
    expect(effectiveEnd({ ...clock, endsOn: '2027-09-01' })).toBe('2027-07-31');
  });
});

describe('noticeEnd', () => {
  const plan = clockOf({ ...creditPlan, billingCycle: 'month' }, '2027-02-01');

  it('AC10: notice inside the minimum term ends it at the end of the minimum term', () => {
    expect(noticeEnd(plan, '2027-03-10')).toEqual({ outcome: 'ends', endsOn: '2027-04-30' });
  });

  it('AC10: notice after the minimum term ends one month later', () => {
    expect(noticeEnd(plan, '2027-06-10')).toEqual({ outcome: 'ends', endsOn: '2027-07-09' });
  });

  it('takes the later of one month from notice and the minimum term end', () => {
    // 30 March + 1 month - 1 day = 29 April, before 30 April; 31 March gives 30 April.
    expect(noticeEnd(plan, '2027-03-30')).toEqual({ outcome: 'ends', endsOn: '2027-04-30' });
    expect(noticeEnd(plan, '2027-03-31')).toEqual({ outcome: 'ends', endsOn: '2027-04-30' });
    expect(noticeEnd(plan, '2027-04-01')).toEqual({ outcome: 'ends', endsOn: '2027-04-30' });
    expect(noticeEnd(plan, '2027-04-02')).toEqual({ outcome: 'ends', endsOn: '2027-05-01' });
  });

  it('a credit plan without a minimum term ends one month after notice', () => {
    const open = clockOf({ ...creditPlan, minimumTermMonths: 0 }, '2027-02-01');
    expect(noticeEnd(open, '2027-02-10')).toEqual({ outcome: 'ends', endsOn: '2027-03-09' });
  });

  it('clamps one month from the 31st to the end of the shorter month', () => {
    const open = clockOf({ ...creditPlan, minimumTermMonths: 0 }, '2027-01-01');
    expect(noticeEnd(open, '2027-01-31')).toEqual({ outcome: 'ends', endsOn: '2027-02-27' });
    expect(noticeEnd(open, '2027-12-31')).toEqual({ outcome: 'ends', endsOn: '2028-01-30' });
  });

  it('a fixed term that has not run out gives the first notice date and the end it then gives', () => {
    const fixed = clockOf({ ...membership, endOfTerm: 'continue' }, '2027-02-01');
    expect(noticeEnd(fixed, '2027-03-10')).toEqual({
      outcome: 'not-yet',
      firstNoticeOn: '2027-08-01',
      endsOn: '2027-08-31',
    });
    // Still the last day of the term.
    expect(noticeEnd(fixed, '2027-07-31')).toMatchObject({ outcome: 'not-yet' });
  });

  it('a fixed term that has run out can be ended with one month of notice', () => {
    const fixed = clockOf({ ...membership, endOfTerm: 'continue' }, '2027-02-01');
    expect(noticeEnd(fixed, '2027-08-01')).toEqual({ outcome: 'ends', endsOn: '2027-08-31' });
    expect(noticeEnd(fixed, '2027-09-15')).toEqual({ outcome: 'ends', endsOn: '2027-10-14' });
  });

  it('an agreement that stops needs no notice', () => {
    const stopping = clockOf(membership, '2027-02-01');
    expect(noticeEnd(stopping, '2027-03-10')).toEqual({
      outcome: 'not-needed',
      endsOn: '2027-07-31',
    });
  });

  it('a stopping credit plan without a minimum term never ends by itself: notice ends it one month on', () => {
    const endless = clockOf(
      { ...creditPlan, endOfTerm: 'stop', minimumTermMonths: 0 },
      '2027-02-01',
    );
    expect(noticeEnd(endless, '2027-02-10')).toEqual({ outcome: 'ends', endsOn: '2027-03-09' });
  });

  it('an agreement that already has an end takes no second notice', () => {
    const ending: AgreementClock = { ...plan, endsOn: '2027-07-09' };
    expect(noticeEnd(ending, '2027-06-20')).toEqual({
      outcome: 'already-ending',
      endsOn: '2027-07-09',
    });
  });

  it('refuses a notice date that is no calendar date', () => {
    expect(() => noticeEnd(plan, 'yesterday')).toThrow(RangeError);
  });
});

describe('calendarDateIn', () => {
  it('reads the date on the wall clock of the time zone, not in UTC', () => {
    // 23:30 UTC on 31 January is already 1 February in Amsterdam (UTC+1).
    expect(calendarDateIn(new Date('2027-01-31T23:30:00Z'), 'Europe/Amsterdam')).toBe('2027-02-01');
    expect(calendarDateIn(new Date('2027-01-31T22:59:00Z'), 'Europe/Amsterdam')).toBe('2027-01-31');
    // In summer time (UTC+2) 22:00 UTC is already the next day.
    expect(calendarDateIn(new Date('2027-07-31T22:00:00Z'), 'Europe/Amsterdam')).toBe('2027-08-01');
  });

  it('is not moved by the clock change itself', () => {
    expect(calendarDateIn(new Date('2027-03-28T00:30:00Z'), 'Europe/Amsterdam')).toBe('2027-03-28');
    expect(calendarDateIn(new Date('2027-03-28T23:30:00Z'), 'Europe/Amsterdam')).toBe('2027-03-29');
    expect(calendarDateIn(new Date('2027-10-30T22:30:00Z'), 'Europe/Amsterdam')).toBe('2027-10-31');
    expect(calendarDateIn(new Date('2027-10-31T23:30:00Z'), 'Europe/Amsterdam')).toBe('2027-11-01');
  });

  it('follows any other IANA zone', () => {
    expect(calendarDateIn(new Date('2027-02-01T03:00:00Z'), 'America/New_York')).toBe('2027-01-31');
  });
});

describe('anchorDay', () => {
  it('is the day of the month the agreement starts on', () => {
    expect(anchorDay(clockOf(membership, '2027-01-31'))).toBe(31);
    expect(anchorDay(clockOf(membership, '2027-02-01'))).toBe(1);
  });
});

describe('dueDayPhrase', () => {
  it('words the day of the month in Dutch', () => {
    expect(dueDayPhrase(1, 'nl-NL')).toBe('op de 1e');
    expect(dueDayPhrase(2, 'nl-NL')).toBe('op de 2e');
    expect(dueDayPhrase(15, 'nl-NL')).toBe('op de 15e');
    expect(dueDayPhrase(31, 'nl-NL')).toBe('op de 31e');
  });

  it('words the day of the month in English with its ordinal', () => {
    const phrases = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 30, 31].map((day) =>
      dueDayPhrase(day, 'en'),
    );
    expect(phrases).toEqual([
      'on the 1st',
      'on the 2nd',
      'on the 3rd',
      'on the 4th',
      'on the 11th',
      'on the 12th',
      'on the 13th',
      'on the 21st',
      'on the 22nd',
      'on the 23rd',
      'on the 24th',
      'on the 30th',
      'on the 31st',
    ]);
  });

  it('refuses a day that is no day of a month', () => {
    expect(() => dueDayPhrase(0, 'en')).toThrow(RangeError);
    expect(() => dueDayPhrase(32, 'nl-NL')).toThrow(RangeError);
    expect(() => dueDayPhrase(1.5, 'nl-NL')).toThrow(RangeError);
  });
});
