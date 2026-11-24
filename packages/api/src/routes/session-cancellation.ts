import {
  findClassSeries,
  findOwnTeamMember,
  findSession,
  findWorkspace,
  listLaterSeriesDates,
} from '@fivvi/database';
import {
  CANCELLATION_MESSAGE_MAX_LENGTH,
  mayCancelPrivateSession,
  previewClassCancellation,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  FORBIDDEN,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { cancelClassDateInRequest, cancellableClassDate } from '../sessions/cancel-class-date.ts';
import { cancelPrivateSessionInRequest } from '../sessions/cancel-private-session.ts';
import { invalid, surfaceOf } from './group-classes.ts';
import { conflict, SessionSchema, shown } from './sessions.ts';

// Cancelling a private session (F026, spec #462, ticket #557). A Trainer cancels their own private
// session, the Owner any (PS-06): who is cancelling (*De klant* / *Wij*), and whether to email the
// client. The session becomes `cancelled` and stays (nothing is deleted, there is no undo); its
// clients' places become `cancelled`, one line of the status history each; the time, the team member
// and the initiator are stored (M11's cancellation policy reads them). The rules are
// `cancelPrivateSession` in @fivvi/domain; `cancelPrivateSessionInRequest` stores, and queues the
// email (EM-05) and the event for after the commit.
//
// A class date is cancelled by the Owner alone (CO-03, ticket #558): `POST …/cancel-class` with the
// scope (*Alleen deze les* or *Deze en alle volgende lessen*, after which the series stops) and an
// optional message, and `GET …/cancel-preview` tells CO-03 how many people get the email and which
// dates are cancelled or removed. It is an operation of its own, with its own body, because the
// contract has no `oneOf` (a union is not generated cleanly in Swift and Kotlin; see
// `RescheduleRefusalSchema` in sessions.ts): a private session and a class date each answer `404` on
// the other's route.

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

const CancelClassDateBodySchema = z
  .object({
    scope: z.enum(['this', 'following']).openapi({
      description:
        '`this`: only this class date (*Alleen deze les*); `following`: this date and every later ' +
        'date of its series, after which the series stops (*Deze en alle volgende lessen*, only for a ' +
        'date in a series: `400` on `scope` with the code `not_in_series` otherwise). With ' +
        '`following` the later dates with participants or changes of their own are cancelled, the ' +
        'others (only a projection of the rule) are removed, and the series ends the day before this ' +
        'date; the daily task adds no date after it.',
    }),
    message: z
      .string()
      .max(CANCELLATION_MESSAGE_MAX_LENGTH)
      .optional()
      .openapi({
        description:
          `Optional text for the participants, at most ${CANCELLATION_MESSAGE_MAX_LENGTH} ` +
          'characters, sent in the email and kept as typed (escaped, never translated). It is ' +
          'ignored for a date that has started, which is recorded without emails. A blank text is ' +
          'no message.',
      }),
    version: z
      .number()
      .int()
      .min(1)
      .openapi({
        description:
          'The `version` of the class date the Owner saw. If it has been changed since, nothing ' +
          'is stored and the answer is `409` with the date as it is now.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`; the `source` of the cancellation in ' +
          'the status history and the platform of the `class_cancelled` event. A request with a ' +
          'bearer token must send it (`400` on `surface` with the code `required` otherwise); the ' +
          'web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('CancelClassDateRequest', {
    description:
      'How much of a series to cancel, with an optional message for the participants, and the ' +
      'version seen.',
  });

const CancelledClassDateSchema = z
  .object({
    session: SessionSchema.openapi({
      description: 'The class date that was chosen, as it is now: `cancelled`.',
    }),
    datesCancelled: z
      .number()
      .int()
      .openapi({
        description:
          'How many dates became *Geannuleerd*, the chosen one included: 1 for `this`; for `following` ' +
          'also the later dates with participants or changes of their own.',
      }),
    datesRemoved: z
      .number()
      .int()
      .openapi({
        description:
          'How many later dates of the series were removed from the calendar: those with no ' +
          'participant, no change of their own and nothing pointing at them (`following` only).',
      }),
    participantsNotified: z
      .number()
      .int()
      .openapi({
        description:
          'How many different people get the cancellation email (EM-05): the participants whose ' +
          'place was cancelled on a date that has not started, else 0. It is sent after the answer ' +
          'is decided, each in their own language; a failure is reported to error tracking and does ' +
          'not undo the cancellation.',
      }),
    seriesEndsOn: z
      .string()
      .optional()
      .openapi({
        description:
          'The last day of the series after `following` (*de reeks stopt*): `YYYY-MM-DD`, the day ' +
          'before the chosen date (for the first date of a series, its own day). Left out for `this`.',
      }),
  })
  .openapi('CancelledClassDate', {
    description:
      'The class date after it was cancelled, with how many dates and people the cancellation reached.',
  });

const CancelClassDateRefusalSchema = z
  .object({
    code: z.enum(['session_changed', 'session_cancelled']).openapi({
      description:
        '`session_changed`: someone changed the date after the `version` sent; ' +
        '`session_cancelled`: the date was cancelled already (a second cancel) and stays as it is.',
    }),
    session: SessionSchema.openapi({ description: 'The class date as it is now.' }),
    changedBy: z
      .object({ name: z.string().openapi({ description: 'The account’s name.' }) })
      .optional()
      .openapi({
        description:
          'Who changed the date last, for `session_changed`; left out when that person has ' +
          'been removed, has no name, or for a date nobody changed since it was planned.',
      }),
  })
  .openapi('CancelClassDateRefusal', {
    description:
      'Why the cancellation of a class date was refused; nothing was stored. Contains no user-facing text.',
  });

const ClassCancellationCountsSchema = z
  .object({
    datesCancelled: z.number().int().openapi({
      description: 'Dates that become *Geannuleerd*, the chosen one included.',
    }),
    datesRemoved: z.number().int().openapi({
      description: 'Later dates removed from the calendar.',
    }),
    datesWithEmails: z.number().int().openapi({
      description: 'Dates on which somebody gets an email: the “{classes}” of CO-03.',
    }),
    participants: z
      .number()
      .int()
      .openapi({
        description:
          'Different people who get at least one email: the “{n} deelnemers” of CO-03; 0 for a ' +
          'date that has started or has no participants.',
      }),
    emails: z
      .number()
      .int()
      .openapi({
        description:
          'Emails in all: one for each place that is cancelled on a date that has not started ' +
          '(more than `participants` when someone is booked on several dates).',
      }),
  })
  .openapi('ClassCancellationCounts', {
    description: 'What cancelling a class date reaches for one scope.',
  });

const ClassCancellationPreviewSchema = z
  .object({
    sessionId: z.uuid().openapi({ description: 'The class date the preview is for.' }),
    started: z.boolean().openapi({
      description:
        'The date has started or passed: cancelling it is recorded for the record, without ' +
        'emails and without the message field (CO-03).',
    }),
    inSeries: z.boolean().openapi({
      description: 'The date is in a series, so *Deze en alle volgende lessen* is offered.',
    }),
    thisDate: ClassCancellationCountsSchema.openapi({
      description: 'What `scope: this` reaches.',
    }),
    following: ClassCancellationCountsSchema.optional().openapi({
      description: 'What `scope: following` reaches; left out for a date that is in no series.',
    }),
  })
  .openapi('ClassCancellationPreview', {
    description:
      'What cancelling a class date would do, for CO-03: how many people get the email and which ' +
      'dates are cancelled or removed, for each scope. It stores and sends nothing.',
  });

// A Trainer cancels the sessions they teach (`session.private.cancel.own`), the Owner any
// (`session.private.cancel.any`): the matrix gives both roles the first, and the rules ask for the
// second when the session's trainer is another.
const cancelSessions = {
  type: 'workspace',
  capability: 'session.private.cancel.own',
  client: 'none',
} as const;

// Only the Owner cancels a class date (`class.manage`).
const cancelClasses = { type: 'workspace', capability: 'class.manage', client: 'none' } as const;

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

const cancelClassDateRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-class',
    operationId: 'cancelClassDate',
    tags: ['group-classes'],
    summary: 'Cancel a class date or the rest of its series',
    description:
      'Cancels a class date (CO-03, the Owner only; a Trainer gets `403`): the date becomes ' +
      '`cancelled` and stays, each participant’s place becomes `cancelled` (one line of the status ' +
      'history each, with the Owner as actor and `workspace` as the initiator), and the time (UTC), ' +
      'the Owner and the message are stored. With `scope: following` the later dates of the series ' +
      'with participants or changes of their own are cancelled the same way, the later dates with ' +
      'neither are removed, and the series ends the day before this date. EM-05 goes to each ' +
      'participant whose place was cancelled on a date that has not started, after the cancellation ' +
      'is committed, in their email language, else the workspace’s default, with the message as ' +
      'typed, and never names another participant; a date that has started is recorded without an ' +
      'email. A cancelled date answers `409` with the code `session_cancelled` (a second cancel ' +
      'too, whatever the version; the state is told before the version); a `version` that is not ' +
      'the date’s answers `409` with `session_changed` and the date as it is now. A session that ' +
      'is not a class date of the workspace (a private session too) answers `404`. There is no undo.',
    security: SIGNED_IN,
    request: {
      params: SessionParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CancelClassDateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The class date was cancelled.',
        content: { 'application/json': { schema: CancelledClassDateSchema } },
      },
      400: validationErrorResponse,
      409: {
        description:
          'The date was cancelled already (`session_cancelled`), or changed after the ' +
          '`version` sent (`session_changed`). Nothing was stored.',
        content: { 'application/json': { schema: CancelClassDateRefusalSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  cancelClasses,
);

const previewClassCancellationRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-preview',
    operationId: 'previewClassCancellation',
    tags: ['group-classes'],
    summary: 'What cancelling a class date would do',
    description:
      'Before the Owner confirms *Les annuleren* (CO-03), says for each scope how many people get ' +
      'the cancellation email and which dates are cancelled or removed, without storing or sending ' +
      'anything (the Owner only; a Trainer gets `403`). `started` says the date has started or ' +
      'passed: it is then recorded for the record, with no emails and no message. A cancelled date ' +
      'answers `409` with the code `session_cancelled`. A session that is not a class date of the ' +
      'workspace (a private session too) answers `404`.',
    security: SIGNED_IN,
    request: { params: SessionParamsSchema },
    responses: {
      200: {
        description: 'What cancelling the date reaches.',
        content: { 'application/json': { schema: ClassCancellationPreviewSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The date was cancelled already (`session_cancelled`).',
        content: { 'application/json': { schema: CancelClassDateRefusalSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  cancelClasses,
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
  router.openapi(cancelClassDateRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const dependencies = c.get('dependencies');
    const actor = await findOwnTeamMember(scope);
    const workspace = await findWorkspace(scope);
    const session = await findSession(scope, sessionId);
    // This route cancels class dates; a private session has its own rules (PS-06), Open Gym too.
    if (!actor || !workspace || !session || session.type !== 'group') {
      return c.json(NOT_FOUND, 404);
    }
    // The source of the cancellation: the web, or the app that named itself (the history records it).
    const source = surfaceOf(c.req.header('authorization'), body.surface);
    if (source === undefined) return c.json(invalid('surface', 'required'), 400);

    const result = await cancelClassDateInRequest({
      scope,
      afterCommit: c.get('afterCommit'),
      dependencies,
      session,
      workspace,
      actor: { teamMemberId: actor.id, role: actor.role, accountId: c.get('account').id },
      request: {
        scope: body.scope,
        ...(body.message === undefined ? {} : { message: body.message }),
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
        case 'not-found':
          return c.json(NOT_FOUND, 404);
        case 'not-in-series':
          return c.json(invalid('scope', 'not_in_series'), 400);
        case 'session-cancelled':
          return c.json(conflict('session_cancelled', result.session, workspace.timeZone), 409);
        case 'session-changed':
          return c.json(conflict('session_changed', result.session, workspace.timeZone), 409);
      }
    }
    return c.json(
      {
        session: shown(result.session, workspace.timeZone),
        datesCancelled: result.datesCancelled,
        datesRemoved: result.datesRemoved,
        participantsNotified: result.participantsNotified,
        ...(result.seriesEndsOn === null ? {} : { seriesEndsOn: result.seriesEndsOn }),
      },
      200,
    );
  });

  router.openapi(previewClassCancellationRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const { clock } = c.get('dependencies');
    const workspace = await findWorkspace(scope);
    const session = await findSession(scope, sessionId);
    if (!workspace || !session || session.type !== 'group') return c.json(NOT_FOUND, 404);
    // A cancelled date stays as it is: there is nothing to preview.
    if (session.status === 'cancelled') {
      return c.json(conflict('session_cancelled', session, workspace.timeZone), 409);
    }
    const series = session.series ? await findClassSeries(scope, session.series.id) : undefined;
    const later =
      session.series && series
        ? await listLaterSeriesDates(scope, series.id, session.series.occurrenceDate)
        : [];
    const { thisDate, following, started, inSeries } = previewClassCancellation(
      cancellableClassDate(session, series),
      later,
      clock.now(),
    );
    return c.json(
      { sessionId: session.id, started, inSeries, thisDate, ...(following ? { following } : {}) },
      200,
    );
  });
  app.route('/', router);
}
