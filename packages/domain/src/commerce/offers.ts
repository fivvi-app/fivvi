// Offers (F052, spec #468, ticket #785): what makes an offer valid for its kind, how it reads in one
// line and the cancellation sentence a client sees. Pure rules, no I/O: the routes ask, the
// repositories store the answer, and every platform shows the text this returns. Amounts are
// integers in cents including VAT and rates are basis points (2100 is 21 %); no float is accepted.

import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import { createTranslator } from 'use-intl/core';

/** The four kinds of offer (`PRODUCT.md §90`). There is no fifth kind. */
export const OFFER_KINDS = [
  'membership',
  'credit_pack',
  'credit_plan',
  'single_class_pass',
] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

/**
 * The kinds of credit. A credit offer grants exactly one of them, never both. Open Gym credits
 * come back with Open Gym (F034 to F036, `PRODUCT.md §53`).
 */
export const CREDIT_KINDS = ['group', 'private'] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

/** How often a recurring offer is billed (`PRODUCT.md §90`). */
export const BILLING_CYCLES = ['month', 'four_weeks'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** What happens when a term ends: the agreement stops, or continues per cycle until notice. */
export const END_OF_TERMS = ['stop', 'continue'] as const;
export type EndOfTerm = (typeof END_OF_TERMS)[number];

/** The unit of a credit pack's validity. */
export const VALIDITY_UNITS = ['day', 'week', 'month'] as const;
export type ValidityUnit = (typeof VALIDITY_UNITS)[number];

/** The VAT rates of an offer, in basis points: 21 % or 9 %. 0 % is not one of them (F052). */
export const VAT_RATES_BASIS_POINTS = [2100, 900] as const;

/** The renewal window of an offer when the owner sets none, in days. */
export const DEFAULT_RENEWAL_WINDOW_DAYS = 30;

/** The bounds of the offer fields, inclusive (`PRODUCT.md §90` to §95, spec #468 CM-02). */
export const OFFER_LIMITS = {
  priceCents: { min: 1, max: 1_000_000 },
  classesPerWeek: { min: 1, max: 7 },
  termMonths: { min: 1, max: 24 },
  /** A first term over this many months needs an explicit confirmation (consumer law). */
  termMonthsWithoutConfirmation: 12,
  makeupsPerMonth: { min: 0, max: 10 },
  cutoffHours: { min: 0, max: 72 },
  packCredits: { min: 1, max: 200 },
  validityAmount: { min: 1 },
  planCredits: { min: 1, max: 50 },
  minimumTermMonths: { min: 0, max: 12 },
  carryOverLimit: { min: 0, max: 50 },
  renewalWindowDays: { min: 0, max: 365 },
} as const;

export type OfferField =
  | 'kind'
  | 'priceCents'
  | 'vatRateBasisPoints'
  | 'creditKind'
  | 'classesPerWeek'
  | 'termMonths'
  | 'billingCycle'
  | 'endOfTerm'
  | 'makeupsPerMonth'
  | 'credits'
  | 'validity'
  | 'minimumTermMonths'
  | 'carryOverLimit'
  | 'cutoffMinutes'
  | 'renewalWindowDays';

export interface OfferIssue {
  readonly field: OfferField;
  /**
   * `missing`: a required field is empty. `not-integer`: not a whole number (a float, a string, NaN).
   * `too-low` / `too-high`: outside the bounds. `invalid`: not one of the allowed values.
   * `not-allowed`: the field does not belong to this kind or workspace. `confirmation-required`: a
   * term over 12 months without the confirmation flag. `not-whole-hours`: a cutoff that is not a
   * whole number of hours.
   */
  readonly problem:
    | 'missing'
    | 'not-integer'
    | 'too-low'
    | 'too-high'
    | 'invalid'
    | 'not-allowed'
    | 'confirmation-required'
    | 'not-whole-hours';
}

export interface Validity {
  readonly amount: number;
  readonly unit: ValidityUnit;
}

/** The fields every kind has. Price and VAT rate are null while an offer is off and not priced yet. */
interface OfferBase {
  readonly priceCents: number | null;
  readonly vatRateBasisPoints: number | null;
  /** Minutes before the start up to which a client cancels for free: a whole number of hours. */
  readonly cutoffMinutes: number;
}

export interface MembershipOffer extends OfferBase {
  readonly kind: 'membership';
  readonly classesPerWeek: number;
  readonly termMonths: number;
  readonly billingCycle: BillingCycle;
  readonly endOfTerm: EndOfTerm;
  readonly makeupsPerMonth: number;
  readonly renewalWindowDays: number;
}

export interface CreditPackOffer extends OfferBase {
  readonly kind: 'credit_pack';
  readonly creditKind: CreditKind;
  readonly credits: number;
  readonly validity: Validity;
  readonly renewalWindowDays: number;
}

export interface CreditPlanOffer extends OfferBase {
  readonly kind: 'credit_plan';
  readonly creditKind: CreditKind;
  /** Credits granted every billing cycle. */
  readonly credits: number;
  readonly billingCycle: BillingCycle;
  readonly minimumTermMonths: number;
  readonly endOfTerm: EndOfTerm;
  readonly carryOverLimit: number;
  readonly renewalWindowDays: number;
}

export interface SingleClassPassOffer extends OfferBase {
  readonly kind: 'single_class_pass';
}

/** An offer whose fields are valid for its kind. */
export type ValidOffer = MembershipOffer | CreditPackOffer | CreditPlanOffer | SingleClassPassOffer;

export type OfferDecision =
  | { readonly ok: true; readonly offer: ValidOffer }
  | { readonly ok: false; readonly issues: readonly OfferIssue[] };

export interface ValidateOfferOptions {
  /**
   * The offer is switched on: it needs a price and, unless the workspace charges no VAT, a VAT rate.
   * An offer that is off may have neither yet (a default plan). Default: off.
   */
  readonly switchedOn?: boolean;
  /**
   * The workspace charges VAT. When it does not (*Ik reken geen btw*, F059) its offers have no VAT
   * rate. Default: it does.
   */
  readonly chargesVat?: boolean;
}

type Fields = Readonly<Record<string, unknown>>;

// The readers below return a fallback value next to the issue they record. A decision with an
// issue never exposes the values, so the fallback exists only to keep the code straight.

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null;
}

function readInteger(
  fields: Fields,
  field: OfferField,
  min: number,
  max: number,
  issues: OfferIssue[],
): number {
  const value = fields[field];
  if (isEmpty(value)) {
    issues.push({ field, problem: 'missing' });
  } else if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push({ field, problem: 'not-integer' });
  } else if (value < min) {
    issues.push({ field, problem: 'too-low' });
  } else if (value > max) {
    issues.push({ field, problem: 'too-high' });
  } else {
    return value;
  }
  return min;
}

function readOption<T extends string>(
  fields: Fields,
  field: OfferField,
  allowed: readonly T[],
  issues: OfferIssue[],
): T {
  const value = fields[field];
  const found = allowed.find((option) => option === value);
  if (found !== undefined) return found;
  issues.push({ field, problem: isEmpty(value) ? 'missing' : 'invalid' });
  return allowed[0] as T;
}

function readPrice(fields: Fields, options: ValidateOfferOptions, issues: OfferIssue[]) {
  if (isEmpty(fields.priceCents)) {
    if (options.switchedOn) issues.push({ field: 'priceCents', problem: 'missing' });
    return null;
  }
  const { min, max } = OFFER_LIMITS.priceCents;
  return readInteger(fields, 'priceCents', min, max, issues);
}

function readVatRate(fields: Fields, options: ValidateOfferOptions, issues: OfferIssue[]) {
  const value = fields.vatRateBasisPoints;
  if (options.chargesVat === false) {
    if (!isEmpty(value)) issues.push({ field: 'vatRateBasisPoints', problem: 'not-allowed' });
    return null;
  }
  if (isEmpty(value)) {
    if (options.switchedOn) issues.push({ field: 'vatRateBasisPoints', problem: 'missing' });
    return null;
  }
  const found = VAT_RATES_BASIS_POINTS.find((rate) => rate === value);
  if (found !== undefined) return found;
  issues.push({ field: 'vatRateBasisPoints', problem: 'invalid' });
  return null;
}

function readCutoff(fields: Fields, issues: OfferIssue[]): number {
  const { min, max } = OFFER_LIMITS.cutoffHours;
  const before = issues.length;
  const minutes = readInteger(fields, 'cutoffMinutes', min * 60, max * 60, issues);
  if (issues.length === before && minutes % 60 !== 0) {
    issues.push({ field: 'cutoffMinutes', problem: 'not-whole-hours' });
  }
  return minutes;
}

function readRenewalWindow(fields: Fields, issues: OfferIssue[]): number {
  if (isEmpty(fields.renewalWindowDays)) return DEFAULT_RENEWAL_WINDOW_DAYS;
  const { min, max } = OFFER_LIMITS.renewalWindowDays;
  return readInteger(fields, 'renewalWindowDays', min, max, issues);
}

function readCreditKind(fields: Fields, issues: OfferIssue[]): CreditKind {
  // An array, or any other value, is not one credit kind: a credit offer never mixes kinds.
  return readOption(fields, 'creditKind', CREDIT_KINDS, issues);
}

function refuseCreditKind(fields: Fields, issues: OfferIssue[]): void {
  if (!isEmpty(fields.creditKind)) issues.push({ field: 'creditKind', problem: 'not-allowed' });
}

function readValidity(fields: Fields, issues: OfferIssue[]): Validity {
  const fallback: Validity = { amount: OFFER_LIMITS.validityAmount.min, unit: 'day' };
  const value = fields.validity;
  if (isEmpty(value)) {
    issues.push({ field: 'validity', problem: 'missing' });
    return fallback;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ field: 'validity', problem: 'invalid' });
    return fallback;
  }
  const { amount, unit } = value as Fields;
  const found = VALIDITY_UNITS.find((option) => option === unit);
  const { min } = OFFER_LIMITS.validityAmount;
  let problem: OfferIssue['problem'] | undefined;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) problem = 'not-integer';
  else if (amount < min) problem = 'too-low';
  else if (found === undefined) problem = 'invalid';
  if (problem || found === undefined || typeof amount !== 'number') {
    issues.push({ field: 'validity', problem: problem ?? 'invalid' });
    return fallback;
  }
  return { amount, unit: found };
}

function readMembership(
  fields: Fields,
  priceCents: number | null,
  vatRateBasisPoints: number | null,
  issues: OfferIssue[],
): MembershipOffer {
  refuseCreditKind(fields, issues);
  const classes = OFFER_LIMITS.classesPerWeek;
  const classesPerWeek = readInteger(fields, 'classesPerWeek', classes.min, classes.max, issues);
  const term = OFFER_LIMITS.termMonths;
  const termMonths = readInteger(fields, 'termMonths', term.min, term.max, issues);
  if (
    termMonths > OFFER_LIMITS.termMonthsWithoutConfirmation &&
    fields.longTermConfirmed !== true &&
    !issues.some((issue) => issue.field === 'termMonths')
  ) {
    issues.push({ field: 'termMonths', problem: 'confirmation-required' });
  }
  const billingCycle = readOption(fields, 'billingCycle', BILLING_CYCLES, issues);
  const endOfTerm = readOption(fields, 'endOfTerm', END_OF_TERMS, issues);
  const makeups = OFFER_LIMITS.makeupsPerMonth;
  const makeupsPerMonth = readInteger(fields, 'makeupsPerMonth', makeups.min, makeups.max, issues);
  const cutoffMinutes = readCutoff(fields, issues);
  const renewalWindowDays = readRenewalWindow(fields, issues);
  return {
    kind: 'membership',
    priceCents,
    vatRateBasisPoints,
    classesPerWeek,
    termMonths,
    billingCycle,
    endOfTerm,
    makeupsPerMonth,
    cutoffMinutes,
    renewalWindowDays,
  };
}

function readCreditPack(
  fields: Fields,
  priceCents: number | null,
  vatRateBasisPoints: number | null,
  issues: OfferIssue[],
): CreditPackOffer {
  const creditKind = readCreditKind(fields, issues);
  const pack = OFFER_LIMITS.packCredits;
  const credits = readInteger(fields, 'credits', pack.min, pack.max, issues);
  const validity = readValidity(fields, issues);
  const cutoffMinutes = readCutoff(fields, issues);
  const renewalWindowDays = readRenewalWindow(fields, issues);
  return {
    kind: 'credit_pack',
    priceCents,
    vatRateBasisPoints,
    creditKind,
    credits,
    validity,
    cutoffMinutes,
    renewalWindowDays,
  };
}

function readCreditPlan(
  fields: Fields,
  priceCents: number | null,
  vatRateBasisPoints: number | null,
  issues: OfferIssue[],
): CreditPlanOffer {
  const creditKind = readCreditKind(fields, issues);
  const plan = OFFER_LIMITS.planCredits;
  const credits = readInteger(fields, 'credits', plan.min, plan.max, issues);
  const billingCycle = readOption(fields, 'billingCycle', BILLING_CYCLES, issues);
  const term = OFFER_LIMITS.minimumTermMonths;
  const minimumTermMonths = readInteger(fields, 'minimumTermMonths', term.min, term.max, issues);
  const endOfTerm = readOption(fields, 'endOfTerm', END_OF_TERMS, issues);
  const carry = OFFER_LIMITS.carryOverLimit;
  const carryOverLimit = readInteger(fields, 'carryOverLimit', carry.min, carry.max, issues);
  const cutoffMinutes = readCutoff(fields, issues);
  const renewalWindowDays = readRenewalWindow(fields, issues);
  return {
    kind: 'credit_plan',
    priceCents,
    vatRateBasisPoints,
    creditKind,
    credits,
    billingCycle,
    minimumTermMonths,
    endOfTerm,
    carryOverLimit,
    cutoffMinutes,
    renewalWindowDays,
  };
}

function readSingleClassPass(
  fields: Fields,
  priceCents: number | null,
  vatRateBasisPoints: number | null,
  issues: OfferIssue[],
): SingleClassPassOffer {
  refuseCreditKind(fields, issues);
  const cutoffMinutes = readCutoff(fields, issues);
  // Any price within the bounds is valid: Fivvi never compares it with other offers (owner,
  // 9 November 2026).
  return { kind: 'single_class_pass', priceCents, vatRateBasisPoints, cutoffMinutes };
}

/**
 * Whether the typed fields make a valid offer of `kind`, and the offer when they do. Every invalid
 * value has its own issue, in field order: price, VAT rate, then the fields of the kind. A kind
 * other than the four, and a credit kind other than one of group or private, are invalid. A
 * membership term over 12 months is valid only with `longTermConfirmed: true`. Fields that do not
 * belong to the kind are ignored, except `creditKind`.
 */
export function validateOffer(
  kind: unknown,
  fields: Fields,
  options: ValidateOfferOptions = {},
): OfferDecision {
  const known = OFFER_KINDS.find((option) => option === kind);
  if (known === undefined) return { ok: false, issues: [{ field: 'kind', problem: 'invalid' }] };
  const issues: OfferIssue[] = [];
  const priceCents = readPrice(fields, options, issues);
  const vatRateBasisPoints = readVatRate(fields, options, issues);
  const offer = {
    membership: readMembership,
    credit_pack: readCreditPack,
    credit_plan: readCreditPlan,
    single_class_pass: readSingleClassPass,
  }[known](fields, priceCents, vatRateBasisPoints, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, offer };
}

function assertWholeCents(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError('An amount is a non-negative whole number of cents');
  }
}

/** An amount in cents as the owner and clients read it: `€ 79,00` in Dutch, `€79.00` in English. */
export function formatEuros(cents: number, locale: Locale): string {
  assertWholeCents(cents);
  const euros = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  const dutch = locale === 'nl-NL';
  const whole = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, dutch ? '.' : ',');
  return dutch ? `€ ${whole},${fraction}` : `€${whole}.${fraction}`;
}

/** A VAT rate in basis points as it reads: `21 %` in Dutch, `21%` in English. */
export function formatVatRate(basisPoints: number, locale: Locale): string {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError('A VAT rate is a non-negative whole number of basis points');
  }
  const dutch = locale === 'nl-NL';
  const percent = String(basisPoints / 100).replace('.', dutch ? ',' : '.');
  return dutch ? `${percent} %` : `${percent}%`;
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

const translators = new Map<Locale, Translator>();

// The wording is in the catalogs (`offers.*`), never here. A missing key or placeholder throws, so
// a broken message fails the tests instead of reaching a client.
function translatorFor(locale: Locale): Translator {
  let translator = translators.get(locale);
  if (!translator) {
    const created = createTranslator({
      locale: formattingLocales[locale],
      messages: messages[locale],
      onError: (error) => {
        throw error;
      },
    });
    translator = (key, values) => created(key as never, values as never);
    translators.set(locale, translator);
  }
  return translator;
}

const SEPARATOR = ' · ';

function creditsText(t: Translator, creditKind: CreditKind, count: number): string {
  return t(
    creditKind === 'group' ? 'offers.summary.groupCredits' : 'offers.summary.privateCredits',
    {
      count,
    },
  );
}

function validityText(t: Translator, validity: Validity): string {
  const key = { day: 'days', week: 'weeks', month: 'months' }[validity.unit];
  return t(`offers.summary.${key}`, { count: validity.amount });
}

function monthsText(t: Translator, count: number): string {
  return t('offers.summary.months', { count });
}

function recurringPrice(t: Translator, cents: number, cycle: BillingCycle, locale: Locale): string {
  const key =
    cycle === 'month' ? 'offers.summary.pricePerMonth' : 'offers.summary.pricePerFourWeeks';
  return t(key, { amount: formatEuros(cents, locale) });
}

/**
 * The one-line summary of an offer in `locale`, the parts joined by ` · `, e.g. "2 lessen per week ·
 * 6 maanden · € 79,00 per maand" / "10 group credits · valid for 3 months · €150.00". An offer
 * without a price yet (a default plan) leaves the amount out. `classNames` are the classes the
 * offer is limited to; they follow the first part ("2 lessen per week · Kracht, Mobility · …"), and
 * none means all group classes.
 */
export function summarise(
  offer: ValidOffer,
  locale: Locale,
  classNames: readonly string[] = [],
): string {
  const t = translatorFor(locale);
  const price = offer.priceCents;
  let lead: string;
  const rest: string[] = [];
  switch (offer.kind) {
    case 'membership':
      lead = t('offers.summary.classesPerWeek', { count: offer.classesPerWeek });
      rest.push(monthsText(t, offer.termMonths));
      if (price !== null) rest.push(recurringPrice(t, price, offer.billingCycle, locale));
      break;
    case 'credit_pack':
      lead = creditsText(t, offer.creditKind, offer.credits);
      rest.push(t('offers.summary.validFor', { duration: validityText(t, offer.validity) }));
      if (price !== null) rest.push(formatEuros(price, locale));
      break;
    case 'credit_plan': {
      const key =
        offer.billingCycle === 'month'
          ? 'offers.summary.creditsEveryMonth'
          : 'offers.summary.creditsEveryFourWeeks';
      lead = t(key, { credits: creditsText(t, offer.creditKind, offer.credits) });
      if (offer.minimumTermMonths > 0) {
        rest.push(
          t('offers.summary.minimumTerm', { duration: monthsText(t, offer.minimumTermMonths) }),
        );
      }
      if (price !== null) rest.push(recurringPrice(t, price, offer.billingCycle, locale));
      break;
    }
    case 'single_class_pass':
      lead = t('offers.summary.singleClass');
      if (price !== null) rest.push(formatEuros(price, locale));
      break;
  }
  const classes = classNames.length > 0 ? [classNames.join(', ')] : [];
  return [lead, ...classes, ...rest].join(SEPARATOR);
}

/**
 * The cancellation rule as the sentence clients read, from the cutoff in minutes (a whole number of
 * hours): "Je kunt tot 12 uur van tevoren gratis annuleren." / "You can cancel free of charge up to
 * 12 hours before.", and for 0 "…tot de start…" / "…until the start.".
 */
export function cancellationSentence(cutoffMinutes: number, locale: Locale): string {
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes % 60 !== 0) {
    throw new RangeError('A cancellation cutoff is a non-negative whole number of hours');
  }
  const t = translatorFor(locale);
  return cutoffMinutes === 0
    ? t('offers.cancellation.untilStart')
    : t('offers.cancellation.upTo', { count: cutoffMinutes / 60 });
}
