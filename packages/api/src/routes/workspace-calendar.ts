import {
  findWorkspace,
  hasWorkspaceSession,
  listWorkspaceCalendar,
  type WorkspaceCalendarRow,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  attentionWindow,
  busiestMoment,
  type DetachedField,
  decidePersonalRange,
  filterWorkspaceCalendar,
  localDateOf,
  localDayBounds,
  PERSONAL_RANGE_MAX_DAYS,
  parseWeeklyRule,
  sessionsOfDay,
  sessionsWithoutTrainer,
  type WorkspaceCalendarSession,
} from '@fivvi/domain';
import { parseAcceptLanguage, pickContentLanguage, resolveInterfaceLanguage } from '@fivvi/i18n';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { LocationSchema } from './locations.ts';
import { PersonalSessionClientSchema } from './personal.ts';
import { SessionSeriesSchema, SessionTrainerSchema } from './sessions.ts';

// The workspace calendar's read model (F014, spec #458): every session of one workspace, whoever
// its trainer is, for the Agenda (week, day per trainer, list) and, for the day, the Owner's
// dashboard and the apps' *Mijn dag | {workspace}* toggle. No new tables: the data is `sessions`.
//
// Tenant isolation (ADR-006): both routes are `workspace` routes, so the request's context holds
// that one workspace; the query names its `organization_id` besides. A trainer's sessions in
// another workspace never come back, not even as a busy marker (AC2). A caller with no place in
// the workspace gets `404`, one with a place the route does not allow (a client) `403`
// (`access.ts`).
//
// The rules (the filters, the rows of a day, *Aandacht nodig*, calendar days across summer and
// winter time) are in @fivvi/domain (`workspace-calendar.ts`, `decidePersonalRange`). Times are
// answered as UTC instants plus the workspace's zone (ADR-012); the days are the ones on the
// workspace's wall clock. Notes are never part of it.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

/** A query value written once is a string, written twice an array: both are a list. */
const listOf = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => (value === undefined || Array.isArray(value) ? value : [value]), item);

const surfaceQuery = z
  .enum(['ios', 'android'])
  .optional()
  .openapi({
    param: { name: 'surface', in: 'query' },
    description:
      'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
      'records the product event of the view with this surface; without it nothing is recorded. ' +
      'The web does not send it, and a request without a bearer token ignores it.',
  });

const CalendarQuerySchema = z.object({
  from: z
    .string()
    .regex(DATE)
    .openapi({
      param: { name: 'from', in: 'query' },
      description:
        'The first day: `YYYY-MM-DD`, on the workspace’s wall clock. A date that is none ' +
        '(30 February) answers `400` on `from`.',
    }),
  to: z
    .string()
    .regex(DATE)
    .openapi({
      param: { name: 'to', in: 'query' },
      description:
        'The last day, included: `YYYY-MM-DD`. Before `from` answers `400` on `to` with ' +
        '`before_from`; more than 42 days from `from` answers `400` with `range_too_long`.',
    }),
  trainerIds: listOf(z.array(z.uuid()))
    .optional()
    .openapi({
      param: { name: 'trainerIds', in: 'query' },
      description:
        'Only the sessions of these trainers (team-member IDs, as in `GET …/trainers`); repeat the ' +
        'parameter for each. A session without a trainer matches none. Left out: every trainer.',
    }),
  types: listOf(z.array(z.enum(['private', 'group'])))
    .optional()
    .openapi({
      param: { name: 'types', in: 'query' },
      description:
        'Only these kinds of session: `private` (*Privé*) and `group` (*Groep*); repeat the ' +
        'parameter for each. Left out: every kind.',
    }),
  groupClassId: z
    .uuid()
    .optional()
    .openapi({
      param: { name: 'groupClassId', in: 'query' },
      description:
        'Only the dates of this class (a class ID, as in `GET …/group-classes`): the class dates ' +
        'of one class, no private session. A class of another workspace matches nothing. Left ' +
        'out: every session. For *Eén les op een datum* (F037).',
    }),
  includeCancelled: z
    .preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean(),
    )
    .optional()
    .openapi({
      param: { name: 'includeCancelled', in: 'query' },
      description:
        '*Geannuleerde tonen*: `true` (the default) keeps the cancelled sessions, `false` leaves them out.',
    }),
  surface: surfaceQuery,
});

const DayQuerySchema = z.object({
  date: z
    .string()
    .regex(DATE)
    .optional()
    .openapi({
      param: { name: 'date', in: 'query' },
      description:
        'The day to show: `YYYY-MM-DD`, on the workspace’s wall clock; today when left out. A ' +
        'date that is none (30 February) answers `400` on `date`.',
    }),
});

export const WorkspaceCalendarSessionSchema = z
  .object({
    id: z.uuid().openapi({
      description:
        'The session ID. It opens with `GET /v1/workspaces/{workspaceId}/sessions/{sessionId}`.',
    }),
    type: z.enum(['private', 'group', 'open_gym']).openapi({
      description: 'The kind of session, to be shown in words (*Privé*, *Groep*, *Open Gym*).',
    }),
    status: z.enum(['scheduled', 'cancelled']).openapi({
      description: 'Whether the session still takes place. A cancelled one stays in the list.',
    }),
    startsAt: z.iso.datetime().openapi({ description: 'The start, a UTC instant.' }),
    endsAt: z.iso.datetime().openapi({ description: 'The end, a UTC instant.' }),
    timeZone: z.string().openapi({
      description: 'The workspace’s IANA time zone, e.g. `Europe/Amsterdam` (ADR-012).',
    }),
    capacity: z.number().int().openapi({
      description:
        '1 for a private session, 2 for a duo (F066); the date’s own capacity for a class date.',
    }),
    version: z.number().int().openapi({
      description:
        'Raised by every change. A move says the version it saw (`409` when it is stale).',
    }),
    booked: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          'The places taken (not cancelled), for a class date: *{booked}/{capacity} geboekt*. ' +
          'Left out for a private session.',
      }),
    location: LocationSchema,
    trainer: SessionTrainerSchema.optional().openapi({
      description:
        'Left out for *Trainer nodig*: a class date or a private session with no trainer.',
    }),
    className: z
      .string()
      .optional()
      .openapi({
        description:
          'The class name in the viewer’s language, for a class date: the English name for a ' +
          'viewer whose language is English and a class that has one, else the Dutch name ' +
          '(`pickContentLanguage`). The language is the account’s stored language, else the ' +
          'first supported one of `Accept-Language`, else English (ADR-017). Left out for a ' +
          'private session.',
      }),
    clientName: z
      .string()
      .optional()
      .openapi({
        description:
          'The client’s display name, for a private session; left out for the other kinds. It ' +
          'holds no contact detail. A duo (F066) reads as one session: the two names joined with ' +
          '` & `; `clients` has them apart.',
      }),
    clients: z
      .array(PersonalSessionClientSchema)
      .optional()
      .openapi({
        description:
          'The clients of a private session in the order they were added: one, or two for a duo. ' +
          'A client who cancelled is left out, a cancelled session keeps its clients. Left out ' +
          'for the other kinds.',
      }),
    series: SessionSeriesSchema.optional().openapi({
      description:
        'The weekly series of a class date (F022): the weekday and time of the series line and ' +
        'what was changed on this date alone. Left out for a date on its own and for private sessions.',
    }),
  })
  .openapi('WorkspaceCalendarSession', {
    description:
      'A session of the workspace as a block of its calendar. It holds no note, email address or ' +
      'other contact detail of a client.',
  });

export const WorkspaceCalendarSchema = z
  .object({
    from: z.string().openapi({ description: 'The first day: `YYYY-MM-DD`.' }),
    to: z.string().openapi({ description: 'The last day, included: `YYYY-MM-DD`.' }),
    timeZone: z.string().openapi({
      description: 'The workspace’s IANA time zone: the days follow its wall clock (ADR-012).',
    }),
    items: z.array(WorkspaceCalendarSessionSchema).openapi({
      description:
        'The workspace’s sessions that start from the start of `from` to the end of `to`, after ' +
        'the filters, in time order. Never a session of another workspace.',
    }),
  })
  .openapi('WorkspaceCalendar', {
    description:
      'The sessions of a workspace for a range of days: the Agenda’s week, day and list.',
  });

export const WorkspaceBusiestMomentSchema = z
  .object({
    startsAt: z.iso
      .datetime()
      .openapi({ description: 'The start of the busiest moment, a UTC instant.' }),
    endsAt: z.iso
      .datetime()
      .openapi({ description: 'The end of the busiest moment, a UTC instant.' }),
    timeZone: z.string().openapi({
      description: 'The workspace’s IANA time zone, e.g. `Europe/Amsterdam` (ADR-012).',
    }),
    atOnce: z.number().int().min(2).openapi({
      description: 'How many sessions run at once in that time: 2 or more.',
    }),
  })
  .openapi('WorkspaceBusiestMoment', {
    description:
      'The stretch of the day in which the most sessions run at once, for *Drukst 18:00–19:00 · 2 ' +
      'tegelijk*: the app words it and shows the times in `timeZone`.',
  });

export const WorkspaceDaySchema = z
  .object({
    date: z.string().openapi({ description: 'The day shown: `YYYY-MM-DD`, in `timeZone`.' }),
    timeZone: z.string().openapi({
      description: 'The workspace’s IANA time zone: the day starts and ends on its wall clock.',
    }),
    items: z.array(WorkspaceCalendarSessionSchema).openapi({
      description:
        'The sessions that start on the day, in time order, cancelled ones included (struck ' +
        'through): the rows of the dashboard and of *Mijn dag | {workspace}*.',
    }),
    busiest: WorkspaceBusiestMomentSchema.optional().openapi({
      description:
        'The busiest moment of the day, for *Drukst 18:00–19:00 · 2 tegelijk*: the app words it ' +
        'and shows the times in `timeZone`. The time in which the most sessions run at once and ' +
        'how many, from the sessions of `items` that take place (cancelled ones do not count; ' +
        'class dates, private sessions and Open Gym do). It ends at the next start or end of a ' +
        'session, so 18:00–20:00, 18:00–19:00 and 19:00–20:00 give 18:00–19:00. Left out when ' +
        'no two sessions run at once (*Geen overlap*). The first of equally busy moments; ' +
        'sessions that end as another begins do not overlap.',
    }),
    attention: z.array(WorkspaceCalendarSessionSchema).openapi({
      description:
        '*Aandacht nodig*: the sessions that take place without a trainer, class dates and ' +
        'private sessions alike (a private session whose trainer was removed), from now to the ' +
        'end of the 14th day counted from today, in time order. Each item says what it is as ' +
        'data: `type` (`group` or `private`), with `className` for a class date and ' +
        '`clientName` (and `clients`, two for a duo) for a private session; the app words it: ' +
        '"{class}, {date} {time}: nog geen trainer", "Privé · {client}, {date} {time}: nog ' +
        'geen trainer". Empty when nothing needs attention. Later features add their own open ' +
        'items.',
    }),
    hasSessions: z.boolean().openapi({
      description:
        'Whether the workspace has any session at all, past or planned, cancelled or not, ' +
        'whatever day is shown: it tells a new workspace (*Welkom bij Fivvi. …*) from one with ' +
        'nothing planned today. Decided on the server and only for this workspace.',
    }),
  })
  .openapi('WorkspaceDay', {
    description: 'Today in the workspace and what needs attention: the Owner’s dashboard.',
  });

// The whole team reads the calendar; only the Owner manages it (F004: `calendar.read`,
// `calendar.manage`), and the dashboard and its day are the Owner's.
const readCalendar = { type: 'workspace', capability: 'calendar.read', client: 'none' } as const;
const manageCalendar = {
  type: 'workspace',
  capability: 'calendar.manage',
  client: 'none',
} as const;

const getWorkspaceCalendarRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/calendar',
    operationId: 'getWorkspaceCalendar',
    tags: ['workspaces'],
    summary: 'The workspace calendar: the sessions of a range of days',
    description:
      'Every session of the workspace that starts from the start of `from` to the end of `to` ' +
      `(at most ${PERSONAL_RANGE_MAX_DAYS} days, on the workspace's wall clock), whoever its ` +
      'trainer is, in time order: private sessions and class dates with their type, status, ' +
      'start and end (UTC instants plus the time zone), trainer, location, the client’s display ' +
      'name, the class name in the viewer’s language, booked and capacity, the series line and ' +
      'what changed on the date. For the Agenda’s week, day per trainer and list. `trainerIds`, ' +
      '`types`, `groupClassId` and `includeCancelled` narrow it. Notes are never in it. Every team member may read.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: CalendarQuerySchema },
    responses: {
      200: {
        description: 'The sessions.',
        content: { 'application/json': { schema: WorkspaceCalendarSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readCalendar,
);

const getWorkspaceDayRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/day',
    operationId: 'getWorkspaceDay',
    tags: ['workspaces'],
    summary: 'The workspace today: the rows of one day and what needs attention',
    description:
      'The sessions of the workspace on one day (today unless `date` says otherwise, on the ' +
      'workspace’s wall clock), whoever the trainer is, in time order, and *Aandacht nodig*: the ' +
      'class dates and private sessions in the next 14 days that have no trainer. `busiest` is the ' +
      'day’s busiest moment (the time with the most sessions at once, and how many), left out ' +
      'when no two sessions overlap. For the Owner’s dashboard and the ' +
      'apps’ *Mijn dag | {workspace}* toggle. Only for the Owner (`calendar.manage`).',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema, query: DayQuerySchema },
    responses: {
      200: {
        description: 'The day.',
        content: { 'application/json': { schema: WorkspaceDaySchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageCalendar,
);

/** A session of the workspace as the rules read it and the answer shows it. */
interface CalendarItem extends WorkspaceCalendarSession {
  readonly row: WorkspaceCalendarRow;
}

function toItem(row: WorkspaceCalendarRow): CalendarItem {
  return {
    row,
    sessionId: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    trainerId: row.trainer?.id ?? null,
    groupClassId: row.groupClassId,
  };
}

/** What the answer shows of a session: instants as ISO text; the fields of the other kinds are left out. */
function shown({ row }: CalendarItem, timeZone: string, viewerLocale: string) {
  const rule = row.series ? parseWeeklyRule(row.series.rrule) : undefined;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone,
    capacity: row.capacity,
    version: row.version,
    location: row.location,
    ...(row.trainer ? { trainer: row.trainer } : {}),
    ...(row.type === 'private'
      ? row.clientName === null
        ? {}
        : { clientName: row.clientName, clients: [...row.clients] }
      : {
          booked: row.booked,
          ...(row.classNameNl === null
            ? {}
            : { className: pickContentLanguage(viewerLocale, row.classNameNl, row.classNameEn) }),
        }),
    ...(row.series && rule
      ? {
          series: {
            id: row.series.id,
            weekday: rule.weekday,
            localStartTime: row.series.localStartTime,
            occurrenceDate: row.series.occurrenceDate,
            changedFields: row.series.detachedFields as DetachedField[],
          },
        }
      : {}),
  };
}

/** A refusal of the typed input, in the shape of the contract's validation error. */
function invalid(path: string, code: string) {
  return { code: 'validation_failed' as const, issues: [{ path, code }] };
}

/**
 * The language of the viewer (ADR-017): the account's stored language, else the first supported
 * language of the request's `Accept-Language`, else English.
 */
function viewerLocaleOf(c: Context<WorkspaceEnv>) {
  return resolveInterfaceLanguage({
    stored: c.get('account').preferredLocale,
    requested: parseAcceptLanguage(c.req.header('accept-language')),
  });
}

async function readWindow(scope: WorkspaceScope, window: { from: Date; to: Date }) {
  return (await listWorkspaceCalendar(scope, window)).map(toItem);
}

export function registerWorkspaceCalendar(app: OpenAPIHono) {
  // Its own router, so `scope` is typed on the routes behind the access middleware.
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  router.openapi(getWorkspaceCalendarRoute, async (c) => {
    const { from, to, trainerIds, types, groupClassId, includeCancelled, surface } =
      c.req.valid('query');
    const scope = c.get('scope');
    const workspace = await findWorkspace(scope);
    if (!workspace) return c.json(NOT_FOUND, 404);
    const range = decidePersonalRange(from, to, workspace.timeZone);
    if (range.outcome === 'refused') {
      switch (range.reason) {
        case 'invalid-from':
          return c.json(invalid('from', 'invalid_date'), 400);
        case 'invalid-to':
          return c.json(invalid('to', 'invalid_date'), 400);
        case 'to-before-from':
          return c.json(invalid('to', 'before_from'), 400);
        case 'too-long':
          return c.json(invalid('to', 'range_too_long'), 400);
      }
    }
    const viewerLocale = viewerLocaleOf(c);
    const items = filterWorkspaceCalendar(
      await readWindow(scope, { from: range.start, to: range.end }),
      {
        ...(trainerIds ? { trainerIds } : {}),
        ...(types ? { types } : {}),
        ...(groupClassId ? { groupClassId } : {}),
        ...(includeCancelled === undefined ? {} : { includeCancelled }),
      },
    );

    // The workspace ID and the platform only: no client, class or trainer, no time or filter
    // (OBSERVABILITY.md §4). The web sends no bearer token; an app names its surface, and one that
    // names none records nothing, as the API does not guess.
    const platform = c.req.header('authorization') ? surface : 'web';
    if (platform !== undefined) {
      const { productEvents } = c.get('dependencies');
      const distinctId = c.get('account').id;
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'workspace_calendar_viewed',
          distinctId,
          properties: { workspace_id: scope.workspaceId, platform },
        }),
      );
    }
    return c.json(
      {
        from,
        to,
        timeZone: workspace.timeZone,
        items: items.map((item) => shown(item, workspace.timeZone, viewerLocale)),
      },
      200,
    );
  });

  router.openapi(getWorkspaceDayRoute, async (c) => {
    const { date: asked } = c.req.valid('query');
    const scope = c.get('scope');
    const workspace = await findWorkspace(scope);
    if (!workspace) return c.json(NOT_FOUND, 404);
    const now = c.get('dependencies').clock.now();
    const date = asked ?? localDateOf(now, workspace.timeZone);
    const bounds = localDayBounds(date, workspace.timeZone);
    if (!bounds) return c.json(invalid('date', 'invalid_date'), 400);
    const window = attentionWindow(now, workspace.timeZone);
    const viewerLocale = viewerLocaleOf(c);

    const rows =
      sessionsOfDay(
        await readWindow(scope, { from: bounds.start, to: bounds.end }),
        date,
        workspace.timeZone,
      ) ?? [];
    const busiest = busiestMoment(rows);
    // The open items look 14 days ahead whatever day is shown: read on their own.
    const ahead = window ? await readWindow(scope, window) : [];
    // Any row says the workspace has sessions; only an empty answer asks the database.
    const hasSessions = rows.length > 0 || ahead.length > 0 || (await hasWorkspaceSession(scope));
    return c.json(
      {
        date,
        timeZone: workspace.timeZone,
        items: rows.map((item) => shown(item, workspace.timeZone, viewerLocale)),
        ...(busiest
          ? {
              busiest: {
                startsAt: busiest.startsAt.toISOString(),
                endsAt: busiest.endsAt.toISOString(),
                timeZone: workspace.timeZone,
                atOnce: busiest.atOnce,
              },
            }
          : {}),
        attention: sessionsWithoutTrainer(ahead, now, workspace.timeZone).map((item) =>
          shown(item, workspace.timeZone, viewerLocale),
        ),
        hasSessions,
      },
      200,
    );
  });

  app.route('/', router);
}
