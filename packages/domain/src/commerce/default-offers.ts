// The default plans (*standaardaanbod*, F052, spec #468, ticket #784; `PRODUCT.md §90`): the three
// ready-made offers every workspace starts with. They are a constant template here, in code. Creating a
// workspace copies them into the workspace (`createWorkspaceWithOwner` stores what `defaultOffers()`
// returns) and a one-time migration copied them into the workspaces that existed before offers did, so
// each workspace has its own: a later change to this template never reaches an offer a workspace already
// has (AC12). They are switched off, without a price and without a VAT rate, because Fivvi never
// suggests a price (owner, 21 October 2026).
//
// The names are user content, stored per workspace in Dutch and English and renamed by the owner, as a
// class name is; they are not UI strings and so are not in the catalogs.

import {
  type BillingCycle,
  type CreditKind,
  DEFAULT_RENEWAL_WINDOW_DAYS,
  type EndOfTerm,
  type OfferKind,
  type Validity,
} from './offers.ts';

/** Which default plan an offer is a copy of; at most one offer per plan and workspace. */
export const DEFAULT_PLAN_KEYS = [
  'membership',
  'group_credit_pack',
  'private_credit_plan',
] as const;
export type DefaultPlanKey = (typeof DEFAULT_PLAN_KEYS)[number];

/** The terms a default plan fills in; the rest of an offer's terms stay empty. */
export interface DefaultPlanTerms {
  readonly nameNl: string;
  readonly nameEn: string;
  readonly classesPerWeek?: number;
  readonly termMonths?: number;
  readonly billingCycle?: BillingCycle;
  readonly endOfTerm?: EndOfTerm;
  readonly makeupsPerMonth?: number;
  readonly credits?: number;
  readonly validity?: Validity;
  readonly minimumTermMonths?: number;
  readonly carryOverLimit?: number;
  /** Minutes: a whole number of hours. */
  readonly cutoffMinutes: number;
  /** The most credits that come back a month on a timely cancellation; left out: always. */
  readonly returnsPerMonth?: number;
  readonly renewalWindowDays: number;
}

/** A default plan as a new workspace gets it: no price, no VAT rate, no classes limit, switched off. */
export interface DefaultPlan {
  readonly defaultPlan: DefaultPlanKey;
  readonly kind: OfferKind;
  readonly creditKind: CreditKind | null;
  readonly status: 'off';
  readonly terms: DefaultPlanTerms;
}

const HOURS = 60;

/** Fivvi's default plans. Deeply frozen: only `defaultOffers()` hands out copies. */
export const DEFAULT_PLANS: readonly DefaultPlan[] = deepFreeze([
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
      cutoffMinutes: 12 * HOURS,
      renewalWindowDays: DEFAULT_RENEWAL_WINDOW_DAYS,
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
      cutoffMinutes: 12 * HOURS,
      renewalWindowDays: DEFAULT_RENEWAL_WINDOW_DAYS,
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
      cutoffMinutes: 24 * HOURS,
      returnsPerMonth: 2,
      renewalWindowDays: DEFAULT_RENEWAL_WINDOW_DAYS,
    },
  },
]);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/**
 * The default plans to copy into a new workspace: fresh objects every call, so what a workspace
 * stores is never the template itself and a change to one copy touches no other (AC12).
 */
export function defaultOffers(): DefaultPlan[] {
  return structuredClone(DEFAULT_PLANS) as DefaultPlan[];
}
