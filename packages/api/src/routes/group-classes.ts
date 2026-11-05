import {
  createGroupClass,
  createGroupSession,
  findGroupClass,
  findOwnTeamMember,
  findSession,
  findTrainer,
  findWorkspace,
  type GroupClassView,
  listGroupClasses,
  listLocations,
  updateGroupClass,
  updateGroupSession,
  type WorkspaceScope,
} from '@fivvi/database';
import { decideGroupDateEdit, GROUP_CLASS_LIMITS, scheduleClassOnDate } from '@fivvi/domain';
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

const FirstDateSchema = z
  .object({
    localDate: localDateField.openapi({
      description: 'The date in the workspace’s time zone: `YYYY-MM-DD`.',
    }),
    localStart: localTimeField.openapi({
      description: 'The start in the workspace’s time zone: `HH:mm`, 24 hours.',
    }),
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
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `class_scheduled` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
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
    localDate: localDateField.optional().openapi({
      description:
        'The new date in the workspace’s time zone, `YYYY-MM-DD`. Leave it out to keep it.',
    }),
    localStart: localTimeField.optional().openapi({
      description: 'The new start, `HH:mm` in the workspace’s time zone. Leave it out to keep it.',
    }),
    localEnd: localTimeField.optional().openapi({
      description:
        'The new end, `HH:mm` on the same date as the start. Leave it out to keep its time of ' +
        'day. An end that is not after the start answers `400` on `localEnd` with the code ' +
        '`end_before_start`.',
    }),
    capacity: capacityField.optional().openapi({
      description:
        `The new capacity of this date, ${LIMITS.capacity.min} to ${LIMITS.capacity.max}. ` +
        'Leave it out to keep it.',
    }),
  })
  // A save that changes nothing is refused on the start.
  .refine(
    (body) =>
      body.localDate !== undefined ||
      body.localStart !== undefined ||
      body.localEnd !== undefined ||
      body.capacity !== undefined,
    { path: ['localStart'], error: 'Give at least one field to change.' },
  )
  .openapi('UpdateGroupClassDateRequest', {
    description:
      'Changes one date of a class (CO-04): the date, the start, the end and the capacity, ' +
      'each only when given. The class itself never changes.',
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
      'repeat takes the first. A class or trainer that is not in the workspace answers `404`.',
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
        description: 'The class was scheduled.',
        content: { 'application/json': { schema: SessionSchema } },
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
      'Changes the date, start, end and/or capacity of one group session (the Owner only), ' +
      'from the version the caller read (`409` with the date as it is now when it changed ' +
      'since). Times are wall-clock in the workspace’s time zone with the same daylight saving ' +
      'rules as scheduling. An end that is not after the start answers `400` on `localEnd` ' +
      '(`end_before_start`). The class and its other dates are not touched. A session that is ' +
      'not a group session of the workspace (a private session too) answers `404`.',
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
        content: { 'application/json': { schema: SessionSchema } },
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
function invalid(path: string, code: string) {
  return { code: 'validation_failed' as const, issues: [{ path, code }] };
}

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
            defaultTrainerTeamMemberId: trainer?.id ?? null,
          },
          localDate: body.firstDate.localDate,
          localStart: body.firstDate.localStart,
          timeZone: workspace.timeZone,
          now: clock.now(),
          locations: await listLocations(scope),
        })
      : undefined;
    if (plan?.outcome === 'refused') return c.json(...refusalOfDate(plan.reason, 'firstDate.'));

    const groupClass = await createGroupClass(scope, {
      nameNl: body.nameNl,
      nameEn: textOrNull(body.nameEn),
      descriptionNl: textOrNull(body.descriptionNl),
      descriptionEn: textOrNull(body.descriptionEn),
      defaultTrainerProfileId: trainerProfileId,
      capacity: body.capacity,
      durationMinutes: body.durationMinutes,
    });
    const firstDate = plan
      ? shown(
          await createGroupSession(scope, {
            groupClassId: groupClass.id,
            trainerProfileId,
            locationId: plan.locationId,
            startsAt: plan.startsAt,
            endsAt: plan.endsAt,
            capacity: plan.capacity,
            createdByTeamMemberId: actor.id,
          }),
          workspace.timeZone,
        )
      : undefined;

    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (surface !== undefined) {
      const afterCommit = c.get('afterCommit');
      const distinctId = c.get('account').id;
      afterCommit(() =>
        productEvents.track({
          event: 'class_created',
          distinctId,
          properties: { workspace_id: scope.workspaceId, surface },
        }),
      );
      if (firstDate) {
        afterCommit(() =>
          productEvents.track({
            event: 'class_scheduled',
            distinctId,
            properties: { workspace_id: scope.workspaceId, surface },
          }),
        );
      }
    }
    return c.json({ groupClass: shownClass(groupClass), ...(firstDate ? { firstDate } : {}) }, 201);
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
    const decision = scheduleClassOnDate({
      groupClass: {
        capacity: groupClass.capacity,
        durationMinutes: groupClass.durationMinutes,
        defaultTrainerTeamMemberId: groupClass.defaultTrainer?.id ?? null,
      },
      ...(requested === undefined
        ? {}
        : {
            requestedTrainer:
              requested === null
                ? null
                : { teamMemberId: body.trainerId ?? '', trains: requested !== 'unknown' },
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
    // The trainer profile of the date: the one named for it, else the class's usual trainer.
    const trainerProfileId =
      decision.trainerTeamMemberId === null
        ? null
        : requested !== undefined && requested !== null && requested !== 'unknown'
          ? requested.trainerProfileId
          : groupClass.defaultTrainerProfileId;
    const session = await createGroupSession(scope, {
      groupClassId: groupClass.id,
      trainerProfileId,
      locationId: decision.locationId,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
      capacity: decision.capacity,
      createdByTeamMemberId: actor.id,
    });
    const surface = surfaceOf(c.req.header('authorization'), body.surface);
    if (surface !== undefined) {
      const distinctId = c.get('account').id;
      c.get('afterCommit')(() =>
        productEvents.track({
          event: 'class_scheduled',
          distinctId,
          properties: { workspace_id: scope.workspaceId, surface },
        }),
      );
    }
    return c.json(shown(session, workspace.timeZone), 201);
  });

  router.openapi(updateGroupClassDateRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const current = await findSession(scope, sessionId);
    const workspace = await findWorkspace(scope);
    if (!current || !workspace || current.type !== 'group') return c.json(NOT_FOUND, 404);
    const changed = (session: typeof current) => ({
      code: 'class_date_changed' as const,
      session: shown(session, workspace.timeZone),
    });
    // A save from an old version never gets as far as the rules.
    if (current.version !== body.version) return c.json(changed(current), 409);

    const decision = decideGroupDateEdit({
      current: { startsAt: current.startsAt, endsAt: current.endsAt, capacity: current.capacity },
      requested: {
        ...(body.localDate === undefined ? {} : { localDate: body.localDate }),
        ...(body.localStart === undefined ? {} : { localStart: body.localStart }),
        ...(body.localEnd === undefined ? {} : { localEnd: body.localEnd }),
        ...(body.capacity === undefined ? {} : { capacity: body.capacity }),
      },
      timeZone: workspace.timeZone,
    });
    if (decision.outcome === 'refused') return c.json(...refusalOfEdit(decision.reason));

    const result = await updateGroupSession(scope, sessionId, {
      version: body.version,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
      capacity: decision.capacity,
    });
    if (result.outcome === 'not-found') return c.json(NOT_FOUND, 404);
    if (result.outcome === 'stale') {
      // Lost a race with another save between the read and the write: show what won.
      const latest = await findSession(scope, sessionId);
      if (!latest) return c.json(NOT_FOUND, 404);
      return c.json(changed(latest), 409);
    }
    return c.json(shown(result.session, workspace.timeZone), 200);
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
    | 'invalid-date'
    | 'invalid-time'
    | 'invalid-end-time'
    | 'time-does-not-exist'
    | 'end-time-does-not-exist'
    | 'end-before-start',
) {
  switch (reason) {
    case 'invalid-date':
      return [invalid('localDate', 'invalid_date'), 400] as const;
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
