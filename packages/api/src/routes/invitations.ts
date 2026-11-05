import {
  addTrainerToTeam,
  closeInvitation,
  findAccountForInvitation,
  findInvitation,
  findTeamMemberName,
  findWorkspace,
  listTeamWorkspaces,
  lockInvitation,
  nameAccountIfEmpty,
  setTrainerProfile,
  type WorkspaceScope,
} from '@fivvi/database';
import { capabilitiesOf, decideInvitationAnswer, isInvitationOpen, maskEmail } from '@fivvi/domain';
import { type OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import {
  FORBIDDEN,
  ForbiddenSchema,
  internalServerErrorResponse,
  NOT_FOUND,
  NOT_SIGNED_IN,
  NotFoundSchema,
  NotSignedInSchema,
  validationErrorResponse,
} from '../errors.ts';
import { hashInvitationToken } from '../invitations/token.ts';
import { MyWorkspaceSchema } from './me.ts';

// Answering a trainer invitation (F011, spec #422), second slice: the person who holds the link
// reads what it is for, then accepts or declines. They are not on the team yet, so these routes
// have no workspace in their path and no team access: the token in the link is the way in, through
// `inInvitationScope`, which finds the invitation by the token's hash and only then opens its
// workspace. The rules (open, expired, whose address) are `decideInvitationAnswer` of @fivvi/domain.
//
// The read is anonymous. Accepting and declining need a signed-in account, and judge that
// themselves, as `signOut` does: the sign-in session is what proves the address, and an anonymous
// call answers 401 before anything about the token is looked up. An invitation that is expired,
// withdrawn, used or unknown is one neutral `404` for everyone, so a link says nothing about whom
// it was for; the masked address shows only for a valid one, and an account with another address
// answers `403`. The token is never logged or put in an event.

const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const TokenParamsSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(256)
    .openapi({
      param: { name: 'token', in: 'path' },
      description: 'The token in the invitation link: the last part of `/invitations/{token}`.',
    }),
});

const InvitationPreviewSchema = z
  .object({
    workspaceName: z.string().openapi({ description: 'The name of the workspace that invites.' }),
    inviterName: z
      .string()
      .nullable()
      .openapi({
        description:
          'The name of the Owner who invited, `null` while they have given none. Never their ' +
          'address.',
      }),
    maskedEmail: z.string().openapi({
      description:
        'The address the invitation is for, hidden except for its first character and its ' +
        'domain (`l***@example.com`), so a person signed in with another address can see which ' +
        'to use.',
    }),
  })
  .openapi('InvitationPreview', {
    description:
      'What the link of a valid invitation shows to anyone who holds it, signed in or not.',
  });

const notFoundResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: NotFoundSchema } },
});

const notSignedInResponse = {
  description: 'Nobody is signed in: no valid sign-in session or bearer token.',
  content: { 'application/json': { schema: NotSignedInSchema } },
};

const notYourInvitationResponse = {
  description:
    'The signed-in account’s verified address is not the one the invitation is for; nothing ' +
    'changed. Sign out and sign in with the address `GET /v1/invitations/{token}` shows masked.',
  content: { 'application/json': { schema: ForbiddenSchema } },
};

const noLongerValid =
  'The invitation is no longer valid: expired, withdrawn, already used or unknown. The same ' +
  'answer for all four; nothing changed.';

const getInvitationRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/invitations/{token}',
    operationId: 'getInvitation',
    tags: ['invitations'],
    summary: 'What an invitation link is for',
    description:
      'Anyone with the link (signed in or not) reads the name of the workspace that invites, the ' +
      'name of the inviter and the masked address the invitation is for, and nothing else. An ' +
      'invitation that is expired, withdrawn, used or unknown answers one neutral `404`.',
    request: { params: TokenParamsSchema },
    responses: {
      200: {
        description: 'A valid invitation.',
        content: { 'application/json': { schema: InvitationPreviewSchema } },
      },
      400: validationErrorResponse,
      404: notFoundResponse(noLongerValid),
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

const acceptInvitationRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/invitations/{token}/accept',
    operationId: 'acceptInvitation',
    tags: ['invitations'],
    summary: 'Accept an invitation',
    description:
      'The signed-in account whose verified address is the invitation’s joins the workspace as ' +
      'a Trainer, with a trainer profile: on the account it has, a client’s included, which ' +
      'stays as it is. The account’s name becomes the invitation’s name only when it has none. ' +
      'The invitation is used. Someone who is on the team already just gets the workspace back, ' +
      'with the role they have. Two accepts at once make one team-member record: the second ' +
      'answers `404`, as for any used invitation. An invitation that is no longer valid answers ' +
      'the neutral `404`; an account with another address `403`.',
    security: SIGNED_IN,
    request: { params: TokenParamsSchema },
    responses: {
      200: {
        description:
          'The workspace the account is now on the team of, as `listMyWorkspaces` shows it.',
        content: { 'application/json': { schema: MyWorkspaceSchema } },
      },
      400: validationErrorResponse,
      401: notSignedInResponse,
      403: notYourInvitationResponse,
      404: notFoundResponse(noLongerValid),
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

const declineInvitationRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/invitations/{token}/decline',
    operationId: 'declineInvitation',
    tags: ['invitations'],
    summary: 'Decline an invitation',
    description:
      'The signed-in account whose verified address is the invitation’s declines it: no role ' +
      'is created, the invitation is closed and leaves the Owner’s list. An invitation that is ' +
      'no longer valid answers the neutral `404`; an account with another address `403`.',
    security: SIGNED_IN,
    request: { params: TokenParamsSchema },
    responses: {
      204: { description: 'The invitation was declined.' },
      400: validationErrorResponse,
      401: notSignedInResponse,
      403: notYourInvitationResponse,
      404: notFoundResponse(noLongerValid),
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

export function registerInvitations(app: OpenAPIHono, dependencies: ApiDependencies) {
  const { tenantScopes, clock, productEvents } = dependencies;

  app.openapi(getInvitationRoute, async (c) => {
    const { token } = c.req.valid('param');
    const entry = await tenantScopes.inInvitationScope(
      { tokenHash: hashInvitationToken(token) },
      async (scope, invitationId) => {
        const invitation = await findInvitation(scope, invitationId);
        if (!invitation || !isInvitationOpen(invitation, clock.now())) return undefined;
        const workspace = await findWorkspace(scope);
        if (!workspace) return undefined;
        const inviterName = (
          await findTeamMemberName(scope, invitation.inviterTeamMemberId)
        )?.trim();
        return {
          workspaceName: workspace.name,
          inviterName: inviterName ? inviterName : null,
          maskedEmail: maskEmail(invitation.email),
        };
      },
    );
    if (entry.status === 'unknown' || !entry.value) return c.json(NOT_FOUND, 404);
    return c.json(entry.value, 200);
  });

  /**
   * Accepting and declining, which differ in what they do once the person may answer. Locks the
   * invitation, decides on it as it is now, and writes only after it allowed.
   */
  async function answer<T>(
    headers: Headers,
    token: string,
    act: (input: {
      scope: WorkspaceScope;
      invitationId: string;
      invitationName: string;
    }) => Promise<T>,
  ) {
    const account = await dependencies.findSignedInAccount(headers);
    if (!account) return { kind: 'not-signed-in' as const };
    const entry = await tenantScopes.inInvitationScope(
      { tokenHash: hashInvitationToken(token), accountId: account.id },
      async (scope, invitationId) => {
        const invitation = await lockInvitation(scope, invitationId);
        const accountFacts = await findAccountForInvitation(scope);
        if (!invitation || !accountFacts) return { kind: 'no-longer-valid' as const };
        const decision = decideInvitationAnswer({
          invitation,
          now: clock.now(),
          account: accountFacts,
        });
        if (decision.outcome === 'refused') {
          return decision.reason === 'not_valid'
            ? { kind: 'no-longer-valid' as const }
            : { kind: 'wrong-account' as const };
        }
        return {
          kind: 'answered' as const,
          workspaceId: scope.workspaceId,
          value: await act({ scope, invitationId, invitationName: invitation.name }),
        };
      },
    );
    if (entry.status === 'unknown') return { kind: 'no-longer-valid' as const };
    return { ...entry.value, account };
  }

  app.openapi(acceptInvitationRoute, async (c) => {
    const { token } = c.req.valid('param');
    const result = await answer(
      c.req.raw.headers,
      token,
      async ({ scope, invitationId, invitationName }) => {
        // A person already on the team keeps the record and the role they have.
        const member = await addTrainerToTeam(scope);
        if (member.added) await setTrainerProfile(scope, member.id, true);
        await nameAccountIfEmpty(scope, invitationName);
        await closeInvitation(scope, invitationId, 'accepted');
        const place = (await listTeamWorkspaces(scope)).find(({ id }) => id === scope.workspaceId);
        if (!place) throw new Error('The account is not on the team after it accepted.');
        const { id, trainsHere, ...rest } = place;
        return { workspaceId: id, ...rest, capabilities: capabilitiesOf(rest.role), trainsHere };
      },
    );
    if (result.kind === 'not-signed-in') return c.json(NOT_SIGNED_IN, 401);
    if (result.kind === 'no-longer-valid') return c.json(NOT_FOUND, 404);
    if (result.kind === 'wrong-account') return c.json(FORBIDDEN, 403);
    // The workspace ID only (the account's UUID is the distinct ID): no name, address, role or token.
    productEvents.track({
      event: 'trainer_invitation_accepted',
      distinctId: result.account.id,
      properties: { workspace_id: result.workspaceId },
    });
    return c.json(result.value, 200);
  });

  app.openapi(declineInvitationRoute, async (c) => {
    const { token } = c.req.valid('param');
    const result = await answer(c.req.raw.headers, token, ({ scope, invitationId }) =>
      closeInvitation(scope, invitationId, 'declined'),
    );
    if (result.kind === 'not-signed-in') return c.json(NOT_SIGNED_IN, 401);
    if (result.kind === 'no-longer-valid') return c.json(NOT_FOUND, 404);
    if (result.kind === 'wrong-account') return c.json(FORBIDDEN, 403);
    productEvents.track({
      event: 'trainer_invitation_declined',
      distinctId: result.account.id,
      properties: { workspace_id: result.workspaceId },
    });
    return c.body(null, 204);
  });
}
