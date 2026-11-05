import { type AddressField, decideAddressLookup } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import { addressIssueCode } from '../address-issues.ts';
import {
  internalServerErrorResponse,
  NOT_FOUND,
  toValidationError,
  ValidationErrorSchema,
} from '../errors.ts';

// The address lookup (F015, spec #424): the street and the city of a Dutch postcode, house number
// and addition, from the PDOK Locatieserver in production and a fake elsewhere (`ApiDependencies`).
// Forms use it to fill the address (the workspace's location now, later address forms reuse it).
// The Owner only, because the form is in the workspace settings; the rules of the query are in
// `@fivvi/domain`. Privacy: PDOK gets the postcode, number and addition and nothing else, and the
// query and the answer are never logged, reported or sent as a product event.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/** Lookups per workspace per hour. */
const LOOKUP_LIMIT = { max: 60, windowMinutes: 60 };

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

export const AddressLookupQuerySchema = z.object({
  postcode: z.string().openapi({
    description: 'A Dutch postcode: four digits, an optional space, two letters.',
  }),
  houseNumber: z.string().openapi({
    description: 'One to five digits.',
  }),
  addition: z
    .string()
    .optional()
    .openapi({
      description:
        'The house number addition, for example `A` or `2 hoog`: at most 10 letters, digits, ' +
        'spaces and hyphens. Optional.',
    }),
});

export const FoundAddressSchema = z
  .object({
    street: z.string().openapi({ description: 'The street, as the BAG writes it.' }),
    city: z.string().openapi({ description: 'The city, as the BAG writes it.' }),
  })
  .openapi('AddressLookupResult', { description: 'The street and the city of an address.' });

const UnavailableSchema = z.object({ code: z.enum(['unavailable']) }).openapi('Unavailable', {
  description:
    'The address service did not answer in time or answered with an error. Try again later. ' +
    'Contains no user-facing text.',
});

const RateLimitedSchema = z.object({ code: z.enum(['rate_limited']) }).openapi('RateLimited', {
  description:
    'Too many requests for this workspace in the last hour. Contains no user-facing text.',
});

// The query's names in the validation issues; the domain calls the addition `houseNumberAddition`.
const PARAMETER: Record<AddressField, string> = {
  postcode: 'postcode',
  houseNumber: 'houseNumber',
  houseNumberAddition: 'addition',
  street: 'street',
  city: 'city',
};

const lookupAddressRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/address-lookup',
    operationId: 'lookupAddress',
    tags: ['locations'],
    summary: 'The street and city of a postcode and house number',
    description:
      'Looks up a Dutch address by postcode, house number and optional addition and answers its ' +
      'street and city (the Owner only; a Trainer gets `403`). `404` when no address has that ' +
      'postcode, number and addition; `503` when the address service does not answer within 3 ' +
      'seconds or fails (the person fills the address in by hand); `422` for a postcode that is ' +
      'not Dutch, a house number that is not one to five digits or an addition that is too long ' +
      'or holds anything but letters, digits, spaces and hyphens (the service is not called); ' +
      '`429` after 60 lookups per workspace in an hour. The service receives the postcode, the ' +
      'house number and the addition only; nothing is logged.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: AddressLookupQuerySchema },
    responses: {
      200: {
        description: 'The street and the city.',
        content: { 'application/json': { schema: FoundAddressSchema } },
      },
      422: {
        description:
          'The postcode, house number or addition is not valid. The service is not called.',
        content: { 'application/json': { schema: ValidationErrorSchema } },
      },
      429: {
        description: 'More than 60 lookups for this workspace in the last hour.',
        content: { 'application/json': { schema: RateLimitedSchema } },
      },
      500: internalServerErrorResponse,
      503: {
        description: 'The address service did not answer in time, or failed.',
        content: { 'application/json': { schema: UnavailableSchema } },
      },
    },
  },
  { type: 'workspace', capability: 'settings.manage', client: 'none' },
);

export function registerAddressLookup(app: OpenAPIHono) {
  const lookups = new OpenAPIHono<WorkspaceEnv>({
    // The invalid input of this route is a `422`, whatever is wrong with it (a missing parameter
    // included); the other routes answer `400`.
    defaultHook: (result, c) => {
      if (!result.success) return c.json(toValidationError(result.error), 422);
      return undefined;
    },
  });
  lookups.openapi(lookupAddressRoute, async (c) => {
    const { postcode, houseNumber, addition } = c.req.valid('query');
    const decision = decideAddressLookup({ postcode, houseNumber, houseNumberAddition: addition });
    if (!decision.ok) {
      return c.json(
        {
          code: 'validation_failed' as const,
          issues: decision.issues.map(({ field, problem }) => ({
            path: PARAMETER[field],
            code: addressIssueCode(problem),
          })),
        },
        422,
      );
    }
    const dependencies = c.get('dependencies');
    // After the access and the validation: a refused caller and an invalid query use nothing up.
    // The key is the workspace ID, no person; the counter lives outside the request's transaction.
    const { allowed } = await dependencies.consumeRateLimit(
      `address-lookup:${c.get('scope').workspaceId}`,
      LOOKUP_LIMIT,
    );
    if (!allowed) return c.json({ code: 'rate_limited' as const }, 429);
    const query = decision.query;
    const result = await dependencies.addressLookup.lookup(
      query.postcode,
      query.houseNumber,
      query.houseNumberAddition,
    );
    if (result === 'not-found') return c.json(NOT_FOUND, 404);
    if (result === 'unavailable') return c.json({ code: 'unavailable' as const }, 503);
    return c.json({ street: result.street, city: result.city }, 200);
  });
  app.route('/', lookups);
}
