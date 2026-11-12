import { type AccessLogItem, listAccessLog } from '@fivvi/database';
import { ACCESS_LOG_ACTIONS } from '@fivvi/domain';
import { messages, parseAcceptLanguage, resolveInterfaceLanguage } from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  validationErrorResponse,
} from '../errors.ts';

// The access log of a workspace (E014, spec #477, ticket #1173; `retention-policy.md` §3.4): the
// Owner reads who exported, trashed, restored or purged which client and, from M7, who viewed or
// changed which note. The entries hold IDs and a time and never a note's text; the names of the
// team member and the client are looked up when the log is read, and a client that is gone reads
// as "Deleted client" in the reader's language. The log is written by the privacy actions through
// the domain's `createAccessLog`, never by a route of its own.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;

export const AccessLogEntrySchema = z
  .object({
    id: z.uuid().openapi({ description: 'The entry ID.' }),
    occurredAt: z.iso.datetime().openapi({ description: 'When it happened, a UTC instant.' }),
    action: z.enum(ACCESS_LOG_ACTIONS).openapi({
      description:
        'What was done: `client.exported`, `client.trashed`, `client.restored`, `client.purged`, ' +
        '`workspace.exported`, `client.retention_kept`, and from M7 `note.viewed` and `note.changed`.',
    }),
    actorTeamMemberId: z
      .uuid()
      .nullable()
      .openapi({
        description:
          'The team member who did it. `null` for what the daily cleanup does by itself. The ID stays ' +
          'when the team member has left the team.',
      }),
    actorName: z
      .string()
      .nullable()
      .openapi({
        description:
          'The team member’s name now (their email address when they have given none). `null` when ' +
          'there is no team member, or when they have left the team.',
      }),
    clientId: z
      .uuid()
      .nullable()
      .openapi({
        description:
          'The client the action was about; `null` for an action about no client (`workspace.exported`). ' +
          'The ID stays after the client is deleted, so the list can still be filtered by it.',
      }),
    clientName: z
      .string()
      .nullable()
      .openapi({
        description:
          'The client’s name now. `null` for an action about no client. A client that no longer ' +
          'exists reads as *Verwijderde klant* or *Deleted client*, in the language of the reader ' +
          '(their stored language, else `Accept-Language`, else English); `clientRemoved` is `true` then.',
      }),
    clientRemoved: z.boolean().openapi({
      description: '`true` when the entry is about a client who no longer exists.',
    }),
    objectId: z
      .uuid()
      .nullable()
      .openapi({
        description:
          'The note’s ID for `note.viewed` and `note.changed`; `null` for any other action. The log ' +
          'never holds a note’s text.',
      }),
  })
  .openapi('AccessLogEntry', {
    description:
      'One entry of the access log: who did what to which client, and when. IDs, names and a ' +
      'time; no free text, never note content.',
  });

const AccessLogListSchema = z
  .object({
    items: z
      .array(AccessLogEntrySchema)
      .openapi({ description: 'This page of entries, newest first.' }),
    total: z.number().int().openapi({ description: 'How many entries match, over all pages.' }),
  })
  .openapi('AccessLogList', { description: 'One page of the access log of a workspace.' });

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const ListQuerySchema = z.object({
  clientId: z
    .uuid()
    .optional()
    .openapi({
      param: { name: 'clientId', in: 'query' },
      description:
        'Only the entries about this client. Also finds those of a client who is deleted since. ' +
        'An ID that belongs to no client of this workspace finds nothing.',
    }),
  action: z
    .enum(ACCESS_LOG_ACTIONS)
    .optional()
    .openapi({
      param: { name: 'action', in: 'query' },
      description: 'Only the entries of this action.',
    }),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .openapi({
      param: { name: 'pageSize', in: 'query' },
      description: `How many entries a page holds, 1 to ${MAX_PAGE_SIZE}; ${DEFAULT_PAGE_SIZE} by default.`,
    }),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE)
    .default(1)
    .openapi({
      param: { name: 'page', in: 'query' },
      description: 'Which page, counted from 1, newest first; 1 by default.',
    }),
});

// The capability comes from the permission matrix in @fivvi/domain (F004): the Owner only.
const readAccessLog = {
  type: 'workspace',
  capability: 'access_log.read',
  client: 'none',
} as const;

const listAccessLogRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/access-log',
    operationId: 'listAccessLog',
    tags: ['privacy'],
    summary: 'The access log of a workspace',
    description:
      'The access log of the workspace (the Owner only; a Trainer gets `403`): who exported, ' +
      'trashed, restored or purged which client, and from M7 who viewed or changed which note. ' +
      'This workspace’s entries only, newest first, one page at a time, optionally of one client ' +
      'and one action. Names are looked up now; a client who no longer exists reads as ' +
      '*Verwijderde klant* or *Deleted client* in the reader’s language. Entries hold IDs and a ' +
      'time, never a note’s text. Entries older than 12 months are deleted.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: ListQuerySchema },
    responses: {
      200: {
        description: 'One page of the access log.',
        content: { 'application/json': { schema: AccessLogListSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readAccessLog,
);

/**
 * The language of the reader (ADR-017): the account’s stored language, else the first supported
 * language of the request’s `Accept-Language`, else English.
 */
function readerLocaleOf(c: Context<WorkspaceEnv>) {
  return resolveInterfaceLanguage({
    stored: c.get('account').preferredLocale,
    requested: parseAcceptLanguage(c.req.header('accept-language')),
  });
}

function shown(item: AccessLogItem, deletedClient: string) {
  const clientRemoved = item.clientId !== null && item.clientName === null;
  return {
    id: item.id,
    occurredAt: item.occurredAt.toISOString(),
    action: item.action,
    actorTeamMemberId: item.actorTeamMemberId,
    actorName: item.actorName,
    clientId: item.clientId,
    clientName: clientRemoved ? deletedClient : item.clientName,
    clientRemoved,
    objectId: item.objectId,
  };
}

export function registerAccessLog(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(listAccessLogRoute, async (c) => {
    const { clientId, action, pageSize, page } = c.req.valid('query');
    const found = await listAccessLog(c.get('scope'), {
      clientId,
      action,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const deletedClient = messages[readerLocaleOf(c)].accessLog.deletedClient;
    return c.json(
      { items: found.items.map((item) => shown(item, deletedClient)), total: found.total },
      200,
    );
  });
  app.route('/', router);
}
