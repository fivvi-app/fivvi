import {
  findMyNextSessionStart,
  hasMySession,
  inEachWorkspace,
  listMySessions,
  listMyTrainingWorkspaces,
  type PersonalSessionRow,
  type PersonalWorkspace,
  type TenantScope,
} from '@fivvi/database';
import {
  addDays,
  decidePersonalRange,
  localDateOf,
  localDayBounds,
  mergePersonalDay,
  orderPersonalSessions,
  PERSONAL_RANGE_MAX_DAYS,
  PERSONAL_TIME_ZONE,
  type PersonalSessionTimes,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { type AccessEnv, defineRoute } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  validationErrorResponse,
} from '../errors.ts';
import { LocationSchema } from './locations.ts';

// The personal read model of a trainer (F013, spec #457): every session the signed-in account is the
// current trainer of, across all its workspaces, for *Mijn dag* / *Vandaag* and *Mijn agenda* /
// *Agenda*. No new tables: the data is `sessions` (and the class dates that join it later).
//
// Tenant isolation (ADR-006): the route is an `account` route whose context holds the account's
// team workspaces. It lists the ones the account trains in, then reads each of them in a context of
// its own (`inEachWorkspace`: one workspace, the same policies as a workspace route) and merges the
// answers in memory. No query spans workspaces, and nothing here uses the privileged path.
//
// The rules (ordering, the next item, the summary, the tomorrow line, calendar days across summer and
// winter time) are in @fivvi/domain (`mergePersonalDay`, `decidePersonalRange`). Times are answered
// as UTC instants plus the workspace's zone (ADR-012); the day is the one in Europe/Amsterdam, the
// only zone of the personal scope (information-architecture.md, Q19).
//
// An account that trains nowhere (an Owner who does not train, a client-only account) gets an empty
// answer, not `403`: a client account learns nothing from it.

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

const DayQuerySchema = z.object({
  date: z
    .string()
    .regex(DATE)
    .openapi({
      param: { name: 'date', in: 'query' },
      description:
        'The day to show: `YYYY-MM-DD`, in Dutch time (Europe/Amsterdam). A date that is none ' +
        '(30 February) answers `400` on `date`.',
    }),
  surface: surfaceQuery,
});

const SessionsQuerySchema = z.object({
  from: z
    .string()
    .regex(DATE)
    .openapi({
      param: { name: 'from', in: 'query' },
      description:
        'The first day: `YYYY-MM-DD`, in Dutch time. A date that is none answers `400` on `from`.',
    }),
  to: z
    .string()
    .regex(DATE)
    .openapi({
      param: { name: 'to', in: 'query' },
      description:
        'The last day, included: `YYYY-MM-DD`, in Dutch time. Before `from` answers `400` on ' +
        '`to` with `before_from`; more than 42 days from `from` answers `400` with `range_too_long`.',
    }),
  surface: surfaceQuery,
});

const PersonalWorkspaceSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The workspace ID.' }),
    slug: z.string().openapi({ description: 'The URL name: `/w/{slug}` on the web.' }),
    name: z.string().openapi({ description: 'The name shown in the product.' }),
  })
  .openapi('PersonalWorkspace', {
    description: 'The workspace an item of the personal view is in.',
  });

export const PersonalSessionSchema = z
  .object({
    sessionId: z.uuid().openapi({
      description:
        'The session ID. It opens in its own workspace: `GET /v1/workspaces/{workspaceId}/sessions/{sessionId}` ' +
        'with the item’s `workspace.id`.',
    }),
    workspace: PersonalWorkspaceSchema,
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
    capacity: z.number().int().openapi({ description: '1 for a private session.' }),
    booked: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          'The places taken (not cancelled), for a group class or Open Gym: *{booked}/{capacity} ' +
          'geboekt*. Left out for a private session.',
      }),
    className: z
      .string()
      .optional()
      .openapi({
        description:
          'The class name in the viewer’s language, for a group class. Left out until classes ' +
          'exist (F021 adds it).',
      }),
    location: LocationSchema.optional(),
    clientName: z
      .string()
      .optional()
      .openapi({
        description:
          'The client’s display name, for a private session; left out for the other kinds. It is ' +
          'the name in the workspace’s client record and holds no contact detail.',
      }),
  })
  .openapi('PersonalSession', {
    description:
      'A session the signed-in account is the current trainer of, in one of its workspaces. ' +
      '`location` is where a private session takes place and is left out for the other kinds.',
  });

export const MyDaySchema = z
  .object({
    date: z.string().openapi({ description: 'The day shown: `YYYY-MM-DD`, in `timeZone`.' }),
    timeZone: z.string().openapi({
      description:
        'The zone of the personal scope: `Europe/Amsterdam`. The day starts and ends on its wall clock.',
    }),
    workspaceCount: z
      .number()
      .int()
      .openapi({
        description:
          'The workspaces the account trains in and the view spans. The apps show a workspace name ' +
          'on a row only when it is more than one.',
      }),
    items: z.array(PersonalSessionSchema).openapi({
      description: 'The day’s items in time order, cancelled ones included.',
    }),
    summary: z
      .object({
        count: z
          .number()
          .int()
          .openapi({ description: 'The items of the day, cancelled ones counted.' }),
        firstStartsAt: z.iso.datetime().optional().openapi({
          description: 'The start of the first item; left out for an empty day.',
        }),
        lastEndsAt: z.iso.datetime().optional().openapi({
          description: 'The end of the last item; left out for an empty day.',
        }),
      })
      .openapi('MyDaySummary', { description: '*4 sessies · 09:00–19:00*.' }),
    next: z
      .object({
        sessionId: z.uuid().openapi({ description: 'The item in `items`.' }),
        state: z.enum(['upcoming', 'in_progress']).openapi({
          description: '`upcoming` is *Straks*, `in_progress` is *Nu bezig*.',
        }),
        startsInMinutes: z.number().int().openapi({
          description: 'Minutes to the start, rounded up; 0 while it runs.',
        }),
      })
      .optional()
      .openapi('MyDayNext', {
        description:
          '*Straks* / *Nu bezig*: the first item of today that has not ended and is not cancelled. ' +
          'Left out when nothing is left today, and for any day but today.',
      }),
    tomorrow: z
      .object({
        date: z.string().openapi({ description: 'The next day: `YYYY-MM-DD`.' }),
        count: z.number().int().openapi({ description: 'The sessions that day that take place.' }),
        firstStartsAt: z.iso.datetime().openapi({ description: 'The start of the first one.' }),
      })
      .optional()
      .openapi('MyDayTomorrow', {
        description:
          'The footer *Morgen: 3 sessies, eerste om 07:00*. Cancelled sessions are not counted; ' +
          'left out when the next day has none.',
      }),
    nextSessionDate: z
      .string()
      .optional()
      .openapi({
        description:
          'The date of the next session that takes place after this day, `YYYY-MM-DD`. Only given ' +
          'when the day has no items; left out when there is none.',
      }),
    hasSessions: z.boolean().openapi({
      description:
        'Whether the account is the current trainer of any session at all, past or future. Only ' +
        'computed when the day is empty and no session follows, to tell a new trainer (*Je hebt ' +
        'nog geen sessies*) from one with nothing planned; true otherwise.',
    }),
  })
  .openapi('MyDay', { description: 'The personal day of a trainer across all their workspaces.' });

export const MySessionsSchema = z
  .object({
    from: z.string().openapi({ description: 'The first day: `YYYY-MM-DD`.' }),
    to: z.string().openapi({ description: 'The last day, included: `YYYY-MM-DD`.' }),
    timeZone: z.string().openapi({
      description:
        'The zone of the personal scope: `Europe/Amsterdam`. The days follow its wall clock.',
    }),
    workspaceCount: z.number().int().openapi({
      description: 'The workspaces the account trains in and the view spans.',
    }),
    items: z.array(PersonalSessionSchema).openapi({
      description: 'The sessions from the start of `from` to the end of `to`, in time order.',
    }),
  })
  .openapi('MySessions', {
    description:
      'The personal sessions of a trainer across all their workspaces, for a range of days.',
  });

// Both read the account's own sessions across its team workspaces; the handler narrows them to the
// ones it trains in. Any signed-in account may call: the answer is empty when it trains nowhere.
const personalAccess = { type: 'account', workspaces: 'team' } as const;

const getMyDayRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/me/day',
    operationId: 'getMyDay',
    tags: ['me'],
    summary: 'My day: the sessions of one day across my workspaces',
    description:
      'Everything the signed-in account is the current trainer of on one day, in all the ' +
      'workspaces it trains in, in time order: the items, *Straks* / *Nu bezig*, the summary, the ' +
      'tomorrow line, the date of the next session when the day is empty and the number of ' +
      'workspaces. Each workspace is read on its own; the answer is merged here. An account that ' +
      'trains in no workspace (an Owner who does not train, a client account) gets an empty answer, ' +
      'not `403`. The day is a date in Dutch time; times are UTC instants, to be shown in Dutch time.',
    security: SIGNED_IN,
    request: { query: DayQuerySchema },
    responses: {
      200: {
        description: 'The day.',
        content: { 'application/json': { schema: MyDaySchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  personalAccess,
);

const listMySessionsRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/me/sessions',
    operationId: 'listMySessions',
    tags: ['me'],
    summary: 'My sessions: a range of days across my workspaces',
    description:
      'The sessions the signed-in account is the current trainer of from the start of `from` to ' +
      `the end of \`to\` (at most ${PERSONAL_RANGE_MAX_DAYS} days, days in Dutch time), in all the ` +
      'workspaces it trains in, in time order: for the week and month views. Cancelled sessions ' +
      'stay. An account that trains nowhere gets an empty list, not `403`.',
    security: SIGNED_IN,
    request: { query: SessionsQuerySchema },
    responses: {
      200: {
        description: 'The sessions.',
        content: { 'application/json': { schema: MySessionsSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  personalAccess,
);

/** One item of the personal view: the times the domain merges on, with what the answer shows. */
interface PersonalItem extends PersonalSessionTimes {
  readonly workspace: { readonly id: string; readonly slug: string; readonly name: string };
  readonly type: PersonalSessionRow['type'];
  readonly timeZone: string;
  readonly capacity: number;
  readonly booked: number;
  readonly location: PersonalSessionRow['location'];
  readonly clientName: string | null;
}

function toItem(row: PersonalSessionRow, workspace: PersonalWorkspace): PersonalItem {
  return {
    sessionId: row.id,
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    type: row.type,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timeZone: workspace.timeZone,
    capacity: row.capacity,
    booked: row.booked,
    location: row.location,
    clientName: row.clientName,
  };
}

/** What the answer shows of an item: instants as ISO text; the fields of the other kinds are left out. */
function shown(item: PersonalItem) {
  const { location, clientName } = item;
  return {
    sessionId: item.sessionId,
    workspace: item.workspace,
    type: item.type,
    status: item.status,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    timeZone: item.timeZone,
    capacity: item.capacity,
    ...(item.type === 'private'
      ? {
          location,
          ...(clientName === null ? {} : { clientName }),
        }
      : { booked: item.booked }),
  };
}

/** A refusal of the typed input, in the shape of the contract's validation error. */
function invalid(path: string, code: string) {
  return { code: 'validation_failed' as const, issues: [{ path, code }] };
}

/**
 * Reads the sessions from `from` up to `to` of each workspace the account trains in, one workspace
 * at a time, each in a context of its own (ADR-006). The workspaces come in name order; the callers
 * merge the lists. Answers the workspaces too, for a caller that reads them again.
 */
async function readWorkspaces(scope: TenantScope, window: { from: Date; to: Date }) {
  const workspaces = await listMyTrainingWorkspaces(scope);
  const perWorkspace = await inEachWorkspace(scope, workspaces, async (workspaceScope, workspace) =>
    (await listMySessions(workspaceScope, window)).map((row) => toItem(row, workspace)),
  );
  return { workspaces, perWorkspace };
}

/**
 * Records that the personal view was opened: the surface and the number of workspaces, nothing
 * else (OBSERVABILITY.md §4). The web sends no bearer token; an app names its surface, and one
 * that names none records nothing, as the API does not guess.
 */
function trackView(
  c: Context<AccessEnv>,
  event: 'my_day_viewed' | 'my_calendar_viewed',
  surface: 'ios' | 'android' | undefined,
  workspaceCount: number,
) {
  const where = c.req.header('authorization') ? surface : 'web';
  if (where === undefined) return;
  const { productEvents } = c.get('dependencies');
  const distinctId = c.get('account').id;
  c.get('afterCommit')(() =>
    productEvents.track({
      event,
      distinctId,
      properties: { surface: where, workspace_count: workspaceCount },
    }),
  );
}

export function registerPersonal(app: OpenAPIHono) {
  // Its own router, so `account` is typed on the routes behind the access middleware.
  const personal = new OpenAPIHono<AccessEnv>({ defaultHook: answerValidationFailure });

  personal.openapi(getMyDayRoute, async (c) => {
    const { date, surface } = c.req.valid('query');
    const today = localDayBounds(date, PERSONAL_TIME_ZONE);
    const tomorrow = localDayBounds(addDays(date, 1), PERSONAL_TIME_ZONE);
    if (!today || !tomorrow) return c.json(invalid('date', 'invalid_date'), 400);
    const scope = c.get('scope');
    const now = c.get('dependencies').clock.now();

    // Today and tomorrow in one query per workspace; the domain splits them.
    const { workspaces, perWorkspace } = await readWorkspaces(scope, {
      from: today.start,
      to: tomorrow.end,
    });
    const merged = mergePersonalDay(perWorkspace, now, PERSONAL_TIME_ZONE, { date });

    let nextSessionDate: string | undefined;
    let hasSessions = true;
    if (merged.items.length === 0) {
      // An empty day: when does it go on, and has it ever begun? Each is read per workspace again.
      const later = await inEachWorkspace(scope, workspaces, (workspaceScope) =>
        findMyNextSessionStart(workspaceScope, today.end),
      );
      const soonest = later
        .filter((start): start is Date => start !== undefined)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (soonest) nextSessionDate = localDateOf(soonest, PERSONAL_TIME_ZONE);
      else {
        const any = await inEachWorkspace(scope, workspaces, (workspaceScope) =>
          hasMySession(workspaceScope),
        );
        hasSessions = any.some(Boolean);
      }
    }

    trackView(c, 'my_day_viewed', surface, perWorkspace.length);
    return c.json(
      {
        date: merged.date,
        timeZone: PERSONAL_TIME_ZONE,
        workspaceCount: perWorkspace.length,
        items: merged.items.map(shown),
        summary: {
          count: merged.summary.count,
          ...(merged.summary.firstStartsAt
            ? { firstStartsAt: merged.summary.firstStartsAt.toISOString() }
            : {}),
          ...(merged.summary.lastEndsAt
            ? { lastEndsAt: merged.summary.lastEndsAt.toISOString() }
            : {}),
        },
        ...(merged.next
          ? {
              next: {
                sessionId: merged.next.sessionId,
                state:
                  merged.next.state === 'in-progress'
                    ? ('in_progress' as const)
                    : ('upcoming' as const),
                startsInMinutes: merged.next.startsInMinutes,
              },
            }
          : {}),
        ...(merged.tomorrow
          ? {
              tomorrow: {
                date: merged.tomorrow.date,
                count: merged.tomorrow.count,
                firstStartsAt: merged.tomorrow.firstStartsAt.toISOString(),
              },
            }
          : {}),
        ...(nextSessionDate ? { nextSessionDate } : {}),
        hasSessions,
      },
      200,
    );
  });

  personal.openapi(listMySessionsRoute, async (c) => {
    const { from, to, surface } = c.req.valid('query');
    const range = decidePersonalRange(from, to, PERSONAL_TIME_ZONE);
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
    const { perWorkspace } = await readWorkspaces(c.get('scope'), {
      from: range.start,
      to: range.end,
    });
    trackView(c, 'my_calendar_viewed', surface, perWorkspace.length);
    return c.json(
      {
        from,
        to,
        timeZone: PERSONAL_TIME_ZONE,
        workspaceCount: perWorkspace.length,
        items: orderPersonalSessions(perWorkspace.flat()).map(shown),
      },
      200,
    );
  });

  app.route('/', personal);
}
