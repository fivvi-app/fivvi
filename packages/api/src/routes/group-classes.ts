import {
  type ClassSeriesView,
  createClassDate,
  createClassSeries,
  createGroupClass,
  createSeriesDates,
  findClassSeries,
  findGroupClass,
  findOwnTeamMember,
  findSession,
  findTrainer,
  findWorkspace,
  type GroupClassView,
  listActiveClassSeries,
  listGroupClasses,
  listLocations,
  listSeriesDates,
  moveDatesToSeries,
  type SessionView,
  updateClassDate,
  updateClassSeries,
  updateGroupClass,
  updateSeriesDates,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  applyThisAndFollowing,
  DETACHABLE_FIELDS,
  type DetachedField,
  decideGroupDateEdit,
  defaultLocation,
  expandSeries,
  GROUP_CLASS_LIMITS,
  horizonEnd,
  instantToWallClock,
  localDateOf,
  materialize,
  parseWeeklyRule,
  type SeriesChange,
  type SeriesFacts,
  type SeriesOccurrence,
  scheduleClassOnDate,
  weekdayOf,
  weeklyRule,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { SessionSchema, SessionTrainerSchema, shown } from './sessions.ts';

// The group classes of a workspace (F021, spec #427), first slice: the Owner defines a class (a
// name in Dutch and optionally English, a description, the usual trainer, capacity and duration),
// puts it on a date, edits one date and, for the apps, makes a class with its first date in one
// request. The whole team reads classes and their dates. A class on a date is a `group` session of
// the one engine (F020, `routes/sessions.ts`); the rules (limits, copying the class's defaults,
// wall-clock time to UTC with daylight saving time) are in @fivvi/domain (`scheduleClassOnDate`,
// `decideGroupDateEdit`); the tables are `group_classes` and `sessions` (packages/database).
//
// The texts are user content: the API returns the Dutch and the English text as the Owner wrote
// them and the client shows one (`pickContentLanguage` of @fivvi/i18n: the viewer's language, else
// Dutch); names are never machine-translated. Wording: *class* (les), *group class* (groepsles).

// Typed once: written inline, TypeScript loses the route's request types (see workspaces.ts).
const SIGNED_IN: RouteConfig['security'] = [{ cookieAuth: [] }, { bearerAuth: [] }];

const LIMITS = GROUP_CLASS_LIMITS;

const WorkspaceParamsSchema = z.object({
  workspaceId: z.uuid().openapi({
    param: { name: 'workspaceId', in: 'path' },
    description: 'The workspace ID.',
  }),
});

const ClassParamsSchema = WorkspaceParamsSchema.extend({
  classId: z.uuid().openapi({
    param: { name: 'classId', in: 'path' },
    description: 'The class ID.',
  }),
});

const SessionParamsSchema = WorkspaceParamsSchema.extend({
  sessionId: z.uuid().openapi({
    param: { name: 'sessionId', in: 'path' },
    description: 'The session ID.',
  }),
});

const GroupClassSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The class ID.' }),
    nameNl: z.string().openapi({ description: 'The Dutch name: always there.' }),
    nameEn: z
      .string()
      .nullable()
      .openapi({
        description:
          'The English name, `null` without one. Show it to a viewer whose language is English, ' +
          'else the Dutch name (`pickContentLanguage` of @fivvi/i18n).',
      }),
    descriptionNl: z
      .string()
      .nullable()
      .openapi({ description: 'The Dutch description, or `null`.' }),
    descriptionEn: z.string().nullable().openapi({
      description: 'The English description, or `null`: shown only to English viewers.',
    }),
    capacity: z
      .number()
      .int()
      .openapi({
        description: `How many people fit: ${LIMITS.capacity.min} to ${LIMITS.capacity.max}.`,
      }),
    durationMinutes: z
      .number()
      .int()
      .openapi({
        description:
          `How long a date of the class lasts: ${LIMITS.duration.min} to ${LIMITS.duration.max} ` +
          `minutes in steps of ${LIMITS.duration.step}.`,
      }),
    defaultTrainer: SessionTrainerSchema.optional().openapi({
      description: 'The usual trainer. Left out for *Trainer nodig* (none).',
    }),
  })
  .openapi('GroupClass', {
    description:
      'A class of the workspace: what it is called, who usually teaches it, how many people ' +
      'fit and how long it lasts. It is not a point in time; a class on a date is a `group` ' +
      'session.',
  });

// A text of the form: trimmed; blank means "no text". The Dutch name alone is required.
const optionalText = (maxLength: number, what: string) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .openapi({
      description:
        `${what}: trimmed, at most ${maxLength} characters. A blank text means none (and, in a ` +
        'change, clears it).',
    });

const capacityField = z.number().int().min(LIMITS.capacity.min).max(LIMITS.capacity.max);
const durationField = z
  .number()
  .int()
  .min(LIMITS.duration.min)
  .max(LIMITS.duration.max)
  .multipleOf(LIMITS.duration.step);
const localDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTimeField = z.string().regex(/^\d{2}:\d{2}$/);

const repeatField = z
  .enum(['none', 'weekly'])
  .optional()
  .openapi({
    description:
      '*Herhalen* / *Repeat* (F022): `none` (the default) puts the class on this date only; ' +
      '`weekly` makes a weekly series on the weekday of `localDate`, at `localStart`, and puts ' +
      'its next 12 weeks in the calendar (this date and 11 more, kept 12 weeks ahead by the ' +
      'daily task). A date before today answers `400` on `localDate` (`date_in_past`); a start ' +
      'the clocks skip on one of the 12 dates answers `400` on `localStart` with the code ' +
      '`time_does_not_exist` and that `date`, and nothing is created.',
  });

const FirstDateSchema = z
  .object({
    localDate: localDateField.openapi({
      description: 'The date in the workspace’s time zone: `YYYY-MM-DD`.',
    }),
    localStart: localTimeField.openapi({
      description: 'The start in the workspace’s time zone: `HH:mm`, 24 hours.',
    }),
    repeat: repeatField,
  })
  .openapi('FirstGroupClassDate', {
    description:
      'The first date of a new class (the apps’ quick create): the class’s trainer, capacity ' +
      'and duration are copied, the end follows from the duration, the location is the default.',
  });

const CreateGroupClassBodySchema = z
  .object({
    nameNl: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.nameMaxLength)
      .openapi({
        description: `The Dutch name: trimmed, 1 to ${LIMITS.nameMaxLength} characters.`,
      }),
    nameEn: optionalText(LIMITS.nameMaxLength, 'The English name'),
    descriptionNl: optionalText(LIMITS.descriptionMaxLength, 'The Dutch description'),
    descriptionEn: optionalText(LIMITS.descriptionMaxLength, 'The English description'),
    trainerId: z
      .uuid()
      .nullable()
      .optional()
      .openapi({
        description:
          'The usual trainer’s team-member ID, from `GET …/trainers`. Leave it out, or send ' +
          '`null`, for *Trainer nodig*. A team member who does not train in the workspace ' +
          'answers `404`.',
      }),
    capacity: capacityField.openapi({
      description: `${LIMITS.capacity.min} to ${LIMITS.capacity.max} people.`,
    }),
    durationMinutes: durationField.openapi({
      description:
        `${LIMITS.duration.min} to ${LIMITS.duration.max} minutes in steps of ` +
        `${LIMITS.duration.step}; any other value answers \`400\` on \`durationMinutes\`.`,
    }),
    firstDate: FirstDateSchema.optional().openapi({
      description:
        'Puts the new class on one date in the same request (the apps’ quick create, TD-05): ' +
        'class and date are stored together or not at all. A refused date (`400` on ' +
        '`firstDate.localDate` or `firstDate.localStart`) leaves no class behind.',
    }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `class_created` event (and `class_scheduled` with a first date) with ' +
          'this surface; without it nothing is recorded. The web does not send it, and a ' +
          'request without a bearer token ignores it.',
      }),
  })
  .openapi('CreateGroupClassRequest', {
    description:
      'A class to create: the Dutch name, optionally an English one, descriptions, the usual ' +
      'trainer, capacity and duration, and optionally its first date.',
  });

const UpdateGroupClassBodySchema = z
  .object({
    nameNl: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.nameMaxLength)
      .optional()
      .openapi({
        description: `The new Dutch name: trimmed, 1 to ${LIMITS.nameMaxLength} characters.`,
      }),
    nameEn: optionalText(LIMITS.nameMaxLength, 'The new English name'),
    descriptionNl: optionalText(LIMITS.descriptionMaxLength, 'The new Dutch description'),
    descriptionEn: optionalText(LIMITS.descriptionMaxLength, 'The new English description'),
    trainerId: z
      .uuid()
      .nullable()
      .optional()
      .openapi({
        description:
          'The new usual trainer’s team-member ID; `null` makes the class *Trainer nodig*; ' +
          'left out keeps it.',
      }),
    capacity: capacityField.optional().openapi({
      description: `The new capacity, ${LIMITS.capacity.min} to ${LIMITS.capacity.max}.`,
    }),
    durationMinutes: durationField.optional().openapi({
      description:
        `The new duration, ${LIMITS.duration.min} to ${LIMITS.duration.max} minutes in steps ` +
        `of ${LIMITS.duration.step}.`,
    }),
  })
  // A body with nothing to change is refused on the Dutch name, as for a location.
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    path: ['nameNl'],
    error: 'Give at least one field to change.',
  })
  .openapi('UpdateGroupClassRequest', {
    description:
      'Changes a class: every field left out stays as it is. Dates already planned keep their ' +
      'own trainer, capacity and times (they were copied when they were planned). Other fields ' +
      'are ignored.',
  });

const CreatedGroupClassSchema = z
  .object({
    groupClass: GroupClassSchema,
    firstDate: SessionSchema.optional().openapi({
      description: 'The first date, when the request had a `firstDate`.',
    }),
    datesAdded: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          'How many dates the class got: 12 when the `firstDate` repeats weekly (“12 ' +
          'groepslessen toegevoegd”); left out otherwise.',
      }),
  })
  .openapi('CreatedGroupClass', {
    description: 'The class that was created, with its first date when the request had one.',
  });

const ScheduleGroupClassDateBodySchema = z
  .object({
    localDate: localDateField.openapi({
      description:
        'The date in the workspace’s time zone: `YYYY-MM-DD`. A date that is none (30 ' +
        'February) answers `400` on `localDate`.',
    }),
    localStart: localTimeField.openapi({
      description:
        'The start in the workspace’s time zone: `HH:mm`, 24 hours. A time the clocks skip ' +
        '(02:30 on 28 March 2027) answers `400` on `localStart` with the code ' +
        '`time_does_not_exist`; a time they repeat (02:30 on 25 October 2026) takes the first.',
    }),
    trainerId: z
      .uuid()
      .nullable()
      .optional()
      .openapi({
        description:
          'The trainer of this date, a team-member ID from `GET …/trainers`. Leave it out for ' +
          'the class’s usual trainer; `null` plans the date as *Trainer nodig*.',
      }),
    capacity: capacityField.optional().openapi({
      description:
        `The capacity of this date, ${LIMITS.capacity.min} to ${LIMITS.capacity.max}. Leave it ` +
        'out for the class’s.',
    }),
    repeat: repeatField,
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `class_scheduled` event (and `class_series_created` for a weekly ' +
          'repeat) with this surface; without it nothing is recorded. The web does not send ' +
          'it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('ScheduleGroupClassDateRequest', {
    description:
      'A class on a date: a local date and start; the end follows from the class’s duration.',
  });

const UpdateGroupClassDateBodySchema = z
  .object({
    version: z
      .number()
      .int()
      .min(1)
      .openapi({
        description:
          'The version of the date the change was made from (`Session.version`). If the date ' +
          'changed since, the answer is `409` and nothing is written.',
      }),
    localStart: localTimeField.optional().openapi({
      description: 'The new start, `HH:mm` in the workspace’s time zone. Leave it out to keep it.',
    }),
    localEnd: localTimeField.optional().openapi({
      description:
        'The new end, `HH:mm` on the same day as the start. Leave it out to keep its time of ' +
        'day: a start moved alone does not move the end with it, and one moved to or past the ' +
        'unchanged end is refused like any end. An end that is not after the start answers `400` on `localEnd` with the code ' +
        '`end_before_start`.',
    }),
    capacity: capacityField.optional().openapi({
      description:
        `The new capacity of this date, ${LIMITS.capacity.min} to ${LIMITS.capacity.max}. ` +
        'Leave it out to keep it.',
    }),
    scope: z
      .enum(['this', 'following'])
      .optional()
      .openapi({
        description:
          '*Wijzigen voor* / *Apply to* (F022, CO-04): `this` (the default) changes this date ' +
          'only and, for a date of a series, marks what differs (`Session.series.changedFields`). ' +
          '`following` changes the series from this date on: the series is split here (the ' +
          'earlier one ends the week before, a new one starts on this date) and every date from ' +
          'here on takes the new start, length and capacity, except dates that were changed on ' +
          'their own, which stay as they are (`keptDates` says how many). A date that is in no ' +
          'series answers `400` on `scope` (`not_in_series`); a start the clocks skip on one of ' +
          'the dates it would reach answers `400` on `localStart` (`time_does_not_exist`) with ' +
          'that `date`, and nothing is changed; a length that is not 15 to 240 minutes in steps ' +
          'of 5 answers `400` on `localEnd` (`invalid_duration`).',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `class_series_changed` event (for `scope: following`) with this ' +
          'surface; without it nothing is recorded. The web does not send it, and a request ' +
          'without a bearer token ignores it.',
      }),
  })
  // A save that changes nothing is refused on the start.
  .refine(
    (body) =>
      body.localStart !== undefined || body.localEnd !== undefined || body.capacity !== undefined,
    { path: ['localStart'], error: 'Give at least one field to change.' },
  )
  .openapi('UpdateGroupClassDateRequest', {
    description:
      'Changes one date of a class (CO-04): the start, the end and the capacity, each only ' +
      'when given. The date stays on its day. The class itself never changes.',
  });

const ScheduledClassDateSchema = SessionSchema.extend({
  datesAdded: z
    .number()
    .int()
    .optional()
    .openapi({
      description:
        'How many dates the request made: 12 for a weekly repeat (“12 groepslessen toegevoegd”); ' +
        'left out for one date. The session is the first of them.',
    }),
}).openapi('ScheduledClassDate', {
  description: 'The class date that was scheduled, with how many dates a weekly repeat made.',
});

const UpdatedClassDateSchema = SessionSchema.extend({
  keptDates: z
    .number()
    .int()
    .optional()
    .openapi({
      description:
        'With `scope: following`: how many dates from this one on were changed on their own and ' +
        'kept as they are (CO-04). Left out for `scope: this`.',
    }),
}).openapi('UpdatedClassDate', {
  description: 'The class date with its changes, and how many other dates kept their own.',
});

const ClassSeriesSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The series ID.' }),
    groupClassId: z.uuid().openapi({ description: 'The class the series is of.' }),
    rrule: z.string().openapi({
      description: 'The weekly rule: `FREQ=WEEKLY;BYDAY=XX`, one weekday (M4 knows no other).',
    }),
    weekday: z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']).openapi({
      description: 'The weekday of the rule: `TU` is every Tuesday.',
    }),
    localStartTime: z.string().openapi({
      description:
        'The start on the wall clock of `timeZone`: `HH:mm`. It stays so across daylight saving time.',
    }),
    durationMinutes: z.number().int().openapi({ description: 'How long each date lasts.' }),
    timeZone: z.string().openapi({ description: 'The IANA time zone the rule is read in.' }),
    trainer: SessionTrainerSchema.optional().openapi({
      description: 'The usual trainer of its dates. Left out for *Trainer nodig*.',
    }),
    capacity: z.number().int().openapi({ description: 'The capacity its dates start with.' }),
    startsOn: z
      .string()
      .openapi({ description: 'The first day it may have a date: `YYYY-MM-DD`.' }),
    endsOn: z
      .string()
      .optional()
      .openapi({
        description:
          'The last day it may have a date; left out for a series that runs until it is stopped. ' +
          'A series ends the week before a later series that took over from a date on.',
      }),
    materializedUntil: z.string().openapi({
      description: 'The last day the calendar was filled to: `YYYY-MM-DD`.',
    }),
    version: z.number().int().openapi({ description: 'Raised by every change of the series.' }),
  })
  .openapi('ClassSeries', {
    description:
      'A weekly series of a class: “Every Tuesday 18:00–19:00 · Sarah · 8 spots, from 6 October”. ' +
      'Its dates are class dates (`Session`) with a `series`.',
  });

const ClassDateChangedSchema = z
  .object({
    code: z.enum(['class_date_changed']),
    session: SessionSchema,
  })
  .openapi('ClassDateChanged', {
    description:
      'The date was changed since the version in the request; nothing was written. `session` ' +
      'is the date as it is now, to show the reloaded values. Contains no user-facing text.',
  });

// The capabilities come from the permission matrix in @fivvi/domain (F004): the Owner manages
// classes, the whole team reads them.
const manageClasses = { type: 'workspace', capability: 'class.manage', client: 'none' } as const;
const readClasses = { type: 'workspace', capability: 'class.read', client: 'none' } as const;

const listGroupClassesRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/group-classes',
    operationId: 'listGroupClasses',
    tags: ['group-classes'],
    summary: 'The classes of a workspace',
    description:
      'The workspace’s classes, sorted by Dutch name. Every team member may read them; a client ' +
      'of the workspace gets `403`, a person with no place in it `404`.',
    security: SIGNED_IN,
    request: { params: WorkspaceParamsSchema },
    responses: {
      200: {
        description: 'The classes.',
        content: { 'application/json': { schema: z.array(GroupClassSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readClasses,
);

const createGroupClassRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/group-classes',
    operationId: 'createGroupClass',
    tags: ['group-classes'],
    summary: 'Create a class',
    description:
      'Creates a class (the Owner only; a Trainer gets `403`). Empty or too long texts, a ' +
      'capacity outside 1 to 100 and a duration outside 15 to 240 minutes in steps of 5 answer ' +
      '`400` with the field in `issues`. With a `firstDate` the class is also put on that date ' +
      '(the apps’ quick create), both in one transaction: a refused date answers `400` and ' +
      'leaves no class. A trainer who does not train in the workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: WorkspaceParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: CreateGroupClassBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'The class was created.',
        content: { 'application/json': { schema: CreatedGroupClassSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageClasses,
);

const getGroupClassRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/group-classes/{classId}',
    operationId: 'getGroupClass',
    tags: ['group-classes'],
    summary: 'One class',
    description:
      'A class of the workspace, for any team member. A class that is not in the workspace ' +
      'answers `404`.',
    security: SIGNED_IN,
    request: { params: ClassParamsSchema },
    responses: {
      200: {
        description: 'The class.',
        content: { 'application/json': { schema: GroupClassSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  readClasses,
);

const updateGroupClassRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/group-classes/{classId}',
    operationId: 'updateGroupClass',
    tags: ['group-classes'],
    summary: 'Change a class',
    description:
      'Changes the fields given of a class (the Owner only). The same limits as creating ' +
      'apply. Dates already planned keep what they copied. A class or trainer that is not in ' +
      'the workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: ClassParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateGroupClassBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The class with its changes.',
        content: { 'application/json': { schema: GroupClassSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageClasses,
);

const scheduleGroupClassDateRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/group-classes/{classId}/dates',
    operationId: 'scheduleGroupClassDate',
    tags: ['group-classes'],
    summary: 'Put a class on a date',
    description:
      'Schedules the class on a date (the Owner only): a `group` session at the local start, ' +
      'taking the class’s trainer, capacity and duration (a trainer or capacity in the request ' +
      'wins for this date; `trainerId: null` plans it without a trainer) and the workspace’s ' +
      'default location, stored and answered as UTC instants plus the workspace’s time zone. ' +
      'A start the clocks skip answers `400` on `localStart` (`time_does_not_exist`); one they ' +
      'repeat takes the first. With `repeat: weekly` (F022) it also makes the weekly series and ' +
      'its next 12 weeks of dates in the same transaction; the answer is the first date with ' +
      '`datesAdded`. A class or trainer that is not in the workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: ClassParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: ScheduleGroupClassDateBodySchema } },
      },
    },
    responses: {
      201: {
        description:
          'The class was scheduled; with a weekly repeat, its first date and how many were made.',
        content: { 'application/json': { schema: ScheduledClassDateSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageClasses,
);

const listGroupClassSeriesRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/group-classes/{classId}/series',
    operationId: 'listGroupClassSeries',
    tags: ['group-classes'],
    summary: 'The weekly series of a class',
    description:
      'The weekly series of the class that still run (no end, or an end that is today or later), ' +
      'in the order they start (TW-03 *Reeksen*). The Owner only: a Trainer gets `403`, and ' +
      'reads the series of a date on the date itself (`Session.series`). A class that is not in ' +
      'the workspace answers `404`.',
    security: SIGNED_IN,
    request: { params: ClassParamsSchema },
    responses: {
      200: {
        description: 'The series.',
        content: { 'application/json': { schema: z.array(ClassSeriesSchema) } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  manageClasses,
);

const updateGroupClassDateRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}',
    operationId: 'updateGroupClassDate',
    tags: ['group-classes'],
    summary: 'Change one date of a class',
    description:
      'Changes the start, end and/or capacity of one date of a class (the Owner only), from ' +
      'the version the caller read (`409` with the date as it is now when it changed since). ' +
      'The date stays on its day. Times are wall-clock in the workspace’s time zone with the ' +
      'same daylight saving rules as scheduling. A start sent alone keeps the end at its time ' +
      'of day; when that is not after the new start the answer is `400` on `localEnd`. An end ' +
      'that is not after the start answers `400` on `localEnd` (`end_before_start`). The class ' +
      'and its other dates are not touched. A session that is not a class date of the ' +
      'workspace (a private session too) answers `404`.',
    security: SIGNED_IN,
    request: {
      params: SessionParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateGroupClassDateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The date with its changes.',
        content: { 'application/json': { schema: UpdatedClassDateSchema } },
      },
      400: validationErrorResponse,
      409: {
        description: 'The date changed since the version in the request; nothing was written.',
        content: { 'application/json': { schema: ClassDateChangedSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  manageClasses,
);

/** A refusal of the typed input, in the shape of the contract's validation error (path and code). */
function invalid(path: string, code: string, date?: string) {
  return {
    code: 'validation_failed' as const,
    issues: [{ path, code, ...(date === undefined ? {} : { date }) }],
  };
}

/** A series as the Owner reads it. */
function shownSeries(series: ClassSeriesView) {
  const rule = parseWeeklyRule(series.rrule);
  if (!rule) throw new Error(`A series with a rule other than weekly: ${series.rrule}.`);
  return {
    id: series.id,
    groupClassId: series.groupClassId,
    rrule: series.rrule,
    weekday: rule.weekday,
    localStartTime: series.localStartTime,
    durationMinutes: series.durationMinutes,
    timeZone: series.timeZone,
    ...(series.trainer ? { trainer: series.trainer } : {}),
    capacity: series.capacity,
    startsOn: series.startsOn,
    ...(series.endsOn === null ? {} : { endsOn: series.endsOn }),
    materializedUntil: series.materializedUntil,
    version: series.version,
  };
}

/** A weekly series decided but not stored: the rule, its 12 dates and the day the calendar is filled to. */
interface PlannedSeries {
  readonly facts: SeriesFacts;
  readonly occurrences: readonly SeriesOccurrence[];
  readonly materializedUntil: string;
}

/**
 * The weekly series for a first date (F022): the rule is the weekday of `localDate` at
 * `localStart`, and the 12 weeks from `localDate` are expanded by the domain. Refuses, before
 * anything is stored, a first date in the past (past dates are not made again, out of scope in
 * #428) and a start that the clocks skip on one of the dates (`time_does_not_exist`, with the date).
 */
function planWeeklySeries(input: {
  localDate: string;
  localStart: string;
  durationMinutes: number;
  timeZone: string;
  now: Date;
  prefix: string;
}) {
  const { prefix } = input;
  if (input.localDate < localDateOf(input.now, input.timeZone)) {
    return { outcome: 'refused' as const, answer: invalid(`${prefix}localDate`, 'date_in_past') };
  }
  const weekday = weekdayOf(input.localDate);
  if (!weekday) {
    return { outcome: 'refused' as const, answer: invalid(`${prefix}localDate`, 'invalid_date') };
  }
  const facts: SeriesFacts = {
    rrule: weeklyRule(weekday),
    localStartTime: input.localStart,
    durationMinutes: input.durationMinutes,
    timeZone: input.timeZone,
    startsOn: input.localDate,
    endsOn: null,
  };
  const materializedUntil = horizonEnd(input.localDate);
  const expanded = expandSeries(facts, input.localDate, materializedUntil);
  if (expanded.outcome === 'refused') {
    if (expanded.reason !== 'time-does-not-exist') {
      // The request schema and `scheduleClassOnDate` rule these out before this runs.
      throw new Error(`A refusal the request rules out reached the handler: ${expanded.reason}.`);
    }
    return {
      outcome: 'refused' as const,
      answer: invalid(`${prefix}localStart`, 'time_does_not_exist', expanded.date),
    };
  }
  return {
    outcome: 'planned' as const,
    plan: { facts, occurrences: expanded.occurrences, materializedUntil } satisfies PlannedSeries,
  };
}

/** Stores the series and its dates (the first one is the date the Owner chose); returns that first date and how many were made. */
async function storeWeeklySeries(
  scope: WorkspaceScope,
  groupClassId: string,
  plan: PlannedSeries,
  decision: {
    readonly trainer: { readonly trainerProfileId: string } | null;
    readonly locationId: string;
    readonly capacity: number;
  },
  createdByTeamMemberId: string,
) {
  const trainerProfileId = decision.trainer?.trainerProfileId ?? null;
  const series = await createClassSeries(scope, {
    groupClassId,
    rrule: plan.facts.rrule,
    localStartTime: plan.facts.localStartTime,
    durationMinutes: plan.facts.durationMinutes,
    timeZone: plan.facts.timeZone,
    trainerProfileId,
    capacity: decision.capacity,
    startsOn: plan.facts.startsOn,
    endsOn: null,
    materializedUntil: plan.materializedUntil,
  });
  const made = await createSeriesDates(
    scope,
    series.id,
    groupClassId,
    plan.occurrences.map((occurrence) => ({
      occurrenceDate: occurrence.occurrenceDate,
      locationId: decision.locationId,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      trainerProfileId,
      capacity: decision.capacity,
      createdByTeamMemberId,
    })),
  );
  const first = made.find((date) => date.occurrenceDate === plan.facts.startsOn);
  const session = first && (await findSession(scope, first.id));
  if (!session) throw new Error('The first date of the series was not found after it was stored.');
  return { session, datesAdded: made.length };
}

/** The series fields of an edit, in the order of `DETACHABLE_FIELDS`. */
const inFieldOrder = (fields: readonly string[]): DetachedField[] =>
  DETACHABLE_FIELDS.filter((field) => fields.includes(field));

/** A trainer as the domain rules take it: the team member and the trainer profile. */
const referenceOf = (trainer: { readonly id: string; readonly trainerProfileId: string }) => ({
  teamMemberId: trainer.id,
  trainerProfileId: trainer.trainerProfileId,
});

/** What the answer shows of a class: no `defaultTrainer` key without a usual trainer. */
function shownClass(groupClass: GroupClassView) {
  const { defaultTrainer, defaultTrainerProfileId: _profile, ...rest } = groupClass;
  return { ...rest, ...(defaultTrainer ? { defaultTrainer } : {}) };
}

/** A blank text of a form is no text. */
const textOrNull = (value: string | undefined) =>
  value === undefined || value === '' ? null : value;

/**
 * The event of the surface the request came from: the web sends no bearer token; an app names its
 * surface, and one that names none records nothing, as the API does not guess. The workspace ID and
 * the surface only (OBSERVABILITY.md §4).
 */
function surfaceOf(authorization: string | undefined, named: 'ios' | 'android' | undefined) {
  return authorization ? named : ('web' as const);
}

/**
 * The trainer a request names: `undefined` when it names none (leave it as it is), `null` for
 * *Trainer nodig*, otherwise the trainer, or `'unknown'` when the team member does not train in the
 * workspace.
 */
async function namedTrainer(scope: WorkspaceScope, trainerId: string | null | undefined) {
  if (trainerId === undefined || trainerId === null) return trainerId;
  return (await findTrainer(scope, trainerId)) ?? ('unknown' as const);
}

export function registerGroupClasses(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  router.openapi(listGroupClassesRoute, async (c) => {
    const classes = await listGroupClasses(c.get('scope'));
    return c.json(classes.map(shownClass), 200);
  });

  router.openapi(getGroupClassRoute, async (c) => {
    const groupClass = await findGroupClass(c.get('scope'), c.req.valid('param').classId);
    if (!groupClass) return c.json(NOT_FOUND, 404);
    return c.json(shownClass(groupClass), 200);
  });

  router.openapi(createGroupClassRoute, async (c) => {
    const scope = c.get('scope');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const trainer = await namedTrainer(scope, body.trainerId);
    if (trainer === 'unknown') return c.json(NOT_FOUND, 404);
    const trainerProfileId = trainer?.trainerProfileId ?? null;

    // The date is decided before anything is stored, so a refused date stores nothing; the class
    // and the date are then written in this request's transaction and stand or fall together.
    const workspace = await findWorkspace(scope);
    const actor = await findOwnTeamMember(scope);
    if (!workspace || !actor) return c.json(NOT_FOUND, 404);
    const plan = body.firstDate
      ? scheduleClassOnDate({
          groupClass: {
            capacity: body.capacity,
            durationMinutes: body.durationMinutes,
            defaultTrainer: trainer ? referenceOf(trainer) : null,
          },
          localDate: body.firstDate.localDate,
          localStart: body.firstDate.localStart,
          timeZone: workspace.timeZone,
          now: clock.now(),
          locations: await listLocations(scope),
        })
      : undefined;
    if (plan?.outcome === 'refused') return c.json(...refusalOfDate(plan.reason, 'firstDate.'));
    const weekly =
      body.firstDate?.repeat === 'weekly' && plan?.outcome === 'scheduled'
        ? planWeeklySeries({
            localDate: body.firstDate.localDate,
            localStart: body.firstDate.localStart,
            durationMinutes: body.durationMinutes,
            timeZone: workspace.timeZone,
            now: clock.now(),
            prefix: 'firstDate.',
          })
        : undefined;
    if (weekly?.outcome === 'refused') return c.json(weekly.answer, 400);

    const groupClass = await createGroupClass(scope, {
      nameNl: body.nameNl,
      nameEn: textOrNull(body.nameEn),
      descriptionNl: textOrNull(body.descriptionNl),
      descriptionEn: textOrNull(body.descriptionEn),
      defaultTrainerProfileId: trainerProfileId,
      capacity: body.capacity,
      durationMinutes: body.durationMinutes,
    });
    let datesAdded: number | undefined;
    let firstDateSession: SessionView | undefined;
    if (plan?.outcome === 'scheduled') {
      if (weekly?.outcome === 'planned') {
        const stored = await storeWeeklySeries(scope, groupClass.id, weekly.plan, plan, actor.id);
        firstDateSession = stored.session;
        datesAdded = stored.datesAdded;
      } else {
        firstDateSession = await createClassDate(scope, {
          groupClassId: groupClass.id,
          trainerProfileId: plan.trainer?.trainerProfileId ?? null,
          locationId: plan.locationId,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          capacity: plan.capacity,
          createdByTeamMemberId: actor.id,
        });
      }
    }
    const firstDate = firstDateSession && shown(firstDateSession, workspace.timeZone);

    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (surface !== undefined) {
      const afterCommit = c.get('afterCommit');
      const distinctId = c.get('account').id;
      const record = (event: 'class_created' | 'class_scheduled' | 'class_series_created') =>
        afterCommit(() =>
          productEvents.track({
            event,
            distinctId,
            properties: { workspace_id: scope.workspaceId, surface },
          }),
        );
      record('class_created');
      if (firstDate) record('class_scheduled');
      if (datesAdded !== undefined) record('class_series_created');
    }
    return c.json(
      {
        groupClass: shownClass(groupClass),
        ...(firstDate ? { firstDate } : {}),
        ...(datesAdded === undefined ? {} : { datesAdded }),
      },
      201,
    );
  });

  router.openapi(updateGroupClassRoute, async (c) => {
    const scope = c.get('scope');
    const { classId } = c.req.valid('param');
    const body = c.req.valid('json');
    const trainer = await namedTrainer(scope, body.trainerId);
    if (trainer === 'unknown') return c.json(NOT_FOUND, 404);
    const updated = await updateGroupClass(scope, classId, {
      ...(body.nameNl === undefined ? {} : { nameNl: body.nameNl }),
      ...(body.nameEn === undefined ? {} : { nameEn: textOrNull(body.nameEn) }),
      ...(body.descriptionNl === undefined
        ? {}
        : { descriptionNl: textOrNull(body.descriptionNl) }),
      ...(body.descriptionEn === undefined
        ? {}
        : { descriptionEn: textOrNull(body.descriptionEn) }),
      ...(trainer === undefined
        ? {}
        : { defaultTrainerProfileId: trainer?.trainerProfileId ?? null }),
      ...(body.capacity === undefined ? {} : { capacity: body.capacity }),
      ...(body.durationMinutes === undefined ? {} : { durationMinutes: body.durationMinutes }),
    });
    if (!updated) return c.json(NOT_FOUND, 404);
    return c.json(shownClass(updated), 200);
  });

  router.openapi(scheduleGroupClassDateRoute, async (c) => {
    const scope = c.get('scope');
    const { classId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const groupClass = await findGroupClass(scope, classId);
    const workspace = await findWorkspace(scope);
    const actor = await findOwnTeamMember(scope);
    if (!groupClass || !workspace || !actor) return c.json(NOT_FOUND, 404);
    const requested = await namedTrainer(scope, body.trainerId);
    if (requested === 'unknown') return c.json(NOT_FOUND, 404);
    const decision = scheduleClassOnDate({
      groupClass: {
        capacity: groupClass.capacity,
        durationMinutes: groupClass.durationMinutes,
        defaultTrainer:
          groupClass.defaultTrainer && groupClass.defaultTrainerProfileId
            ? {
                teamMemberId: groupClass.defaultTrainer.id,
                trainerProfileId: groupClass.defaultTrainerProfileId,
              }
            : null,
      },
      ...(requested === undefined
        ? {}
        : {
            requestedTrainer:
              requested === null ? null : { ...referenceOf(requested), trains: true },
          }),
      ...(body.capacity === undefined ? {} : { requestedCapacity: body.capacity }),
      localDate: body.localDate,
      localStart: body.localStart,
      timeZone: workspace.timeZone,
      now: clock.now(),
      locations: await listLocations(scope),
    });
    // Each refusal rolls the request's transaction back: nothing is stored, nothing is recorded.
    if (decision.outcome === 'refused') {
      if (decision.reason === 'unknown-trainer') return c.json(NOT_FOUND, 404);
      return c.json(...refusalOfDate(decision.reason, ''));
    }
    const weekly =
      body.repeat === 'weekly'
        ? planWeeklySeries({
            localDate: body.localDate,
            localStart: body.localStart,
            durationMinutes: groupClass.durationMinutes,
            timeZone: workspace.timeZone,
            now: clock.now(),
            prefix: '',
          })
        : undefined;
    if (weekly?.outcome === 'refused') return c.json(weekly.answer, 400);
    const stored =
      weekly?.outcome === 'planned'
        ? await storeWeeklySeries(scope, groupClass.id, weekly.plan, decision, actor.id)
        : undefined;
    const session =
      stored?.session ??
      (await createClassDate(scope, {
        groupClassId: groupClass.id,
        trainerProfileId: decision.trainer?.trainerProfileId ?? null,
        locationId: decision.locationId,
        startsAt: decision.startsAt,
        endsAt: decision.endsAt,
        capacity: decision.capacity,
        createdByTeamMemberId: actor.id,
      }));
    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (surface !== undefined) {
      const distinctId = c.get('account').id;
      const afterCommit = c.get('afterCommit');
      const record = (event: 'class_scheduled' | 'class_series_created') =>
        afterCommit(() =>
          productEvents.track({
            event,
            distinctId,
            properties: { workspace_id: scope.workspaceId, surface },
          }),
        );
      record('class_scheduled');
      if (stored) record('class_series_created');
    }
    return c.json(
      {
        ...shown(session, workspace.timeZone),
        ...(stored ? { datesAdded: stored.datesAdded } : {}),
      },
      201,
    );
  });

  router.openapi(listGroupClassSeriesRoute, async (c) => {
    const scope = c.get('scope');
    const { classId } = c.req.valid('param');
    const { clock } = c.get('dependencies');
    const groupClass = await findGroupClass(scope, classId);
    const workspace = await findWorkspace(scope);
    if (!groupClass || !workspace) return c.json(NOT_FOUND, 404);
    const today = localDateOf(clock.now(), workspace.timeZone);
    const found = await listActiveClassSeries(scope, classId, today);
    return c.json(found.map(shownSeries), 200);
  });

  router.openapi(updateGroupClassDateRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const current = await findSession(scope, sessionId);
    const workspace = await findWorkspace(scope);
    if (!current || !workspace || current.type !== 'group') return c.json(NOT_FOUND, 404);
    const changed = (session: typeof current) => ({
      code: 'class_date_changed' as const,
      session: shown(session, workspace.timeZone),
    });
    const editScope = body.scope ?? 'this';
    if (editScope === 'following' && !current.series) {
      return c.json(invalid('scope', 'not_in_series'), 400);
    }
    // A save from an old version never gets as far as the rules.
    if (current.version !== body.version) return c.json(changed(current), 409);

    const decision = decideGroupDateEdit({
      current: { startsAt: current.startsAt, endsAt: current.endsAt, capacity: current.capacity },
      requested: {
        ...(body.localStart === undefined ? {} : { localStart: body.localStart }),
        ...(body.localEnd === undefined ? {} : { localEnd: body.localEnd }),
        ...(body.capacity === undefined ? {} : { capacity: body.capacity }),
      },
      timeZone: workspace.timeZone,
    });
    if (decision.outcome === 'refused') return c.json(...refusalOfEdit(decision.reason));

    const timeChanged =
      decision.startsAt.getTime() !== current.startsAt.getTime() ||
      decision.endsAt.getTime() !== current.endsAt.getTime();
    const capacityChanged = decision.capacity !== current.capacity;
    const series = current.series;

    // "This and following": the series changes from this date on, the dates that were changed on
    // their own stay as they are. An edit that changes nothing has nothing to hand on.
    if (editScope === 'following' && series && (timeChanged || capacityChanged)) {
      const stored = await findClassSeries(scope, series.id);
      if (!stored) return c.json(NOT_FOUND, 404);
      const durationMinutes = (decision.endsAt.getTime() - decision.startsAt.getTime()) / 60_000;
      const { duration } = LIMITS;
      if (
        timeChanged &&
        (!Number.isInteger(durationMinutes) ||
          durationMinutes < duration.min ||
          durationMinutes > duration.max ||
          durationMinutes % duration.step !== 0)
      ) {
        return c.json(invalid('localEnd', 'invalid_duration'), 400);
      }
      const change: SeriesChange = {
        ...(timeChanged
          ? {
              localStartTime: instantToWallClock(decision.startsAt, workspace.timeZone).time,
              durationMinutes,
            }
          : {}),
        ...(capacityChanged ? { capacity: decision.capacity } : {}),
      };
      const dates = await listSeriesDates(scope, stored.id);
      const applied = applyThisAndFollowing(
        { ...stored, materializedUntil: stored.materializedUntil },
        series.occurrenceDate,
        change,
        dates.map((date) => ({
          id: date.id,
          occurrenceDate: date.occurrenceDate,
          detachedFields: inFieldOrder(date.detachedFields),
          cancelled: date.status === 'cancelled',
          startsAt: date.startsAt,
          endsAt: date.endsAt,
          trainerProfileId: date.trainerProfileId,
          capacity: date.capacity,
        })),
      );
      if (applied.outcome === 'refused') {
        if (applied.reason !== 'time-does-not-exist') {
          throw new Error(
            `A refusal the request rules out reached the handler: ${applied.reason}.`,
          );
        }
        return c.json(invalid('localStart', 'time_does_not_exist', applied.date), 400);
      }

      // Every change below is rolled back with the request when it ends in a refusal (the `409`).
      const today = localDateOf(clock.now(), workspace.timeZone);
      const through = [stored.materializedUntil, horizonEnd(today)].reduce((a, b) =>
        a > b ? a : b,
      );
      let seriesId = stored.id;
      if (applied.split) {
        const later = await createClassSeries(scope, {
          groupClassId: stored.groupClassId,
          rrule: applied.later.rrule,
          localStartTime: applied.later.localStartTime,
          durationMinutes: applied.later.durationMinutes,
          timeZone: applied.later.timeZone,
          trainerProfileId: applied.later.trainerProfileId,
          capacity: applied.later.capacity,
          startsOn: applied.later.startsOn,
          endsOn: applied.later.endsOn,
          materializedUntil: through,
        });
        await updateClassSeries(scope, stored.id, { endsOn: applied.earlierEndsOn ?? undefined });
        await moveDatesToSeries(scope, applied.moves, later.id);
        seriesId = later.id;
      } else {
        await updateClassSeries(scope, stored.id, {
          localStartTime: applied.later.localStartTime,
          durationMinutes: applied.later.durationMinutes,
          trainerProfileId: applied.later.trainerProfileId,
          capacity: applied.later.capacity,
          materializedUntil: through,
        });
      }
      const staleDates = await updateSeriesDates(
        scope,
        applied.updates.map((update) => ({
          sessionId: update.sessionId,
          startsAt: update.startsAt,
          endsAt: update.endsAt,
          trainerProfileId: update.trainerProfileId,
          capacity: update.capacity,
          detachedFields: update.detachedFields,
          ...(update.sessionId === sessionId ? { version: body.version } : {}),
        })),
      );
      if (staleDates.length > 0) {
        // Lost a race with another save between the read and the write: show what won.
        const latest = await findSession(scope, sessionId);
        if (!latest) return c.json(NOT_FOUND, 404);
        return c.json(changed(latest), 409);
      }

      // The calendar is kept 12 weeks ahead from the series that now runs: dates that are missing
      // are made, the ones that exist are never touched.
      const actor = await findOwnTeamMember(scope);
      const locations = await listLocations(scope);
      const missing = materialize(applied.later, dates, {
        from: applied.later.startsOn,
        to: through,
      });
      await createSeriesDates(
        scope,
        seriesId,
        stored.groupClassId,
        missing.toInsert.map((occurrence) => ({
          occurrenceDate: occurrence.occurrenceDate,
          locationId: defaultLocation({ locations }).id,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          trainerProfileId: applied.later.trainerProfileId,
          capacity: applied.later.capacity,
          createdByTeamMemberId: actor?.id ?? null,
        })),
      );

      const latest = await findSession(scope, sessionId);
      if (!latest) return c.json(NOT_FOUND, 404);
      const surface = surfaceOf(c.req.header('authorization'), body.surface);
      if (surface !== undefined) {
        const distinctId = c.get('account').id;
        c.get('afterCommit')(() =>
          productEvents.track({
            event: 'class_series_changed',
            distinctId,
            properties: { workspace_id: scope.workspaceId, surface },
          }),
        );
      }
      return c.json({ ...shown(latest, workspace.timeZone), keptDates: applied.keptDates }, 200);
    }

    // "Only this class": this date changes and, in a series, is marked as different from it.
    const detachedFields = series
      ? inFieldOrder([
          ...series.detachedFields,
          ...(timeChanged ? ['time'] : []),
          ...(capacityChanged ? ['capacity'] : []),
        ])
      : undefined;
    const result = await updateClassDate(scope, sessionId, {
      version: body.version,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
      capacity: decision.capacity,
      ...(detachedFields ? { detachedFields } : {}),
    });
    if (result.outcome === 'not-found') return c.json(NOT_FOUND, 404);
    if (result.outcome === 'stale') {
      // Lost a race with another save between the read and the write: show what won.
      const latest = await findSession(scope, sessionId);
      if (!latest) return c.json(NOT_FOUND, 404);
      return c.json(changed(latest), 409);
    }
    return c.json(
      {
        ...shown(result.session, workspace.timeZone),
        ...(editScope === 'following' ? { keptDates: 0 } : {}),
      },
      200,
    );
  });

  app.route('/', router);
}

/** The `400` for a refused date or start of `scheduleClassOnDate`; `prefix` is the path of the object that holds them. */
function refusalOfDate(
  reason:
    | 'invalid-capacity'
    | 'invalid-date'
    | 'invalid-time'
    | 'time-does-not-exist'
    | 'unknown-trainer',
  prefix: string,
) {
  switch (reason) {
    case 'invalid-date':
      return [invalid(`${prefix}localDate`, 'invalid_date'), 400] as const;
    case 'invalid-time':
      return [invalid(`${prefix}localStart`, 'invalid_time'), 400] as const;
    case 'time-does-not-exist':
      return [invalid(`${prefix}localStart`, 'time_does_not_exist'), 400] as const;
    case 'invalid-capacity':
    case 'unknown-trainer':
      // The request schema bounds the capacity and the callers look the trainer up first.
      throw new Error(`A refusal the request rules out reached the handler: ${reason}.`);
  }
}

/** The `400` for a refused edit of `decideGroupDateEdit`. */
function refusalOfEdit(
  reason:
    | 'nothing-to-change'
    | 'invalid-capacity'
    | 'invalid-time'
    | 'invalid-end-time'
    | 'time-does-not-exist'
    | 'end-time-does-not-exist'
    | 'end-before-start',
) {
  switch (reason) {
    case 'invalid-time':
      return [invalid('localStart', 'invalid_time'), 400] as const;
    case 'invalid-end-time':
      return [invalid('localEnd', 'invalid_time'), 400] as const;
    case 'time-does-not-exist':
      return [invalid('localStart', 'time_does_not_exist'), 400] as const;
    case 'end-time-does-not-exist':
      return [invalid('localEnd', 'time_does_not_exist'), 400] as const;
    case 'end-before-start':
      return [invalid('localEnd', 'end_before_start'), 400] as const;
    case 'nothing-to-change':
    case 'invalid-capacity':
      // The request schema refuses an empty change and bounds the capacity.
      throw new Error(`A refusal the request rules out reached the handler: ${reason}.`);
  }
}
