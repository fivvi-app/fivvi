import { findOwnTeamMember, findSession, findWorkspace } from '@fivvi/database';
import { mayCancelPrivateSession } from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  FORBIDDEN,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { cancelPrivateSessionInRequest } from '../sessions/cancel-private-session.ts';
import { invalid, surfaceOf } from './group-classes.ts';
import { conflict, SessionSchema, shown } from './sessions.ts';

// Cancelling a private session (F026, spec #462, ticket #557). A Trainer cancels their own private
// session, the Owner any (PS-06): who is cancelling (*De klant* / *Wij*), and whether to email the
// client. The session becomes `cancelled` and stays (nothing is deleted, there is no undo); its
// clients' places become `cancelled`, one line of the status history each; the time, the team member
// and the initiator are stored (M11's cancellation policy reads them). The rules are
// `cancelPrivateSession` in @fivvi/domain; `cancelPrivateSessionInRequest` stores, and queues the
// email (EM-05) and the event for after the commit. A class date's cancellation (CO-03) comes with
// its own ticket on the same path.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const SessionParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
  sessionId: z.uuid().openapi({
    param: { name: 'sessionId', in: 'path' },
    description: 'The session ID.',
  }),
});

const CancelPrivateSessionBodySchema = z
  .object({
    initiator: z.enum(['client', 'workspace']).openapi({
      description:
        'Who is cancelling (*Wie annuleert?*): `client` (*De klant*) or `workspace` (*Wij*). It is ' +
        'stored with the time and the team member who cancelled, for the cancellation policy of M11.',
    }),
    notify: z.boolean().openapi({
      description:
        'Whether to email the client (EM-05; each client of a duo): PS-06’s box, off for `client` ' +
        'and on for `workspace` by default. Not sent when the session has started, whatever this says.',
    }),
    version: z
      .number()
      .int()
      .min(1)
      .openapi({
        description:
          'The `version` of the session the person saw. If the session has been changed since, ' +
          'nothing is stored and the answer is `409` with the session as it is now.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`; it is the `source` of the cancellation in ' +
          'the status history and the platform of the `private_session_cancelled` event. A request ' +
          'with a bearer token must send it (`400` on `surface` with the code `required` otherwise); ' +
          'the web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('CancelPrivateSessionRequest', {
    description:
      'Who cancels a private session, whether to email the client, and the version seen.',
  });

const CancelledPrivateSessionSchema = z
  .object({
    session: SessionSchema,
    clientsNotified: z
      .number()
      .int()
      .openapi({
        description:
          'How many clients get the cancellation email (EM-05): the clients of the session when ' +
          '`notify` was on and the session has not started, else 0. It is sent after the answer is ' +
          'decided, in each client’s language; a failure is reported to error tracking and does not ' +
          'undo the cancellation.',
      }),
  })
  .openapi('CancelledPrivateSession', {
    description: 'The private session after it was cancelled, with how many clients are emailed.',
  });

// One object, as for the reschedule's refusal (see `RescheduleRefusalSchema` in sessions.ts):
// `code` tells the two apart.
const CancelRefusalSchema = z
  .object({
    code: z.enum(['session_changed', 'session_cancelled']).openapi({
      description:
        '`session_changed`: someone changed the session after the `version` sent; ' +
        '`session_cancelled`: the session was cancelled already (a second cancel) and stays as it is.',
    }),
    session: SessionSchema.openapi({ description: 'The session as it is now.' }),
    changedBy: z
      .object({ name: z.string().openapi({ description: 'The account’s name.' }) })
      .optional()
      .openapi({
        description:
          'Who changed the session last, for `session_changed`; left out when that person has ' +
          'been removed or their account has no name.',
      }),
  })
  .openapi('CancelPrivateSessionRefusal', {
    description:
      'Why the cancellation was refused; nothing was stored. Contains no user-facing text.',
  });

// A Trainer cancels the sessions they teach (`session.private.cancel.own`), the Owner any
// (`session.private.cancel.any`): the matrix gives both roles the first, and the rules ask for the
// second when the session's trainer is another.
const cancelSessions = {
  type: 'workspace',
  capability: 'session.private.cancel.own',
  client: 'none',
} as const;

const cancelPrivateSessionRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel',
    operationId: 'cancelPrivateSession',
    tags: ['sessions'],
    summary: 'Cancel a private session',
    description:
      'Cancels a private session (PS-06): the session becomes `cancelled` and stays, each ' +
      'client’s place becomes `cancelled` (one line of the status history each, with the caller as ' +
      'actor and `initiator`), and the time (UTC), the team member who cancelled and the ' +
      '`initiator` are stored. The Owner may cancel any private session, a Trainer only their own ' +
      '(`403` otherwise). A cancelled session answers `409` with the code `session_cancelled` (a ' +
      'second cancel too, whatever the version; the state is told before the version); a ' +
      '`version` that is not the session’s answers `409` with `session_changed`, the session as it ' +
      'is now and who changed it last. A session that is not private or not in the workspace ' +
      'answers `404`. When `notify` is on and the session has not started, EM-05 goes to each ' +
      'client after the cancellation is committed, in their email language, else the workspace’s ' +
      'default, and never names another participant. A session that has started is recorded without ' +
      'an email. There is no undo.',
    security: SIGNED_IN,
    request: {
      params: SessionParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CancelPrivateSessionBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The session was cancelled.',
        content: { 'application/json': { schema: CancelledPrivateSessionSchema } },
      },
      400: validationErrorResponse,
      409: {
        description:
          'The session was cancelled already (`session_cancelled`), or changed after the ' +
          '`version` sent (`session_changed`). Nothing was stored.',
        content: { 'application/json': { schema: CancelRefusalSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  cancelSessions,
);

export function registerSessionCancellation(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(cancelPrivateSessionRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const dependencies = c.get('dependencies');
    const actor = await findOwnTeamMember(scope);
    const workspace = await findWorkspace(scope);
    const session = await findSession(scope, sessionId);
    // This route cancels private sessions; a class date has its own rules (CO-03), Open Gym too.
    if (!actor || !workspace || !session || session.type !== 'private') {
      return c.json(NOT_FOUND, 404);
    }
    // Who may comes first: a caller who may not learns nothing about the session or the input.
    if (
      !mayCancelPrivateSession(
        { role: actor.role, teamMemberId: actor.id },
        { trainerTeamMemberId: session.trainer?.id ?? null },
      )
    ) {
      return c.json(FORBIDDEN, 403);
    }
    // The source of the cancellation: the web, or the app that named itself (the history records it).
    const source = surfaceOf(c.req.header('authorization'), body.surface);
    if (source === undefined) return c.json(invalid('surface', 'required'), 400);

    const result = await cancelPrivateSessionInRequest({
      scope,
      afterCommit: c.get('afterCommit'),
      dependencies,
      session,
      workspace,
      actor: { teamMemberId: actor.id, role: actor.role, accountId: c.get('account').id },
      request: {
        initiator: body.initiator,
        notify: body.notify,
        expectedVersion: body.version,
      },
      source,
      now: dependencies.clock.now(),
    });
    // Each refusal rolls the request's transaction back: nothing is stored, nothing is sent.
    if (result.outcome === 'refused') {
      switch (result.reason) {
        case 'not-allowed':
          return c.json(FORBIDDEN, 403);
        case 'session-cancelled':
          return c.json(conflict('session_cancelled', result.session, workspace.timeZone), 409);
        case 'session-changed':
          return c.json(conflict('session_changed', result.session, workspace.timeZone), 409);
      }
    }
    return c.json(
      {
        session: shown(result.session, workspace.timeZone),
        clientsNotified: result.clientsNotified,
      },
      200,
    );
  });
  app.route('/', router);
}
