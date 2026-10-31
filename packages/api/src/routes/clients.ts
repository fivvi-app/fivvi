import {
  type ClientView,
  createClient,
  findAccountIdByEmail,
  findClientByEmail,
  findClientOfAccount,
  searchClients,
  type WorkspaceScope,
} from '@fivvi/database';
import { CLIENT_NAME_MAX_LENGTH, decideNewClient, normalizeEmail } from '@fivvi/domain';
import { locales } from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  validationErrorResponse,
} from '../errors.ts';

// The clients of a workspace (F006, spec #174): owners and trainers add a client, with a name
// only if they like, and list and search them. A client is a record of the workspace, not a
// person's account (`PRODUCT.md §2.9`): adding one never sends an email and never creates an
// account. If an account has the email address, the new client is linked to it, quietly: the
// answer is the same either way (AC4). The duplicate-and-link decision is in @fivvi/domain.
// Wording: *client*, never customer, member or user.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;

export const ClientSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The client ID: this person’s record in this workspace.' }),
    name: z.string().openapi({ description: 'The name as the team wrote it.' }),
    email: z.email().nullable().openapi({
      description: 'The email address, lower case; `null` when none was given.',
    }),
    emailLocale: z
      .enum(locales)
      .nullable()
      .openapi({
        description:
          'The language for the client’s emails the team set: `nl-NL` or `en`. `null` follows ' +
          'the workspace’s default language.',
      }),
  })
  .openapi('Client', { description: 'A client of a workspace.' });

const ClientListSchema = z
  .object({
    items: z.array(ClientSchema).openapi({ description: 'This page of clients, sorted by name.' }),
    total: z.number().int().openapi({ description: 'How many clients match, over all pages.' }),
  })
  .openapi('ClientList', { description: 'One page of the clients of a workspace.' });

const ClientExistsSchema = z
  .object({
    code: z.enum(['client_exists']),
    clientId: z.uuid().openapi({
      description: 'The ID of the client of this workspace that already has the email address.',
    }),
  })
  .openapi('ClientExists', {
    description:
      'A client of the workspace already has the email address (or is the person behind it); ' +
      'nothing was added. Contains no user-facing text.',
  });

const AddClientBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(CLIENT_NAME_MAX_LENGTH)
      .openapi({
        description:
          `The client’s name: trimmed, at least one and at most ${CLIENT_NAME_MAX_LENGTH} ` +
          'characters. Empty, blank or longer answers `400` with a field error.',
      }),
    email: z
      .email()
      .optional()
      .openapi({
        description:
          'The client’s email address; stored lower case. Leave it out to add the client with a ' +
          'name only. An address that is no email address answers `400`. If a client of the ' +
          'workspace has it already, nothing is added and the answer is `409`.',
      }),
    emailLocale: z
      .enum(locales)
      .optional()
      .openapi({
        description:
          'The language for the client’s emails: `nl-NL` or `en`. Leave it out to follow the ' +
          'workspace’s default language. Any other value answers `400`.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `client_added` event with this surface; without it nothing is recorded. ' +
          'The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('AddClientRequest', { description: 'A client to add. Only the name is required.' });

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const ListQuerySchema = z.object({
  search: z
    .string()
    .max(CLIENT_NAME_MAX_LENGTH)
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description:
        'Part of a name or an email address. Case and accents are ignored: `vrie` finds ' +
        '`Anna de Vries`. Blank is no search.',
    }),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .openapi({
      param: { name: 'pageSize', in: 'query' },
      description: `How many clients a page holds, 1 to ${MAX_PAGE_SIZE}; ${DEFAULT_PAGE_SIZE} by default.`,
    }),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE)
    .default(1)
    .openapi({
      param: { name: 'page', in: 'query' },
      description: 'Which page, counted from 1, in the order of the list; 1 by default.',
    }),
});

// The capabilities come from the permission matrix in @fivvi/domain (F004): Owner and Trainer.
const viewClients = { type: 'workspace', capability: 'clients.view', client: 'none' } as const;
const manageClients = { type: 'workspace', capability: 'clients.manage', client: 'none' } as const;

const listClientsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/clients',
    operationId: 'listClients',
    tags: ['clients'],
    summary: 'The clients of a workspace',
    description:
      'The whole workspace’s clients (the Owner and every Trainer), sorted by name, one page at ' +
      'a time. `search` matches part of a name or an email address in the server, ignoring case ' +
      'and accents.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: ListQuerySchema },
    responses: {
      200: {
        description: 'One page of clients.',
        content: { 'application/json': { schema: ClientListSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  viewClients,
);

const addClientRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/clients',
    operationId: 'addClient',
    tags: ['clients'],
    summary: 'Add a client',
    description:
      'Adds a client to the workspace (the Owner and every Trainer). Only the name is required. ' +
      'Adding a client never sends an email and never creates an account. If an account has the ' +
      'email address, the client is linked to it; the answer is the same either way. A client ' +
      'of the workspace with the same address (in any case) makes the answer `409` with that ' +
      'client’s ID, and nothing is added. Two clients without an email address may share a name.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: { required: true, content: { 'application/json': { schema: AddClientBodySchema } } },
    },
    responses: {
      201: {
        description: 'The client that was added.',
        content: { 'application/json': { schema: ClientSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'A client of the workspace already has the email address; nothing was added.',
        content: { 'application/json': { schema: ClientExistsSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  manageClients,
);

/** What the answer shows of a client: the fields of `Client`, never the workspace or an account. */
function shown({ id, name, email, emailLocale }: ClientView) {
  return { id, name, email, emailLocale };
}

/** What the workspace already knows about the address: the facts the domain rule decides on. */
async function factsAbout(scope: WorkspaceScope, email: string | undefined) {
  if (email === undefined) return {};
  const accountId = await findAccountIdByEmail(scope, email);
  const clientWithEmail = await findClientByEmail(scope, email);
  const clientOfAccount = accountId ? await findClientOfAccount(scope, accountId) : undefined;
  return {
    email,
    ...(clientWithEmail ? { clientWithEmail } : {}),
    ...(accountId ? { accountId } : {}),
    ...(clientOfAccount ? { clientOfAccount } : {}),
  };
}

export function registerClients(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(listClientsRoute, async (c) => {
    const { search, pageSize, page } = c.req.valid('query');
    const found = await searchClients(c.get('scope'), {
      search,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return c.json({ items: found.items.map(shown), total: found.total }, 200);
  });
  router.openapi(addClientRoute, async (c) => {
    const scope = c.get('scope');
    const { name, email: typed, emailLocale, surface } = c.req.valid('json');
    const email = typed === undefined ? undefined : normalizeEmail(typed);
    let decision = decideNewClient(await factsAbout(scope, email));
    let client: ClientView | undefined;
    if (decision.outcome === 'add') {
      client = await createClient(scope, {
        name,
        email: email ?? null,
        emailLocale: emailLocale ?? null,
        accountId: decision.accountId,
      });
      // A parallel request added the same address between the check and the insert: it decides.
      if (!client) decision = decideNewClient(await factsAbout(scope, email));
    }
    // The 409 rolls the request's transaction back; nothing was added.
    if (decision.outcome === 'duplicate') {
      return c.json({ code: 'client_exists' as const, clientId: decision.clientId }, 409);
    }
    if (!client) throw new Error('The client was not added.');
    // The workspace ID and the surface only: no name, address or language (OBSERVABILITY.md §4).
    // The web sends no bearer token; an app names its surface, and one that names none records
    // nothing, as the API does not guess (as for `language_changed`).
    const appSurface = c.req.header('authorization') ? surface : 'web';
    if (appSurface !== undefined) {
      c.get('dependencies').productEvents.track({
        event: 'client_added',
        distinctId: c.get('account').id,
        properties: { workspace_id: scope.workspaceId, surface: appSurface },
      });
    }
    return c.json(shown(client), 201);
  });
  app.route('/', router);
}
