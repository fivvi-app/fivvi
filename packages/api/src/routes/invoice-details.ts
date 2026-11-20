import {
  findInvoiceQuestionEmail,
  findInvoiceSettings,
  type InvoiceSettingsView,
  saveInvoiceSettings,
} from '@fivvi/database';
import { decideInvoiceSettings, isInvoiceDetailsComplete } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  ValidationErrorSchema,
  validationErrorResponse,
} from '../errors.ts';

// The invoice details of a workspace (F059, spec #474, ticket #852): what the Owner enters on
// *Instellingen → Facturen* (CM-11), the seller on every invoice, and the switch *Ik reken geen
// btw*. Only the Owner reads and saves them; a change applies to invoices issued afterwards. The
// rules (the KvK and VAT number formats, what is required, the question email) are in
// @fivvi/domain; the table is `workspace_invoice_details` (packages/database).

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const nullableText = (description: string) => z.string().nullable().openapi({ description });

export const InvoiceDetailsSchema = z
  .object({
    legalName: nullableText('The official business name; `null` until details were saved.'),
    street: nullableText('The street; `null` until details were saved.'),
    houseNumber: nullableText('One to five digits; `null` until details were saved.'),
    houseNumberAddition: nullableText('For example `A` or `2 hoog`; `null` when there is none.'),
    postcode: nullableText('Stored as `1234 AB`; `null` until details were saved.'),
    city: nullableText('The city; `null` until details were saved.'),
    kvkNumber: nullableText('Eight digits; `null` until details were saved.'),
    vatNumber: nullableText('`NL` + 9 digits + `B` + 2 digits; `null` until details were saved.'),
    questionEmail: nullableText(
      'The email address for invoice questions as the Owner saved it; `null` when left empty, ' +
        'then the Owner’s own address is used.',
    ),
    effectiveQuestionEmail: nullableText(
      'The address invoice questions go to: `questionEmail`, else the first Owner’s address.',
    ),
    noVat: z.boolean().openapi({
      description:
        '*Ik reken geen btw* / *I don’t charge VAT*: off for a workspace that never saved details. ' +
        'It applies to invoices issued from then on.',
    }),
    complete: z.boolean().openapi({
      description:
        'Whether the invoice details are complete. Offers can be switched on only when they are.',
    }),
  })
  .openapi('InvoiceDetails', {
    description:
      'The invoice details of a workspace: the seller on every invoice, the email for invoice ' +
      'questions and the no-VAT switch. Before the first save every text field is `null`.',
  });

const SaveInvoiceDetailsRequestSchema = z
  .object({
    legalName: z
      .string()
      .openapi({ description: 'The official business name, at most 120 characters.' }),
    street: z.string().openapi({ description: 'The street, at most 120 characters.' }),
    houseNumber: z.string().openapi({ description: 'One to five digits.' }),
    houseNumberAddition: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: 'For example `A` or `2 hoog`; at most 10 characters.' }),
    postcode: z.string().openapi({
      description: 'A Dutch postcode: four digits, an optional space, two letters.',
    }),
    city: z.string().openapi({ description: 'The city, at most 120 characters.' }),
    kvkNumber: z.string().openapi({ description: 'Exactly eight digits.' }),
    vatNumber: z.string().openapi({
      description: '`NL` + 9 digits + `B` + 2 digits; typed in lower case it is kept in capitals.',
    }),
    questionEmail: z.string().nullable().optional().openapi({
      description:
        'The email address for invoice questions; empty or `null` uses the Owner’s own address.',
    }),
    noVat: z.boolean().openapi({
      description: '*Ik reken geen btw*: whether the workspace charges no VAT from now on.',
    }),
  })
  .openapi('SaveInvoiceDetailsRequest', {
    description:
      'The invoice details as typed, replacing what was saved. Everything but the house number ' +
      'addition and the question email is required; a field that fails answers `422` with its ' +
      'name and code, and nothing is saved.',
  });

const getInvoiceDetailsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/settings/invoice-details',
    operationId: 'getInvoiceDetails',
    tags: ['invoices'],
    summary: 'The invoice details of a workspace',
    description:
      'The seller’s invoice details, the email for invoice questions and the no-VAT switch of ' +
      'the workspace (the Owner only; a Trainer gets `403`). A workspace that never saved them ' +
      'answers `200` with `null` fields, `noVat: false` and `complete: false`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The invoice details.',
        content: { 'application/json': { schema: InvoiceDetailsSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'invoices.manage', client: 'none' },
);

const putInvoiceDetailsRoute = defineRoute(
  {
    method: 'put',
    path: '/v1/workspaces/{workspaceId}/settings/invoice-details',
    operationId: 'putInvoiceDetails',
    tags: ['invoices'],
    summary: 'Save the invoice details of a workspace',
    description:
      'Saves the invoice details as typed, replacing what was saved (the Owner only; a Trainer ' +
      'gets `403`). The KvK number is eight digits and the VAT number `NL` + 9 digits + `B` + 2 ' +
      'digits; a field that is empty or does not match answers `422` with its name and code ' +
      '(`required`, `too_long`, `invalid`, `invalid_kvk_number`, `invalid_vat_number`, ' +
      '`invalid_email`) and nothing is saved. A body that is not shaped like the request answers ' +
      '`400`. The changes apply to invoices issued afterwards; issued ones never change.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SaveInvoiceDetailsRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The saved invoice details.',
        content: { 'application/json': { schema: InvoiceDetailsSchema } },
      },
      400: validationErrorResponse,
      422: {
        description:
          'A field is empty or has the wrong format: the issues name the field and the code. ' +
          'Nothing was saved.',
        content: { 'application/json': { schema: ValidationErrorSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'invoices.manage', client: 'none' },
);

/** What the contract shows of what is stored (or of nothing stored yet). */
function show(
  settings: InvoiceSettingsView | undefined,
  effectiveQuestionEmail: string | undefined,
): z.infer<typeof InvoiceDetailsSchema> {
  return {
    legalName: settings?.legalName ?? null,
    street: settings?.street ?? null,
    houseNumber: settings?.houseNumber ?? null,
    houseNumberAddition: settings?.houseNumberAddition ?? null,
    postcode: settings?.postcode ?? null,
    city: settings?.city ?? null,
    kvkNumber: settings?.kvkNumber ?? null,
    vatNumber: settings?.vatNumber ?? null,
    questionEmail: settings?.questionEmail ?? null,
    effectiveQuestionEmail: effectiveQuestionEmail ?? null,
    noVat: settings?.noVat ?? false,
    complete: isInvoiceDetailsComplete(settings),
  };
}

export function registerInvoiceDetails(app: OpenAPIHono) {
  const details = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  details.openapi(getInvoiceDetailsRoute, async (c) => {
    const scope = c.get('scope');
    // One after the other: the request's transaction has one client.
    const settings = await findInvoiceSettings(scope);
    return c.json(show(settings, await findInvoiceQuestionEmail(scope, settings)), 200);
  });
  details.openapi(putInvoiceDetailsRoute, async (c) => {
    const scope = c.get('scope');
    const decision = decideInvoiceSettings(c.req.valid('json'));
    if (!decision.ok) {
      return c.json(
        {
          code: 'validation_failed' as const,
          issues: decision.issues.map(({ field, code }) => ({ path: field, code })),
        },
        422,
      );
    }
    const saved = await saveInvoiceSettings(scope, decision.settings);
    return c.json(show(saved, await findInvoiceQuestionEmail(scope, saved)), 200);
  });
  app.route('/', details);
}
