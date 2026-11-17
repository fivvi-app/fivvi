import {
  type CoveredClass,
  changeOffer,
  createOffer,
  findOffer,
  listCoveredClasses,
  listOffers,
  type OfferTerms,
  type OfferView,
  runningAgreementCounts,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  BILLING_CYCLES,
  CREDIT_KINDS,
  cancellationSentence,
  coveredClassLabel,
  END_OF_TERMS,
  OFFER_KINDS,
  OFFER_LIMITS,
  type OfferIssue,
  summarise,
  VALIDITY_UNITS,
  type ValidOffer,
  validateOffer,
} from '@fivvi/domain';
import {
  type Locale,
  parseAcceptLanguage,
  pickContentLanguage,
  resolveInterfaceLanguage,
} from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  internalServerErrorResponse,
  NOT_FOUND,
  toValidationError,
  ValidationErrorSchema,
  validationErrorResponse,
} from '../errors.ts';

// The offers of a workspace (F052, spec #468, ticket #796): the Owner lists them, reads one,
// creates one and edits one, and every saved change is a new, immutable offer version: a running
// agreement (F057) keeps the version it started on. The rules (what a valid offer of each kind is,
// the summary line, the cancellation sentence) are in @fivvi/domain (`validateOffer`, `summarise`,
// `cancellationSentence`); the tables are `offers` and `offer_versions` (packages/database).
// Money is integers: the price in euro cents including VAT, the VAT rate in basis points.
//
// A request body that is not what the contract says (a fifth kind, two credit kinds, a price that
// is not a whole number) and a body the rules refuse (an amount out of bounds, a term over 12
// months without the confirmation) are both `422`, in the shape of the contract's validation error:
// the path is the field and the code says what is wrong. A bad path parameter is a `400`.
//
// The texts are user content: the Dutch and the English text as the Owner wrote them, never
// machine-translated. The summary and the cancellation sentence are in the language of the caller
// (their stored language, else `Accept-Language`, else English, ADR-017).

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const LIMITS = OFFER_LIMITS;
const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const OfferParamsSchema = WorkspaceParamsSchema.extend({
  offerId: z.uuid().openapi({
    param: { name: 'offerId', in: 'path' },
    description: 'The offer ID.',
  }),
});

const OfferKindSchema = z.enum(OFFER_KINDS).openapi('OfferKind', {
  description:
    'The kind of offer: `membership`, `credit_pack`, `credit_plan` or `single_class_pass`. There ' +
    'is no fifth kind, and it never changes once the offer exists.',
});

const CreditKindSchema = z.enum(CREDIT_KINDS).openapi('OfferCreditKind', {
  description:
    'What a credit pack or credit plan grants: `group` or `private`. One kind per offer, never ' +
    'both.',
});

const OfferStatusSchema = z.enum(['off', 'on', 'archived']).openapi('OfferStatus', {
  description:
    '`off` is not for sale, `on` is, `archived` is a deleted offer whose agreements still run.',
});

const BillingCycleSchema = z.enum(BILLING_CYCLES).openapi('OfferBillingCycle', {
  description: 'How often a recurring offer is billed: every `month` or every `four_weeks`.',
});

const EndOfTermSchema = z.enum(END_OF_TERMS).openapi('OfferEndOfTerm', {
  description:
    'What happens when a term ends: the agreement `stop`s, or `continue`s per billing cycle until ' +
    'notice.',
});

const ValiditySchema = z
  .object({
    amount: z.number().int().openapi({ description: 'How many units, at least 1.' }),
    unit: z.enum(VALIDITY_UNITS).openapi({ description: '`day`, `week` or `month`.' }),
  })
  .openapi('OfferValidity', { description: 'How long a credit pack is good for.' });

const CoveredClassSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The class ID.' }),
    name: z
      .string()
      .nullable()
      .openapi({
        description:
          'The class’s name in the caller’s language (the English name when the caller reads ' +
          'English and there is one, else the Dutch). `null` for a class that was removed with its ' +
          'name.',
      }),
    deleted: z.boolean().openapi({
      description: 'Whether the class is gone since this version was saved.',
    }),
    label: z.string().openapi({
      description:
        'How the class is listed in the caller’s language: its name, with "(verwijderd)" / ' +
        '"(deleted)" after it when it is gone.',
    }),
  })
  .openapi('OfferCoveredClass', { description: 'A group class an offer version is limited to.' });

const OfferVersionSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The version ID: what an agreement points at.' }),
    version: z.number().int().openapi({
      description: 'The version number: 1 for the first, one more for every saved change.',
    }),
    nameNl: z.string().openapi({ description: 'The Dutch name: always there.' }),
    nameEn: z.string().nullable().openapi({ description: 'The English name, or `null`.' }),
    descriptionNl: z.string().nullable().openapi({ description: 'The Dutch description.' }),
    descriptionEn: z.string().nullable().openapi({ description: 'The English description.' }),
    priceCents: z
      .number()
      .int()
      .nullable()
      .openapi({
        description:
          'The price including VAT in euro cents, 1 to 1,000,000; `null` until the owner sets it ' +
          '(a default plan).',
      }),
    vatRateBasisPoints: z.number().int().nullable().openapi({
      description: 'The VAT rate in basis points: 2100 or 900; `null` until chosen. Never 0.',
    }),
    billingCycle: BillingCycleSchema.nullable(),
    termMonths: z.number().int().nullable().openapi({ description: 'A membership’s term.' }),
    minimumTermMonths: z
      .number()
      .int()
      .nullable()
      .openapi({ description: 'A credit plan’s minimum term in months.' }),
    endOfTerm: EndOfTermSchema.nullable(),
    classesPerWeek: z.number().int().nullable().openapi({ description: 'A membership’s classes.' }),
    credits: z.number().int().nullable().openapi({
      description: 'Credits of a pack, or credits per billing cycle of a plan.',
    }),
    validity: ValiditySchema.nullable(),
    carryOverLimit: z.number().int().nullable().openapi({
      description: 'The most credits a credit plan carries over to the next cycle.',
    }),
    oncePerClient: z.boolean().openapi({ description: 'A credit pack a client buys once.' }),
    membersOnly: z.boolean().openapi({ description: 'Sold only to clients with a membership.' }),
    cutoffMinutes: z.number().int().openapi({
      description: 'Minutes before the start up to which a client cancels for free: whole hours.',
    }),
    makeupsPerMonth: z
      .number()
      .int()
      .nullable()
      .openapi({ description: 'A membership’s makeups.' }),
    returnsPerMonth: z.number().int().nullable().openapi({
      description: 'The most credits that come back a month on a timely cancellation; `null`: all.',
    }),
    coveredClasses: z.array(CoveredClassSchema).nullable().openapi({
      description: 'The classes the version is limited to; `null`: all group classes.',
    }),
    renewalWindowDays: z.number().int().nullable().openapi({
      description: 'Days before the end that renewing is suggested and the client is reminded.',
    }),
    createdAt: z.iso
      .datetime()
      .openapi({ description: 'When the version was saved, a UTC instant.' }),
  })
  .openapi('OfferVersion', {
    description:
      'The terms of an offer as of one saved change. Never changes once stored: an agreement keeps ' +
      'the version it started on.',
  });

const OfferSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The offer ID.' }),
    kind: OfferKindSchema,
    creditKind: CreditKindSchema.nullable().openapi({
      description: 'For a credit pack or credit plan; `null` otherwise.',
    }),
    status: OfferStatusSchema,
    origin: z.enum(['default', 'owner']).openapi({
      description: '`default` for a copy of one of Fivvi’s default plans, `owner` for the rest.',
    }),
    runningAgreements: z.number().int().openapi({
      description: 'How many agreements run on the offer: 0 until agreements exist (F057).',
    }),
    summary: z.string().openapi({
      description:
        'The one-line summary in the caller’s language, e.g. "2 lessen per week · 6 maanden · € ' +
        '79,00 per maand". Without a price the amount is left out.',
    }),
    cancellation: z.string().openapi({
      description: 'The cancellation rule as clients read it, in the caller’s language.',
    }),
    currentVersion: OfferVersionSchema,
  })
  .openapi('Offer', {
    description:
      'An offer of the workspace with its current version. A saved change is a new version; the ' +
      'versions before it stay as they were.',
  });

// A text of the form: trimmed; blank means "no text". The Dutch name alone is required.
const optionalText = (maxLength: number, what: string) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .openapi({ description: `${what}: trimmed, at most ${maxLength} characters. Blank: none.` });

const whole = (what: string) => z.number().int().optional().openapi({ description: what });

/**
 * The fields of an offer version, as the Owner's form sends them. Which of them belong to a kind,
 * and their bounds, are the domain's rules (`validateOffer`): a field that does not belong to the
 * kind is ignored and not stored.
 */
const offerFields = {
  nameNl: z
    .string()
    .trim()
    .min(1)
    .max(NAME_MAX_LENGTH)
    .openapi({ description: `The Dutch name: trimmed, 1 to ${NAME_MAX_LENGTH} characters.` }),
  nameEn: optionalText(NAME_MAX_LENGTH, 'The English name'),
  descriptionNl: optionalText(DESCRIPTION_MAX_LENGTH, 'The Dutch description'),
  descriptionEn: optionalText(DESCRIPTION_MAX_LENGTH, 'The English description'),
  priceCents: z
    .number()
    .int()
    .nullable()
    .optional()
    .openapi({
      description:
        `The price including VAT in euro cents, ${LIMITS.priceCents.min} to ` +
        `${LIMITS.priceCents.max}. \`null\` or left out: no price yet (an offer without a price ` +
        'can be saved but not switched on). A non-whole number or one out of bounds answers ' +
        '`422`.',
    }),
  vatRateBasisPoints: z
    .number()
    .int()
    .nullable()
    .optional()
    .openapi({ description: 'The VAT rate in basis points: 2100 (21 %) or 900 (9 %). Never 0.' }),
  billingCycle: BillingCycleSchema.nullable().optional(),
  termMonths: whole(
    `A membership’s term in months, ${LIMITS.termMonths.min} to ${LIMITS.termMonths.max}.`,
  ),
  longTermConfirmed: z
    .boolean()
    .optional()
    .openapi({
      description:
        `The owner confirmed a first term over ${LIMITS.termMonthsWithoutConfirmation} months ` +
        '(consumer law). A longer term without it answers `422` on `termMonths`.',
    }),
  minimumTermMonths: whole(
    `A credit plan’s minimum term in months, ${LIMITS.minimumTermMonths.min} to ` +
      `${LIMITS.minimumTermMonths.max}.`,
  ),
  endOfTerm: EndOfTermSchema.nullable().optional(),
  classesPerWeek: whole(
    `A membership’s classes a week, ${LIMITS.classesPerWeek.min} to ${LIMITS.classesPerWeek.max}.`,
  ),
  credits: whole(
    `A credit pack’s credits (${LIMITS.packCredits.min} to ${LIMITS.packCredits.max}), or a ` +
      `credit plan’s credits per billing cycle (${LIMITS.planCredits.min} to ` +
      `${LIMITS.planCredits.max}).`,
  ),
  validity: ValiditySchema.nullable().optional(),
  carryOverLimit: whole(
    `A credit plan’s carry-over, ${LIMITS.carryOverLimit.min} to ${LIMITS.carryOverLimit.max}.`,
  ),
  oncePerClient: z
    .boolean()
    .optional()
    .openapi({ description: 'A credit pack a client can buy once. Default `false`.' }),
  membersOnly: z.boolean().optional().openapi({
    description:
      'Sold only to clients with a membership (credits and the single class pass). Default `false`.',
  }),
  cutoffMinutes: whole(
    `Minutes before the start up to which a client cancels for free: a whole number of hours, ` +
      `${LIMITS.cutoffHours.min * 60} to ${LIMITS.cutoffHours.max * 60}.`,
  ),
  makeupsPerMonth: whole(
    `A membership’s makeups a month, ${LIMITS.makeupsPerMonth.min} to ` +
      `${LIMITS.makeupsPerMonth.max}.`,
  ),
  returnsPerMonth: z
    .number()
    .int()
    .nullable()
    .optional()
    .openapi({
      description:
        'Credit offers: the most credits that come back a month on a timely cancellation, ' +
        `${LIMITS.returnsPerMonth.min} to ${LIMITS.returnsPerMonth.max}. \`null\` or left out: ` +
        'always.',
    }),
  coveredClassIds: z
    .array(z.uuid())
    .nullable()
    .optional()
    .openapi({
      description:
        `The group classes the offer is limited to, ${LIMITS.coveredClasses.min} to ` +
        `${LIMITS.coveredClasses.max} (a membership, a group credit offer or the single class ` +
        'pass). `null` or left out: all group classes. A class of another workspace, or one that ' +
        'was deleted and is not on the offer already, answers `422` on `coveredClassIds`.',
    }),
  renewalWindowDays: whole(
    `Days before the end that renewing is suggested, ${LIMITS.renewalWindowDays.min} to ` +
      `${LIMITS.renewalWindowDays.max}. Left out: 30.`,
  ),
};

const surfaceField = z
  .enum(['ios', 'android'])
  .optional()
  .openapi({
    description:
      'The app that sends the request: `ios` or `android`. A request with a bearer token records ' +
      'the `offer_created` event with this surface; without it nothing is recorded. The web does ' +
      'not send it, and a request without a bearer token ignores it.',
  });

const CreateOfferBodySchema = z
  .object({
    kind: OfferKindSchema,
    creditKind: CreditKindSchema.nullable().optional().openapi({
      description: 'Required for a credit pack and a credit plan; refused for the other kinds.',
    }),
    ...offerFields,
    surface: surfaceField,
  })
  .openapi('CreateOfferRequest', {
    description:
      'A new offer: its kind, for credits the credit kind, and the fields of its first version. ' +
      'It starts switched off.',
  });

const UpdateOfferBodySchema = z
  .object({
    version: z
      .number()
      .int()
      .openapi({
        description:
          'The version the caller read (`Offer.currentVersion.version`). When the offer has been ' +
          'changed since, nothing is stored and the answer is `409`.',
      }),
    creditKind: CreditKindSchema.nullable()
      .optional()
      .openapi({
        description:
          'A credit offer’s credit kind, which can change while no agreement uses it. Left out: ' +
          'unchanged. Refused for the other kinds.',
      }),
    ...offerFields,
  })
  .openapi('UpdateOfferRequest', {
    description:
      'The full set of fields of the offer’s next version, with the version it was changed from. ' +
      'A field left out is empty in the new version, not kept from the old one. The offer’s kind ' +
      'never changes.',
  });

const OfferChangedSchema = z
  .object({ code: z.enum(['offer_changed']), offer: OfferSchema })
  .openapi('OfferChanged', {
    description:
      'The offer changed since the version in the request; nothing was written. `offer` is the ' +
      'offer as it is now.',
  });

const OfferInvalidSchema = ValidationErrorSchema;

const manageOffers = {
  type: 'workspace',
  capability: 'commerce.offers.manage',
  client: 'none',
} as const;

const invalidResponse = {
  description:
    'The body is not valid: a field has the wrong type, is out of bounds, does not belong to the ' +
    'kind, or needs a confirmation. `issues` names each field (`path`) and what is wrong (`code`). ' +
    'Nothing is stored.',
  content: { 'application/json': { schema: OfferInvalidSchema } },
};

const listOffersRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/offers',
    operationId: 'listOffers',
    tags: ['offers'],
    summary: 'The offers of a workspace',
    description:
      'Every offer of the workspace by Dutch name, archived ones included (`status`), each with its ' +
      'current version, the summary line in the caller’s language and the number of running ' +
      'agreements. The Owner only; a Trainer and a client of the workspace get `403`, anyone with ' +
      'no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The offers.',
        content: { 'application/json': { schema: z.array(OfferSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageOffers,
);

const getOfferRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/offers/{offerId}',
    operationId: 'getOffer',
    tags: ['offers'],
    summary: 'One offer of a workspace',
    description:
      'One offer with its current version. The Owner only. An offer of another workspace ' +
      'answers `404`.',
    security: SIGNED_IN,
    request: { params: OfferParamsSchema },
    responses: {
      200: {
        description: 'The offer.',
        content: { 'application/json': { schema: OfferSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageOffers,
);

const createOfferRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/offers',
    operationId: 'createOffer',
    tags: ['offers'],
    summary: 'Create an offer',
    description:
      'Creates an offer of one kind (and, for credits, one credit kind) with the fields of its ' +
      'first version, validated by the rules of its kind. The new offer is switched off. An ' +
      'amount outside 1 to 1,000,000 cents or not a whole number, a fifth kind, two credit kinds ' +
      'and a term over 12 months without `longTermConfirmed` answer `422` and store nothing. The ' +
      'Owner only.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CreateOfferBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'The offer that was created, switched off, at version 1.',
        content: { 'application/json': { schema: OfferSchema } },
      },
      400: validationErrorResponse,
      422: invalidResponse,
      500: internalServerErrorResponse,
    },
  },
  manageOffers,
);

const updateOfferRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/offers/{offerId}',
    operationId: 'updateOffer',
    tags: ['offers'],
    summary: 'Change an offer: a new version',
    description:
      'Saves the full set of fields as the offer’s next version, from the version the caller ' +
      'read; the versions before it stay as they were, so agreements that run keep their terms. ' +
      'When the offer has a newer version the answer is `409` with the offer as it is now and ' +
      'nothing is stored. The kind never changes; a credit offer’s credit kind can. An offer ' +
      'that is switched on must stay valid to be sold: it keeps a price and a VAT rate. The ' +
      'Owner only.',
    security: SIGNED_IN,
    request: {
      params: OfferParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateOfferBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The offer with its new version as the current one.',
        content: { 'application/json': { schema: OfferSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The offer changed since the version in the request; nothing was written.',
        content: { 'application/json': { schema: OfferChangedSchema } },
      },
      422: invalidResponse,
      500: internalServerErrorResponse,
    },
  },
  manageOffers,
);

/** The language of the reader (ADR-017): their stored language, else `Accept-Language`, else English. */
function readerLocaleOf(c: Context<WorkspaceEnv>): Locale {
  return resolveInterfaceLanguage({
    stored: c.get('account').preferredLocale,
    requested: parseAcceptLanguage(c.req.header('accept-language')),
  });
}

/** A blank text of a form is no text. */
const textOrNull = (value: string | null | undefined) =>
  value === undefined || value === null || value === '' ? null : value;

/**
 * The offer as the domain's rules take it, from what is stored (every stored version was valid
 * when it was saved; a switched-on offer's price and VAT rate are there, a long term was
 * confirmed then).
 */
function validOfferOf(offer: OfferView): ValidOffer {
  const { version } = offer;
  const decision = validateOffer(offer.kind, {
    ...version,
    creditKind: offer.creditKind,
    validity:
      version.validityAmount === null
        ? null
        : { amount: version.validityAmount, unit: version.validityUnit },
    longTermConfirmed: true,
  });
  if (!decision.ok) throw new Error('A stored offer version is not a valid offer.');
  return decision.offer;
}

/** How the classes of an offer version are listed in the language of the reader. */
function shownClasses(
  ids: readonly string[] | null,
  known: ReadonlyMap<string, CoveredClass>,
  locale: Locale,
) {
  if (ids === null) return null;
  return ids.map((id) => {
    const found = known.get(id);
    const name = found ? pickContentLanguage(locale, found.nameNl, found.nameEn) : null;
    const deleted = found?.deleted ?? true;
    return { id, name, deleted, label: coveredClassLabel(name, deleted, locale) };
  });
}

async function shownOffers(scope: WorkspaceScope, offers: readonly OfferView[], locale: Locale) {
  const counts = await runningAgreementCounts(
    scope,
    offers.map(({ id }) => id),
  );
  const known = new Map(
    (
      await listCoveredClasses(
        scope,
        offers.flatMap(({ version }) => version.coveredClassIds ?? []),
      )
    ).map((found) => [found.id, found]),
  );
  return offers.map((offer) => {
    const { version } = offer;
    const coveredClasses = shownClasses(version.coveredClassIds, known, locale);
    return {
      id: offer.id,
      kind: offer.kind,
      creditKind: offer.creditKind,
      status: offer.status,
      origin: offer.origin,
      runningAgreements: counts.get(offer.id) ?? 0,
      summary: summarise(
        validOfferOf(offer),
        locale,
        (coveredClasses ?? []).map(({ label }) => label),
      ),
      cancellation: cancellationSentence(version.cutoffMinutes, locale),
      currentVersion: {
        id: version.id,
        version: version.version,
        nameNl: version.nameNl,
        nameEn: version.nameEn,
        descriptionNl: version.descriptionNl,
        descriptionEn: version.descriptionEn,
        priceCents: version.priceCents,
        vatRateBasisPoints: version.vatRateBasisPoints,
        billingCycle: version.billingCycle,
        termMonths: version.termMonths,
        minimumTermMonths: version.minimumTermMonths,
        endOfTerm: version.endOfTerm,
        classesPerWeek: version.classesPerWeek,
        credits: version.credits,
        validity:
          version.validityAmount === null || version.validityUnit === null
            ? null
            : { amount: version.validityAmount, unit: version.validityUnit },
        carryOverLimit: version.carryOverLimit,
        oncePerClient: version.oncePerClient,
        membersOnly: version.membersOnly,
        cutoffMinutes: version.cutoffMinutes,
        makeupsPerMonth: version.makeupsPerMonth,
        returnsPerMonth: version.returnsPerMonth,
        coveredClasses,
        renewalWindowDays: version.renewalWindowDays,
        createdAt: version.createdAt.toISOString(),
      },
    };
  });
}

type OfferBody = z.infer<typeof CreateOfferBodySchema> | z.infer<typeof UpdateOfferBodySchema>;

/** A refusal of the typed input, in the shape of the contract's validation error. */
function invalid(issues: readonly { path: string; code: string }[]) {
  return { code: 'validation_failed' as const, issues: [...issues] };
}

const issuesOfRules = (issues: readonly OfferIssue[]) =>
  issues.map(({ field, problem }) => ({ path: field, code: problem }));

/** What the offer's fields become once the rules have accepted them, for storing. */
function termsOf(offer: ValidOffer, body: OfferBody): OfferTerms {
  const common = {
    nameNl: body.nameNl,
    nameEn: textOrNull(body.nameEn),
    descriptionNl: textOrNull(body.descriptionNl),
    descriptionEn: textOrNull(body.descriptionEn),
    priceCents: offer.priceCents,
    vatRateBasisPoints: offer.vatRateBasisPoints,
    cutoffMinutes: offer.cutoffMinutes,
    coveredClassIds: offer.coveredClassIds,
  };
  switch (offer.kind) {
    case 'membership':
      return {
        ...common,
        classesPerWeek: offer.classesPerWeek,
        termMonths: offer.termMonths,
        billingCycle: offer.billingCycle,
        endOfTerm: offer.endOfTerm,
        makeupsPerMonth: offer.makeupsPerMonth,
        renewalWindowDays: offer.renewalWindowDays,
      };
    case 'credit_pack':
      return {
        ...common,
        credits: offer.credits,
        validity: offer.validity,
        oncePerClient: offer.oncePerClient,
        membersOnly: offer.membersOnly,
        returnsPerMonth: offer.returnsPerMonth,
        renewalWindowDays: offer.renewalWindowDays,
      };
    case 'credit_plan':
      return {
        ...common,
        credits: offer.credits,
        billingCycle: offer.billingCycle,
        minimumTermMonths: offer.minimumTermMonths,
        endOfTerm: offer.endOfTerm,
        carryOverLimit: offer.carryOverLimit,
        membersOnly: offer.membersOnly,
        returnsPerMonth: offer.returnsPerMonth,
        renewalWindowDays: offer.renewalWindowDays,
      };
    case 'single_class_pass':
      return { ...common, membersOnly: offer.membersOnly };
  }
}

/**
 * The body checked against the rules of the kind (the domain's `validateOffer`) and against the
 * classes it names, which must be classes of the workspace: the terms to store, or the issues to
 * answer `422` with. A class that was deleted can stay on an offer, but is not added to one:
 * `keptClassIds` are the classes of the version the change starts from.
 */
async function decideOffer(
  scope: WorkspaceScope,
  kind: OfferView['kind'],
  creditKind: string | null | undefined,
  body: OfferBody,
  options: { switchedOn: boolean; keptClassIds: readonly string[] | null },
) {
  const decision = validateOffer(
    kind,
    { ...body, creditKind: creditKind ?? undefined },
    { switchedOn: options.switchedOn },
  );
  if (!decision.ok) return { ok: false as const, issues: issuesOfRules(decision.issues) };
  const wanted = decision.offer.coveredClassIds;
  if (wanted !== null) {
    const kept = new Set(options.keptClassIds ?? []);
    const found = new Map((await listCoveredClasses(scope, wanted)).map((one) => [one.id, one]));
    const usable = wanted.every((id) => {
      const one = found.get(id);
      return one !== undefined && (!one.deleted || kept.has(id));
    });
    if (!usable) {
      return { ok: false as const, issues: [{ path: 'coveredClassIds', code: 'invalid' }] };
    }
  }
  return { ok: true as const, terms: termsOf(decision.offer, body) };
}

/** One offer as shown to the reader. */
async function shownOffer(scope: WorkspaceScope, offer: OfferView, locale: Locale) {
  const [shown] = await shownOffers(scope, [offer], locale);
  if (!shown) throw new Error('The offer was not shown.');
  return shown;
}

/**
 * The event of the surface the request came from: the web sends no bearer token; an app names its
 * surface, and one that names none records nothing, as the API does not guess.
 */
const surfaceOf = (authorization: string | undefined, named: 'ios' | 'android' | undefined) =>
  authorization ? named : ('web' as const);

export function registerOffers(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({
    // A body that does not match the contract is a `422`, like one the rules refuse; a bad path
    // parameter is a `400`.
    defaultHook: (result, c) => {
      if (result.success) return undefined;
      return c.json(toValidationError(result.error), result.target === 'json' ? 422 : 400);
    },
  });

  router.openapi(listOffersRoute, async (c) => {
    const scope = c.get('scope');
    return c.json(await shownOffers(scope, await listOffers(scope), readerLocaleOf(c)), 200);
  });

  router.openapi(getOfferRoute, async (c) => {
    const scope = c.get('scope');
    const { offerId } = c.req.valid('param');
    const offer = await findOffer(scope, offerId);
    if (!offer) return c.json(NOT_FOUND, 404);
    return c.json(await shownOffer(scope, offer, readerLocaleOf(c)), 200);
  });

  router.openapi(createOfferRoute, async (c) => {
    const scope = c.get('scope');
    const body = c.req.valid('json');
    const decision = await decideOffer(scope, body.kind, body.creditKind, body, {
      switchedOn: false,
      keptClassIds: null,
    });
    if (!decision.ok) return c.json(invalid(decision.issues), 422);
    const id = await createOffer(scope, {
      kind: body.kind,
      creditKind:
        body.kind === 'credit_pack' || body.kind === 'credit_plan'
          ? (body.creditKind ?? null)
          : null,
      defaultPlan: null,
      terms: decision.terms,
    });
    const created = await findOffer(scope, id);
    if (!created) throw new Error('The offer was not found after it was stored.');

    // The workspace ID, the kind and the surface only: no name, description or price
    // (OBSERVABILITY.md §4). The web sends no bearer token; an app names its surface.
    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (surface !== undefined) {
      const distinctId = c.get('account').id;
      c.get('afterCommit')(() =>
        c.get('dependencies').productEvents.track({
          event: 'offer_created',
          distinctId,
          properties: { workspace_id: scope.workspaceId, kind: created.kind, surface },
        }),
      );
    }
    return c.json(await shownOffer(scope, created, readerLocaleOf(c)), 201);
  });

  router.openapi(updateOfferRoute, async (c) => {
    const scope = c.get('scope');
    const { offerId } = c.req.valid('param');
    const body = c.req.valid('json');
    const locale = readerLocaleOf(c);
    const current = await findOffer(scope, offerId);
    if (!current) return c.json(NOT_FOUND, 404);
    // The 409 rolls the request's transaction back; nothing was stored.
    const changed = async (offer: OfferView) => ({
      code: 'offer_changed' as const,
      offer: await shownOffer(scope, offer, locale),
    });
    // A save from an old version never gets as far as the rules.
    if (current.version.version !== body.version) return c.json(await changed(current), 409);

    const isCredit = current.kind === 'credit_pack' || current.kind === 'credit_plan';
    const creditKind = body.creditKind ?? (isCredit ? current.creditKind : null);
    const decision = await decideOffer(scope, current.kind, creditKind, body, {
      switchedOn: current.status === 'on',
      keptClassIds: current.version.coveredClassIds,
    });
    if (!decision.ok) return c.json(invalid(decision.issues), 422);

    const result = await changeOffer(scope, offerId, {
      expectedVersion: body.version,
      ...(isCredit && creditKind !== null ? { creditKind } : {}),
      terms: decision.terms,
    });
    if (result.outcome === 'not-found') return c.json(NOT_FOUND, 404);
    // Lost a race with another save between the read and the write: show what won.
    if (result.outcome === 'stale') return c.json(await changed(result.offer), 409);
    return c.json(await shownOffer(scope, result.offer, locale), 200);
  });

  app.route('/', router);
}
