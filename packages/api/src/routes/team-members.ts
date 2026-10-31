import { deleteTeamMember, findTeamMember, listTeamMembers, lockOwners } from '@fivvi/database';
import { canRemoveTeamMember } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  LAST_OWNER,
  LastOwnerSchema,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';

// The team of a workspace (F003, spec #171): the Owner lists it and removes a trainer from it.
// Removal deletes the team-member record only. The rule "a workspace keeps at least one Owner" is
// in @fivvi/domain; the repository locks the Owners so two removals at once can't both pass it.
// Wording: a person on a team is a *team member*, never a "member".

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

export const TeamMemberSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The team-member ID: this person’s place on this team.' }),
    name: z.string().openapi({
      description: 'The account’s name; empty when the person has not given one.',
    }),
    email: z.email().openapi({ description: 'The address the account signs in with.' }),
    role: z.enum(['owner', 'trainer']).openapi({ description: 'What the person is on the team.' }),
  })
  .openapi('TeamMember', { description: 'A person on the team of a workspace.' });

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const TeamMemberParamsSchema = WorkspaceParamsSchema.extend({
  teamMemberId: z.uuid().openapi({
    param: { name: 'teamMemberId', in: 'path' },
    description: 'The team-member ID, from the team list.',
  }),
});

// The capabilities come from the permission matrix in @fivvi/domain (F004): the Owner's both.
const viewTeam = { type: 'workspace', capability: 'team.view', client: 'none' } as const;
const manageTeam = { type: 'workspace', capability: 'team.manage', client: 'none' } as const;

const listTeamMembersRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/team-members',
    operationId: 'listTeamMembers',
    tags: ['team'],
    summary: 'The team of a workspace',
    description:
      'The people on the team of the workspace (the Owner only), sorted by name: team-member ' +
      'ID, name, email address and role. Clients of the workspace are not on the team.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The team.',
        content: { 'application/json': { schema: z.array(TeamMemberSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  viewTeam,
);

const removeTeamMemberRoute = defineRoute(
  {
    method: 'delete',
    path: '/v1/workspaces/{workspaceId}/team-members/{teamMemberId}',
    operationId: 'removeTeamMember',
    tags: ['team'],
    summary: 'Remove a team member',
    description:
      'Removes a person from the team of the workspace (the Owner only). Only the team access ' +
      'goes: the person’s account and sign-in sessions stay, and so does anything they have as ' +
      'a client of the workspace. It takes effect on the person’s next request. A workspace ' +
      'keeps at least one Owner: removing the last one answers `409` and changes nothing.',
    security: SIGNED_IN,
    request: { params: TeamMemberParamsSchema },
    responses: {
      204: { description: 'The team member was removed.' },
      400: validationErrorResponse,
      409: {
        description: 'The team member is the last Owner of the workspace; nothing changed.',
        content: { 'application/json': { schema: LastOwnerSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  manageTeam,
);

export function registerTeamMembers(app: OpenAPIHono) {
  const team = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  team.openapi(listTeamMembersRoute, async (c) =>
    c.json(await listTeamMembers(c.get('scope')), 200),
  );
  team.openapi(removeTeamMemberRoute, async (c) => {
    const scope = c.get('scope');
    const { teamMemberId } = c.req.valid('param');
    // The Owners first, locked: a parallel removal that commits first is already gone from here.
    const owners = await lockOwners(scope);
    const teamMember = await findTeamMember(scope, teamMemberId);
    if (!teamMember) return c.json(NOT_FOUND, 404);
    const team = [
      ...owners,
      ...(owners.some(({ id }) => id === teamMember.id) ? [] : [teamMember]),
    ];
    // The 409 rolls the request's transaction back, which is what "nothing changes" needs.
    if (!canRemoveTeamMember(team, teamMember.id)) return c.json(LAST_OWNER, 409);
    if (!(await deleteTeamMember(scope, teamMember.id))) return c.json(NOT_FOUND, 404);
    // The workspace ID only: the Owner’s own UUID is the pseudonymous ID (OBSERVABILITY.md §4).
    c.get('dependencies').productEvents.track({
      event: 'team_member_removed',
      distinctId: c.get('account').id,
      properties: { workspace_id: scope.workspaceId },
    });
    return c.body(null, 204);
  });
  app.route('/', team);
}
