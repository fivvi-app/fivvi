import {
  assignSessionTrainer,
  findClassSeries,
  findOwnTeamMember,
  findSession,
  findTrainer,
  findTrainerRecipient,
  findWorkspace,
  listBookedClients,
  listSeriesDates,
  listTrainersWithProfiles,
  type SeriesDateRow,
  type SessionView,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  type AssignTrainerDecision,
  assignTrainer,
  isSubstitution,
  localDateOf,
  sendsSubstitutionNotice,
  sendsTrainerChangeNotice,
  substitute,
  substitutionLanguage,
} from '@fivvi/domain';
import type { SubstitutionMail } from '@fivvi/email/substitution-mail';
import { OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import { defineRoute, type WorkspaceEnv } from '../access.ts';
import {
  answerValidationFailure,
  internalServerErrorResponse,
  NOT_FOUND,
  validationErrorResponse,
} from '../errors.ts';
import { substitutionEmailEvent } from '../sessions/email-event.ts';
import { queueTrainerChangeEmails } from '../sessions/trainer-change-emails.ts';
import {
  allowConflictsField,
  checkDoubleBooking,
  countConflictingSlots,
  TrainerConflictItemSchema,
  trainerConflictsOf,
} from '../sessions/trainer-conflicts.ts';
import {
  inFieldOrder,
  invalid,
  seriesDatesOf,
  surfaceOf,
  writeSeriesChange,
} from './group-classes.ts';
import { conflict, SessionSchema, shown } from './sessions.ts';

// Assigning and changing a trainer (F023, spec #459, ticket #536). The Owner gives a class date
// that has no trainer one (*Trainer toewijzen*), makes someone a class's regular trainer from a
// date on (*Deze en alle volgende lessen*, F022's change of a series from a date) and changes a
// private session's trainer (*Trainer wijzigen*); the clients who are booked are told by email
// (EM-13) unless the Owner unchecks the box. The rules are `assignTrainer` and
// `sendsTrainerChangeNotice` in @fivvi/domain; the double-booking check is the one every
// scheduling save has (`trainer_conflict`, PS-07). Who may: `session.assign`, the Owner only
// (decision of 4 November 2026). Substituting a trainer on one class date that has one (*Alleen deze
// les*, F024, ticket #552) is this route too: the date's trainer changes, the date remembers whom
// the substitute replaces (`substituteFor`), the substitute gets EM-10 unless the Owner unchecks
// the box, and choosing the original again ends the substitution (`substitute` in @fivvi/domain).

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

const TrainerCandidateSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The trainer’s team-member ID, as in `GET …/trainers`.' }),
    name: z.string().openapi({ description: 'The account’s name; empty when it has none.' }),
    conflicts: z.array(TrainerConflictItemSchema).openapi({
      description:
        'What the trainer already has at the session’s time in this workspace (the hint in the ' +
        'trainer dialog), soonest first; empty when they are free. Never anything of another ' +
        'workspace.',
    }),
    laterConflictingDates: z
      .number()
      .int()
      .openapi({
        description:
          'How many later dates of the session’s series the trainer already has something at, of ' +
          'the dates *Deze en alle volgende lessen* would give them. 0 for a private session, a ' +
          'date outside a series and a date that is not offered that scope.',
      }),
  })
  .openapi('TrainerCandidate', {
    description: 'A trainer the session can go to, with what they already have then.',
  });

const TrainerCandidatesSchema = z
  .object({
    sessionId: z.uuid().openapi({ description: 'The session ID.' }),
    trainers: z.array(TrainerCandidateSchema).openapi({
      description:
        'The workspace’s trainers except the session’s own, by name. Empty when there is nobody ' +
        'else (“Er zijn geen andere trainers”).',
    }),
    participantsToNotify: z
      .object({
        forThisDate: z
          .number()
          .int()
          .openapi({
            description:
              'The clients with a booked place in the session who would get the email: 0 for a ' +
              'session that has started.',
          }),
        forFollowingDates: z
          .number()
          .int()
          .openapi({
            description:
              'The clients with a booked place on any date *Deze en alle volgende lessen* would ' +
              'give another trainer, each counted once (“{n} deelnemers informeren per e-mail”); 0 ' +
              'outside a series. Dates that have started are not counted.',
          }),
      })
      .openapi('ParticipantsToNotify', {
        description: 'How many clients the trainer-change email reaches, for each scope.',
      }),
  })
  .openapi('TrainerCandidates', {
    description:
      'The trainers a session can go to, with their conflicts and who would be told (CO-02, ' +
      '*Trainer wijzigen*). Contains no client name or email address.',
  });

const AssignTrainerBodySchema = z
  .object({
    trainerId: z.uuid().openapi({
      description:
        'The new trainer’s team-member ID, from `GET …/trainers`. A team member who does not ' +
        'train in the workspace answers `404`, the session’s trainer already `400` on `trainerId` ' +
        'with the code `same_trainer`.',
    }),
    scope: z
      .enum(['this', 'following'])
      .optional()
      .openapi({
        description:
          'For a class date: `this` (*Alleen deze les*: a date that has no trainer gets one; on a ' +
          'date that has one it is a substitution, F024: the chosen trainer replaces the date’s ' +
          'trainer on this date alone, the date remembers whom (`substituteFor`) and the series ' +
          'and the other dates stay; choosing the trainer the date’s trainer replaces ends the ' +
          'substitution) or `following` (*Deze en alle volgende lessen*: the trainer becomes the ' +
          'series’ regular trainer from this date, and dates with a change of their own keep ' +
          'theirs; a date outside a series answers `400` on `scope` with the code ' +
          '`not_in_series`, a date before today `date_in_past`). Left out it is `this`. Ignored ' +
          'for a private session, but a private session with `this` sent explicitly is a ' +
          'substitution that cannot be made: `422` `private_session` (its trainer is changed ' +
          'without a `scope`, *Trainer wijzigen*).',
      }),
    allowConflicts: allowConflictsField,
    version: z
      .number()
      .int()
      .min(1)
      .openapi({
        description:
          'The `version` of the session the person saw. If the session has been changed since, ' +
          'nothing is stored and the answer is `409` with the session as it is now.',
      }),
    notifyClients: z
      .boolean()
      .optional()
      .openapi({
        description:
          'Whether to email the clients with a booked place the new trainer (EM-13), each client ' +
          'one email listing their dates, in their email language, else the workspace’s default. ' +
          'Left out it is `true`. Never sent for a session that has started, whatever this says. ' +
          'Not sent for a substitution (F024): the substitute gets EM-10 (`notifySubstitute`).',
      }),
    notifySubstitute: z
      .boolean()
      .optional()
      .openapi({
        description:
          'For a substitution (F024): whether to email the substitute EM-10, in their own ' +
          'language, else the workspace’s default, once per date and substitute. Left out it is ' +
          '`true`. Never sent when the substitution ends, for a date that has started (the ' +
          'substitution is recorded all the same, to say who taught) or for a date that is no ' +
          'substitution, whatever this says.',
      }),
    surface: z
      .enum(['ios', 'android'])
      .optional()
      .openapi({
        description:
          'The app that sends the request: `ios` or `android`. A request with a bearer token ' +
          'records the `trainer_assigned` event with this surface; without it nothing is ' +
          'recorded. The web does not send it, and a request without a bearer token ignores it.',
      }),
  })
  .openapi('AssignTrainerRequest', {
    description: 'The trainer a session or a class from a date on goes to.',
  });

const TrainerAssignedSchema = z
  .object({
    session: SessionSchema,
    clientsNotified: z
      .number()
      .int()
      .openapi({
        description:
          'How many clients get the email (EM-13): one each, after the answer is decided; a failure ' +
          'is reported to error tracking and does not undo the change. 0 when it was not asked ' +
          'for, for a session that has started and when nobody has a booked place.',
      }),
    keptDates: z
      .number()
      .int()
      .openapi({
        description:
          'For `following`: the later dates that keep their own trainer or other change of their ' +
          'own; 0 otherwise.',
      }),
  })
  .openapi('TrainerAssigned', { description: 'The session after the trainer was assigned.' });

// One object, not a `oneOf` (see `RescheduleRefusalSchema` in sessions.ts for why): `code` tells
// the refusals apart, `session` and `changedBy` come with the session codes and `conflicts` with
// `trainer_conflict`.
const SubstitutionRefusedSchema = z
  .object({
    code: z.enum(['private_session']).openapi({
      description:
        '`private_session`: a private session’s trainer is changed with *Trainer wijzigen* ' +
        '(`scope` left out), never substituted.',
    }),
  })
  .openapi('SubstitutionRefused', {
    description:
      'Why the substitution was refused; nothing was stored. Contains no user-facing text.',
  });

const AssignTrainerRefusalSchema = z
  .object({
    code: z.enum(['session_changed', 'session_cancelled', 'trainer_conflict']).openapi({
      description:
        '`session_changed`: someone changed the session after the `version` sent; ' +
        '`session_cancelled`: the session was cancelled and stays as it is; `trainer_conflict`: ' +
        'the new trainer already has something at that time (PS-07).',
    }),
    session: SessionSchema.optional().openapi({
      description: 'The session as it is now, for `session_changed` and `session_cancelled`.',
    }),
    changedBy: z
      .object({ name: z.string().openapi({ description: 'The account’s name.' }) })
      .optional()
      .openapi({
        description:
          'Who changed the session last, for `session_changed`; left out when that person has ' +
          'been removed or their account has no name.',
      }),
    conflicts: z.array(TrainerConflictItemSchema).optional().openapi({
      description:
        'The overlapping sessions, soonest first, of this workspace only, for `trainer_conflict`.',
    }),
  })
  .openapi('AssignTrainerRefusal', {
    description:
      'Why the assignment was refused; nothing was stored. Contains no user-facing text.',
  });

// Both routes are the Owner's: the capability is `session.assign` of the permission matrix (F004).
const assignTrainers = { type: 'workspace', capability: 'session.assign', client: 'none' } as const;

const trainerCandidatesRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer-candidates',
    operationId: 'listTrainerCandidates',
    tags: ['sessions'],
    summary: 'The trainers a session can go to',
    description:
      'For the trainer dialog (CO-02, *Trainer wijzigen*): the workspace’s trainers except the ' +
      'session’s own, by name, each with what they already have at the session’s time ' +
      '(`findTrainerConflicts`, this workspace only, a cancelled session and back-to-back ' +
      'never count) and, for a class date in a series, on how many later dates; and how many ' +
      'clients would be told, for each scope. The Owner only: a Trainer gets `403`. A session ' +
      'that is not in the workspace, or an Open Gym, answers `404`.',
    security: SIGNED_IN,
    request: { params: SessionParamsSchema },
    responses: {
      200: {
        description: 'The candidates, possibly none.',
        content: { 'application/json': { schema: TrainerCandidatesSchema } },
      },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  assignTrainers,
);

const assignTrainerRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer',
    operationId: 'assignTrainer',
    tags: ['sessions'],
    summary: 'Assign or change the trainer of a session',
    description:
      'Gives a private session or a class date another trainer, or a class date without one its ' +
      'first (the Owner only: a Trainer gets `403`). For a class date `scope` is `this` (a date ' +
      'without a trainer; the date is marked as changed from its series) or `following` (the ' +
      'series’ regular trainer from this date on: dates with a change of their own keep it, ' +
      'earlier dates keep theirs, later dates the calendar fills get the new trainer); for a ' +
      'private session it is ignored. On a class date that has a trainer, `this` is a ' +
      'substitution (F024): only that date gets the substitute, the date remembers whom they ' +
      'replace, and the substitute gets EM-10 after the commit unless `notifySubstitute` is ' +
      '`false` or the date has started (a past date is recorded without an email). `version` is the one the person saw: if the session has ' +
      'been changed since, nothing is stored and the answer is `409` (`session_changed`) with ' +
      'the session as it is now. A cancelled session answers `409` `session_cancelled`. The ' +
      'new trainer is checked for double booking (`409` `trainer_conflict` with the sessions, ' +
      'unless `allowConflicts` is `true`, PS-07). After the change is committed the clients with ' +
      'a booked place get EM-13, one email each listing their dates, unless `notifyClients` is ' +
      '`false` or the session has started. No other participant and no email address of the ' +
      'trainer is in it. A session or trainer that is not in the workspace answers `404`.',
    security: SIGNED_IN,
    request: {
      params: SessionParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: AssignTrainerBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'The trainer was assigned.',
        content: { 'application/json': { schema: TrainerAssignedSchema } },
      },
      400: validationErrorResponse,
      422: {
        description: 'A private session cannot be substituted (`scope` `this` sent for it).',
        content: { 'application/json': { schema: SubstitutionRefusedSchema } },
      },
      409: {
        description:
          'The session was changed after the `version` sent, or it is cancelled, or the new ' +
          'trainer already has something at that time. Nothing was stored.',
        content: { 'application/json': { schema: AssignTrainerRefusalSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  assignTrainers,
);

/** The session and, for a date in a series, the series and its dates, as the rules read them. */
async function factsOf(scope: WorkspaceScope, session: SessionView) {
  const trainer = session.trainer ? await findTrainer(scope, session.trainer.id) : undefined;
  const stored = session.series ? await findClassSeries(scope, session.series.id) : undefined;
  const dates: SeriesDateRow[] = stored ? await listSeriesDates(scope, stored.id) : [];
  return {
    stored,
    dates,
    session: {
      id: session.id,
      type: session.type,
      status: session.status,
      startsAt: session.startsAt,
      trainerProfileId: trainer?.trainerProfileId ?? null,
      series:
        session.series && stored
          ? {
              state: stored,
              occurrenceDate: session.series.occurrenceDate,
              detachedFields: inFieldOrder(session.series.detachedFields),
              dates: seriesDatesOf(dates),
            }
          : undefined,
    },
  };
}

/** The `400` or `409` for a refusal of the rules. */
function refusalOf(
  decision: Extract<AssignTrainerDecision, { outcome: 'refused' }>,
  session: SessionView,
  timeZone: string,
) {
  switch (decision.reason) {
    case 'not-scheduled':
      return [conflict('session_cancelled', session, timeZone), 409] as const;
    case 'same-trainer':
      return [invalid('trainerId', 'same_trainer'), 400] as const;
    case 'has-trainer':
      return [invalid('scope', 'has_trainer'), 400] as const;
    case 'not-in-series':
      return [invalid('scope', 'not_in_series'), 400] as const;
    case 'date-in-past':
      return [invalid('scope', 'date_in_past'), 400] as const;
    case 'time-does-not-exist':
      return [invalid('scope', 'time_does_not_exist'), 400] as const;
    case 'invalid-rule':
    case 'invalid-date':
    case 'invalid-time':
    case 'invalid-duration':
      // A stored series is valid and the request holds none of these.
      throw new Error(`A refusal the request rules out reached the handler: ${decision.reason}.`);
  }
}

export function registerTrainerAssignment(app: OpenAPIHono) {
  const router = new OpenAPIHono<WorkspaceEnv>({ defaultHook: answerValidationFailure });

  router.openapi(trainerCandidatesRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const { clock } = c.get('dependencies');
    const session = await findSession(scope, sessionId);
    const workspace = await findWorkspace(scope);
    if (!session || !workspace || session.type === 'open_gym') return c.json(NOT_FOUND, 404);
    const now = clock.now();
    const today = localDateOf(now, workspace.timeZone);
    const trainers = (await listTrainersWithProfiles(scope)).filter(
      (trainer) => trainer.id !== session.trainer?.id,
    );
    const { session: facts } = await factsOf(scope, session);

    // Which later dates *Deze en alle volgende lessen* would give the trainer: the dates that follow
    // the series and do not have the trainer yet. Who is picked does not change which dates take it.
    const followingFor = (trainerProfileId: string) => {
      if (session.type !== 'group' || !facts.series) return [];
      const decision = assignTrainer({
        session: { ...facts, trainerProfileId: null },
        trainerProfileId,
        scope: 'following',
        today,
      });
      if (decision.outcome !== 'applied' || decision.kind !== 'series') return [];
      const before = new Map(facts.series.dates.map((date) => [date.id, date]));
      return decision.change.updates.filter((update) => {
        const old = before.get(update.sessionId);
        return old !== undefined && !old.cancelled && old.trainerProfileId !== trainerProfileId;
      });
    };

    const candidates = [];
    for (const trainer of trainers) {
      const own = await trainerConflictsOf(scope, [
        {
          trainerProfileId: trainer.trainerProfileId,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          sessionId: session.id,
        },
      ]);
      const later = followingFor(trainer.trainerProfileId).filter(
        (update) => update.sessionId !== session.id,
      );
      candidates.push({
        id: trainer.id,
        name: trainer.name,
        conflicts: own?.conflicts ?? [],
        laterConflictingDates: await countConflictingSlots(
          scope,
          later.map((update) => ({
            trainerProfileId: trainer.trainerProfileId,
            startsAt: update.startsAt,
            endsAt: update.endsAt,
            sessionId: update.sessionId,
          })),
        ),
      });
    }

    const notifiable = async (dates: readonly { id: string; startsAt: Date }[]) => {
      const coming = dates.filter((date) =>
        sendsTrainerChangeNotice({ notify: true, startsAt: date.startsAt, now }),
      );
      const booked = await listBookedClients(
        scope,
        coming.map((date) => date.id),
      );
      return new Set(booked.map((place) => place.clientId)).size;
    };
    const [first] = trainers;
    const following = first
      ? followingFor(first.trainerProfileId).map((update) => ({
          id: update.sessionId,
          startsAt: update.startsAt,
        }))
      : [];
    return c.json(
      {
        sessionId: session.id,
        trainers: candidates,
        participantsToNotify: {
          forThisDate: await notifiable([{ id: session.id, startsAt: session.startsAt }]),
          forFollowingDates: await notifiable(following),
        },
      },
      200,
    );
  });

  router.openapi(assignTrainerRoute, async (c) => {
    const scope = c.get('scope');
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const dependencies = c.get('dependencies');
    const { clock, productEvents, sendTrainerChange } = dependencies;
    const current = await findSession(scope, sessionId);
    const workspace = await findWorkspace(scope);
    const trainer = await findTrainer(scope, body.trainerId);
    const actor = await findOwnTeamMember(scope);
    if (!current || !workspace || current.type === 'open_gym' || !trainer || !actor) {
      return c.json(NOT_FOUND, 404);
    }
    const timeZone = workspace.timeZone;
    // A private session is never substituted (F024 AC11): `this` sent for it is refused, whatever
    // its state; *Trainer wijzigen* sends no scope.
    if (current.type === 'private' && body.scope === 'this') {
      return c.json({ code: 'private_session' as const }, 422);
    }
    // A cancelled session stays as it is (F026): the state is told before the version, so a form
    // opened before the cancellation learns why it cannot save.
    if (current.status === 'cancelled') {
      return c.json(conflict('session_cancelled', current, timeZone), 409);
    }
    // A save from an old version never gets as far as the rules (F020's 409, with the session).
    if (current.version !== body.version) {
      return c.json(conflict('session_changed', current, timeZone), 409);
    }
    const now = clock.now();
    const editScope = body.scope ?? 'this';
    const { session: facts, stored, dates } = await factsOf(scope, current);
    const substitution = isSubstitution(facts, editScope)
      ? substitute(
          {
            type: current.type,
            status: current.status,
            startsAt: current.startsAt,
            trainerProfileId: facts.trainerProfileId,
            substituteForTrainerProfileId: current.substituteFor?.trainerProfileId ?? null,
            series:
              facts.series && stored
                ? {
                    trainerProfileId: stored.trainerProfileId,
                    detachedFields: facts.series.detachedFields,
                  }
                : undefined,
          },
          trainer.trainerProfileId,
          now,
        )
      : undefined;
    if (substitution?.outcome === 'refused' && substitution.reason !== 'same-trainer') {
      // The cancelled date and the private session were answered above, a date with a trainer has one.
      throw new Error(
        `A refusal the request rules out reached the handler: ${substitution.reason}.`,
      );
    }
    const decision: AssignTrainerDecision =
      substitution === undefined
        ? assignTrainer({
            session: facts,
            trainerProfileId: trainer.trainerProfileId,
            scope: editScope,
            today: localDateOf(now, timeZone),
          })
        : substitution.outcome === 'applied'
          ? {
              outcome: 'applied',
              kind: 'date',
              trainerProfileId: substitution.trainerProfileId,
              detachedFields: substitution.detachedFields,
            }
          : { outcome: 'refused', reason: 'same-trainer' };
    // Each refusal rolls the request's transaction back: nothing is stored, nothing is sent.
    if (decision.outcome === 'refused') {
      const [answer, status] = refusalOf(decision, current, timeZone);
      return status === 409 ? c.json(answer, 409) : c.json(answer, 400);
    }

    // The sessions that get the trainer, as they were before the change.
    let affected: string[];
    let keptDates = 0;
    if (decision.kind === 'date') {
      const doubleBooked = await checkDoubleBooking(c, {
        allowConflicts: body.allowConflicts,
        surface: body.surface,
        slots: [
          {
            trainerProfileId: trainer.trainerProfileId,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
            sessionId,
          },
        ],
      });
      if (doubleBooked) return c.json(doubleBooked, 409);
      const moved = await assignSessionTrainer(scope, {
        sessionId,
        expectedVersion: body.version,
        trainerProfileId: decision.trainerProfileId,
        ...(current.series ? { detachedFields: decision.detachedFields } : {}),
        ...(substitution?.outcome === 'applied'
          ? { substituteForTrainerProfileId: substitution.substituteForTrainerProfileId }
          : {}),
        changedByTeamMemberId: actor.id,
      });
      if (!moved) {
        const latest = await findSession(scope, sessionId);
        if (!latest) return c.json(NOT_FOUND, 404);
        // What the other change was decides which: cancelling can win the race too.
        const code = latest.status === 'cancelled' ? 'session_cancelled' : 'session_changed';
        return c.json(conflict(code, latest, timeZone), 409);
      }
      affected = [sessionId];
    } else {
      if (!stored) throw new Error('A date in a series has no series.');
      const written = await writeSeriesChange(c, {
        stored,
        dates,
        applied: decision.change,
        allowConflicts: body.allowConflicts,
        surface: body.surface,
        guard: { sessionId, sessionVersion: body.version },
      });
      if (written.outcome === 'conflict') return c.json(written.answer, 409);
      if (written.outcome === 'stale') {
        // Lost a race with another save between the read and the write: show what won.
        const latest = await findSession(scope, sessionId);
        if (!latest) return c.json(NOT_FOUND, 404);
        return c.json(conflict('session_changed', latest, timeZone), 409);
      }
      const before = new Map(dates.map((date) => [date.id, date]));
      affected = decision.change.updates
        .filter(
          (update) =>
            update.trainerProfileId === trainer.trainerProfileId &&
            before.get(update.sessionId)?.trainerProfileId !== trainer.trainerProfileId,
        )
        .map((update) => update.sessionId);
      keptDates = decision.change.keptDates;
    }

    const latest = await findSession(scope, sessionId);
    if (!latest) return c.json(NOT_FOUND, 404);
    const afterCommit = c.get('afterCommit');

    // EM-13: one email to each client with a booked place on an affected date that has not started,
    // listing their dates. Each date is read as it is now, with the version that keys the email.
    // A substitution tells the substitute (EM-10) and nobody else here: the participants' notice
    // of a substitution is F024's AC16 and AC17, with a box of its own.
    let clientsNotified = 0;
    if (body.notifyClients !== false && substitution === undefined) {
      const changed: SessionView[] = [];
      for (const id of affected) {
        const date = id === sessionId ? latest : await findSession(scope, id);
        if (date && sendsTrainerChangeNotice({ notify: true, startsAt: date.startsAt, now })) {
          changed.push(date);
        }
      }
      clientsNotified = await queueTrainerChangeEmails({
        scope,
        afterCommit,
        dependencies: { sendTrainerChange },
        workspace,
        trainer: { id: trainer.id, name: trainer.name },
        dates: changed,
      });
    }

    // EM-10: the substitute is told, once, after the commit, in their own language, when the Owner
    // left the box checked and the date has not started (F024 AC2, AC8, AC12). Ending a
    // substitution tells nobody (AC5).
    if (
      substitution?.outcome === 'applied' &&
      sendsSubstitutionNotice({
        notify: body.notifySubstitute !== false,
        change: substitution.change,
        startsAt: latest.startsAt,
        now,
      })
    ) {
      const recipient = await findTrainerRecipient(scope, trainer.id);
      if (recipient) {
        const mail: SubstitutionMail = {
          to: { email: recipient.email, name: recipient.name },
          locale: substitutionLanguage({
            accountPreference: recipient.preferredLocale,
            workspaceDefault: workspace.defaultLocale,
          }),
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          timeZone,
          session: {
            id: latest.id,
            nameNl: latest.groupClass?.nameNl ?? '',
            nameEn: latest.groupClass?.nameEn ?? null,
          },
          startsAt: latest.startsAt,
          endsAt: latest.endsAt,
          location: { name: latest.location.name, address: latest.location.address },
          originalName: latest.substituteFor?.name.trim() ? latest.substituteFor.name : null,
          event: substitutionEmailEvent(latest.id, trainer.id),
        };
        afterCommit(() => dependencies.sendSubstitution(mail));
      }
    }

    // The workspace ID and the platform only for a substitution (OBSERVABILITY.md §4); the
    // workspace ID, the platform, the scope and the kind for an assignment.
    const platform = surfaceOf(c.req.header('authorization'), body.surface);
    if (platform !== undefined) {
      afterCommit(() =>
        productEvents.track(
          substitution?.outcome === 'applied'
            ? {
                event:
                  substitution.change === 'ended' ? 'substitution_ended' : 'trainer_substituted',
                distinctId: c.get('account').id,
                properties: { workspace_id: scope.workspaceId, platform },
              }
            : {
                event: 'trainer_assigned',
                distinctId: c.get('account').id,
                properties: {
                  workspace_id: scope.workspaceId,
                  platform,
                  scope: current.type === 'private' ? 'this' : editScope,
                  kind: current.type === 'private' ? 'private' : 'class',
                },
              },
        ),
      );
    }
    return c.json({ session: shown(latest, timeZone), clientsNotified, keptDates }, 200);
  });

  app.route('/', router);
}
