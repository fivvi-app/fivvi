import {
  type AttendanceParticipantView,
  bulkRequestKey,
  findAttendanceParticipant,
  findOwnTeamMember,
  findSession,
  findStatusChangeByRequest,
  listAttendanceParticipants,
  recordParticipantStatusChange,
  type SessionView,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  type AttendanceActor,
  type AttendanceSession,
  attendanceOpensAt,
  attendanceSummary,
  changeParticipantStatus,
  checkAttendanceOpen,
  type MarkableStatus,
  mayTakeAttendance,
  needsAttendance,
  type ParticipantStatus,
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
import { invalid, surfaceOf } from './group-classes.ts';

// Attendance through the API (F025, spec #460, ticket #544). The session's current trainer or the
// Owner sets *Aanwezig*, *Niet verschenen* or back to *Geboekt* for a participant, from 30 minutes
// before the start (`PUT …/participants/{clientId}/attendance`), or marks every participant who is
// still open as *Aanwezig* in one action on a class date (*Iedereen aanwezig*, `POST
// …/participants/attended`). The rules are `changeParticipantStatus`, `checkAttendanceOpen` and
// `attendanceSummary` in @fivvi/domain; every change is one line of the append-only status history
// (`session_participant_status_changes`), written with the change. A request carries a
// `clientRequestId`, so a retry (the apps queue taps offline and send them on reconnect) changes
// nothing more and answers the current list. Last write wins; the history keeps both. Participant
// lists carry the client's ID, name and status and nothing else (AC14).

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

const ParticipantParamsSchema = SessionParamsSchema.extend({
  clientId: z.uuid().openapi({
    param: { name: 'clientId', in: 'path' },
    description: 'The client ID of the participant.',
  }),
});

const ClientRequestIdSchema = z.uuid().openapi({
  description:
    'An ID the sender makes up for this request, once, and sends again when it retries. The same ' +
    'ID twice in a workspace stores one change: the second answers the current list and changes ' +
    'nothing more. The same ID for another participant answers `400` on `clientRequestId` with ' +
    'the code `already_used`.',
});

const SurfaceSchema = z
  .enum(['ios', 'android'])
  .optional()
  .openapi({
    description:
      'The app that sends the request: `ios` or `android`; it is the `source` of the change in ' +
      'the history and the platform of the `attendance_marked` event. A request with a bearer ' +
      'token must send it (`400` on `surface` with the code `required` otherwise); the web does ' +
      'not send it, and a request without a bearer token ignores it.',
  });

const AttendanceParticipantSchema = z
  .object({
    clientId: z.uuid().openapi({ description: 'The client ID.' }),
    name: z.string().openapi({ description: 'The client’s display name.' }),
    status: z.enum(['booked', 'attended', 'cancelled', 'no_show']).openapi({
      description:
        '`booked` (*Geboekt*, still open), `attended` (*Aanwezig*), `no_show` (*Niet verschenen*) ' +
        'or `cancelled` (*Geannuleerd*: the client’s place was cancelled; attendance never sets or ' +
        'changes it).',
    }),
  })
  .openapi('AttendanceParticipant', {
    description:
      'A participant of a session: the client’s ID, name and status, and nothing else (no email ' +
      'address, phone number or notes).',
  });

export const AttendanceSummarySchema = z
  .object({
    attended: z.number().int().openapi({ description: 'Participants with `attended`.' }),
    noShow: z.number().int().openapi({ description: 'Participants with `no_show`.' }),
    open: z.number().int().openapi({ description: 'Participants still `booked`.' }),
    cancelled: z.number().int().openapi({ description: 'Participants with `cancelled`.' }),
  })
  .openapi('AttendanceSummary', {
    description: 'The counts behind “5 aanwezig · 1 niet verschenen · 1 open” (CO-05, CO-06).',
  });

/** The field of `attendanceOpen` on a session of the personal and the workspace read models. */
export const AttendanceOpenFieldSchema = z
  .boolean()
  .optional()
  .openapi({
    description:
      '`true` when the session has ended, takes place and a participant is still *Geboekt*: the ' +
      'nudge *Aanwezigheid nog invullen* (F025, Q18). Left out otherwise, and for Open Gym.',
  });

/**
 * What a session of the read models says of its attendance (F025, #545): `attendanceOpen` when it
 * waits for attendance (`needsAttendance`, the same rule as *Aandacht nodig*) and, for a class date,
 * the counts of its participants' statuses. Nothing for Open Gym, which has no attendance yet.
 */
export function attendanceShown(
  session: {
    readonly type: 'private' | 'group' | 'open_gym';
    readonly status: 'scheduled' | 'cancelled';
    readonly endsAt: Date;
    readonly attendanceStatuses: readonly ParticipantStatus[];
  },
  now: Date,
) {
  if (session.type === 'open_gym') return {};
  const open = needsAttendance(
    {
      status: session.status,
      endsAt: session.endsAt,
      participants: session.attendanceStatuses,
    },
    now,
  );
  return {
    ...(open ? { attendanceOpen: true as const } : {}),
    ...(session.type === 'group'
      ? { attendance: attendanceSummary(session.attendanceStatuses) }
      : {}),
  };
}

const AttendanceSchema = z
  .object({
    sessionId: z.uuid().openapi({ description: 'The session ID.' }),
    type: z.enum(['private', 'group', 'open_gym']).openapi({ description: 'The kind of session.' }),
    status: z.enum(['scheduled', 'cancelled']).openapi({
      description: 'Whether the session still takes place; no attendance is needed once cancelled.',
    }),
    attendanceOpensAt: z.iso.datetime().openapi({
      description:
        'From when attendance can be taken: 30 minutes before the start, a UTC instant, with no ' +
        'end (“Aanwezigheid kun je invullen vanaf 17:30.”).',
    }),
    canTakeAttendance: z.boolean().openapi({
      description:
        'Whether the caller may take attendance of this session: its current trainer or the ' +
        'Owner. Whether it is open yet or the session cancelled is in the other fields.',
    }),
    participants: z.array(AttendanceParticipantSchema).openapi({
      description:
        'The participants, in the order they were added; none for a class date without bookings.',
    }),
    summary: AttendanceSummarySchema,
  })
  .openapi('Attendance', {
    description:
      'A session’s participants with their status, and the counts. Holds no email address, phone ' +
      'number or notes of a client.',
  });

const SetAttendanceBodySchema = z
  .object({
    status: z.enum(['booked', 'attended', 'no_show']).openapi({
      description:
        'The new status: `attended`, `no_show`, or `booked` to take a tap back. `cancelled` is ' +
        'not accepted (`400`): it comes only from cancelling.',
    }),
    clientRequestId: ClientRequestIdSchema,
    surface: SurfaceSchema,
  })
  .openapi('SetAttendanceRequest', {
    description: 'The status to set for one participant.',
  });

const MarkEveryoneAttendedBodySchema = z
  .object({
    clientRequestId: ClientRequestIdSchema,
    surface: SurfaceSchema,
  })
  .openapi('MarkEveryoneAttendedRequest', {
    description: '*Iedereen aanwezig*: every participant still open becomes attended.',
  });

const AttendanceRefusalSchema = z
  .object({
    code: z.enum(['session_cancelled', 'participant_cancelled']).openapi({
      description:
        '`session_cancelled`: the session was cancelled, no attendance is needed; ' +
        '`participant_cancelled`: the participant cancelled their place, which attendance cannot ' +
        'change.',
    }),
  })
  .openapi('AttendanceRefusal', {
    description:
      'Why the attendance was refused; nothing was stored. Contains no user-facing text.',
  });

const TooEarlySchema = z
  .object({
    code: z.enum(['attendance_too_early']),
    opensAt: z.iso.datetime().openapi({
      description: 'When attendance opens: 30 minutes before the start, a UTC instant.',
    }),
  })
  .openapi('AttendanceTooEarly', {
    description:
      'Attendance cannot be taken yet; nothing was stored. Contains no user-facing text.',
  });

// The capabilities come from the permission matrix in @fivvi/domain (F004): both roles take
// attendance of the sessions they teach (`attendance.mark.own`), and the rules ask for
// `attendance.mark.any` (the Owner) when the session's trainer is another.
const takeAttendance = {
  type: 'workspace',
  capability: 'attendance.mark.own',
  client: 'none',
} as const;
// Who may see the clients may see who came (F004): both roles read all clients of the workspace.
const readAttendance = { type: 'workspace', capability: 'clients.view', client: 'none' } as const;

const listParticipantsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/participants',
    operationId: 'listSessionParticipants',
    tags: ['sessions'],
    summary: 'The participants of a session with their attendance',
    description:
      'The participants of a session (a private session’s client or clients, the seeded or ' +
      'booked participants of a class date) with each one’s ID, display name and status, and the ' +
      'counts of the statuses, for CO-05, CO-06 and the attendance of a private session. It also ' +
      'says when attendance opens and whether the caller may take it. Any team member may read ' +
      'it. A session that is not in the workspace answers `404`.',
    security: SIGNED_IN,
    request: { params: SessionParamsSchema },
    responses: {
      200: {
        description: 'The participants.',
        content: { 'application/json': { schema: AttendanceSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readAttendance,
);

const setAttendanceRoute = defineRoute(
  {
    method: 'put',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/{clientId}/attendance',
    operationId: 'setParticipantAttendance',
    tags: ['sessions'],
    summary: 'Set a participant’s attendance',
    description:
      'Sets a participant to `attended`, `no_show` or back to `booked`, and stores one line of ' +
      'the status history (from, to, the server’s time in UTC, the caller as actor, the source). ' +
      'The session’s current trainer or the Owner may; another Trainer gets `403`. From 30 ' +
      'minutes before the start, with no end: before that `422` `attendance_too_early` with ' +
      '`opensAt`. A cancelled session answers `409` `session_cancelled`, a participant who ' +
      'cancelled their place `409` `participant_cancelled`. Setting the status the participant ' +
      'has changes nothing. The last write wins; the history keeps both. The same ' +
      '`clientRequestId` twice stores one change and answers the current list. Answers the ' +
      'session’s participants as `GET …/participants` does. A session or participant that is not ' +
      'in the workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: ParticipantParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SetAttendanceBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The status is set (or was set already); the participants as they are now.',
        content: { 'application/json': { schema: AttendanceSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The session or the participant was cancelled. Nothing was stored.',
        content: { 'application/json': { schema: AttendanceRefusalSchema } },
      },
      422: {
        description: 'Attendance opens 30 minutes before the start. Nothing was stored.',
        content: { 'application/json': { schema: TooEarlySchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  takeAttendance,
);

const markEveryoneAttendedRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/attended',
    operationId: 'markEveryoneAttended',
    tags: ['sessions'],
    summary: 'Everyone attended',
    description:
      '*Iedereen aanwezig*, for a class date only (a private session or any other session ' +
      'answers `404`): in one transaction every participant with status `booked` becomes ' +
      '`attended`, one line of the status history each (the source is the caller’s). A ' +
      'participant who is `no_show` or `cancelled`, or `attended` already, stays as they are. The ' +
      'same rules as one change: the session’s current trainer or the Owner (another Trainer ' +
      'gets `403`), from 30 minutes before the start (`422` `attendance_too_early`), never on a ' +
      'cancelled session (`409` `session_cancelled`). The same `clientRequestId` twice, as a ' +
      'queued request sent again after a reconnect, changes nothing more and answers the current ' +
      'list. Answers the session’s participants with the counts, as `GET …/participants` does.',
    security: SIGNED_IN,
    request: {
      params: SessionParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: MarkEveryoneAttendedBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Everyone who was open is attended; the participants as they are now.',
        content: { 'application/json': { schema: AttendanceSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The session was cancelled. Nothing was stored.',
        content: { 'application/json': { schema: AttendanceRefusalSchema } },
      },
      422: {
        description: 'Attendance opens 30 minutes before the start. Nothing was stored.',
        content: { 'application/json': { schema: TooEarlySchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  takeAttendance,
);

/** What the rules read of a session. */
function attendanceSessionOf(session: SessionView): AttendanceSession {
  return {
    status: session.status,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    trainerTeamMemberId: session.trainer?.id ?? null,
  };
}

/** The participants of a session as the API shows them, with the counts. */
async function attendanceOf(
  scope: WorkspaceScope,
  session: SessionView,
  actor: AttendanceActor,
  places?: readonly AttendanceParticipantView[],
) {
  const participants = places ?? (await listAttendanceParticipants(scope, session.id));
  return {
    sessionId: session.id,
    type: session.type,
    status: session.status,
    attendanceOpensAt: attendanceOpensAt(session.startsAt).toISOString(),
    canTakeAttendance: mayTakeAttendance(actor, attendanceSessionOf(session)),
    participants: participants.map(({ clientId, name, status }) => ({ clientId, name, status })),
    summary: attendanceSummary(participants.map((place) => place.status)),
  };
}

export function registerAttendance(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  router.openapi(listParticipantsRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const session = await findSession(scope, sessionId);
    const me = await findOwnTeamMember(scope);
    if (!session || !me) return c.json(NOT_FOUND, 404);
    const actor = { role: me.role, teamMemberId: me.id };
    return c.json(await attendanceOf(scope, session, actor), 200);
  });

  router.openapi(setAttendanceRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId, clientId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const session = await findSession(scope, sessionId);
    const me = await findOwnTeamMember(scope);
    if (!session || !me) return c.json(NOT_FOUND, 404);
    const actor = { role: me.role, teamMemberId: me.id };
    const sessionFacts = attendanceSessionOf(session);
    if (!mayTakeAttendance(actor, sessionFacts)) return c.json(FORBIDDEN, 403);
    // The source of the change: the web, or the app that named itself (the history records it).
    const platform = surfaceOf(c.req.header('authorization'), body.surface);
    if (platform === undefined) return c.json(invalid('surface', 'required'), 400);
    // Locked until the transaction ends: two changes to one participant take turns, and the second
    // decides on what the first left, so the history's `from` is always the status before.
    const place = await findAttendanceParticipant(scope, sessionId, clientId, { lock: true });
    if (!place) return c.json(NOT_FOUND, 404);

    // A retry of a request that was stored: nothing more changes, the answer is the current list.
    const used = await findStatusChangeByRequest(scope, body.clientRequestId);
    if (used) {
      if (used.bulk || used.sessionParticipantId !== place.id) {
        return c.json(invalid('clientRequestId', 'already_used'), 400);
      }
      return c.json(await attendanceOf(scope, session, actor), 200);
    }

    const now = clock.now();
    const decision = changeParticipantStatus(
      { status: place.status, session: sessionFacts },
      body.status,
      actor,
      now,
    );
    // Each refusal rolls the request's transaction back: nothing is stored, nothing is sent.
    if (decision.outcome === 'refused') {
      switch (decision.reason) {
        case 'not-allowed':
          return c.json(FORBIDDEN, 403);
        case 'session-cancelled':
          return c.json({ code: 'session_cancelled' as const }, 409);
        case 'participant-cancelled':
          return c.json({ code: 'participant_cancelled' as const }, 409);
        case 'too-early':
          return c.json(
            { code: 'attendance_too_early' as const, opensAt: decision.opensAt.toISOString() },
            422,
          );
      }
    }
    if (decision.outcome === 'changed') {
      const stored = await recordParticipantStatusChange(scope, {
        participantId: place.id,
        clientId: place.clientId,
        from: decision.from,
        to: decision.to,
        changedAt: decision.changedAt,
        actor: { type: 'team_member', teamMemberId: me.id, accountId: scope.context.accountId },
        source: platform,
        requestKey: body.clientRequestId,
      });
      if (stored) {
        const accountId = c.get('account').id;
        c.get('afterCommit')(() =>
          productEvents.track({
            event: 'attendance_marked',
            distinctId: accountId,
            properties: {
              workspace_id: scope.workspaceId,
              platform,
              session_type: session.type,
              status: decision.to,
            },
          }),
        );
      }
    }
    return c.json(await attendanceOf(scope, session, actor), 200);
  });

  router.openapi(markEveryoneAttendedRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const session = await findSession(scope, sessionId);
    const me = await findOwnTeamMember(scope);
    // *Iedereen aanwezig* is for a class date: a private session is a tap or two, and Open Gym
    // comes with F034.
    if (!session || !me || session.type !== 'group') return c.json(NOT_FOUND, 404);
    const actor = { role: me.role, teamMemberId: me.id };
    const sessionFacts = attendanceSessionOf(session);
    if (!mayTakeAttendance(actor, sessionFacts)) return c.json(FORBIDDEN, 403);
    const platform = surfaceOf(c.req.header('authorization'), body.surface);
    if (platform === undefined) return c.json(invalid('surface', 'required'), 400);

    // Every participant locked, in a fixed order, until the transaction ends: a second request
    // (a replay, or a tap on one participant) waits and then decides on what this one left.
    const places = await listAttendanceParticipants(scope, sessionId, { lock: true });

    // A replay of a bulk that was stored (a queued request sent again after a reconnect): the
    // answer is the current list, and nothing changes.
    const used = await findStatusChangeByRequest(scope, body.clientRequestId);
    if (used) {
      if (!used.bulk || !places.some((place) => place.id === used.sessionParticipantId)) {
        return c.json(invalid('clientRequestId', 'already_used'), 400);
      }
      return c.json(await attendanceOf(scope, session, actor, places), 200);
    }

    const now = clock.now();
    const open = checkAttendanceOpen(sessionFacts, actor, now);
    if (open.outcome === 'refused') {
      switch (open.reason) {
        case 'not-allowed':
          return c.json(FORBIDDEN, 403);
        case 'session-cancelled':
          return c.json({ code: 'session_cancelled' as const }, 409);
        case 'too-early':
          return c.json(
            { code: 'attendance_too_early' as const, opensAt: open.opensAt.toISOString() },
            422,
          );
      }
    }

    // One change for each participant who is still open, through the same function as a single
    // change; `no_show`, `cancelled` and `attended` stay as they are.
    const changed: AttendanceParticipantView[] = [];
    for (const place of places) {
      const decision = changeParticipantStatus(
        { status: place.status, session: sessionFacts },
        'attended' satisfies MarkableStatus,
        actor,
        now,
      );
      if (place.status !== 'booked' || decision.outcome !== 'changed') continue;
      const stored = await recordParticipantStatusChange(scope, {
        participantId: place.id,
        clientId: place.clientId,
        from: decision.from,
        to: decision.to,
        changedAt: decision.changedAt,
        actor: { type: 'team_member', teamMemberId: me.id, accountId: scope.context.accountId },
        source: platform,
        requestKey: bulkRequestKey(body.clientRequestId, place.id),
      });
      if (stored) changed.push(place);
    }
    const accountId = c.get('account').id;
    for (let marked = 0; marked < changed.length; marked += 1) {
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'attendance_marked',
          distinctId: accountId,
          properties: {
            workspace_id: scope.workspaceId,
            platform,
            session_type: session.type,
            status: 'attended',
          },
        }),
      );
    }
    return c.json(await attendanceOf(scope, session, actor), 200);
  });

  app.route('/', router);
}
