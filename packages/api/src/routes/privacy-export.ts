import {
  accessLogStore,
  findClient,
  findOwnTeamMember,
  findWorkspace,
  type WorkspaceScope,
} from '@fivvi/database';
import { createAccessLog, type ExportKind, exportFilesFor, localInstant } from '@fivvi/domain';
import { parseAcceptLanguage, resolveInterfaceLanguage } from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { admission, defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { writeExport } from '../privacy-export/write-export.ts';
import { streamZip } from '../privacy-export/zip-stream.ts';

// The export of E014 (spec #477, tickets #1177 and #1178; ADR-010): the Owner downloads everything
// the workspace holds about one client, or the whole workspace, as a ZIP of `README.txt`,
// `data.json` and one CSV per kind of record. What is in it is what the privacy registry declares.
// The ZIP is generated per request and streamed; no file, no queue, nothing stored. Each export
// writes one access-log entry, in the request's transaction, and one `data_exported` product event
// (the workspace ID, the kind and the platform; nothing of the data).

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
    description: 'The client ID.',
  }),
});

const SurfaceQuerySchema = z.object({
  surface: z
    .enum(['ios', 'android'])
    .optional()
    .openapi({
      param: { name: 'surface', in: 'query' },
      description:
        'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
        'records the `data_exported` event with this platform; without it nothing is recorded. ' +
        'The web does not send it, and a request without a bearer token ignores it.',
    }),
});

const ZipResponse = (description: string) => ({
  description,
  headers: z.object({
    'content-disposition': z.string().openapi({
      description: 'An attachment named as the ZIP: `fivvi-{workspace-slug}-…-{date}.zip`.',
    }),
  }),
  content: {
    'application/zip': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
  },
});

const exportClient = { type: 'workspace', capability: 'client.export', client: 'none' } as const;
const exportWorkspace = {
  type: 'workspace',
  capability: 'workspace.export',
  client: 'none',
} as const;

const README_DESCRIPTION =
  '`README.txt` in the Owner’s language (their stored language, else `Accept-Language`, else ' +
  'English) says what each file is and what the field names mean; `data.json` holds every ' +
  'record; each kind of record is also a CSV in UTF-8 with a byte order mark, so Excel opens it ' +
  'with the accents intact. The field names are English and stable. Every time is given in UTC ' +
  'and, next to it, in the workspace time zone (`…_local`). It is generated for this request and ' +
  'streamed: the server stores no file. It writes one entry in the access log.';

const exportClientRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/clients/{clientId}/export',
    operationId: 'exportClient',
    tags: ['privacy'],
    summary: 'Export everything the workspace holds about one client',
    description:
      'Downloads a ZIP named `fivvi-{workspace-slug}-{client-id}-{date}.zip` (the Owner only; a ' +
      'Trainer gets `403`) with the client’s profile, her sessions and bookings with attendance, ' +
      'and, as later features add them, the rest of her records, all from this workspace only. ' +
      `${README_DESCRIPTION} A client who is not in this workspace answers \`404\`.`,
    security: SIGNED_IN,
    request: { params: ClientParamsSchema, query: SurfaceQuerySchema },
    responses: {
      200: ZipResponse('The ZIP.'),
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  exportClient,
);

const exportWorkspaceRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/export',
    operationId: 'exportWorkspace',
    tags: ['privacy'],
    summary: 'Export everything the workspace holds',
    description:
      'Downloads a ZIP named `fivvi-{workspace-slug}-{date}.zip` (the Owner only; a Trainer gets ' +
      '`403`) with every record of the workspace that the privacy registry declares, for when the ' +
      `workspace leaves. ${README_DESCRIPTION}`,
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: SurfaceQuerySchema },
    responses: {
      200: ZipResponse('The ZIP.'),
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  exportWorkspace,
);

/** The language of the Owner (ADR-017): their stored language, else `Accept-Language`, else English. */
function ownerLocaleOf(c: Context<WorkspaceEnv>) {
  return resolveInterfaceLanguage({
    stored: c.get('account').preferredLocale,
    requested: parseAcceptLanguage(c.req.header('accept-language')),
  });
}

interface Planned {
  readonly kind: ExportKind;
  readonly clientId?: string;
}

/**
 * Answers with the ZIP. The access-log entry is written in this request's transaction, the export
 * itself is read in a transaction of its own (the request's commits when this returns, and the body
 * is read after), opened as the same account with the same access: the Owner's, checked again.
 */
async function answerWithZip(
  c: Context<WorkspaceEnv>,
  access: typeof exportClient | typeof exportWorkspace,
  planned: Planned,
  surface: 'ios' | 'android' | undefined,
) {
  const scope = c.get('scope');
  const dependencies = c.get('dependencies');
  const account = c.get('account');
  const workspace = await findWorkspace(scope);
  if (!workspace) return c.json(NOT_FOUND, 404);
  if (planned.clientId && !(await findClient(scope, planned.clientId))) {
    return c.json(NOT_FOUND, 404);
  }
  const actor = await findOwnTeamMember(scope);
  if (!actor) return c.json(NOT_FOUND, 404);
  const now = dependencies.clock.now();
  await createAccessLog(accessLogStore(scope), { now: () => now }).record(
    planned.kind === 'client'
      ? {
          action: 'client.exported',
          actorTeamMemberId: actor.id,
          subjectClientId: planned.clientId ?? null,
        }
      : { action: 'workspace.exported', actorTeamMemberId: actor.id },
  );

  // The web sends no bearer token; an app names its platform, and one that names none records
  // nothing, as the API does not guess. The workspace ID, the kind and the platform only.
  const platform = c.req.header('authorization') ? surface : 'web';
  if (platform !== undefined) {
    c.get('afterCommit')(() =>
      dependencies.productEvents.track({
        event: 'data_exported',
        distinctId: account.id,
        properties: { workspace_id: scope.workspaceId, kind: planned.kind, platform },
      }),
    );
  }

  const locale = ownerLocaleOf(c);
  const files = exportFilesFor(planned.kind);
  const date = localInstant(now, workspace.timeZone).slice(0, 10);
  const fileName = `fivvi-${workspace.slug}-${planned.clientId ? `${planned.clientId}-` : ''}${date}.zip`;
  const stream = streamZip(now, async (zip) => {
    const entry = await dependencies.tenantScopes.inWorkspaceScope(
      {
        accountId: account.id,
        workspaceId: scope.workspaceId,
        admit: (place) => admission(access, place),
      },
      (exportScope: WorkspaceScope) =>
        writeExport(zip, {
          scope: exportScope,
          kind: planned.kind,
          locale,
          workspace,
          ...(planned.clientId ? { clientId: planned.clientId } : {}),
          files,
          exportedAt: now,
        }),
    );
    if (entry.status !== 'entered') throw new Error('The export is no longer allowed.');
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      // Personal data: never kept by a cache.
      'cache-control': 'no-store',
    },
  });
}

export function registerPrivacyExport(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(exportClientRoute, async (c) => {
    const { clientId } = c.req.valid('param');
    const { surface } = c.req.valid('query');
    return (await answerWithZip(c, exportClient, { kind: 'client', clientId }, surface)) as never;
  });
  router.openapi(exportWorkspaceRoute, async (c) => {
    const { surface } = c.req.valid('query');
    return (await answerWithZip(c, exportWorkspace, { kind: 'workspace' }, surface)) as never;
  });
  app.route('/', router);
}
