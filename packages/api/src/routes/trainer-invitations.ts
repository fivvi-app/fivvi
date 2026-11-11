import {
  countInvitationsSince,
  createTrainerInvitation,
  findOwnTeamMember,
  findPendingInvitation,
  findPendingInvitationByEmail,
  findPreferredLocaleByEmail,
  findWorkspace,
  isOnTeam,
  listPendingInvitations,
  lockInvitationQuota,
  resendInvitation,
  type TrainerInvitationView,
  type WorkspaceScope,
  withdrawInvitation,
} from '@fivvi/database';
import {
  decideNewInvitation,
  INVITATION_NAME_MAX_LENGTH,
  invitationExpiry,
  invitationLanguage,
  invitationQuotaSince,
  normalizeEmail,
} from '@fivvi/domain';
import { locales } from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { createInvitationToken, invitationEmailEvent } from '../invitations/token.ts';

// The trainer invitations of a workspace (F011, spec #422), first slice: the Owner invites a
// trainer by email, sees the pending invitations, sends one again or withdraws it. Accepting and
// declining come with the next ticket. The rules (7 days, 20 a day, one pending invitation per
// address, the language of the email) are in @fivvi/domain; the table is `trainer_invitations`
// (packages/database); EM-09 is a template of @fivvi/email.
//
// The token in the link is random, goes into the email and nowhere else; only its hash is stored.
// Resending rotates it, so the old link stops working. An invitation is made, or sent again,
// together with its email: a send that fails fails the request and rolls everything back.
// Wording: *invitation*, *invite*, *Trainer*; never "member".

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const InvitationSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The invitation ID.' }),
    name: z.string().openapi({ description: 'The name the Owner typed for the person.' }),
    email: z.email().openapi({ description: 'The address the invitation went to, lower case.' }),
    emailLocale: z
      .enum(locales)
      .nullable()
      .openapi({
        description:
          'The language the Owner chose for the email: `nl-NL` or `en`. `null` follows the ' +
          'language of the account with that address, then the workspace’s default.',
      }),
    sentAt: z.iso.datetime().openapi({
      description: 'When the invitation was last sent: it moves forward when it is sent again.',
    }),
    expiresAt: z.iso.datetime().openapi({
      description:
        'When the link stops working: seven days after it was sent. A pending invitation can be ' +
        'past it; the Owner then sends it again.',
    }),
  })
  .openapi('TrainerInvitation', {
    description:
      'A pending invitation to join the team as a Trainer. The link’s token is only in the ' +
      'email; it is never part of an answer.',
  });

const CreateInvitationBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(INVITATION_NAME_MAX_LENGTH)
      .openapi({
        description:
          `The person’s name: trimmed, at least one and at most ${INVITATION_NAME_MAX_LENGTH} ` +
          'characters. It becomes the account’s name only when the account has none.',
      }),
    email: z.email().openapi({
      description: 'The person’s email address, stored lower case. Invalid answers `400`.',
    }),
    emailLocale: z
      .enum(locales)
      .nullish()
      .openapi({
        description:
          'The language of the email: `nl-NL` or `en`. Leave it out, or send `null`, to follow ' +
          'the language of the account with that address, then the workspace’s default. Any ' +
          'other value answers `400`.',
      }),
  })
  .openapi('CreateTrainerInvitationRequest', {
    description: 'The person to invite to the team as a Trainer.',
  });

const InvitationConflictSchema = z
  .object({
    code: z.enum(['already_on_team', 'invitation_pending']),
    invitationId: z
      .uuid()
      .optional()
      .openapi({
        description:
          'With `invitation_pending`: the ID of the invitation that exists, which the Owner can ' +
          'send again.',
      }),
  })
  .openapi('TrainerInvitationConflict', {
    description:
      'Nothing was sent. `already_on_team`: an account with the address has a team role in the ' +
      'workspace. `invitation_pending`: the address has a pending invitation. Contains no ' +
      'user-facing text.',
  });

const TooManyInvitationsSchema = z
  .object({ code: z.enum(['too_many_invitations']) })
  .openapi('TooManyInvitations', {
    description:
      'The workspace made 20 invitations in the last 24 hours; nothing was sent. Contains no ' +
      'user-facing text.',
  });

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const InvitationParamsSchema = WorkspaceParamsSchema.extend({
  invitationId: z.uuid().openapi({
    param: { name: 'invitationId', in: 'path' },
    description: 'The invitation ID, from the list of pending invitations.',
  }),
});

// The capability comes from the permission matrix in @fivvi/domain (F004): the Owner's.
const inviteTrainers = { type: 'workspace', capability: 'team.invite', client: 'none' } as const;

const createInvitationRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/trainer-invitations',
    operationId: 'createTrainerInvitation',
    tags: ['team'],
    summary: 'Invite a trainer',
    description:
      'Invites a person to join the team as a Trainer (the Owner only) and emails them the ' +
      'invitation (EM-09) in the chosen language, else the language of the account with that ' +
      'address, else the workspace’s default. The invitation works for seven days. An address ' +
      'that is on the team answers `409` `already_on_team`; one with a pending invitation ' +
      '`409` `invitation_pending` with that invitation’s ID, and no second one is made. A ' +
      'workspace makes at most 20 invitations in 24 hours: the next answers `429`. If the email ' +
      'can not be sent the answer is `500` and nothing is stored.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CreateInvitationBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'The invitation was made and emailed.',
        content: { 'application/json': { schema: InvitationSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The address is on the team or has a pending invitation; nothing was sent.',
        content: { 'application/json': { schema: InvitationConflictSchema } },
      },
      429: {
        description: 'The workspace reached its 20 invitations of the day; nothing was sent.',
        content: { 'application/json': { schema: TooManyInvitationsSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  inviteTrainers,
);

const listInvitationsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/trainer-invitations',
    operationId: 'listTrainerInvitations',
    tags: ['team'],
    summary: 'The pending invitations of a workspace',
    description:
      'The invitations that are still pending (the Owner only), the latest sent first. One ' +
      'whose `expiresAt` has passed is still listed, so the Owner can send it again. Accepted, ' +
      'declined and withdrawn invitations are not listed.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The pending invitations.',
        content: { 'application/json': { schema: z.array(InvitationSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  inviteTrainers,
);

const resendInvitationRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}/resend',
    operationId: 'resendTrainerInvitation',
    tags: ['team'],
    summary: 'Send an invitation again',
    description:
      'Emails a pending invitation again (the Owner only) with a new link and a new seven-day ' +
      'expiry; the old link stops working. An invitation that is not pending, or not found in ' +
      'the workspace, answers `404`. If the email can not be sent the answer is `500` and the ' +
      'old link keeps working.',
    security: SIGNED_IN,
    request: { params: InvitationParamsSchema },
    responses: {
      200: {
        description: 'The invitation with its new sending time and expiry.',
        content: { 'application/json': { schema: InvitationSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  inviteTrainers,
);

const withdrawInvitationRoute = defineRoute(
  {
    method: 'delete',
    path: '/v1/workspaces/{workspaceId}/trainer-invitations/{invitationId}',
    operationId: 'withdrawTrainerInvitation',
    tags: ['team'],
    summary: 'Withdraw an invitation',
    description:
      'Withdraws a pending invitation (the Owner only): its link stops working and it leaves ' +
      'the list. An invitation that is not pending, or not found in the workspace, answers ' +
      '`404`. The address can be invited again.',
    security: SIGNED_IN,
    request: { params: InvitationParamsSchema },
    responses: {
      204: { description: 'The invitation was withdrawn.' },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  inviteTrainers,
);

/** What the answer shows of an invitation: the fields of `TrainerInvitation`, as ISO instants. */
function shown({ id, name, email, emailLocale, sentAt, expiresAt }: TrainerInvitationView) {
  return {
    id,
    name,
    email,
    emailLocale,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Emails EM-09 for an invitation with the token in its link, in the language the rules decide:
 * the chosen one, the account's behind the address, the workspace's default. The event follows
 * the invitation and its token, so the same send repeated has one idempotency key and goes out once.
 */
async function sendInvitationEmail(
  c: Context<WorkspaceEnv>,
  scope: WorkspaceScope,
  invitation: TrainerInvitationView,
  token: { value: string; hash: string },
): Promise<void> {
  const workspace = await findWorkspace(scope);
  if (!workspace) throw new Error('The workspace of the invitation was not found.');
  const account = c.get('account');
  await c.get('dependencies').sendTrainerInvitation({
    to: { email: invitation.email, name: invitation.name },
    locale: invitationLanguage({
      chosen: invitation.emailLocale,
      accountPreference: await findPreferredLocaleByEmail(scope, invitation.email),
      workspaceDefault: workspace.defaultLocale,
    }),
    // The Owner's name as the account has it; the address when the account has no name yet.
    inviterName: account.name.trim() === '' ? account.email : account.name,
    workspaceName: workspace.name,
    timeZone: workspace.timeZone,
    token: token.value,
    expiresAt: invitation.expiresAt,
    event: invitationEmailEvent(invitation.id, token.hash),
  });
}

export function registerTrainerInvitations(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(createInvitationRoute, async (c) => {
    const scope = c.get('scope');
    const { name, email: typed, emailLocale } = c.req.valid('json');
    const email = normalizeEmail(typed);
    const { clock, productEvents } = c.get('dependencies');
    const now = clock.now();
    // The day's count is read after other invitations of the workspace in flight have finished.
    await lockInvitationQuota(scope);
    const pending = await findPendingInvitationByEmail(scope, email);
    const decision = decideNewInvitation({
      onTeam: await isOnTeam(scope, email),
      ...(pending ? { pending } : {}),
      sentInLastDay: await countInvitationsSince(scope, invitationQuotaSince(now)),
    });
    // The refusals roll the request's transaction back; nothing is stored or sent.
    if (decision.outcome === 'refused') {
      if (decision.reason === 'already_on_team') {
        return c.json({ code: 'already_on_team' as const }, 409);
      }
      if (decision.reason === 'invitation_pending') {
        return c.json(
          { code: 'invitation_pending' as const, invitationId: decision.invitationId },
          409,
        );
      }
      return c.json({ code: 'too_many_invitations' as const }, 429);
    }
    const inviter = await findOwnTeamMember(scope);
    if (!inviter) throw new Error('The Owner has no team member record.');
    const token = createInvitationToken();
    const invitation = await createTrainerInvitation(scope, {
      name,
      email,
      emailLocale: emailLocale ?? null,
      inviterTeamMemberId: inviter.id,
      tokenHash: token.hash,
      sentAt: now,
      expiresAt: invitationExpiry(now),
    });
    // The quota lock serialises the requests of a workspace, so the check above still holds.
    if (!invitation) throw new Error('The invitation was not stored.');
    await sendInvitationEmail(c, scope, invitation, { value: token.token, hash: token.hash });
    // The workspace ID only: neither the person's name, address nor language, nor the token
    // (OBSERVABILITY.md §4).
    productEvents.track({
      event: 'trainer_invited',
      distinctId: c.get('account').id,
      properties: { workspace_id: scope.workspaceId },
    });
    return c.json(shown(invitation), 201);
  });
  router.openapi(listInvitationsRoute, async (c) =>
    c.json((await listPendingInvitations(c.get('scope'))).map(shown), 200),
  );
  router.openapi(resendInvitationRoute, async (c) => {
    const scope = c.get('scope');
    const { invitationId } = c.req.valid('param');
    if (!(await findPendingInvitation(scope, invitationId))) return c.json(NOT_FOUND, 404);
    const now = c.get('dependencies').clock.now();
    const token = createInvitationToken();
    const invitation = await resendInvitation(scope, invitationId, {
      tokenHash: token.hash,
      sentAt: now,
      expiresAt: invitationExpiry(now),
    });
    if (!invitation) return c.json(NOT_FOUND, 404);
    await sendInvitationEmail(c, scope, invitation, { value: token.token, hash: token.hash });
    return c.json(shown(invitation), 200);
  });
  router.openapi(withdrawInvitationRoute, async (c) => {
    const { invitationId } = c.req.valid('param');
    if (!(await withdrawInvitation(c.get('scope'), invitationId))) return c.json(NOT_FOUND, 404);
    return c.body(null, 204);
  });
  app.route('/', router);
}
