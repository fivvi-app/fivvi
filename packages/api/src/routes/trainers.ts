import { findOwnTeamMember, listTrainers, setTrainerProfile } from '@fivvi/database';
import { decideTrainerProfileSwitch } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  FORBIDDEN,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';

// Who trains in a workspace (F005, spec #173). A trainer profile says "this team member trains
// here": every Trainer has one, an Owner has one when they also train and switches it themselves.
// The rules are in @fivvi/domain; the table is `trainer_profiles` (packages/database).
// Wording: *trainer profile* in code, but the switch speaks of training, never of profiles.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

export const TrainerSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The team-member ID: this person’s place on this team.' }),
    name: z.string().openapi({
      description: 'The account’s name; empty when the person has not given one.',
    }),
  })
  .openapi('Trainer', { description: 'A team member who trains in the workspace.' });

export const TrainerProfileSchema = z
  .object({
    teamMemberId: z.uuid().openapi({ description: 'The caller’s team-member ID.' }),
    trainsHere: z.literal(true).openapi({ description: 'The caller trains in the workspace.' }),
  })
  .openapi('TrainerProfile', {
    description: 'The caller’s own trainer profile: they train in this workspace.',
  });

const listTrainersRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/trainers',
    operationId: 'listTrainers',
    tags: ['trainers'],
    summary: 'The trainers of a workspace',
    description:
      'The team members who train in the workspace, by name: every Trainer, and each Owner who ' +
      'also trains. Each has the team-member ID and the name. Both roles may read it; a client ' +
      'of the workspace gets `403`, a person with no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The trainers.',
        content: { 'application/json': { schema: z.array(TrainerSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'workspace', capability: 'trainers.view', client: 'none' },
);

// Both switch routes are for the Owner. The capability is the Owner-only `team.manage`: who trains
// is part of how the team is made up.
const manageTeam = { type: 'workspace', capability: 'team.manage', client: 'none' } as const;

const putTrainerProfileRoute = defineRoute(
  {
    method: 'put',
    path: '/v1/workspaces/{workspaceId}/trainer-profile',
    operationId: 'putTrainerProfile',
    tags: ['trainers'],
    summary: 'Switch on that the caller trains here',
    description:
      'Gives the caller their own trainer profile in the workspace: they train here and show in ' +
      'the list of trainers from their next request. The Owner only; a Trainer always has one and ' +
      'gets `403`. It acts on the caller alone: there is no way to name another team member. ' +
      'Idempotent: switching on twice keeps one trainer profile.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The caller trains in the workspace.',
        content: { 'application/json': { schema: TrainerProfileSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageTeam,
);

const deleteTrainerProfileRoute = defineRoute(
  {
    method: 'delete',
    path: '/v1/workspaces/{workspaceId}/trainer-profile',
    operationId: 'deleteTrainerProfile',
    tags: ['trainers'],
    summary: 'Switch off that the caller trains here',
    description:
      'Takes the caller’s own trainer profile away: they no longer show in the list of trainers ' +
      'from their next request, and nothing else about them changes. The Owner only; a Trainer ' +
      'always has one and gets `403`. It acts on the caller alone: there is no way to name ' +
      'another team member. Idempotent: switching off when it is off answers `204` too.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      204: { description: 'The caller does not train in the workspace.' },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageTeam,
);

export function registerTrainers(app: OpenAPIHono) {
  const trainers = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  trainers.openapi(listTrainersRoute, async (c) => c.json(await listTrainers(c.get('scope')), 200));
  trainers.openapi(putTrainerProfileRoute, async (c) => {
    const scope = c.get('scope');
    // The caller's own team-member record is the only one the route can act on (AC6).
    const own = await findOwnTeamMember(scope);
    if (!own) return c.json(NOT_FOUND, 404);
    if (!decideTrainerProfileSwitch(own.role).allowed) return c.json(FORBIDDEN, 403);
    if (await setTrainerProfile(scope, own.id, true)) trackSwitch(c, true);
    return c.json({ teamMemberId: own.id, trainsHere: true as const }, 200);
  });
  trainers.openapi(deleteTrainerProfileRoute, async (c) => {
    const scope = c.get('scope');
    const own = await findOwnTeamMember(scope);
    if (!own) return c.json(NOT_FOUND, 404);
    if (!decideTrainerProfileSwitch(own.role).allowed) return c.json(FORBIDDEN, 403);
    if (await setTrainerProfile(scope, own.id, false)) trackSwitch(c, false);
    return c.body(null, 204);
  });
  app.route('/', trainers);
}

/** The workspace ID and on/off only: the Owner’s own UUID is the pseudonymous ID (OBSERVABILITY.md §4). */
function trackSwitch(c: Context<WorkspaceEnv>, trainsHere: boolean) {
  c.get('dependencies').productEvents.track({
    event: 'trainer_profile_changed',
    distinctId: c.get('account').id,
    properties: { workspace_id: c.get('scope').workspaceId, trains_here: trainsHere },
  });
}
