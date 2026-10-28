import { listTeamWorkspaces } from '@fivvi/database';
import { canCreateWorkspace } from '@fivvi/domain';
import { locales } from '@fivvi/i18n';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { type AccessEnv, defineRoute } from '../access.ts';
import { internalServerErrorResponse } from '../errors.ts';

export const MeWorkspaceSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The workspace ID.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
    slug: z.string().openapi({ description: 'The URL name: `/w/{slug}` on the web.' }),
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

export function registerMe(app: OpenAPIHono) {
  // Its own router, so `account` is typed on the routes behind the access middleware.
  // /me has no input to validate, so it needs no `defaultHook`; a route with input added here
  // must pass the one `createApp` sets, so its validation errors stay the same.
  const me = new OpenAPIHono<AccessEnv>();
  me.openapi(meRoute, async (c) => {
    const { id, email, name, preferredLocale } = c.get('account');
    const workspaces = await listTeamWorkspaces(c.get('scope'));
    // The rule is in packages/domain: whoever listed workspaces has a team role.
    const mayCreate = canCreateWorkspace({
      email,
      signUpAllowlist: c.get('dependencies').signUpAllowlist,
      hasTeamRole: workspaces.length > 0,
    });
    return c.json(
      {
        id,
        email,
        name: name === '' ? null : name,
        preferredLocale,
        canCreateWorkspace: mayCreate,
        workspaces,
      },
      200,
    );
  });
  app.route('/', me);
}
