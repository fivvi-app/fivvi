import { listLocations, updateLocation } from '@fivvi/database';
import {
  ADDRESS_ADDITION_MAX_LENGTH,
  ADDRESS_TEXT_MAX_LENGTH,
  decideAddress,
  LOCATION_NAME_MAX_LENGTH,
  LOCATION_TYPES,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import { addressIssueCode } from '../address-issues.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';

// The locations of a workspace (F015, spec #424). At go-live a workspace has exactly one, its
// own, made with the workspace; the Owner names it and gives it an address, every team member
// reads it. There is no route to create or delete one: M7 adds them without a breaking change,
// because the read already returns a list. The rules (the postcode, an address all or nothing)
// are in @fivvi/domain; the table is `locations` (packages/database).

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const LocationParamsSchema = WorkspaceParamsSchema.extend({
  locationId: z.uuid().openapi({
    param: { name: 'locationId', in: 'path' },
    description: 'The location ID.',
  }),
});

export const LocationTypeSchema = z.enum(LOCATION_TYPES).openapi('LocationType', {
  description:
    'The kind of location. Every workspace has one `organization_location` (its own) at ' +
    'go-live; the other kinds exist in the model for later and are not written yet.',
});

export const LocationAddressSchema = z
  .object({
    postcode: z.string().openapi({ description: 'A Dutch postcode, stored as `1234 AB`.' }),
    houseNumber: z.string().openapi({ description: 'One to five digits.' }),
    houseNumberAddition: z.string().nullable().openapi({
      description: 'For example `A` or `2 hoog`; `null` when there is none.',
    }),
    street: z.string(),
    city: z.string(),
  })
  .openapi('LocationAddress', { description: 'A Dutch address: all of it, or none.' });

export const LocationSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The location ID.' }),
    name: z.string().openapi({ description: 'The name sessions show, up to 120 characters.' }),
    type: LocationTypeSchema,
    address: LocationAddressSchema.nullable().openapi({
      description: 'The address, or `null` when the location has none.',
    }),
    isDefault: z.boolean().openapi({
      description:
        'Whether this is the workspace’s default location, the one every new session takes.',
    }),
  })
  .openapi('Location', { description: 'A place where sessions of the workspace take place.' });

const LocationAddressInputSchema = z
  .object({
    postcode: z.string().openapi({
      description:
        'A Dutch postcode: four digits, an optional space, two letters. Stored as `1234 AB`.',
    }),
    houseNumber: z.string().openapi({ description: 'One to five digits.' }),
    houseNumberAddition: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: 'For example `A` or `2 hoog`; optional, at most 10 characters.' }),
    street: z.string().openapi({ description: 'At most 120 characters.' }),
    city: z.string().openapi({ description: 'At most 120 characters.' }),
  })
  .openapi('LocationAddressInput', {
    description:
      'An address as typed. All or nothing: with any field filled, the postcode, house number, ' +
      'street and city are required.',
  });

/**
 * The domain's verdict on a typed address, as the validation errors of the contract (the codes of
 * `addressIssueCode`).
 */
function checkAddress(
  body: z.infer<typeof LocationAddressInputSchema> | null | undefined,
  ctx: z.RefinementCtx,
) {
  const decision = decideAddress(body);
  if (decision.ok) return;
  for (const { field, problem } of decision.issues) {
    const path = ['address', field];
    const input = body?.[field] ?? '';
    const maximum =
      field === 'houseNumberAddition' ? ADDRESS_ADDITION_MAX_LENGTH : ADDRESS_TEXT_MAX_LENGTH;
    const code = addressIssueCode(problem);
    if (code === 'too_small') {
      ctx.addIssue({ code, origin: 'string', minimum: 1, path, input });
    } else if (code === 'invalid_format') {
      ctx.addIssue({ code, format: 'regex', pattern: '', path, input });
    } else {
      ctx.addIssue({ code, origin: 'string', maximum, path, input });
    }
  }
}

const UpdateLocationRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(LOCATION_NAME_MAX_LENGTH)
      .optional()
      .openapi({ description: 'The new name: trimmed, not blank, at most 120 characters.' }),
    // No `.openapi({ description })` after `.nullable().optional()`: it would inline the named
    // component. What the field does is in the description of the request.
    address: LocationAddressInputSchema.nullable().optional(),
  })
  // A body with neither changes nothing; it is refused on `name`, as for a workspace.
  .refine((body) => body.name !== undefined || body.address !== undefined, {
    path: ['name'],
    error: 'Give the name, the address or both.',
  })
  .superRefine((body, ctx) => checkAddress(body.address, ctx))
  .openapi('UpdateLocationRequest', {
    description:
      'Changes a location: its name, its address (a Dutch one, all or nothing; the postcode is ' +
      'stored as `1234 AB`), or both. `address: null` removes the address; leave `address` out to ' +
      'keep it as it is. The type and which location is the default never change. Other fields ' +
      'are ignored.',
  });

const listLocationsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/locations',
    operationId: 'listLocations',
    tags: ['locations'],
    summary: 'The locations of a workspace',
    description:
      'The workspace’s locations, the default first. At go-live that is the one location of the ' +
      'gym, marked `isDefault`. Every team member may read it (sessions show it); a client of ' +
      'the workspace gets `403`, a person with no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The locations.',
        content: { 'application/json': { schema: z.array(LocationSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'location.read', client: 'none' },
);

const updateLocationRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/locations/{locationId}',
    operationId: 'updateLocation',
    tags: ['locations'],
    summary: 'Change a location’s name or address',
    description:
      'Changes the name and/or the address of one location of the workspace (the Owner only; a ' +
      'Trainer gets `403`). The name is trimmed, not blank and at most 120 characters. The ' +
      'address is Dutch and all or nothing: a half-filled one, or a postcode that is not Dutch, ' +
      'answers `400` and nothing changes; `"1234ab"` is stored as `"1234 AB"`; `null` removes ' +
      'the address. A location of another workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: LocationParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateLocationRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The location with its changes.',
        content: { 'application/json': { schema: LocationSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'settings.manage', client: 'none' },
);

export function registerLocations(app: OpenAPIHono) {
  const locations = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  locations.openapi(listLocationsRoute, async (c) =>
    c.json(await listLocations(c.get('scope')), 200),
  );
  locations.openapi(updateLocationRoute, async (c) => {
    const { locationId } = c.req.valid('param');
    const { name, address } = c.req.valid('json');
    // The schema has checked the address; this is the same rule giving the normalized one.
    const decision = decideAddress(address);
    if (!decision.ok) throw new Error('A refused address reached the handler.');
    const location = await updateLocation(c.get('scope'), locationId, {
      ...(name === undefined ? {} : { name }),
      ...(address === undefined ? {} : { address: decision.address }),
    });
    if (!location) return c.json(NOT_FOUND, 404);
    // The workspace ID only: the Owner's account UUID is the pseudonymous ID, and neither the
    // name nor the address leaves (OBSERVABILITY.md §4).
    c.get('dependencies').productEvents.track({
      event: 'location_updated',
      distinctId: c.get('account').id,
      properties: { workspace_id: c.get('scope').workspaceId },
    });
    return c.json(location, 200);
  });
  app.route('/', locations);
}
