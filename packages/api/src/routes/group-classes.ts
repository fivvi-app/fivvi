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
  type SeriesDateRow,
  type SessionView,
  updateClassDate,
  updateClassSeries,
  updateGroupClass,
  updateSeriesDates,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  type ApplyFollowingDecision,
  applyThisAndFollowing,
  applyToUpcomingDates,
  DETACHABLE_FIELDS,
  type DetachedField,
  decideGroupDateEdit,
  defaultLocation,
  GROUP_CLASS_LIMITS,
  instantToWallClock,
  localDateOf,
  materialize,
  type PlanWeeklySeriesDecision,
  type PlanWeeklySeriesFacts,
  parseWeeklyRule,
  planWeeklySeries,
  type SeriesChange,
  scheduleClassOnDate,
} from '@fivvi/domain';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import {
  allowConflictsField,
  checkDoubleBooking,
  type TrainerConflictAnswer,
  TrainerConflictItemSchema,
  type TrainerSlot,
  trainerConflictResponse,
} from '../sessions/trainer-conflicts.ts';
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
    allowConflicts: allowConflictsField,
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
    allowConflicts: allowConflictsField,
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
          'series answers `400` on `scope` (`not_in_series`), and so does a date before today ' +
          '(`date_in_past`: past dates of a series are not changed); a start the clocks skip on ' +
          'one of the dates it would reach, up to the end of the 12 weeks ahead, answers `400` on `localStart` (`time_does_not_exist`) with ' +
          'that `date`, and nothing is changed; a length that is not 15 to 240 minutes in steps ' +
          'of 5 answers `400` on `localEnd` (`invalid_duration`).',
      }),
    allowConflicts: allowConflictsField,
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

const UpdateClassSeriesBodySchema = z
  .object({
    version: z
      .number()
      .int()
      .min(1)
      .openapi({
        description:
          'The version of the series the change was made from (`ClassSeries.version`). If the ' +
          'series changed since, the answer is `409` with the series as it is now and nothing is ' +
          'written.',
      }),
    localStartTime: localTimeField.optional().openapi({
      description:
        'The new start of every date, `HH:mm` on the wall clock of the workspace’s time zone ' +
        '(it stays so across daylight saving time). Leave it out to keep it.',
    }),
    durationMinutes: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          `The new length of every date: ${LIMITS.duration.min} to ${LIMITS.duration.max} ` +
          `minutes in steps of ${LIMITS.duration.step}, else \`400\` on \`durationMinutes\` ` +
          '(`invalid_duration`). Leave it out to keep it.',
      }),
    capacity: capacityField.optional().openapi({
      description:
        `The new capacity of every date, ${LIMITS.capacity.min} to ${LIMITS.capacity.max}. ` +
        'Leave it out to keep it.',
    }),
    trainerId: z
      .uuid()
      .nullable()
      .optional()
      .openapi({
        description:
          'The new trainer of every date, a team-member ID from `GET …/trainers`; `null` makes ' +
          'the dates *Trainer nodig*. Leave it out to keep the trainer. A team member who is no ' +
          'trainer of the workspace answers `404`.',
      }),
    allowConflicts: allowConflictsField,
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `class_series_changed` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  // A save that changes nothing is refused on the start.
  .refine(
    (body) =>
      body.localStartTime !== undefined ||
      body.durationMinutes !== undefined ||
      body.capacity !== undefined ||
      body.trainerId !== undefined,
    { path: ['localStartTime'], error: 'Give at least one field to change.' },
  )
  .openapi('UpdateClassSeriesRequest', {
    description:
      'Changes a whole weekly series (CO-04): the start, length, capacity and trainer of its ' +
      'dates, each only when given.',
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

const UpdatedClassSeriesSchema = ClassSeriesSchema.extend({
  keptDates: z
    .number()
    .int()
    .openapi({
      description:
        'How many dates from the first one that has not started on were changed on their own and ' +
        'keep those changes (CO-04, “1 les heeft een eigen wijziging en is niet aangepast”).',
    }),
}).openapi('UpdatedClassSeries', {
  description: 'The series as it now runs, and how many dates kept their own changes.',
});

// The `409` of a series edit is one object, as for a date (`ClassDateRefusalSchema`).
const ClassSeriesRefusalSchema = z
  .object({
    code: z.enum(['series_changed', 'trainer_conflict']).openapi({
      description:
        '`series_changed`: the series changed since the `version` sent; `trainer_conflict`: the ' +
        'trainer already has something at the new time (PS-07).',
    }),
    series: ClassSeriesSchema.optional().openapi({
      description: 'The series as it is now, for `series_changed`.',
    }),
    conflicts: z.array(TrainerConflictItemSchema).optional().openapi({
      description:
        'The overlapping sessions, soonest first, of this workspace only, for `trainer_conflict`.',
    }),
  })
  .openapi('UpdateClassSeriesRefusal', {
    description:
      'Why the series edit was refused; nothing was written. The version refusal ' +
      '(`series_changed`) and the body of `TrainerConflict` (`trainer_conflict`) in one object, ' +
      'told apart by `code`. Contains no user-facing text.',
  });

// The `409` of a date edit is one object, not a `oneOf` of the date's version refusal and
// `TrainerConflict` (see `RescheduleRefusalSchema` in sessions.ts for why). `code` tells the
// refusals apart; `session` comes with `class_date_changed`, `conflicts` with `trainer_conflict`.
const ClassDateRefusalSchema = z
  .object({
    code: z.enum(['class_date_changed', 'trainer_conflict']).openapi({
      description:
        '`class_date_changed`: the date changed since the `version` sent; `trainer_conflict`: ' +
        'the trainer already has something at the new time (PS-07).',
    }),
    session: SessionSchema.optional().openapi({
      description: 'The date as it is now, for `class_date_changed`.',
    }),
    conflicts: z.array(TrainerConflictItemSchema).optional().openapi({
      description:
        'The overlapping sessions, soonest first, of this workspace only, for `trainer_conflict`.',
    }),
  })
  .openapi('UpdateGroupClassDateRefusal', {
    description:
      'Why the date edit was refused; nothing was written. The version refusal ' +
      '(`class_date_changed`) and the body of `TrainerConflict` (`trainer_conflict`) in one ' +
      'object, told apart by `code`. Contains no user-facing text.',
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
      'leaves no class. A trainer who does not train in the workspace answers `404`. When the ' +
      'first date puts the class’s trainer where they already have something (a weekly repeat: ' +
      'on any of its 12 dates), the answer is `409` with the code `trainer_conflict` and those ' +
      'sessions, and nothing is stored, unless `allowConflicts` is `true` (PS-07).',
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
      409: trainerConflictResponse,
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
      '`datesAdded`. A class or trainer that is not in the workspace answers `404`. When the ' +
      'date’s trainer already has a scheduled session of this workspace that overlaps (a weekly ' +
      'repeat: on any of its 12 dates), the answer is `409` with the code `trainer_conflict` ' +
      'and those sessions, and nothing is stored, unless `allowConflicts` is `true` (PS-07).',
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
      409: trainerConflictResponse,
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

const SeriesParamsSchema = ClassParamsSchema.extend({
  seriesId: z.uuid().openapi({
    param: { name: 'seriesId', in: 'path' },
    description: 'The series ID.',
  }),
});

const updateGroupClassSeriesRoute = defineRoute(
  {
    method: 'patch',
    path: '/v1/workspaces/{workspaceId}/group-classes/{classId}/series/{seriesId}',
    operationId: 'updateGroupClassSeries',
    tags: ['group-classes'],
    summary: 'Change a whole series of a class',
    description:
      'Changes the start, length, capacity and/or trainer of a weekly series (the Owner only), ' +
      'from the version the caller read (`409` with the series as it is now when it changed ' +
      'since). The change applies from the series’ first date that has not started, as “this ' +
      'and following” (CO-04): started dates and cancelled ones stay as they are, and dates ' +
      'that were changed on their own keep their changes (`keptDates` counts them). When ' +
      'earlier dates have started the series is split there, so the answer is the series that ' +
      'now runs from that date (it has a new ID); the earlier one ends the week before. ' +
      'Times are wall-clock in the workspace’s time zone: a start the clocks skip on one of the ' +
      'dates it would reach answers `400` on `localStartTime` (`time_does_not_exist`) with that ' +
      '`date`, a length that is no step `400` on `durationMinutes` (`invalid_duration`), and a ' +
      'series with no date left to change `400` on `seriesId` (`no_upcoming_dates`); nothing is ' +
      'changed then. A trainer who already has a scheduled session of this workspace at the new ' +
      'time answers `409` with the code `trainer_conflict` unless `allowConflicts` is `true` ' +
      '(PS-07); the version is checked first. A series or class that is not in the workspace ' +
      'answers `404`.',
    security: SIGNED_IN,
    request: {
      params: SeriesParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: UpdateClassSeriesBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The series as it now runs.',
        content: { 'application/json': { schema: UpdatedClassSeriesSchema } },
      },
      400: validationErrorResponse,
      409: {
        description:
          'The series changed since the version in the request (`series_changed`), or the ' +
          'trainer already has something at the new time (`trainer_conflict`); nothing was written.',
        content: { 'application/json': { schema: ClassSeriesRefusalSchema } },
      },
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
      'workspace (a private session too) answers `404`. A new time that puts the date’s trainer ' +
      'where they already have a scheduled session of this workspace (with `scope: following`: ' +
      'any date it moves) answers `409` with the code `trainer_conflict` and those sessions ' +
      'unless `allowConflicts` is `true` (PS-07); a change of the capacity alone is never ' +
      'checked, and the version is checked first.',
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
        description:
          'The date changed since the version in the request (`class_date_changed`), or the ' +
          'trainer already has something at the new time (`trainer_conflict`); nothing was written.',
        content: {
          'application/json': { schema: ClassDateRefusalSchema },
        },
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

/** A weekly series decided by the domain but not stored: the rule, its 12 dates and the day the calendar is filled to. */
type PlannedSeries = Extract<PlanWeeklySeriesDecision, { outcome: 'planned' }>;

/**
 * The weekly series for a first date (F022): the domain plans it (`planWeeklySeries`); this turns
 * a refusal into the contract's validation error. Nothing is stored before the refusal.
 */
function weeklySeriesFor(
  input: PlanWeeklySeriesFacts & { prefix: string },
):
  | { outcome: 'planned'; plan: PlannedSeries }
  | { outcome: 'refused'; answer: ReturnType<typeof invalid> } {
  const { prefix, ...facts } = input;
  const decision = planWeeklySeries(facts);
  if (decision.outcome === 'planned') return { outcome: 'planned', plan: decision };
  switch (decision.reason) {
    case 'date-in-past':
      return { outcome: 'refused', answer: invalid(`${prefix}localDate`, 'date_in_past') };
    case 'invalid-date':
      return { outcome: 'refused', answer: invalid(`${prefix}localDate`, 'invalid_date') };
    case 'time-does-not-exist':
      return {
        outcome: 'refused',
        answer: invalid(`${prefix}localStart`, 'time_does_not_exist', decision.date),
      };
    case 'invalid-time':
      // The request schema and `scheduleClassOnDate` rule this out before this runs.
      throw new Error(`A refusal the request rules out reached the handler: ${decision.reason}.`);
  }
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

/**
 * The times a scheduling save puts the date's trainer in: the date, or with a weekly repeat each of
 * the series' dates (the first of them is the date). None for *Trainer nodig*.
 */
function slotsOf(
  date: {
    readonly trainer: { readonly trainerProfileId: string } | null;
    readonly startsAt: Date;
    readonly endsAt: Date;
  },
  weekly: { outcome: string; plan?: PlannedSeries } | undefined,
): TrainerSlot[] {
  if (!date.trainer) return [];
  const { trainerProfileId } = date.trainer;
  const dates = weekly?.plan?.occurrences ?? [date];
  return dates.map(({ startsAt, endsAt }) => ({ trainerProfileId, startsAt, endsAt }));
}

/** A whole series or a date and what follows it, as the domain decided it. */
type AppliedSeriesChange = Extract<ApplyFollowingDecision, { outcome: 'applied' }>;

/**
 * Writes what `applyThisAndFollowing` decided: fills the calendar, warns about a trainer who is
 * busy (PS-07), splits the series, updates the dates and makes the missing ones. Nothing is
 * stored before the warning; every write is rolled back with the request when the caller answers
 * `409`. `guard` says which version the caller read: the date's (`sessionId`, a date edit) or the
 * series' (a whole-series edit); a write that finds another one is `stale`.
 */
async function writeSeriesChange(
  c: Context<WorkspaceEnv>,
  input: {
    stored: ClassSeriesView;
    dates: readonly SeriesDateRow[];
    applied: AppliedSeriesChange;
    allowConflicts: boolean | undefined;
    surface: 'ios' | 'android' | undefined;
    guard: { sessionId: string; sessionVersion: number } | { seriesVersion: number };
  },
): Promise<
  | { outcome: 'written'; seriesId: string }
  | { outcome: 'conflict'; answer: TrainerConflictAnswer }
  | { outcome: 'stale' }
> {
  const scope = c.get('scope');
  const { stored, dates, applied, guard } = input;
  // The calendar is kept 12 weeks ahead from the series that now runs: dates that are missing
  // are made, the ones that exist are never touched. Read now, so the double-booking check
  // sees them too.
  const through = applied.materializedUntil;
  const missing = materialize(applied.later, dates, {
    from: applied.later.startsOn,
    to: through,
  });

  // A date that moves to a time or a trainer that is busy warns (PS-07), the dates this save
  // moves not at their old time; a date that stays, a cancelled one and a capacity change alone
  // never do.
  const before = new Map(dates.map((date) => [date.id, date]));
  const doubleBooked = await checkDoubleBooking(c, {
    allowConflicts: input.allowConflicts,
    surface: input.surface,
    moving: applied.updates.map((update) => update.sessionId),
    slots: [
      ...applied.updates.flatMap((update) => {
        const old = before.get(update.sessionId);
        const moved =
          old !== undefined &&
          old.status !== 'cancelled' &&
          (old.startsAt.getTime() !== update.startsAt.getTime() ||
            old.endsAt.getTime() !== update.endsAt.getTime() ||
            old.trainerProfileId !== update.trainerProfileId);
        return moved && update.trainerProfileId
          ? [
              {
                trainerProfileId: update.trainerProfileId,
                startsAt: update.startsAt,
                endsAt: update.endsAt,
                sessionId: update.sessionId,
              },
            ]
          : [];
      }),
      ...(applied.later.trainerProfileId
        ? missing.toInsert.map((occurrence) => ({
            trainerProfileId: applied.later.trainerProfileId as string,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
          }))
        : []),
    ],
  });
  if (doubleBooked) return { outcome: 'conflict', answer: doubleBooked };

  // The domain checked every date up to `through`, so none is dropped when the calendar is filled.
  const seriesVersion = 'seriesVersion' in guard ? guard.seriesVersion : undefined;
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
    const ended = await updateClassSeries(
      scope,
      stored.id,
      { endsOn: applied.earlierEndsOn ?? undefined },
      seriesVersion,
    );
    if (!ended) return { outcome: 'stale' };
    await moveDatesToSeries(scope, applied.moves, later.id);
    seriesId = later.id;
  } else {
    const updated = await updateClassSeries(
      scope,
      stored.id,
      {
        localStartTime: applied.later.localStartTime,
        durationMinutes: applied.later.durationMinutes,
        trainerProfileId: applied.later.trainerProfileId,
        capacity: applied.later.capacity,
        materializedUntil: through,
      },
      seriesVersion,
    );
    if (!updated) return { outcome: 'stale' };
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
      ...('sessionId' in guard && update.sessionId === guard.sessionId
        ? { version: guard.sessionVersion }
        : {}),
    })),
  );
  if (staleDates.length > 0) return { outcome: 'stale' };

  const actor = await findOwnTeamMember(scope);
  const locations = await listLocations(scope);
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
  return { outcome: 'written', seriesId };
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
        ? weeklySeriesFor({
            localDate: body.firstDate.localDate,
            localStart: body.firstDate.localStart,
            durationMinutes: body.durationMinutes,
            timeZone: workspace.timeZone,
            now: clock.now(),
            prefix: 'firstDate.',
          })
        : undefined;
    if (weekly?.outcome === 'refused') return c.json(weekly.answer, 400);
    const doubleBooked = await checkDoubleBooking(c, {
      allowConflicts: body.allowConflicts,
      surface: body.surface,
      slots: plan?.outcome === 'scheduled' ? slotsOf(plan, weekly) : [],
    });
    if (doubleBooked) return c.json(doubleBooked, 409);

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
        ? weeklySeriesFor({
            localDate: body.localDate,
            localStart: body.localStart,
            durationMinutes: groupClass.durationMinutes,
            timeZone: workspace.timeZone,
            now: clock.now(),
            prefix: '',
          })
        : undefined;
    if (weekly?.outcome === 'refused') return c.json(weekly.answer, 400);
    const doubleBooked = await checkDoubleBooking(c, {
      allowConflicts: body.allowConflicts,
      surface: body.surface,
      slots: slotsOf(decision, weekly),
    });
    if (doubleBooked) return c.json(doubleBooked, 409);
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

  router.openapi(updateGroupClassSeriesRoute, async (c) => {
    const scope = c.get('scope');
    const { classId, seriesId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { clock, productEvents } = c.get('dependencies');
    const stored = await findClassSeries(scope, seriesId);
    const workspace = await findWorkspace(scope);
    if (!stored || !workspace || stored.groupClassId !== classId) return c.json(NOT_FOUND, 404);
    // A save from an old version never gets as far as the rules.
    if (stored.version !== body.version) {
      return c.json({ code: 'series_changed' as const, series: shownSeries(stored) }, 409);
    }
    const trainer = await namedTrainer(scope, body.trainerId);
    if (trainer === 'unknown') return c.json(NOT_FOUND, 404);

    const dates = await listSeriesDates(scope, stored.id);
    const decision = applyToUpcomingDates(
      stored,
      {
        ...(body.localStartTime === undefined ? {} : { localStartTime: body.localStartTime }),
        ...(body.durationMinutes === undefined ? {} : { durationMinutes: body.durationMinutes }),
        ...(body.capacity === undefined ? {} : { capacity: body.capacity }),
        ...(trainer === undefined ? {} : { trainerProfileId: trainer?.trainerProfileId ?? null }),
      },
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
      clock.now(),
    );
    if (decision.outcome === 'unchanged') {
      return c.json({ ...shownSeries(stored), keptDates: decision.keptDates }, 200);
    }
    if (decision.outcome === 'refused') {
      switch (decision.reason) {
        case 'time-does-not-exist':
          return c.json(invalid('localStartTime', 'time_does_not_exist', decision.date), 400);
        case 'invalid-time':
          return c.json(invalid('localStartTime', 'invalid_time'), 400);
        case 'invalid-duration':
          return c.json(invalid('durationMinutes', 'invalid_duration'), 400);
        case 'no-upcoming-dates':
          return c.json(invalid('seriesId', 'no_upcoming_dates'), 400);
        default:
          throw new Error(
            `A refusal the request rules out reached the handler: ${decision.reason}.`,
          );
      }
    }

    const written = await writeSeriesChange(c, {
      stored,
      dates,
      applied: decision,
      allowConflicts: body.allowConflicts,
      surface: body.surface,
      guard: { seriesVersion: body.version },
    });
    if (written.outcome === 'conflict') return c.json(written.answer, 409);
    if (written.outcome === 'stale') {
      // Lost a race with another save between the read and the write: show what won.
      const latest = await findClassSeries(scope, seriesId);
      if (!latest) return c.json(NOT_FOUND, 404);
      return c.json({ code: 'series_changed' as const, series: shownSeries(latest) }, 409);
    }

    const running = await findClassSeries(scope, written.seriesId);
    if (!running) return c.json(NOT_FOUND, 404);
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
    return c.json({ ...shownSeries(running), keptDates: decision.keptDates }, 200);
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
      const today = localDateOf(clock.now(), workspace.timeZone);
      const applied = applyThisAndFollowing(
        stored,
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
        today,
      );
      if (applied.outcome === 'refused') {
        switch (applied.reason) {
          case 'time-does-not-exist':
            return c.json(invalid('localStart', 'time_does_not_exist', applied.date), 400);
          case 'invalid-duration':
            return c.json(invalid('localEnd', 'invalid_duration'), 400);
          case 'date-in-past':
            return c.json(invalid('scope', 'date_in_past'), 400);
          default:
            throw new Error(
              `A refusal the request rules out reached the handler: ${applied.reason}.`,
            );
        }
      }

      const written = await writeSeriesChange(c, {
        stored,
        dates,
        applied,
        allowConflicts: body.allowConflicts,
        surface: body.surface,
        guard: { sessionId, sessionVersion: body.version },
      });
      if (written.outcome === 'conflict') return c.json(written.answer, 409);
      if (written.outcome === 'stale') {
        // Lost a race with another save between the read and the write: show what won.
        const latest = await findSession(scope, sessionId);
        if (!latest) return c.json(NOT_FOUND, 404);
        return c.json(changed(latest), 409);
      }

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

    // "Only this class": a new time that puts the trainer where they are busy warns (PS-07); the
    // date's own old time does not count, and a capacity change alone is never checked.
    const trainer = current.trainer ? await findTrainer(scope, current.trainer.id) : undefined;
    const doubleBooked = await checkDoubleBooking(c, {
      allowConflicts: body.allowConflicts,
      surface: body.surface,
      slots:
        trainer && timeChanged && current.status === 'scheduled'
          ? [
              {
                trainerProfileId: trainer.trainerProfileId,
                startsAt: decision.startsAt,
                endsAt: decision.endsAt,
                sessionId,
              },
            ]
          : [],
    });
    if (doubleBooked) return c.json(doubleBooked, 409);

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
