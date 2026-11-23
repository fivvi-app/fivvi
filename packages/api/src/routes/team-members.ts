import {
  assignSessionTrainer,
  changeTeamMemberRole,
  clearSeriesTrainer,
  deleteTeamMember,
  findOwnTeamMember,
  findSession,
  findTeamMember,
  findTrainer,
  findTrainerProfileId,
  findWorkspace,
  listActiveSeriesOfTrainer,
  listFutureSessionsOfTrainer,
  listTeamMembers,
  lockOwners,
  type SessionView,
  setTrainerProfile,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  canChangeRole,
  canRemoveTeamMember,
  countFutureSessions,
  type FutureSessionCounts,
  hasFutureSessions,
  localDateOf,
  planHandover,
  ROLES,
  sendsTrainerChangeNotice,
  startsWithTrainerProfile,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  LAST_OWNER,
  LastOwnerSchema,
  NOT_FOUND,
  ValidationErrorSchema,
  validationErrorResponse,
} from '../errors.ts';
import { cancelPrivateSessionInRequest } from '../sessions/cancel-private-session.ts';
import { queueTrainerChangeEmails } from '../sessions/trainer-change-emails.ts';
import { inFieldOrder, invalid, surfaceOf } from './group-classes.ts';

// The team of a workspace (F003, spec #171): the Owner lists it, removes a trainer from it and
// changes a role on it (F004, spec #172). Removing a trainer who still has future sessions hands
// them over first (F023, spec #459, ticket #537): the next 2 weeks' private sessions go to a trainer
// or are cancelled (*Niemand*, F026's cancellation and email), the next 2 weeks' class dates to a
// trainer or *Trainer nodig*, everything later gets *Trainer nodig*, and the series they were the
// regular trainer of has none. The rules are `planHandover` in @fivvi/domain; the handover, the
// cancellations, the series and the removal are the request's one transaction.
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
    role: z.enum(ROLES).openapi({ description: 'What the person is on the team.' }),
  })
  .openapi('TeamMember', { description: 'A person on the team of a workspace.' });

const ChangeRoleBodySchema = z
  .object({
    role: z.enum(ROLES).openapi({
      description: 'The new role: `owner` or `trainer`. There is no `admin` role; it answers 400.',
    }),
  })
  .openapi('ChangeTeamMemberRole', { description: 'The role a team member gets.' });

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

const WindowCountsSchema = z
  .object({
    privateSessions: z.number().int().openapi({
      description: 'The scheduled private sessions that have not started.',
    }),
    classDates: z.number().int().openapi({
      description: 'The scheduled class dates that have not started.',
    }),
  })
  .openapi('FutureSessionWindow', {
    description: 'Private sessions and class dates of one window.',
  });

const futureSessionFields = {
  nextTwoWeeks: WindowCountsSchema.openapi({
    description:
      'The sessions that start within 14 days from now, on the workspace’s wall clock: the ones ' +
      'a handover hands to a trainer (or cancels, for a private session, or sets to *Trainer ' +
      'nodig*, for a class date).',
  }),
  later: WindowCountsSchema.openapi({
    description:
      'Every session after that: a handover always sets them to *Trainer nodig*, none is cancelled.',
  }),
  regularTrainerOfSeries: z.boolean().openapi({
    description:
      'Whether the person is the regular trainer of a weekly class that has not ended: it has no ' +
      'regular trainer after the removal.',
  }),
};

const FutureSessionsSchema = z
  .object({
    teamMemberId: z.uuid().openapi({ description: 'The team-member ID the counts are about.' }),
    ...futureSessionFields,
    hasFutureSessions: z.boolean().openapi({
      description:
        'Whether removing the person needs a handover: a session in either window, or a series. ' +
        'Without a handover body the removal then answers `409` `has_future_sessions`.',
    }),
  })
  .openapi('TeamMemberFutureSessions', {
    description:
      'What a team member still has coming, for the removal dialog. Counts only; no client or ' +
      'class name.',
  });

const RemoveTeamMemberRefusalSchema = z
  .object({
    code: z.enum(['last_owner', 'has_future_sessions']).openapi({
      description:
        '`last_owner`: the team member is the last Owner of the workspace; `has_future_sessions`: ' +
        'they have future sessions or a series and the request holds no handover.',
    }),
    nextTwoWeeks: futureSessionFields.nextTwoWeeks.optional(),
    later: futureSessionFields.later.optional(),
    regularTrainerOfSeries: futureSessionFields.regularTrainerOfSeries.optional(),
  })
  .openapi('RemoveTeamMemberRefusal', {
    description:
      'Why the removal was refused; nothing changed. `has_future_sessions` carries the counts of ' +
      '`GET …/future-sessions`. Contains no user-facing text.',
  });

const RemoveTeamMemberBodySchema = z
  .object({
    privateTo: z
      .uuid()
      .nullable()
      .openapi({
        description:
          'Where the next 2 weeks’ private sessions go: a trainer’s team-member ID, from `GET ' +
          '…/trainers`, or `null` (*Niemand*): they are cancelled with the cancellation email. A ' +
          'team member who does not train in the workspace, one of another workspace and the ' +
          'person being removed answer `422` on `privateTo` with the code `unknown_trainer`.',
      }),
    classesTo: z
      .uuid()
      .nullable()
      .openapi({
        description:
          'Where the next 2 weeks’ class dates go: a trainer’s team-member ID, or `null` (*Trainer ' +
          'nodig*). Same `422` on `classesTo`. Class dates and private sessions after the next 2 ' +
          'weeks always get *Trainer nodig*, whatever this says.',
      }),
    notifyClients: z
      .boolean()
      .optional()
      .openapi({
        description:
          'Whether to email the clients (*Klanten informeren*): the trainer-change email (EM-13) ' +
          'to the clients of handed-over private sessions and the booked participants of ' +
          'handed-over class dates, and F026’s cancellation email for a cancelled private ' +
          'session. Nothing is sent for *Trainer nodig*. Left out it is `true`. Never sent for a ' +
          'session that has started.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `trainer_handover` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('RemoveTeamMemberRequest', {
    description: 'The handover of the next 2 weeks’ sessions that comes with a removal.',
  });

const TeamMemberHandoverSchema = z
  .object({
    nextTwoWeeks: z
      .object({
        privateHandedOver: z
          .number()
          .int()
          .openapi({ description: 'Private sessions that went to `privateTo`.' }),
        privateCancelled: z
          .number()
          .int()
          .openapi({ description: 'Private sessions cancelled (`privateTo` was `null`).' }),
        classesHandedOver: z
          .number()
          .int()
          .openapi({ description: 'Class dates that went to `classesTo`.' }),
        classesTrainerNeeded: z
          .number()
          .int()
          .openapi({ description: 'Class dates set to *Trainer nodig* (`classesTo` was `null`).' }),
      })
      .openapi('TeamMemberHandoverNextTwoWeeks', {
        description: 'What happened to the sessions of the next 2 weeks.',
      }),
    later: z
      .object({
        privateTrainerNeeded: z.number().int().openapi({
          description: 'Later private sessions set to *Trainer nodig*; none is cancelled.',
        }),
        classesTrainerNeeded: z
          .number()
          .int()
          .openapi({ description: 'Later class dates set to *Trainer nodig*.' }),
      })
      .openapi('TeamMemberHandoverLater', {
        description: 'What happened to the sessions after the next 2 weeks.',
      }),
  })
  .openapi('TeamMemberHandover', {
    description:
      'What the handover changed, all in the one transaction that removed the team member.',
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

const futureSessionsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/team-members/{teamMemberId}/future-sessions',
    operationId: 'getTeamMemberFutureSessions',
    tags: ['team'],
    summary: 'What a team member still has coming',
    description:
      'For the removal dialog (the Owner only): the scheduled private sessions and class dates of ' +
      'the team member that have not started, in this workspace only, counted for the next 2 weeks ' +
      '(within 14 days from now, on the workspace’s wall clock) and for later, and whether they ' +
      'are the regular trainer of a series. A cancelled session does not count. A team member who ' +
      'does not train has none. A team member that is not in the workspace answers `404`.',
    security: SIGNED_IN,
    request: { params: TeamMemberParamsSchema },
    responses: {
      200: {
        description: 'The counts, possibly all zero.',
        content: { 'application/json': { schema: FutureSessionsSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageTeam,
);

const removeTeamMemberRoute = defineRoute(
  {
    method: 'delete',
    path: '/v1/workspaces/{workspaceId}/team-members/{teamMemberId}',
    operationId: 'removeTeamMember',
    tags: ['team'],
    summary: 'Remove a team member, handing over their future sessions',
    description:
      'Removes a person from the team of the workspace (the Owner only). Only the team access ' +
      'goes: the person’s account and sign-in sessions stay, and so does anything they have as ' +
      'a client of the workspace. It takes effect on the person’s next request. Their past ' +
      'sessions still show their name. A workspace keeps at least one Owner: removing the last one ' +
      'answers `409` `last_owner` and changes nothing. A person with future private sessions, ' +
      'class dates or a series they are the regular trainer of needs a handover (the request ' +
      'body): without one the answer is `409` `has_future_sessions` with the counts and nothing ' +
      'changes. With it, in one transaction: the next 2 weeks’ private sessions go to `privateTo` ' +
      'or are cancelled (F026) when it is `null`, the next 2 weeks’ class dates go to `classesTo` ' +
      'or get *Trainer nodig*, every later session gets *Trainer nodig* (none is cancelled), the ' +
      'series they were the regular trainer of has none, and the person is removed; the answer ' +
      'is `200` with what changed. The emails go out after the commit when `notifyClients` is ' +
      'not `false`. A handover to a team member who does not train in the workspace answers ' +
      '`422`. A request without a body for a person with nothing coming answers `204`.',
    security: SIGNED_IN,
    request: {
      params: TeamMemberParamsSchema,
      body: {
        required: false,
        content: { 'application/json': { schema: RemoveTeamMemberBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The team member was removed after the handover in the request.',
        content: { 'application/json': { schema: TeamMemberHandoverSchema } },
      },
      204: { description: 'The team member was removed; there was nothing to hand over.' },
      400: validationErrorResponse,
      409: {
        description:
          'The team member is the last Owner of the workspace, or has future sessions and the ' +
          'request holds no handover; nothing changed.',
        content: { 'application/json': { schema: RemoveTeamMemberRefusalSchema } },
      },
      422: {
        description:
          'The handover names a team member who does not train in the workspace; nothing changed.',
        content: { 'application/json': { schema: ValidationErrorSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  manageTeam,
);

const changeTeamMemberRoleRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/team-members/{teamMemberId}',
    operationId: 'changeTeamMemberRole',
    tags: ['team'],
    summary: 'Change a team member’s role',
    description:
      'Makes a team member of the workspace an Owner or a Trainer (the Owner only). The role is ' +
      'replaced on the same team-member record, so a person never has two roles in a ' +
      'workspace. It takes effect on the person’s next request. A new Trainer gets a trainer ' +
      'profile (a Trainer always trains); a new Owner keeps the one they had. A workspace keeps ' +
      'at least one Owner: making the last Owner a Trainer answers `409` and changes nothing. A role other ' +
      'than `owner` or `trainer` (`admin` included) answers `400`.',
    security: SIGNED_IN,
    request: {
      params: TeamMemberParamsSchema,
      body: { required: true, content: { 'application/json': { schema: ChangeRoleBodySchema } } },
    },
    responses: {
      200: {
        description: 'The team member with the new role.',
        content: { 'application/json': { schema: TeamMemberSchema } },
      },
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

type TeamMemberHandover = z.infer<typeof TeamMemberHandoverSchema>;

/** The trainer's future sessions and series, and what the removal dialog counts of them. */
async function futureOf(scope: WorkspaceScope, teamMemberId: string, now: Date, timeZone: string) {
  const profileId = await findTrainerProfileId(scope, teamMemberId);
  const sessions = profileId ? await listFutureSessionsOfTrainer(scope, profileId, now) : [];
  const seriesIds = profileId
    ? await listActiveSeriesOfTrainer(scope, profileId, localDateOf(now, timeZone))
    : [];
  const handoverSessions = sessions.map((session) => ({
    id: session.id,
    type: session.type,
    startsAt: session.startsAt,
    version: session.version,
    inSeries: session.inSeries,
    detachedFields: inFieldOrder(session.detachedFields),
  }));
  const counts: FutureSessionCounts = countFutureSessions({
    sessions: handoverSessions,
    regularTrainerOfSeries: seriesIds.length > 0,
    now,
    timeZone,
  });
  return { counts, sessions: handoverSessions, seriesIds };
}

/**
 * The trainer a handover names: `null` for nobody (*Niemand*, *Trainer nodig*), the trainer, or
 * `'unknown'` when the team member does not train in the workspace (another workspace's included)
 * or is the person being removed.
 */
async function namedTrainer(scope: WorkspaceScope, teamMemberId: string | null, leaving: string) {
  if (teamMemberId === null) return null;
  if (teamMemberId === leaving) return 'unknown' as const;
  return (await findTrainer(scope, teamMemberId)) ?? ('unknown' as const);
}

type NamedTrainer = Exclude<Awaited<ReturnType<typeof namedTrainer>>, 'unknown'>;

/**
 * Does what `planHandover` decides, in the request's transaction, and queues the emails for after
 * the commit. The sessions were read locked, so each write is of the version read.
 */
async function handOver(
  c: Context<WorkspaceEnv>,
  input: {
    workspace: NonNullable<Awaited<ReturnType<typeof findWorkspace>>>;
    now: Date;
    future: Awaited<ReturnType<typeof futureOf>>;
    privateTo: NamedTrainer;
    classesTo: NamedTrainer;
    notify: boolean;
    actor: { id: string; accountId: string };
  },
): Promise<TeamMemberHandover> {
  const scope = c.get('scope');
  const dependencies = c.get('dependencies');
  const afterCommit = c.get('afterCommit');
  const { workspace, now, actor } = input;
  const plan = planHandover({
    sessions: input.future.sessions,
    now,
    timeZone: workspace.timeZone,
    privateTo: input.privateTo?.trainerProfileId ?? null,
    classesTo: input.classesTo?.trainerProfileId ?? null,
  });

  // The sessions that went to a trainer, as they are after the change, by who got them.
  const handed = new Map<string, { trainer: { id: string; name: string }; dates: SessionView[] }>();
  for (const change of plan.changes) {
    const { action } = change;
    if (action.kind === 'cancel') {
      const session = await findSession(scope, change.sessionId);
      if (!session) throw new Error('A session of the handover was not found.');
      const cancelled = await cancelPrivateSessionInRequest({
        scope,
        afterCommit,
        dependencies,
        session,
        workspace,
        actor: { teamMemberId: actor.id, role: 'owner', accountId: actor.accountId },
        request: { initiator: 'workspace', notify: input.notify },
        source: 'system',
        now,
      });
      if (cancelled.outcome !== 'cancelled') {
        throw new Error(`A session of the handover could not be cancelled: ${cancelled.reason}.`);
      }
      continue;
    }
    const moved = await assignSessionTrainer(scope, {
      sessionId: change.sessionId,
      expectedVersion: change.version,
      trainerProfileId: action.kind === 'hand-over' ? action.trainerProfileId : null,
      ...(action.kind === 'hand-over' && change.type === 'group'
        ? { detachedFields: action.detachedFields }
        : {}),
      changedByTeamMemberId: actor.id,
    });
    if (!moved) throw new Error('A session of the handover changed while it was locked.');
    if (action.kind !== 'hand-over') continue;
    const to = change.type === 'private' ? input.privateTo : input.classesTo;
    if (!to || !sendsTrainerChangeNotice({ notify: input.notify, startsAt: moved.startsAt, now })) {
      continue;
    }
    const group = handed.get(to.id) ?? { trainer: { id: to.id, name: to.name }, dates: [] };
    group.dates.push(moved);
    handed.set(to.id, group);
  }

  // The series they were the regular trainer of has none from now on, so the dates the calendar
  // fills later show *Trainer nodig* too.
  await clearSeriesTrainer(scope, input.future.seriesIds);

  for (const { trainer, dates } of handed.values()) {
    await queueTrainerChangeEmails({
      scope,
      afterCommit,
      dependencies,
      workspace,
      trainer,
      dates,
    });
  }
  return plan.summary;
}

export function registerTeamMembers(app: OpenAPIHono) {
  const team = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  team.openapi(listTeamMembersRoute, async (c) =>
    c.json(await listTeamMembers(c.get('scope')), 200),
  );
  team.openapi(futureSessionsRoute, async (c) => {
    const scope = c.get('scope');
    const { teamMemberId } = c.req.valid('param');
    const teamMember = await findTeamMember(scope, teamMemberId);
    const workspace = await findWorkspace(scope);
    if (!teamMember || !workspace) return c.json(NOT_FOUND, 404);
    const { counts } = await futureOf(
      scope,
      teamMember.id,
      c.get('dependencies').clock.now(),
      workspace.timeZone,
    );
    return c.json(
      { teamMemberId: teamMember.id, ...counts, hasFutureSessions: hasFutureSessions(counts) },
      200,
    );
  });
  team.openapi(removeTeamMemberRoute, async (c) => {
    const scope = c.get('scope');
    const { teamMemberId } = c.req.valid('param');
    // A request without a body is read as `{}`: the handover is there when it names its targets.
    const sent = c.req.valid('json');
    const body = sent && 'privateTo' in sent ? sent : undefined;
    const dependencies = c.get('dependencies');
    // The Owners first, locked: a parallel removal that commits first is already gone from here.
    const owners = await lockOwners(scope);
    const teamMember = await findTeamMember(scope, teamMemberId);
    const workspace = await findWorkspace(scope);
    if (!teamMember || !workspace) return c.json(NOT_FOUND, 404);
    const team = [
      ...owners,
      ...(owners.some(({ id }) => id === teamMember.id) ? [] : [teamMember]),
    ];
    // The 409 rolls the request's transaction back, which is what "nothing changes" needs.
    if (!canRemoveTeamMember(team, teamMember.id)) return c.json(LAST_OWNER, 409);

    const now = dependencies.clock.now();
    const future = await futureOf(scope, teamMember.id, now, workspace.timeZone);
    if (!body) {
      if (hasFutureSessions(future.counts)) {
        return c.json({ code: 'has_future_sessions' as const, ...future.counts }, 409);
      }
    }

    let handover: TeamMemberHandover | undefined;
    if (body) {
      const privateTo = await namedTrainer(scope, body.privateTo, teamMember.id);
      if (privateTo === 'unknown') return c.json(invalid('privateTo', 'unknown_trainer'), 422);
      const classesTo = await namedTrainer(scope, body.classesTo, teamMember.id);
      if (classesTo === 'unknown') return c.json(invalid('classesTo', 'unknown_trainer'), 422);
      const actor = await findOwnTeamMember(scope);
      if (!actor) return c.json(NOT_FOUND, 404);
      handover = await handOver(c, {
        workspace,
        now,
        future,
        privateTo,
        classesTo,
        notify: body.notifyClients !== false,
        actor: { id: actor.id, accountId: c.get('account').id },
      });
    }

    if (!(await deleteTeamMember(scope, teamMember.id))) return c.json(NOT_FOUND, 404);
    // The workspace ID only: the Owner’s own UUID is the pseudonymous ID (OBSERVABILITY.md §4).
    dependencies.productEvents.track({
      event: 'team_member_removed',
      distinctId: c.get('account').id,
      properties: { workspace_id: scope.workspaceId },
    });
    if (!body || !handover) return c.body(null, 204);
    // The workspace ID and the platform only (OBSERVABILITY.md §4).
    const platform = surfaceOf(c.req.header('authorization'), body.surface);
    if (platform !== undefined) {
      c.get('afterCommit')(() =>
        dependencies.productEvents.track({
          event: 'trainer_handover',
          distinctId: c.get('account').id,
          properties: { workspace_id: scope.workspaceId, platform },
        }),
      );
    }
    return c.json(handover, 200);
  });
  team.openapi(changeTeamMemberRoleRoute, async (c) => {
    const scope = c.get('scope');
    const { teamMemberId } = c.req.valid('param');
    const { role } = c.req.valid('json');
    // The Owners first, locked, as for a removal: two demotions at once decide one after the other.
    const owners = await lockOwners(scope);
    const teamMember = await findTeamMember(scope, teamMemberId);
    if (!teamMember) return c.json(NOT_FOUND, 404);
    const team = [
      ...owners,
      ...(owners.some(({ id }) => id === teamMember.id) ? [] : [teamMember]),
    ];
    // The 409 rolls the request's transaction back, which is what "nothing changes" needs.
    if (!canChangeRole(team, teamMember.id, role)) return c.json(LAST_OWNER, 409);
    const changed = await changeTeamMemberRole(scope, teamMember.id, role);
    if (!changed) return c.json(NOT_FOUND, 404);
    // A Trainer always trains (F005 AC2): becoming one creates the trainer profile (setting it is
    // idempotent), becoming an Owner keeps what the person had.
    if (startsWithTrainerProfile(role)) await setTrainerProfile(scope, teamMember.id, true);
    return c.json(changed, 200);
  });
  app.route('/', team);
}
