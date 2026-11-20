import {
  type BillingDetailsView,
  findBillingDetails,
  saveBillingDetails,
  type WorkspaceScope,
} from '@fivvi/database';
import { decideBillingDetails } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  ValidationErrorSchema,
  validationErrorResponse,
} from '../errors.ts';

// The billing details of a client (F059, spec #474, ticket #853): *Factuur op naam van een
// bedrijf* with the company name, address and VAT number, per client of a workspace. The client
// reads and saves their own (CW-04, `…/me/billing-details`); the Owner reads and saves a client's on
// their behalf (TW-02, `…/clients/{clientId}/billing-details`), and the record says the team
// changed it. A change applies to invoices issued afterwards. The rules are in @fivvi/domain; the
// table is `client_billing_details` (packages/database).

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const ClientParamsSchema = WorkspaceParamsSchema.extend({
  clientId: z.uuid().openapi({
    param: { name: 'clientId', in: 'path' },
    description: 'The client ID: the client’s record in this workspace.',
  }),
});

export const BillingDetailsSchema = z
  .object({
    clientId: z.uuid().openapi({ description: 'The client these details belong to.' }),
    asCompany: z.boolean().openapi({
      description:
        '*Factuur op naam van een bedrijf* / *Invoice in a company’s name*. Off: invoices use ' +
        'the client’s name and every field below is `null`.',
    }),
    companyName: z.string().nullable(),
    street: z.string().nullable(),
    houseNumber: z.string().nullable().openapi({ description: 'One to five digits.' }),
    houseNumberAddition: z.string().nullable(),
    postcode: z.string().nullable().openapi({ description: 'Stored as `1234 AB`.' }),
    city: z.string().nullable(),
    vatNumber: z.string().nullable().openapi({
      description: '`NL` + 9 digits + `B` + 2 digits; `null` when the client gave none.',
    }),
    changedBy: z
      .enum(['client', 'team'])
      .nullable()
      .openapi({
        description:
          'Who changed them last: the `client` themselves or the `team` on their behalf. `null` ' +
          'while nobody has saved any.',
      }),
    changedAt: z.iso.datetime().nullable().openapi({
      description: 'When they were last saved; `null` while nobody has saved any.',
    }),
  })
  .openapi('BillingDetails', {
    description:
      'A client’s billing details in one workspace. A client of two workspaces has two ' +
      'separate sets; a client who saved none has `asCompany: false` and `null` fields.',
  });

const SaveBillingDetailsRequestSchema = z
  .object({
    asCompany: z.boolean().openapi({
      description:
        'Whether invoices are made out to a company. Off: the other fields are ignored and ' +
        'cleared.',
    }),
    companyName: z.string().nullable().optional().openapi({
      description: 'Required with `asCompany`, at most 120 characters.',
    }),
    street: z.string().nullable().optional().openapi({
      description: 'Required with `asCompany`, at most 120 characters.',
    }),
    houseNumber: z.string().nullable().optional().openapi({
      description: 'Required with `asCompany`: one to five digits.',
    }),
    houseNumberAddition: z.string().nullable().optional().openapi({
      description: 'For example `A` or `2 hoog`; at most 10 characters.',
    }),
    postcode: z.string().nullable().optional().openapi({
      description: 'Required with `asCompany`: a Dutch postcode.',
    }),
    city: z.string().nullable().optional().openapi({
      description: 'Required with `asCompany`, at most 120 characters.',
    }),
    vatNumber: z.string().nullable().optional().openapi({
      description:
        'Optional: empty or `null` is accepted; given, it is `NL` + 9 digits + `B` + 2 digits.',
    }),
  })
  .openapi('SaveBillingDetailsRequest', {
    description:
      'The billing details as typed, replacing what was saved. With `asCompany` the company ' +
      'name and the address are required, and a field that fails answers `422` with its name and ' +
      'code; nothing is saved.',
  });

const unprocessable = {
  description:
    'With the company switch on, a required field is empty or a field has the wrong format: ' +
    'the issues name the field and the code (`required`, `too_long`, `invalid`, ' +
    '`invalid_vat_number`). Nothing was saved.',
  content: { 'application/json': { schema: ValidationErrorSchema } },
};

const ownerOnly = { type: 'workspace', capability: 'invoices.manage', client: 'none' } as const;
// No capability: no team member as such, only a client of the workspace, and only their own record.
const clientSelf = { type: 'workspace', client: 'own-records' } as const;

const getClientBillingDetailsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/clients/{clientId}/billing-details',
    operationId: 'getClientBillingDetails',
    tags: ['invoices'],
    summary: 'The billing details of a client',
    description:
      'The billing details of one client of the workspace (the Owner only; a Trainer or a ' +
      'client gets `403`). A client who saved none has `asCompany: false`. A client of another ' +
      'workspace, or one that does not exist, answers `404`.',
    security: SIGNED_IN,
    request: { params: ClientParamsSchema },
    responses: {
      200: {
        description: 'The client’s billing details.',
        content: { 'application/json': { schema: BillingDetailsSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  ownerOnly,
);

const putClientBillingDetailsRoute = defineRoute(
  {
    method: 'put',
    path: '/v1/workspaces/{workspaceId}/clients/{clientId}/billing-details',
    operationId: 'putClientBillingDetails',
    tags: ['invoices'],
    summary: 'Save the billing details of a client on their behalf',
    description:
      'Saves a client’s billing details as typed, replacing what was saved (the Owner only; a ' +
      'Trainer or a client gets `403`). The record notes that the team changed it ' +
      '(`changedBy: team`). They apply to the client’s next invoices; issued ones never change. ' +
      'A client of another workspace, or one that does not exist, answers `404`.',
    security: SIGNED_IN,
    request: {
      params: ClientParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SaveBillingDetailsRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The saved billing details.',
        content: { 'application/json': { schema: BillingDetailsSchema } },
      },
      400: validationErrorResponse,
      422: unprocessable,
      500: internalServerErrorResponse,
    },
  },
  ownerOnly,
);

const getMyBillingDetailsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/me/billing-details',
    operationId: 'getMyBillingDetails',
    tags: ['invoices'],
    summary: 'My billing details at a workspace',
    description:
      'The signed-in client’s own billing details at this workspace. A client of two ' +
      'workspaces has a separate set in each. A person who is not a client of the workspace ' +
      'answers `404`, a team member who is not also a client `403`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The client’s own billing details.',
        content: { 'application/json': { schema: BillingDetailsSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  clientSelf,
);

const putMyBillingDetailsRoute = defineRoute(
  {
    method: 'put',
    path: '/v1/workspaces/{workspaceId}/me/billing-details',
    operationId: 'putMyBillingDetails',
    tags: ['invoices'],
    summary: 'Save my billing details at a workspace',
    description:
      'Saves the signed-in client’s own billing details at this workspace, replacing what was ' +
      'saved. The record notes that the client changed them (`changedBy: client`). They apply ' +
      'to the next invoices; issued ones never change.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SaveBillingDetailsRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The saved billing details.',
        content: { 'application/json': { schema: BillingDetailsSchema } },
      },
      400: validationErrorResponse,
      422: unprocessable,
      500: internalServerErrorResponse,
    },
  },
  clientSelf,
);

/** What the contract shows of the stored details. */
function show(view: BillingDetailsView): z.infer<typeof BillingDetailsSchema> {
  return { ...view, changedAt: view.changedAt?.toISOString() ?? null };
}

/** The billing details the typed body stands for, or the issues that refuse it. */
function decide(body: z.infer<typeof SaveBillingDetailsRequestSchema>) {
  return decideBillingDetails({
    asCompany: body.asCompany,
    companyName: body.companyName ?? '',
    street: body.street ?? '',
    houseNumber: body.houseNumber ?? '',
    houseNumberAddition: body.houseNumberAddition,
    postcode: body.postcode ?? '',
    city: body.city ?? '',
    vatNumber: body.vatNumber,
  });
}

function issues(decision: Extract<ReturnType<typeof decide>, { ok: false }>) {
  return {
    code: 'validation_failed' as const,
    issues: decision.issues.map(({ field, code }) => ({ path: field, code })),
  };
}

/** The client the scope acts as: the caller's own client record in the workspace. */
function ownClientId(scope: WorkspaceScope): string {
  const { clientId } = scope.context;
  // A client route admits only a caller with a client record (access.ts); this cannot be empty.
  if (!clientId) throw new Error('A client route ran without a client.');
  return clientId;
}

export function registerBillingDetails(app: OpenAPIHono) {
  const details = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  details.openapi(getClientBillingDetailsRoute, async (c) => {
    const view = await findBillingDetails(c.get('scope'), c.req.valid('param').clientId);
    return view ? c.json(show(view), 200) : c.json(NOT_FOUND, 404);
  });
  details.openapi(putClientBillingDetailsRoute, async (c) => {
    const decision = decide(c.req.valid('json'));
    if (!decision.ok) return c.json(issues(decision), 422);
    const view = await saveBillingDetails(
      c.get('scope'),
      c.req.valid('param').clientId,
      decision.billing,
      'team',
    );
    return view ? c.json(show(view), 200) : c.json(NOT_FOUND, 404);
  });

  details.openapi(getMyBillingDetailsRoute, async (c) => {
    const scope = c.get('scope');
    const view = await findBillingDetails(scope, ownClientId(scope));
    return view ? c.json(show(view), 200) : c.json(NOT_FOUND, 404);
  });
  details.openapi(putMyBillingDetailsRoute, async (c) => {
    const scope = c.get('scope');
    const decision = decide(c.req.valid('json'));
    if (!decision.ok) return c.json(issues(decision), 422);
    const view = await saveBillingDetails(scope, ownClientId(scope), decision.billing, 'client');
    return view ? c.json(show(view), 200) : c.json(NOT_FOUND, 404);
  });

  app.route('/', details);
}
