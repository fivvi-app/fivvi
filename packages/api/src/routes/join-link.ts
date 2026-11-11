import { findJoinLink, type JoinLinkView, renewJoinLink } from '@fivvi/database';
import { joinLinkUrl } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';

// The join link of a workspace (F029, spec #484): one code per workspace, `{app address}/j/{code}`,
// that the Owner and the Trainers read and only the Owner renews. The code is made by the database
// (`new_join_code()`); the rules (who may read, who may renew) are the permission matrix's
// (`join_link.view`, `join_link.renew`), and the URL is built by `@fivvi/domain`. The public join
// routes that resolve a code come with the next ticket; F037 and F038 reuse both of these.

/** Typed on purpose, as in routes/workspaces.ts: inline, the literal loses the request types. */
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const JoinLinkSchema = z
  .object({
    url: z.url().openapi({
      description:
        'The join link in full, `https://…/j/{code}`: the one link of the workspace. The QR code ' +
        'and the poster show this same link.',
    }),
    renewedAt: z.iso
      .datetime()
      .nullable()
      .openapi({
        description:
          'When the Owner last renewed the link, a UTC instant; `null` while it is the link the ' +
          'workspace started with.',
      }),
  })
  .openapi('JoinLink', {
    description:
      'The join link (*aanmeldlink*) of a workspace: where a new client asks to become a client.',
  });

const RenewJoinLinkRequestSchema = z
  .object({
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `join_link_renewed` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('RenewJoinLinkRequest', {
    description: 'Who sends the renewal. The body is optional; the web sends none.',
  });

const getJoinLinkRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/join-link',
    operationId: 'getJoinLink',
    tags: ['join-link'],
    summary: 'The join link of a workspace',
    description:
      'The workspace’s join link in full and when it was last renewed. The Owner and the Trainers ' +
      'may read it, to send it to a new client; a client of the workspace gets `403`, a person ' +
      'with no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The join link.',
        content: { 'application/json': { schema: JoinLinkSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'join_link.view', client: 'none' },
);

const renewJoinLinkRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/join-link/renew',
    operationId: 'renewJoinLink',
    tags: ['join-link'],
    summary: 'Renew the join link of a workspace',
    description:
      'Replaces the workspace’s join code with a new one (the Owner only; a Trainer gets `403`) ' +
      'and stores the time. The old link, and every QR code of it, stops working at once; join ' +
      'requests already sent stay. Records the product event `join_link_renewed` with the ' +
      'workspace ID and the surface (`web`, `ios` or `android`) and nothing else. The body is ' +
      'optional; the web sends none and is recorded as `web`. A request with a bearer token ' +
      'records the `surface` it names in the body and, naming none, records nothing.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: false,
        content: { 'application/json': { schema: RenewJoinLinkRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The new join link.',
        content: { 'application/json': { schema: JoinLinkSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'join_link.renew', client: 'none' },
);

function present(appBaseUrl: string, link: JoinLinkView) {
  return {
    url: joinLinkUrl(appBaseUrl, link.code),
    renewedAt: link.renewedAt?.toISOString() ?? null,
  };
}

export function registerJoinLink(app: OpenAPIHono) {
  const joinLink = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  joinLink.openapi(getJoinLinkRoute, async (c) => {
    const link = await findJoinLink(c.get('scope'));
    return link
      ? c.json(present(c.get('dependencies').appBaseUrl(), link), 200)
      : c.json(NOT_FOUND, 404);
  });
  joinLink.openapi(renewJoinLinkRoute, async (c) => {
    // The body is optional: the web sends none.
    const surface = c.req.valid('json')?.surface;
    const { appBaseUrl, clock, productEvents } = c.get('dependencies');
    const link = await renewJoinLink(c.get('scope'), clock.now());
    if (!link) return c.json(NOT_FOUND, 404);
    // The workspace ID and the surface only (OBSERVABILITY.md §4): the Owner's account UUID is the
    // pseudonymous ID, and neither the code nor the URL leaves. The web sends no bearer token; an
    // app names its surface, and one that names none records nothing (as for `workspace_switched`).
    const appSurface = c.req.header('authorization') ? surface : 'web';
    if (appSurface !== undefined) {
      const distinctId = c.get('account').id;
      const workspaceId = c.get('scope').workspaceId;
      // After the commit: a renewal that rolled back is not an event.
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'join_link_renewed',
          distinctId,
          properties: { workspace_id: workspaceId, surface: appSurface },
        }),
      );
    }
    return c.json(present(appBaseUrl(), link), 200);
  });
  app.route('/', joinLink);
}
