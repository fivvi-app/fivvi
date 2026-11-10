import {
  findBookingEmails,
  listTeamWorkspaces,
  type SignedInAccount,
  setAccountName,
  setBookingEmails,
  setPreferredLocale,
} from '@fivvi/database';
import {
  CAPABILITIES,
  canCreateWorkspace,
  capabilitiesOf,
  NAME_MAX_LENGTH,
  ROLES,
  type Role,
} from '@fivvi/domain';
import { locales } from '@fivvi/i18n';
import { anonymousDistinctId } from '@fivvi/observability';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { type AccessEnv, defineRoute } from '../access.ts';
import {
  answerValidationFailure,
  INVALID_OR_EXPIRED_CODE,
  InvalidCodeSchema,
  internalServerErrorResponse,
  validationErrorResponse,
} from '../errors.ts';

const RoleSchema = z.enum(ROLES);

const CapabilitiesSchema = z.array(z.enum(CAPABILITIES)).openapi({
  description:
    'What the account may do in the workspace, from the permission matrix. The web and the ' +
    'apps show a section or an action only when its capability is listed, never from the role ' +
    'name; the API refuses the rest with `403` anyway.',
});

export const MeWorkspaceSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The workspace ID.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
    slug: z.string().openapi({ description: 'The URL name: `/w/{slug}` on the web.' }),
    role: RoleSchema.openapi({
      description: 'What the account is in the workspace; shown as a label, never decided on.',
    }),
    capabilities: CapabilitiesSchema,
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
    bookingEmails: z.boolean().openapi({
      description:
        'Whether the person gets an email when a client books or cancels a class they teach ' +
        '(F050). On for every account until they switch it off. It belongs to the account, so it ' +
        'is the same in every workspace.',
    }),
    canCreateWorkspace: z.boolean().openapi({
      description:
        'Whether the account may set up a workspace: it is on the sign-up allowlist, whether or ' +
        'not it has a workspace already. With no workspace, the first-run screen shows when this ' +
        'is true and the no-access page when it is false. The web and the apps never decide this ' +
        'by rules of their own.',
    }),
    workspaces: z.array(MeWorkspaceSchema).openapi({
      description:
        'The workspaces the account has a team role in, by name. Empty when it has none. ' +
        'Workspaces it is only a client of are not listed.',
    }),
  })
  .openapi('MeResponse', { description: 'The signed-in account.' });

/** One workspace of the list the apps get: the account’s team role in it. */
export const MyWorkspaceSchema = z
  .object({
    workspaceId: z.uuid().openapi({ description: 'The workspace ID.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
    slug: z.string().openapi({ description: 'The URL name: `/w/{slug}` on the web.' }),
    role: RoleSchema.openapi({
      description: 'What the account is on the team; shown as a label, never decided on.',
    }),
    capabilities: CapabilitiesSchema,
    trainsHere: z.boolean().openapi({
      description:
        'Whether the account trains in the workspace, that is has a trainer profile there (F005): ' +
        'always true for a Trainer, the Owner’s own switch for an Owner.',
    }),
  })
  .openapi('MyWorkspace', { description: 'A workspace the account is on the team of.' });

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
      'in, and whether they may set one up (`canCreateWorkspace`: on the sign-up allowlist, also ' +
      'when they have a workspace already).',
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

/** What the account may change about itself. Every field is optional; one left out stays. */
const UpdateMeRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(NAME_MAX_LENGTH)
      .optional()
      .openapi({
        description:
          'The person’s own name, as shown in every workspace they are on: trimmed, at least ' +
          'one and at most 80 characters. Empty, blank or longer answers `400` with a field error.',
      }),
    preferredLocale: z
      .enum(locales)
      .optional()
      .openapi({
        description:
          'The language to store on the account, for its screens and emails: `nl-NL` or `en`. ' +
          'Any other value, a browser’s `nl-BE` included, is refused with `400`.',
      }),
    bookingEmails: z
      .boolean()
      .optional()
      .openapi({
        description:
          'Whether to get an email when a client books or cancels a class the person teaches: ' +
          '`true` or `false`, stored on the account and the same in every workspace. Anything ' +
          'that is not a boolean answers `400` with a field error.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'that changes `preferredLocale` records the `language_changed` event with this surface; ' +
          'without it nothing is recorded. The web does not send it, and a request without a ' +
          'bearer token ignores it.',
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
      'account shows it from its next load, and the name they gave themselves (`name`), one per ' +
      'account, shown in every workspace they are on, and whether they get the emails about bookings ' +
      'in their classes (`bookingEmails`, on until switched off), also one per account. Answers with the account, as ' +
      '`GET /v1/me` does. A language other than `nl-NL` or `en`, a name that is empty, blank ' +
      'or over 80 characters, or a `bookingEmails` that is not a boolean, answers `400` and nothing changes.',
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

const RequestEmailChangeSchema = z
  .object({
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email())
      .openapi({
        description:
          'The new address, trimmed and stored in lower case. Not an address, or the account’s ' +
          'own current one, answers `400` with a field error on `newEmail`.',
      }),
  })
  .openapi('RequestEmailChange', {
    description: 'The address to send the confirmation code to.',
  });

const ConfirmEmailChangeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .openapi({ description: 'The 6-digit code in the email sent to the new address.' }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `email_changed` event with this surface; without it nothing is recorded. ' +
          'The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('ConfirmEmailChange', {
    description: 'The code that confirms the new address.',
  });

const requestEmailChangeRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/me/email/change',
    operationId: 'requestEmailChange',
    tags: ['me'],
    summary: 'Ask for a code to change the signed-in account’s email address',
    description:
      'Sends a 6-digit code to the new address (EM-34), in the account’s language. The address ' +
      'does not change until `POST /v1/me/email/confirm` accepts the code. The answer is `202` ' +
      'for every valid address, one that already has an account, and a request over the rate ' +
      'limits (3 in 15 minutes per account and per address, 20 an hour per network, as for ' +
      'sign-in), so it never says who has an account; only a free address under the limits gets ' +
      'an email. A new request replaces the earlier code. It acts on the signed-in account ' +
      'alone: no route changes anyone else’s address.',
    security: SIGNED_IN,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: RequestEmailChangeSchema } },
      },
    },
    responses: {
      202: { description: 'Accepted. The body is empty.' },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'account', workspaces: 'team' },
);

const confirmEmailChangeRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/me/email/confirm',
    operationId: 'confirmEmailChange',
    tags: ['me'],
    summary: 'Confirm the code and change the signed-in account’s email address',
    description:
      'With the right code the account’s address becomes the one the code was sent to, in every ' +
      'workspace at once, and every open sign-in session stays signed in. The sign-in codes and ' +
      'links sent to the old address stop working. Answers with the account, as `GET /v1/me` ' +
      'does. A wrong, used, replaced or expired code, five wrong codes, an address that has an ' +
      'account by now and a network over its limit all answer `422` and nothing changes.',
    security: SIGNED_IN,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: ConfirmEmailChangeSchema } },
      },
    },
    responses: {
      200: {
        description: 'The account with its new address.',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      400: validationErrorResponse,
      422: {
        description: 'The code was not accepted.',
        content: { 'application/json': { schema: InvalidCodeSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  { type: 'account', workspaces: 'team' },
);

const listMyWorkspacesRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/me/workspaces',
    operationId: 'listMyWorkspaces',
    tags: ['me'],
    summary: 'The workspaces the signed-in account is on the team of',
    description:
      'The workspaces where the account has a team role (Owner or Trainer), by name, each with ' +
      'that role and whether they train there (`trainsHere`): the list *My workspaces* of the ' +
      'profile shows and the apps use. Workspaces ' +
      'the account is only a client of are not listed. Empty when it has no team role.',
    security: SIGNED_IN,
    responses: {
      200: {
        description: 'The workspaces.',
        content: { 'application/json': { schema: z.array(MyWorkspaceSchema) } },
      },
      500: internalServerErrorResponse,
    },
  },
  { type: 'account', workspaces: 'team' },
);

/** The workspace with the capabilities its role has in the matrix (`@fivvi/domain`). */
function withCapabilities<W extends { role: Role }>(workspace: W) {
  return { ...workspace, capabilities: capabilitiesOf(workspace.role) };
}

export function registerMe(app: OpenAPIHono) {
  // Its own router, so `account` is typed on the routes behind the access middleware.
  const me = new OpenAPIHono<AccessEnv>({ defaultHook: answerValidationFailure });

  /** The account as `GET` and `PATCH` answer, from the account of the request. */
  async function meOf(c: Context<AccessEnv>, account: SignedInAccount) {
    const { id, email, name, preferredLocale } = account;
    const workspaces = (await listTeamWorkspaces(c.get('scope'))).map(
      ({ trainsHere: _trainsHere, ...workspace }) => withCapabilities(workspace),
    );
    // The rule is in packages/domain: the sign-up allowlist, whatever workspaces the account has.
    const mayCreate = canCreateWorkspace({
      email,
      signUpAllowlist: c.get('dependencies').signUpAllowlist,
    });
    return {
      id,
      email,
      name: name === '' ? null : name,
      preferredLocale,
      bookingEmails: await findBookingEmails(c.get('scope')),
      canCreateWorkspace: mayCreate,
      workspaces,
    };
  }

  me.openapi(meRoute, async (c) => c.json(await meOf(c, c.get('account')), 200));
  me.openapi(listMyWorkspacesRoute, async (c) => {
    // The same query as `GET /v1/me`: the account's own team-member records, within its scope.
    const workspaces = await listTeamWorkspaces(c.get('scope'));
    return c.json(
      workspaces.map(({ id, ...rest }) => ({ workspaceId: id, ...withCapabilities(rest) })),
      200,
    );
  });
  me.openapi(updateMeRoute, async (c) => {
    const { name, preferredLocale, bookingEmails, surface } = c.req.valid('json');
    let account = c.get('account');
    // No product event for a name, and nothing of it in a log: it is personal data (F005).
    if (name !== undefined) {
      await setAccountName(c.get('scope'), name);
      account = { ...account, name };
    }
    // No product event for the switch either: it is the person's own inbox setting (F050).
    if (bookingEmails !== undefined) await setBookingEmails(c.get('scope'), bookingEmails);
    if (preferredLocale !== undefined) {
      await setPreferredLocale(c.get('scope'), preferredLocale);
      account = { ...account, preferredLocale };
      // The language and the surface only, under a random ID (OBSERVABILITY.md §4). A request with
      // a bearer token comes from an app, which names its surface in the body (F010); one that
      // names none records nothing, as the API does not guess. Without a token it is the web.
      const appSurface = c.req.header('authorization') ? surface : 'web';
      if (appSurface !== undefined) {
        c.get('dependencies').productEvents.track({
          event: 'language_changed',
          distinctId: anonymousDistinctId(),
          properties: { locale: preferredLocale, surface: appSurface },
        });
      }
    }
    return c.json(await meOf(c, account), 200);
  });
  me.openapi(requestEmailChangeRoute, async (c) => {
    const { newEmail } = c.req.valid('json');
    const account = c.get('account');
    // Her own address is no change: a field error, and nothing is sent (the address is hers).
    if (newEmail === account.email) {
      return c.json(
        {
          code: 'validation_failed' as const,
          issues: [{ path: 'newEmail', code: 'same_as_current' }],
        },
        400,
      );
    }
    await c.get('dependencies').requestEmailChange({
      accountId: account.id,
      newEmail,
      headers: c.req.raw.headers,
    });
    return c.body(null, 202);
  });
  me.openapi(confirmEmailChangeRoute, async (c) => {
    const { code, surface } = c.req.valid('json');
    const account = c.get('account');
    const dependencies = c.get('dependencies');
    const changed = await dependencies.confirmEmailChange({
      accountId: account.id,
      code,
      headers: c.req.raw.headers,
    });
    if (!changed) return c.json(INVALID_OR_EXPIRED_CODE, 422);
    // The surface only, never an address, the code or the name (OBSERVABILITY.md §4). The web
    // sends no bearer token; an app names its surface, and one that names none records nothing.
    const appSurface = c.req.header('authorization') ? surface : 'web';
    if (appSurface !== undefined) {
      c.get('afterCommit')(() =>
        dependencies.productEvents.track({
          event: 'email_changed',
          distinctId: account.id,
          properties: { surface: appSurface },
        }),
      );
    }
    return c.json(await meOf(c, { ...account, email: changed.email }), 200);
  });
  app.route('/', me);
}
