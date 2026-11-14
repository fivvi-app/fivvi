import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS, defaultOffers } from './default-offers.ts';
import { validateOffer } from './offers.ts';

// The default plans of F052 (spec #468, ticket #784): what every new workspace starts with.

type Mutable = { status: string; terms: { nameNl: string; credits?: number } };

describe('F052 the default plans', () => {
  it('AC1: are the three of the spec, switched off, with the names in Dutch and English', () => {
    expect(defaultOffers()).toEqual([
      {
        defaultPlan: 'membership',
        kind: 'membership',
        creditKind: null,
        status: 'off',
        terms: {
          nameNl: 'Abonnement',
          nameEn: 'Membership',
          classesPerWeek: 2,
          termMonths: 6,
          billingCycle: 'month',
          endOfTerm: 'stop',
          makeupsPerMonth: 2,
          cutoffMinutes: 720,
          renewalWindowDays: 30,
        },
      },
      {
        defaultPlan: 'group_credit_pack',
        kind: 'credit_pack',
        creditKind: 'group',
        status: 'off',
        terms: {
          nameNl: 'Groepscreditpakket',
          nameEn: 'Group credit pack',
          credits: 10,
          validity: { amount: 3, unit: 'month' },
          cutoffMinutes: 720,
          renewalWindowDays: 30,
        },
      },
      {
        defaultPlan: 'private_credit_plan',
        kind: 'credit_plan',
        creditKind: 'private',
        status: 'off',
        terms: {
          nameNl: 'Privécreditabonnement',
          nameEn: 'Private credit plan',
          credits: 4,
          billingCycle: 'month',
          minimumTermMonths: 3,
          endOfTerm: 'stop',
          carryOverLimit: 0,
          cutoffMinutes: 1440,
          returnsPerMonth: 2,
          renewalWindowDays: 30,
        },
      },
    ]);
  });

  it('AC1: set no price and no VAT rate: Fivvi never suggests one', () => {
    for (const plan of defaultOffers()) {
      expect(plan.terms).not.toHaveProperty('priceCents');
      expect(plan.terms).not.toHaveProperty('vatRateBasisPoints');
    }
  });

  it('AC1: each is a valid offer of its kind while it is off, and not yet switched on', () => {
    for (const { kind, creditKind, terms } of defaultOffers()) {
      const fields = { kind, creditKind, ...terms };
      expect(validateOffer(kind, fields).ok, terms.nameNl).toBe(true);
      expect(validateOffer(kind, fields, { switchedOn: true }).ok, terms.nameNl).toBe(false);
    }
  });

  it('AC12: the template is copied, never linked: a copy changes neither the template nor another copy', () => {
    const first = defaultOffers();
    const second = defaultOffers();
    const [membership, pack] = first as unknown as [Mutable, Mutable];
    pack.terms.nameNl = 'Changed';
    membership.terms.credits = 99;
    membership.status = 'on';

    expect(second[1]?.terms.nameNl).toBe('Groepscreditpakket');
    expect(defaultOffers()).toEqual(second);
    expect(DEFAULT_PLANS[1]?.terms.nameNl).toBe('Groepscreditpakket');
    expect(DEFAULT_PLANS[0]?.terms).not.toHaveProperty('credits');
    expect(second[0]?.terms).not.toBe(DEFAULT_PLANS[0]?.terms);
  });

  it('AC12: the template itself cannot be changed by accident', () => {
    expect(Object.isFrozen(DEFAULT_PLANS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLANS[0]?.terms)).toBe(true);
    expect(() => {
      (DEFAULT_PLANS[0]?.terms as { nameNl: string }).nameNl = 'Changed';
    }).toThrow(TypeError);
  });
});
