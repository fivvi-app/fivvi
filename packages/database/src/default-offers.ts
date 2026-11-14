import type { NewOffer } from './repositories/offers.ts';

/**
 * The three default plans of F052 (AC1) as the create-workspace transaction gets them, for the
 * tests and the seed of this package, which cannot import the template of `packages/domain`
 * (`defaultOffers()`). Written out from the spec, so a test of the package catches a template or a
 * migration that drifts from it. Never used by the product: the API passes the domain's template.
 */
export function defaultOfferPlans(): NewOffer[] {
  return [
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
  ];
}
