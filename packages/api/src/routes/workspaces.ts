import {
  claimWorkspaceCreation,
  createWorkspaceWithOwner,
  findWorkspace,
  updateWorkspace,
} from '@fivvi/database';
import {
  canCreateWorkspace,
  NAME_MAX_LENGTH,
  slugCandidates,
  WORKSPACE_DEFAULTS,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, type RouteHandler, z } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler } from 'hono';
import { type AccessEnv, defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  FORBIDDEN,
  ForbiddenSchema,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { LocaleSchema } from '../schemas.ts';

// The workspace routes (F002, spec #170, ADR-022). A workspace is created on our own tables
// (`organizations`, `team_members`), through repository functions of @fivvi/database; the rules
// (who may create one, the slug, the defaults) are in @fivvi/domain.

/** A name as typed: trimmed, not empty, at most `NAME_MAX_LENGTH` characters (AC3). */
const nameField = (description: string) =>
  z.string().trim().min(1).max(NAME_MAX_LENGTH).openapi({ description });

const CreateWorkspaceRequestSchema = z
  .object({
    name: nameField('The name of the gym or business, as shown in the product.'),
    personName: nameField(
      'The creator’s own name, stored on the account. Leave it out when the account has one.',
    ).optional(),
  })
  .openapi('CreateWorkspaceRequest', {
    description:
      'Creates a workspace for the caller, who becomes its Owner. Nothing else is asked: the ' +
      'default language, the time zone and the slug are the platform’s defaults.',
  });

// `defaultLocale` stays a bare `LocaleSchema`: see the note in routes/sign-in.ts (#223).
export const WorkspaceSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The workspace ID.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
    slug: z.string().openapi({
      description:
        'The URL name, made from the name when the workspace is created and never changed ' +
        'by a rename. Lower case letters, digits and hyphens.',
    }),
    defaultLocale: LocaleSchema,
    timeZone: z.string().openapi({
      description:
        'The IANA time zone dates and times are shown in, for example `Europe/Amsterdam`.',
    }),
  })
  .openapi('Workspace', {
    description: 'A workspace: a gym or an independent trainer’s business.',
  });

/**
 * How a request proves who it is (the schemes `createApp` registers). Typed on purpose: written
 * inline, the two-element literal makes TypeScript lose the route's request types, and
 * `c.req.valid('json')` becomes `never`.
 */
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/** How many slugs to try before giving up: far above any real number of namesakes. */
const MAX_SLUG_ATTEMPTS = 100;

const createWorkspaceRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces',
    operationId: 'createWorkspace',
    tags: ['workspaces'],
    summary: 'Create the caller’s workspace',
    description:
      'Creates a workspace and makes the caller its Owner, in one transaction: the workspace ' +
      '(Dutch as its default language, `Europe/Amsterdam`, a slug made from its name, with a ' +
      'number added when taken), the Owner’s team role and, when given, the account’s name. ' +
      'Only an account on the sign-up allowlist with no team role in any workspace may: ' +
      'anyone else gets `403` and nothing is created.',
    security: SIGNED_IN,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: CreateWorkspaceRequestSchema } },
      },
    },
    responses: {
      201: {
        description: 'The new workspace.',
        content: { 'application/json': { schema: WorkspaceSchema } },
      },
      400: validationErrorResponse,
      403: {
        description:
          'The account may not create a workspace: it is not on the sign-up allowlist, or it ' +
          'already has a team role in a workspace.',
        content: { 'application/json': { schema: ForbiddenSchema } },
      },
      500: internalServerErrorResponse,
    },
    // After the access, ahead of the body's validation: whoever may not create a workspace gets
    // 403 whatever they sent, so a refusal never teaches the shape of the body.
    middleware: [mayCreateWorkspace()],
  },
  // The context holds the caller's team workspaces; the new one is added inside the create.
  { type: 'account', workspaces: 'team' },
);

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const UpdateWorkspaceRequestSchema = z
  .object({
    name: nameField('The new name, as the product shows it from now on.').optional(),
    // A bare `LocaleSchema`, like `Workspace.defaultLocale` (#223).
    defaultLocale: LocaleSchema.optional(),
  })
  // A body with neither changes nothing; it is refused on `name`, the field every client sent
  // before `defaultLocale` existed.
  .refine((body) => body.name !== undefined || body.defaultLocale !== undefined, {
    path: ['name'],
    error: 'Give the name, the default language or both.',
  })
  .openapi('UpdateWorkspaceRequest', {
    description:
      'Changes a workspace: its name, its default communication language (the language of ' +
      'emails to people whose own preference is unknown, never what anyone sees on screen, ' +
      'ADR-017), or both. The slug stays, so links keep working. Other fields are ignored.',
  });

const getWorkspaceRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}',
    operationId: 'getWorkspace',
    tags: ['workspaces'],
    summary: 'A workspace',
    description: 'The workspace: its name, URL name, default language and time zone.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The workspace.',
        content: { 'application/json': { schema: WorkspaceSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', roles: ['owner', 'trainer'], client: 'none' },
);

const renameWorkspaceRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}',
    operationId: 'renameWorkspace',
    tags: ['workspaces'],
    summary: 'Rename a workspace or set its default language',
    description:
      'Changes the name and/or the default communication language of the workspace (the Owner ' +
      'only). The slug never changes, so links and QR codes keep working. The name is trimmed, ' +
      'not blank and at most 80 characters; the language is `nl-NL` or `en`, anything else ' +
      'answers `400` and nothing changes.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateWorkspaceRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The workspace with its changes.',
        content: { 'application/json': { schema: WorkspaceSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', roles: ['owner'], client: 'none' },
);

/**
 * Claims the right to create (the account's lock, its team roles as of now) and asks the rule of
 * `packages/domain`. A refusal is a 403 and the transaction rolls back.
 */
function mayCreateWorkspace(): MiddlewareHandler {
  return async (context, next) => {
    // The access middleware ran first and set what `AccessEnv` names.
    const c = context as unknown as Context<AccessEnv>;
    const { hasTeamRole } = await claimWorkspaceCreation(c.get('scope'));
    const allowed = canCreateWorkspace({
      email: c.get('account').email,
      signUpAllowlist: c.get('dependencies').signUpAllowlist,
      hasTeamRole,
    });
    if (!allowed) return c.json(FORBIDDEN, 403);
    return next();
  };
}

export function registerWorkspaces(app: OpenAPIHono) {
  // Its own router, so `account` and `scope` are typed on the routes behind the access.
  const workspaces = new OpenAPIHono<AccessEnv>({ defaultHook: answerValidationFailure });
  const createWorkspace: RouteHandler<typeof createWorkspaceRoute, AccessEnv> = async (c) => {
    const { name, personName } = c.req.valid('json');
    const { productEvents } = c.get('dependencies');
    let attempts = 0;
    for (const slug of slugCandidates(name)) {
      attempts += 1;
      if (attempts > MAX_SLUG_ATTEMPTS) break;
      const workspace = await createWorkspaceWithOwner(c.get('scope'), {
        ...WORKSPACE_DEFAULTS,
        name,
        slug,
        ...(personName === undefined ? {} : { ownerName: personName }),
      });
      if (!workspace) continue;
      // The workspace ID only: the account's own UUID is the pseudonymous ID (OBSERVABILITY.md §4).
      productEvents.track({
        event: 'workspace_created',
        distinctId: c.get('account').id,
        properties: { workspace_id: workspace.id },
      });
      return c.json(workspace, 201);
    }
    throw new Error(`No free slug among the first ${MAX_SLUG_ATTEMPTS} candidates.`);
  };
  workspaces.openapi(createWorkspaceRoute, createWorkspace);
  app.route('/', workspaces);

  // The routes of one workspace: the scope holds that workspace only.
  const inWorkspace = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  inWorkspace.openapi(getWorkspaceRoute, async (c) => {
    const workspace = await findWorkspace(c.get('scope'));
    return workspace ? c.json(workspace, 200) : c.json(NOT_FOUND, 404);
  });
  inWorkspace.openapi(renameWorkspaceRoute, async (c) => {
    const workspace = await updateWorkspace(c.get('scope'), c.req.valid('json'));
    return workspace ? c.json(workspace, 200) : c.json(NOT_FOUND, 404);
  });
  app.route('/', inWorkspace);
}
