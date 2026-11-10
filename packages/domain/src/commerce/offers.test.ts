import { describe, expect, it } from 'vitest';
import {
  cancellationSentence,
  formatEuros,
  formatVatRate,
  OFFER_KINDS,
  type OfferIssue,
  summarise,
  validateOffer,
} from './offers.ts';

const membership = {
  priceCents: 7900,
  vatRateBasisPoints: 2100,
  classesPerWeek: 2,
  termMonths: 6,
  billingCycle: 'month',
  endOfTerm: 'stop',
  makeupsPerMonth: 2,
  cutoffMinutes: 720,
};

const creditPack = {
  priceCents: 15000,
  vatRateBasisPoints: 2100,
  creditKind: 'group',
  credits: 10,
  validity: { amount: 3, unit: 'month' },
  cutoffMinutes: 720,
};

const creditPlan = {
  priceCents: 6000,
  vatRateBasisPoints: 2100,
  creditKind: 'private',
  credits: 4,
  billingCycle: 'month',
  minimumTermMonths: 3,
  endOfTerm: 'continue',
  carryOverLimit: 0,
  cutoffMinutes: 1440,
};

const singleClassPass = {
  priceCents: 2500,
  vatRateBasisPoints: 2100,
  cutoffMinutes: 720,
};

function issuesOf(kind: unknown, fields: Record<string, unknown>, options = {}): OfferIssue[] {
  const decision = validateOffer(kind, fields, options);
  return decision.ok ? [] : [...decision.issues];
}

function offerOf(kind: string, fields: Record<string, unknown>) {
  const decision = validateOffer(kind, fields);
  if (!decision.ok) throw new Error(`invalid: ${JSON.stringify(decision.issues)}`);
  return decision.offer;
}

describe('F052 offer kinds', () => {
  it('AC4: there are four kinds, and no fifth one is valid', () => {
    expect(OFFER_KINDS).toEqual(['membership', 'credit_pack', 'credit_plan', 'single_class_pass']);
    for (const kind of ['open_gym_pass', 'bundle', '', null, undefined, 4]) {
      expect(issuesOf(kind, membership)).toEqual([{ field: 'kind', problem: 'invalid' }]);
    }
  });

  it('accepts each kind with valid fields and returns them typed', () => {
    expect(offerOf('membership', membership)).toEqual({
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
    });
    expect(offerOf('credit_pack', creditPack)).toMatchObject({
      kind: 'credit_pack',
      creditKind: 'group',
      credits: 10,
      validity: { amount: 3, unit: 'month' },
    });
    expect(offerOf('credit_plan', creditPlan)).toMatchObject({
      kind: 'credit_plan',
      creditKind: 'private',
      credits: 4,
      minimumTermMonths: 3,
      carryOverLimit: 0,
    });
    expect(offerOf('single_class_pass', singleClassPass)).toEqual({
      kind: 'single_class_pass',
      priceCents: 2500,
      vatRateBasisPoints: 2100,
      cutoffMinutes: 720,
    });
  });
});

describe('F052 credit kind', () => {
  it('AC4: a credit offer grants exactly one credit kind, group or private', () => {
    expect(issuesOf('credit_pack', { ...creditPack, creditKind: 'private' })).toEqual([]);
    expect(issuesOf('credit_plan', { ...creditPlan, creditKind: 'group' })).toEqual([]);
  });

  it('AC4: two credit kinds are invalid', () => {
    expect(issuesOf('credit_pack', { ...creditPack, creditKind: ['group', 'private'] })).toEqual([
      { field: 'creditKind', problem: 'invalid' },
    ]);
    expect(issuesOf('credit_plan', { ...creditPlan, creditKind: ['group', 'private'] })).toEqual([
      { field: 'creditKind', problem: 'invalid' },
    ]);
  });

  it('AC4: a credit kind that is not group or private is invalid (Open Gym comes later)', () => {
    for (const creditKind of ['open_gym', 'mixed', '']) {
      expect(issuesOf('credit_pack', { ...creditPack, creditKind })).toEqual([
        { field: 'creditKind', problem: 'invalid' },
      ]);
    }
  });

  it('a credit offer without a credit kind is missing one', () => {
    const { creditKind: _, ...without } = creditPack;
    expect(issuesOf('credit_pack', without)).toEqual([{ field: 'creditKind', problem: 'missing' }]);
  });

  it('a membership or single class pass grants no credits', () => {
    expect(issuesOf('membership', { ...membership, creditKind: 'group' })).toEqual([
      { field: 'creditKind', problem: 'not-allowed' },
    ]);
    expect(issuesOf('single_class_pass', { ...singleClassPass, creditKind: 'group' })).toEqual([
      { field: 'creditKind', problem: 'not-allowed' },
    ]);
  });
});

describe('F052 price and VAT rate', () => {
  it('AC10: 7999 cents at 2100 basis points is valid', () => {
    expect(offerOf('membership', { ...membership, priceCents: 7999 })).toMatchObject({
      priceCents: 7999,
      vatRateBasisPoints: 2100,
    });
  });

  it('AC10: 1 and 1,000,000 cents are the bounds; 0 and 1,000,001 are invalid', () => {
    expect(issuesOf('membership', { ...membership, priceCents: 1 })).toEqual([]);
    expect(issuesOf('membership', { ...membership, priceCents: 1_000_000 })).toEqual([]);
    expect(issuesOf('membership', { ...membership, priceCents: 0 })).toEqual([
      { field: 'priceCents', problem: 'too-low' },
    ]);
    expect(issuesOf('membership', { ...membership, priceCents: 1_000_001 })).toEqual([
      { field: 'priceCents', problem: 'too-high' },
    ]);
    expect(issuesOf('membership', { ...membership, priceCents: -100 })).toEqual([
      { field: 'priceCents', problem: 'too-low' },
    ]);
  });

  it('AC10: only integers are accepted, never a float, a string or NaN', () => {
    for (const priceCents of [79.99, 7900.5, '7900', Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(issuesOf('membership', { ...membership, priceCents })).toEqual([
        { field: 'priceCents', problem: 'not-integer' },
      ]);
    }
  });

  it('the VAT rate is 21 % or 9 %; 0 % and any other rate are invalid', () => {
    expect(issuesOf('membership', { ...membership, vatRateBasisPoints: 900 })).toEqual([]);
    for (const vatRateBasisPoints of [0, 600, 2000, 21, 2100.5, '2100']) {
      expect(issuesOf('membership', { ...membership, vatRateBasisPoints })).toEqual([
        { field: 'vatRateBasisPoints', problem: 'invalid' },
      ]);
    }
  });

  it('an offer that is off may have no price and no VAT rate yet (a default plan)', () => {
    const { priceCents: _p, vatRateBasisPoints: _v, ...bare } = membership;
    const offer = offerOf('membership', bare);
    expect(offer).toMatchObject({ priceCents: null, vatRateBasisPoints: null });
    expect(
      issuesOf('membership', { ...membership, priceCents: null, vatRateBasisPoints: null }),
    ).toEqual([]);
  });

  it('an offer that is on needs a price and a VAT rate', () => {
    const { priceCents: _p, vatRateBasisPoints: _v, ...bare } = membership;
    expect(issuesOf('membership', bare, { switchedOn: true })).toEqual([
      { field: 'priceCents', problem: 'missing' },
      { field: 'vatRateBasisPoints', problem: 'missing' },
    ]);
  });

  it('a workspace that charges no VAT has no VAT rate on its offers, and a price without VAT', () => {
    const { vatRateBasisPoints: _v, ...bare } = membership;
    const decision = validateOffer('membership', bare, { switchedOn: true, chargesVat: false });
    expect(decision.ok && decision.offer.vatRateBasisPoints).toBeNull();
    expect(issuesOf('membership', membership, { chargesVat: false })).toEqual([
      { field: 'vatRateBasisPoints', problem: 'not-allowed' },
    ]);
  });
});

describe('F052 single class pass', () => {
  it('AC16: any price within the bounds is valid, whatever the other offers cost', () => {
    for (const priceCents of [1, 500, 2500, 7900, 1_000_000]) {
      expect(issuesOf('single_class_pass', { ...singleClassPass, priceCents })).toEqual([]);
    }
  });

  it('AC16: the price bounds still apply', () => {
    expect(issuesOf('single_class_pass', { ...singleClassPass, priceCents: 0 })).toEqual([
      { field: 'priceCents', problem: 'too-low' },
    ]);
    expect(issuesOf('single_class_pass', { ...singleClassPass, priceCents: 1_000_001 })).toEqual([
      { field: 'priceCents', problem: 'too-high' },
    ]);
  });
});

describe('F052 membership bounds', () => {
  it.each([
    ['classesPerWeek', 1, 7],
    ['makeupsPerMonth', 0, 10],
  ])('%s is %i to %i', (field, min, max) => {
    expect(issuesOf('membership', { ...membership, [field]: min })).toEqual([]);
    expect(issuesOf('membership', { ...membership, [field]: max })).toEqual([]);
    expect(issuesOf('membership', { ...membership, [field]: min - 1 })).toEqual([
      { field, problem: 'too-low' },
    ]);
    expect(issuesOf('membership', { ...membership, [field]: max + 1 })).toEqual([
      { field, problem: 'too-high' },
    ]);
    expect(issuesOf('membership', { ...membership, [field]: 1.5 })).toEqual([
      { field, problem: 'not-integer' },
    ]);
  });

  it('the cancellation cutoff is 0 to 72 hours, in whole hours', () => {
    expect(issuesOf('membership', { ...membership, cutoffMinutes: 0 })).toEqual([]);
    expect(issuesOf('membership', { ...membership, cutoffMinutes: 72 * 60 })).toEqual([]);
    expect(issuesOf('membership', { ...membership, cutoffMinutes: 72 * 60 + 60 })).toEqual([
      { field: 'cutoffMinutes', problem: 'too-high' },
    ]);
    expect(issuesOf('membership', { ...membership, cutoffMinutes: -60 })).toEqual([
      { field: 'cutoffMinutes', problem: 'too-low' },
    ]);
    expect(issuesOf('membership', { ...membership, cutoffMinutes: 90 })).toEqual([
      { field: 'cutoffMinutes', problem: 'not-whole-hours' },
    ]);
  });

  it('the billing cycle is every month or every 4 weeks', () => {
    expect(issuesOf('membership', { ...membership, billingCycle: 'four_weeks' })).toEqual([]);
    expect(issuesOf('membership', { ...membership, billingCycle: 'week' })).toEqual([
      { field: 'billingCycle', problem: 'invalid' },
    ]);
  });

  it('the end of term stops or continues', () => {
    expect(issuesOf('membership', { ...membership, endOfTerm: 'continue' })).toEqual([]);
    expect(issuesOf('membership', { ...membership, endOfTerm: 'renew' })).toEqual([
      { field: 'endOfTerm', problem: 'invalid' },
    ]);
  });

  it('a missing required field is reported by name', () => {
    expect(issuesOf('membership', {})).toEqual([
      { field: 'classesPerWeek', problem: 'missing' },
      { field: 'termMonths', problem: 'missing' },
      { field: 'billingCycle', problem: 'missing' },
      { field: 'endOfTerm', problem: 'missing' },
      { field: 'makeupsPerMonth', problem: 'missing' },
      { field: 'cutoffMinutes', problem: 'missing' },
    ]);
  });
});

describe('F052 term over 12 months', () => {
  it('a term is 1 to 24 months, whole months', () => {
    expect(issuesOf('membership', { ...membership, termMonths: 1 })).toEqual([]);
    expect(issuesOf('membership', { ...membership, termMonths: 0 })).toEqual([
      { field: 'termMonths', problem: 'too-low' },
    ]);
    expect(issuesOf('membership', { ...membership, termMonths: 1.5 })).toEqual([
      { field: 'termMonths', problem: 'not-integer' },
    ]);
  });

  it('AC7: a term of 18 months is invalid without the confirmation flag', () => {
    expect(issuesOf('membership', { ...membership, termMonths: 18 })).toEqual([
      { field: 'termMonths', problem: 'confirmation-required' },
    ]);
    expect(
      issuesOf('membership', { ...membership, termMonths: 18, longTermConfirmed: false }),
    ).toEqual([{ field: 'termMonths', problem: 'confirmation-required' }]);
  });

  it('AC7: a term of 18 months is valid with the confirmation flag', () => {
    expect(
      issuesOf('membership', { ...membership, termMonths: 18, longTermConfirmed: true }),
    ).toEqual([]);
    expect(
      offerOf('membership', { ...membership, termMonths: 18, longTermConfirmed: true }),
    ).toMatchObject({
      termMonths: 18,
    });
  });

  it('AC7: 12 months needs no confirmation, and 25 months is invalid even with it', () => {
    expect(issuesOf('membership', { ...membership, termMonths: 12 })).toEqual([]);
    expect(
      issuesOf('membership', { ...membership, termMonths: 24, longTermConfirmed: true }),
    ).toEqual([]);
    expect(
      issuesOf('membership', { ...membership, termMonths: 25, longTermConfirmed: true }),
    ).toEqual([{ field: 'termMonths', problem: 'too-high' }]);
  });
});

describe('F052 credit pack bounds', () => {
  it('credits are 1 to 200', () => {
    expect(issuesOf('credit_pack', { ...creditPack, credits: 1 })).toEqual([]);
    expect(issuesOf('credit_pack', { ...creditPack, credits: 200 })).toEqual([]);
    expect(issuesOf('credit_pack', { ...creditPack, credits: 0 })).toEqual([
      { field: 'credits', problem: 'too-low' },
    ]);
    expect(issuesOf('credit_pack', { ...creditPack, credits: 201 })).toEqual([
      { field: 'credits', problem: 'too-high' },
    ]);
  });

  it('a validity is a whole number of days, weeks or months, at least 1', () => {
    for (const unit of ['day', 'week', 'month']) {
      expect(issuesOf('credit_pack', { ...creditPack, validity: { amount: 2, unit } })).toEqual([]);
    }
    expect(
      issuesOf('credit_pack', { ...creditPack, validity: { amount: 0, unit: 'day' } }),
    ).toEqual([{ field: 'validity', problem: 'too-low' }]);
    expect(
      issuesOf('credit_pack', { ...creditPack, validity: { amount: 1.5, unit: 'day' } }),
    ).toEqual([{ field: 'validity', problem: 'not-integer' }]);
    expect(
      issuesOf('credit_pack', { ...creditPack, validity: { amount: 2, unit: 'year' } }),
    ).toEqual([{ field: 'validity', problem: 'invalid' }]);
    const { validity: _, ...without } = creditPack;
    expect(issuesOf('credit_pack', without)).toEqual([{ field: 'validity', problem: 'missing' }]);
  });
});

describe('F052 credit plan bounds', () => {
  it.each([
    ['credits', 1, 50],
    ['minimumTermMonths', 0, 12],
    ['carryOverLimit', 0, 50],
  ])('%s is %i to %i', (field, min, max) => {
    expect(issuesOf('credit_plan', { ...creditPlan, [field]: min })).toEqual([]);
    expect(issuesOf('credit_plan', { ...creditPlan, [field]: max })).toEqual([]);
    expect(issuesOf('credit_plan', { ...creditPlan, [field]: min - 1 })).toEqual([
      { field, problem: 'too-low' },
    ]);
    expect(issuesOf('credit_plan', { ...creditPlan, [field]: max + 1 })).toEqual([
      { field, problem: 'too-high' },
    ]);
  });

  it('a credit plan bills every month or every 4 weeks, and stops or continues', () => {
    expect(issuesOf('credit_plan', { ...creditPlan, billingCycle: 'four_weeks' })).toEqual([]);
    expect(issuesOf('credit_plan', { ...creditPlan, billingCycle: 'year' })).toEqual([
      { field: 'billingCycle', problem: 'invalid' },
    ]);
    expect(issuesOf('credit_plan', { ...creditPlan, endOfTerm: 'stop' })).toEqual([]);
    expect(issuesOf('credit_plan', { ...creditPlan, endOfTerm: undefined })).toEqual([
      { field: 'endOfTerm', problem: 'missing' },
    ]);
  });
});

describe('F052 renewal window', () => {
  it('is a whole number of days, 0 to 365, 30 by default', () => {
    expect(offerOf('membership', membership)).toMatchObject({ renewalWindowDays: 30 });
    expect(offerOf('membership', { ...membership, renewalWindowDays: null })).toMatchObject({
      renewalWindowDays: 30,
    });
    for (const renewalWindowDays of [0, 1, 365]) {
      expect(offerOf('credit_pack', { ...creditPack, renewalWindowDays })).toMatchObject({
        renewalWindowDays,
      });
    }
    expect(issuesOf('credit_plan', { ...creditPlan, renewalWindowDays: -1 })).toEqual([
      { field: 'renewalWindowDays', problem: 'too-low' },
    ]);
    expect(issuesOf('credit_plan', { ...creditPlan, renewalWindowDays: 366 })).toEqual([
      { field: 'renewalWindowDays', problem: 'too-high' },
    ]);
    expect(issuesOf('membership', { ...membership, renewalWindowDays: 7.5 })).toEqual([
      { field: 'renewalWindowDays', problem: 'not-integer' },
    ]);
  });
});

describe('F052 every invalid value gets its own field-level reason', () => {
  it('lists all issues of a membership in field order', () => {
    expect(
      issuesOf('membership', {
        ...membership,
        priceCents: 0,
        vatRateBasisPoints: 0,
        classesPerWeek: 8,
        termMonths: 30,
        makeupsPerMonth: 11,
        cutoffMinutes: 73 * 60,
      }),
    ).toEqual([
      { field: 'priceCents', problem: 'too-low' },
      { field: 'vatRateBasisPoints', problem: 'invalid' },
      { field: 'classesPerWeek', problem: 'too-high' },
      { field: 'termMonths', problem: 'too-high' },
      { field: 'makeupsPerMonth', problem: 'too-high' },
      { field: 'cutoffMinutes', problem: 'too-high' },
    ]);
  });
});

describe('F052 amounts and rates', () => {
  it('formats euros as € 79,00 in Dutch and €79.00 in English', () => {
    expect(formatEuros(7900, 'nl-NL')).toBe('€ 79,00');
    expect(formatEuros(7900, 'en')).toBe('€79.00');
    expect(formatEuros(7999, 'nl-NL')).toBe('€ 79,99');
    expect(formatEuros(5, 'nl-NL')).toBe('€ 0,05');
    expect(formatEuros(5, 'en')).toBe('€0.05');
    expect(formatEuros(1_000_000, 'nl-NL')).toBe('€ 10.000,00');
    expect(formatEuros(1_000_000, 'en')).toBe('€10,000.00');
  });

  it('refuses an amount that is no whole number of cents', () => {
    expect(() => formatEuros(79.5, 'en')).toThrow(RangeError);
    expect(() => formatEuros(-1, 'en')).toThrow(RangeError);
  });

  it('formats the VAT rate as 21 % in Dutch and 21% in English', () => {
    expect(formatVatRate(2100, 'nl-NL')).toBe('21 %');
    expect(formatVatRate(2100, 'en')).toBe('21%');
    expect(formatVatRate(900, 'nl-NL')).toBe('9 %');
    expect(formatVatRate(900, 'en')).toBe('9%');
  });
});

describe('F052 summary line', () => {
  it('a membership reads "2 lessen per week · 6 maanden · € 79,00 per maand" / "2 classes a week · 6 months · €79.00 a month"', () => {
    const offer = offerOf('membership', membership);
    expect(summarise(offer, 'nl-NL')).toBe('2 lessen per week · 6 maanden · € 79,00 per maand');
    expect(summarise(offer, 'en')).toBe('2 classes a week · 6 months · €79.00 a month');
  });

  it('a membership billed every 4 weeks says so, and one class a week is singular', () => {
    const offer = offerOf('membership', {
      ...membership,
      classesPerWeek: 1,
      termMonths: 1,
      billingCycle: 'four_weeks',
    });
    expect(summarise(offer, 'nl-NL')).toBe('1 les per week · 1 maand · € 79,00 per 4 weken');
    expect(summarise(offer, 'en')).toBe('1 class a week · 1 month · €79.00 every 4 weeks');
  });

  it('a membership limited to some classes names them', () => {
    const offer = offerOf('membership', membership);
    expect(summarise(offer, 'nl-NL', ['Kracht', 'Mobility'])).toBe(
      '2 lessen per week · Kracht, Mobility · 6 maanden · € 79,00 per maand',
    );
    expect(summarise(offer, 'en', ['Kracht', 'Mobility'])).toBe(
      '2 classes a week · Kracht, Mobility · 6 months · €79.00 a month',
    );
    expect(summarise(offer, 'nl-NL', [])).toBe('2 lessen per week · 6 maanden · € 79,00 per maand');
  });

  it('a group credit pack reads "10 groepscredits · 3 maanden geldig · € 150,00" / "10 group credits · valid for 3 months · €150.00"', () => {
    const offer = offerOf('credit_pack', creditPack);
    expect(summarise(offer, 'nl-NL')).toBe('10 groepscredits · 3 maanden geldig · € 150,00');
    expect(summarise(offer, 'en')).toBe('10 group credits · valid for 3 months · €150.00');
  });

  it('a private credit pack with a validity in days or weeks', () => {
    const days = offerOf('credit_pack', {
      ...creditPack,
      creditKind: 'private',
      credits: 1,
      validity: { amount: 14, unit: 'day' },
    });
    expect(summarise(days, 'nl-NL')).toBe('1 privécredit · 14 dagen geldig · € 150,00');
    expect(summarise(days, 'en')).toBe('1 private credit · valid for 14 days · €150.00');
    const weeks = offerOf('credit_pack', { ...creditPack, validity: { amount: 1, unit: 'week' } });
    expect(summarise(weeks, 'nl-NL')).toBe('10 groepscredits · 1 week geldig · € 150,00');
    expect(summarise(weeks, 'en')).toBe('10 group credits · valid for 1 week · €150.00');
  });

  it('a credit plan reads credits per cycle, the minimum term and the price per cycle', () => {
    const offer = offerOf('credit_plan', creditPlan);
    expect(summarise(offer, 'nl-NL')).toBe(
      '4 privécredits per maand · minimaal 3 maanden · € 60,00 per maand',
    );
    expect(summarise(offer, 'en')).toBe(
      '4 private credits a month · minimum 3 months · €60.00 a month',
    );
  });

  it('a credit plan without a minimum term, billed every 4 weeks', () => {
    const offer = offerOf('credit_plan', {
      ...creditPlan,
      creditKind: 'group',
      credits: 1,
      minimumTermMonths: 0,
      billingCycle: 'four_weeks',
    });
    expect(summarise(offer, 'nl-NL')).toBe('1 groepscredit per 4 weken · € 60,00 per 4 weken');
    expect(summarise(offer, 'en')).toBe('1 group credit every 4 weeks · €60.00 every 4 weeks');
  });

  it('a single class pass reads one group class and its price', () => {
    const offer = offerOf('single_class_pass', singleClassPass);
    expect(summarise(offer, 'nl-NL')).toBe('1 groepsles · € 25,00');
    expect(summarise(offer, 'en')).toBe('1 group class · €25.00');
    expect(summarise(offer, 'en', ['Kracht'])).toBe('1 group class · Kracht · €25.00');
  });

  it('an offer without a price (a default plan) leaves the amount out', () => {
    const offer = offerOf('membership', {
      ...membership,
      priceCents: null,
      vatRateBasisPoints: null,
    });
    expect(summarise(offer, 'nl-NL')).toBe('2 lessen per week · 6 maanden');
    expect(summarise(offer, 'en')).toBe('2 classes a week · 6 months');
  });
});

describe('F052 cancellation sentence', () => {
  it('AC8: 12 hours reads "Je kunt tot 12 uur van tevoren gratis annuleren." / "You can cancel free of charge up to 12 hours before."', () => {
    expect(cancellationSentence(720, 'nl-NL')).toBe(
      'Je kunt tot 12 uur van tevoren gratis annuleren.',
    );
    expect(cancellationSentence(720, 'en')).toBe(
      'You can cancel free of charge up to 12 hours before.',
    );
  });

  it('AC8: 0 hours reads "Je kunt tot de start gratis annuleren." / "You can cancel free of charge until the start."', () => {
    expect(cancellationSentence(0, 'nl-NL')).toBe('Je kunt tot de start gratis annuleren.');
    expect(cancellationSentence(0, 'en')).toBe('You can cancel free of charge until the start.');
  });

  it('AC8: one hour is singular in English', () => {
    expect(cancellationSentence(60, 'nl-NL')).toBe(
      'Je kunt tot 1 uur van tevoren gratis annuleren.',
    );
    expect(cancellationSentence(60, 'en')).toBe(
      'You can cancel free of charge up to 1 hour before.',
    );
    expect(cancellationSentence(72 * 60, 'en')).toBe(
      'You can cancel free of charge up to 72 hours before.',
    );
  });

  it('refuses a cutoff that is no whole number of hours', () => {
    expect(() => cancellationSentence(90, 'en')).toThrow(RangeError);
    expect(() => cancellationSentence(-60, 'en')).toThrow(RangeError);
    expect(() => cancellationSentence(1.5, 'en')).toThrow(RangeError);
  });
});
