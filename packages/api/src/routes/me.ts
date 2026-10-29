import { listTeamWorkspaces, type SignedInAccount, setPreferredLocale } from '@fivvi/database';
import { canCreateWorkspace } from '@fivvi/domain';
import { locales } from '@fivvi/i18n';
import { anonymousDistinctId } from '@fivvi/observability';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { type AccessEnv, defineRoute } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  validationErrorResponse,
} from '../errors.ts';

export const MeWorkspaceSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The workspace ID.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
    slug: z.string().openapi({ description: 'The URL name: `/w/{slug}` on the web.' }),
    role: z.enum(['owner', 'trainer']).openapi({
      description:
        'What the account is in the workspace. The web shows Settings to the Owner only; the ' +
        'API refuses the rest of what a Trainer may not do with `403` anyway.',
    }),
  })
  .openapi('MeWorkspace', { description: 'A workspace the account has a team role in.' });

export const MeResponseSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The account ID.' }),
    email: z.email().openapi({ description: 'The address the account signs in with.' }),
    name: z.string().nullable().openapi({
      description: 'The person’s own name; null until one is given (TW-11 asks for it).',
    }),
    preferredLocale: z.enum(locales).nullable().openapi({
      description: 'The language stored on the account; null until one is stored.',
    }),
    canCreateWorkspace: z.boolean().openapi({
      description:
        'Whether the account may set up a workspace: it is on the sign-up allowlist and has no ' +
        'team role in any workspace yet. The web and the apps show the first-run screen or the ' +
        'no-access page from this, never from rules of their own.',
    }),
    workspaces: z.array(MeWorkspaceSchema).openapi({
      description:
        'The workspaces the account has a team role in, by name. Empty when it has none. ' +
        'Workspaces it is only a client of are not listed.',
    }),
  })
  .openapi('MeResponse', { description: 'The signed-in account.' });

const meRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/me',
    operationId: 'getMe',
    tags: ['me'],
    summary: 'The signed-in account',
    description:
      'The account of the sign-in session in the request. The web sends the sign-in session ' +
      'cookie, the apps’ `Authorization: Bearer <token>` (the token of `POST /v1/sign-in/token`). ' +
      'A request with an `Authorization` header is judged by that token alone, never by a cookie. ' +
      'It also tells where the person goes after sign-in: the workspaces they have a team role ' +
      'in, and whether they may set one up (`canCreateWorkspace`).',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: {
        description: 'The account.',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  // Only the workspaces with a team role: where the account goes after sign-in.
  { type: 'account', workspaces: 'team' },
);

// Typed on purpose, as in routes/workspaces.ts: written inline, the two-element literal makes
// TypeScript lose the route's request types.
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/**
 * What the account may change about itself. Every field is optional so F005 can add `name` to
 * this body; today a request must carry `preferredLocale` to change anything.
 */
const UpdateMeRequestSchema = z
  .object({
    preferredLocale: z
      .enum(locales)
      .optional()
      .openapi({
        description:
          'The language to store on the account, for its screens and emails: `nl-NL` or `en`. ' +
          'Any other value, a browser’s `nl-BE` included, is refused with `400`.',
      }),
  })
  .openapi('UpdateMeRequest', {
    description: 'What to change on the signed-in account. Fields left out stay as they are.',
  });

const updateMeRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/me',
    operationId: 'updateMe',
    tags: ['me'],
    summary: 'Change the signed-in account',
    description:
      'Stores the language the person chose (`preferredLocale`), so every browser and app of the ' +
      'account shows it from its next load. Answers with the account, as `GET /v1/me` does. ' +
      'A value other than `nl-NL` or `en` answers `400` and nothing changes.',
    security: SIGNED_IN,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateMeRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The account with its change.',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'account', workspaces: 'team' },
);

export function registerMe(app: OpenAPIHono) {
  // Its own router, so `account` is typed on the routes behind the access middleware.
  const me = new OpenAPIHono<AccessEnv>({ defaultHook: answerValidationFailure });

  /** The account as `GET` and `PATCH` answer, from the account of the request. */
  async function meOf(c: Context<AccessEnv>, account: SignedInAccount) {
    const { id, email, name, preferredLocale } = account;
    const workspaces = await listTeamWorkspaces(c.get('scope'));
    // The rule is in packages/domain: whoever listed workspaces has a team role.
    const mayCreate = canCreateWorkspace({
      email,
      signUpAllowlist: c.get('dependencies').signUpAllowlist,
      hasTeamRole: workspaces.length > 0,
    });
    return {
      id,
      email,
      name: name === '' ? null : name,
      preferredLocale,
      canCreateWorkspace: mayCreate,
      workspaces,
    };
  }

  me.openapi(meRoute, async (c) => c.json(await meOf(c, c.get('account')), 200));
  me.openapi(updateMeRoute, async (c) => {
    const { preferredLocale } = c.req.valid('json');
    const account = c.get('account');
    if (preferredLocale === undefined) return c.json(await meOf(c, account), 200);
    await setPreferredLocale(c.get('scope'), preferredLocale);
    // The language and the surface only, under a random ID (OBSERVABILITY.md §4). A request with
    // a bearer token comes from an app, which records its own surface (F010 iOS and Android).
    if (!c.req.header('authorization')) {
      c.get('dependencies').productEvents.track({
        event: 'language_changed',
        distinctId: anonymousDistinctId(),
        properties: { locale: preferredLocale, surface: 'web' },
      });
    }
    return c.json(await meOf(c, { ...account, preferredLocale }), 200);
  });
  app.route('/', me);
}
