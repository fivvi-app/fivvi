import {
  createPrivateSession,
  findClient,
  findOwnTeamMember,
  findSession,
  findTrainer,
  findWorkspace,
  listLocations,
  type SessionView,
} from '@fivvi/database';
import {
  confirmationLanguage,
  PRIVATE_SESSION_DURATIONS,
  planPrivateSession,
  sendsConfirmation,
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
import { privateSessionEmailKey } from '../sessions/email-key.ts';
import { LocationSchema } from './locations.ts';

// The sessions of a workspace (F020, spec #425), first slice: a team member plans a private session
// and reads a session. Group classes (F021) and Open Gym (F034) use the same record and add their
// own routes. The rules (who may plan for whom, wall-clock time to UTC with daylight saving time,
// durations, the default location, the confirmation email) are in @fivvi/domain
// (`planPrivateSession`); the tables are `sessions` and `session_participants`
// (packages/database); EM-11 is a template of @fivvi/email.
//
// A session is answered in UTC instants plus the workspace's time zone (ADR-012): clients format.
// The confirmation email goes out after the request's transaction committed (`afterCommit`), so a
// client never gets mail about a session that was not stored, and a failed send does not undo it.
// Wording: *private session*, *client*, *trainer*; the email's subject says "afspraak", nothing else.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const SessionParamsSchema = WorkspaceParamsSchema.extend({
  sessionId: z.uuid().openapi({
    param: { name: 'sessionId', in: 'path' },
    description: 'The session ID.',
  }),
});

const SessionParticipantSchema = z
  .object({
    clientId: z.uuid().openapi({ description: 'The client ID.' }),
    name: z.string().openapi({ description: 'The client’s name.' }),
    attendanceStatus: z.enum(['booked', 'attended', 'cancelled', 'no_show']).openapi({
      description:
        'What became of the client’s place: `booked` from the start; attendance and ' +
        'cancellations change it in later features.',
    }),
  })
  .openapi('SessionParticipant', { description: 'A client’s place in a session.' });

const SessionGroupClassSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The class ID.' }),
    nameNl: z.string().openapi({ description: 'The class’s Dutch name.' }),
    nameEn: z
      .string()
      .nullable()
      .openapi({
        description:
          'The class’s English name, `null` without one. Show it to a viewer whose language is ' +
          'English, else the Dutch name (`pickContentLanguage`).',
      }),
  })
  .openapi('SessionGroupClass', { description: 'The class a class date was scheduled from.' });

export const SessionTrainerSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The trainer’s team-member ID, as in `GET …/trainers`.' }),
    name: z.string().openapi({ description: 'The account’s name; empty when it has none.' }),
  })
  .openapi('SessionTrainer', { description: 'The trainer of a session.' });

export const SessionSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The session ID.' }),
    type: z.enum(['private', 'group', 'open_gym']).openapi({
      description:
        'The kind of session. Private sessions are planned here, class dates are a class on ' +
        'a date (`…/group-classes/{classId}/dates`); Open Gym comes later.',
    }),
    status: z.enum(['scheduled', 'cancelled']).openapi({
      description: 'Whether the session still takes place. A session is never deleted.',
    }),
    startsAt: z.iso.datetime().openapi({ description: 'The start, a UTC instant.' }),
    endsAt: z.iso.datetime().openapi({ description: 'The end, a UTC instant.' }),
    timeZone: z.string().openapi({
      description:
        'The workspace’s IANA time zone, e.g. `Europe/Amsterdam`: the instants are shown in it ' +
        '(ADR-012).',
    }),
    capacity: z.number().int().openapi({
      description: '1 for a private session; the date’s own capacity for a class date.',
    }),
    version: z.number().int().openapi({
      description: 'Raised by every change; a change says the version it read. Starts at 1.',
    }),
    location: LocationSchema,
    // Left out, not `null`: a named schema made nullable loses its `null` in the document, and a
    // union with `null` is dropped by the Swift generator; an optional property is right in all three clients.
    trainer: SessionTrainerSchema.optional().openapi({
      description: 'Left out when the session has no trainer (the trainer’s profile ended).',
    }),
    groupClass: SessionGroupClassSchema.optional().openapi({
      description: 'The class of a class date (F021); left out for the other kinds.',
    }),
    participants: z.array(SessionParticipantSchema).openapi({
      description:
        'The clients in the session, in the order they were added. One for a private session; ' +
        'none for a class date until bookings exist (M5).',
    }),
  })
  .openapi('Session', {
    description:
      'A session of the workspace as the team sees it. It holds no email address or other ' +
      'contact detail of a client.',
  });

const PlanPrivateSessionBodySchema = z
  .object({
    clientId: z.uuid().openapi({ description: 'The client of the workspace the session is for.' }),
    trainerId: z
      .uuid()
      .optional()
      .openapi({
        description:
          'The trainer’s team-member ID, from `GET …/trainers`. Leave it out to plan for ' +
          'yourself (the caller must train in the workspace). An Owner may plan for any trainer ' +
          'of the workspace, a Trainer only for themself (`403` otherwise).',
      }),
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .openapi({
        description:
          'The date in the workspace’s time zone: `YYYY-MM-DD`. A date that is none (30 ' +
          'February) answers `400` on `localDate`.',
      }),
    localStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .openapi({
        description:
          'The start in the workspace’s time zone: `HH:mm`, 24 hours. A time the clocks skip ' +
          '(02:30 on 28 March 2027) answers `400` on `localStart` with the code ' +
          '`time_does_not_exist`; a time they repeat (02:30 on 25 October 2026) takes the first.',
      }),
    durationMinutes: z
      .number()
      .int()
      .openapi({
        description:
          `The length in minutes: ${PRIVATE_SESSION_DURATIONS.min} to ` +
          `${PRIVATE_SESSION_DURATIONS.max} in steps of ${PRIVATE_SESSION_DURATIONS.step}. Any ` +
          'other value answers `400` on `durationMinutes`.',
      }),
    notify: z.boolean().openapi({
      description:
        'Whether to email the client the confirmation (EM-11). Not sent for a session that ' +
        'starts in the past, whatever this says.',
    }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `private_session_created` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('PlanPrivateSessionRequest', {
    description:
      'A private session to plan: one client, one trainer, a local date, start and length.',
  });

const PlannedPrivateSessionSchema = z
  .object({
    session: SessionSchema,
    past: z.boolean().openapi({
      description: 'The session starts before now: it was saved, and no email goes out.',
    }),
    repeatedStart: z.boolean().openapi({
      description:
        'The start happens twice because the clocks went back; the first (summer time) was taken.',
    }),
    confirmationEmail: z.boolean().openapi({
      description:
        'Whether the confirmation (EM-11) goes to the client: it was asked for and the session ' +
        'is not in the past. It is sent after the answer is decided; a failure is reported to ' +
        'error tracking and does not undo the session.',
    }),
  })
  .openapi('PlannedPrivateSession', {
    description: 'The private session that was planned, with what the trainer should be told.',
  });

// The capabilities come from the permission matrix in @fivvi/domain (F004): both roles plan their
// own sessions, and the handler asks for `session.private.manage.any` when the trainer is another.
const planSessions = {
  type: 'workspace',
  capability: 'session.private.manage.own',
  client: 'none',
} as const;
// Who may see the client may see the session (F004): both roles read all clients of the workspace.
const readSessions = { type: 'workspace', capability: 'clients.view', client: 'none' } as const;

const planPrivateSessionRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/sessions/private',
    operationId: 'createPrivateSession',
    tags: ['sessions'],
    summary: 'Plan a private session',
    description:
      'Plans a private session for a client with a trainer (an Owner for any trainer of the ' +
      'workspace, a Trainer for themself; another trainer answers `403`) at the workspace’s ' +
      'default location. The date and start are wall-clock time in the workspace’s time zone; ' +
      'the session is stored and answered as UTC instants plus that zone. A past session is ' +
      'saved (`past`). A client or trainer that is not in the workspace (or a trainer who does ' +
      'not train) answers `404`; an invalid duration, date or time, or a start the clocks skip ' +
      'answers `400` with the field in `issues`. When ' +
      '`notify` is on and the session is not in the past, EM-11 goes to the client after the ' +
      'session is committed, in the client’s email language, else the workspace’s default.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: PlanPrivateSessionBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'The session was planned.',
        content: { 'application/json': { schema: PlannedPrivateSessionSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  planSessions,
);

const getSessionRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}',
    operationId: 'getSession',
    tags: ['sessions'],
    summary: 'One session',
    description:
      'A session of the workspace with its location, trainer and participants, for any team ' +
      'member who may see the workspace’s clients. A session that is not in the workspace ' +
      'answers `404`.',
    security: SIGNED_IN,
    request: { params: SessionParamsSchema },
    responses: {
      200: {
        description: 'The session.',
        content: { 'application/json': { schema: SessionSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readSessions,
);

/** What the answer shows of a session: instants as ISO text and the workspace's zone; no `trainer` key without one. */
export function shown(session: SessionView, timeZone: string) {
  const { startsAt, endsAt, trainer, groupClass, ...rest } = session;
  return {
    ...rest,
    ...(trainer ? { trainer } : {}),
    ...(groupClass ? { groupClass } : {}),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone,
  };
}

/** A refusal of the typed input, in the shape of the contract's validation error (path and code). */
function invalid(path: string, code: string) {
  return { code: 'validation_failed' as const, issues: [{ path, code }] };
}

export function registerSessions(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });
  router.openapi(planPrivateSessionRoute, async (c) => {
    const scope = c.get('scope');
    const body = c.req.valid('json');
    const { clock, productEvents, sendPrivateSession } = c.get('dependencies');
    const actor = await findOwnTeamMember(scope);
    const workspace = await findWorkspace(scope);
    if (!actor || !workspace) return c.json(NOT_FOUND, 404);
    // Left out, the session is the caller's own (PS-01: Trainer fixed to themself, the Owner who trains defaults to themself).
    const trainerId = body.trainerId ?? actor.id;
    const trainer = await findTrainer(scope, trainerId);
    const decision = planPrivateSession({
      actor: { role: actor.role, teamMemberId: actor.id },
      trainerTeamMemberId: trainerId,
      trainerTrains: trainer !== undefined,
      localDate: body.localDate,
      localStart: body.localStart,
      durationMinutes: body.durationMinutes,
      timeZone: workspace.timeZone,
      now: clock.now(),
      locations: await listLocations(scope),
    });
    // Each refusal rolls the request's transaction back: nothing is stored, nothing is sent.
    if (decision.outcome === 'refused') {
      switch (decision.reason) {
        case 'not-allowed':
          return c.json(FORBIDDEN, 403);
        case 'unknown-trainer':
          return c.json(NOT_FOUND, 404);
        case 'invalid-duration':
          return c.json(invalid('durationMinutes', 'invalid_duration'), 400);
        case 'invalid-date':
          return c.json(invalid('localDate', 'invalid_date'), 400);
        case 'invalid-time':
          return c.json(invalid('localStart', 'invalid_time'), 400);
        case 'time-does-not-exist':
          return c.json(invalid('localStart', 'time_does_not_exist'), 400);
      }
    }
    const client = await findClient(scope, body.clientId);
    if (!client) return c.json(NOT_FOUND, 404);
    // `planPrivateSession` planned it only for a trainer who trains here.
    if (!trainer) throw new Error('The trainer of a planned session was not found.');

    const session = await createPrivateSession(scope, {
      trainerProfileId: trainer.trainerProfileId,
      locationId: decision.locationId,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
      capacity: decision.capacity,
      clientId: client.id,
      createdByTeamMemberId: actor.id,
    });
    const confirmationEmail = sendsConfirmation({ notify: body.notify, past: decision.past });
    const afterCommit = c.get('afterCommit');
    if (confirmationEmail) {
      afterCommit(() =>
        sendPrivateSession({
          to: { email: client.email, name: client.name },
          locale: confirmationLanguage({
            clientEmailLocale: client.emailLocale,
            workspaceDefault: workspace.defaultLocale,
          }),
          workspaceName: workspace.name,
          timeZone: workspace.timeZone,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          location: { name: session.location.name, address: session.location.address },
          trainerName: session.trainer?.name.trim() ? session.trainer.name : null,
          idempotencyKey: privateSessionEmailKey(session.id, session.version),
        }),
      );
    }
    // The workspace ID and the surface only: no session, client or trainer, no date or time
    // (OBSERVABILITY.md §4). The web sends no bearer token; an app names its surface, and one that
    // names none records nothing, as the API does not guess (as for `client_added`).
    const surface = c.req.header('authorization') ? body.surface : 'web';
    if (surface !== undefined) {
      afterCommit(() =>
        productEvents.track({
          event: 'private_session_created',
          distinctId: c.get('account').id,
          properties: { workspace_id: scope.workspaceId, surface },
        }),
      );
    }
    return c.json(
      {
        session: shown(session, workspace.timeZone),
        past: decision.past,
        repeatedStart: decision.repeatedStart,
        confirmationEmail,
      },
      201,
    );
  });
  router.openapi(getSessionRoute, async (c) => {
    const scope = c.get('scope');
    const session = await findSession(scope, c.req.valid('param').sessionId);
    const workspace = await findWorkspace(scope);
    if (!session || !workspace) return c.json(NOT_FOUND, 404);
    return c.json(shown(session, workspace.timeZone), 200);
  });
  app.route('/', router);
}
