import {
  listTrainerSessionsBetween,
  type TrainerSessionView,
  type WorkspaceScope,
} from '@fivvi/database';
import { findTrainerConflicts } from '@fivvi/domain';
import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { WorkspaceEnv } from '../access.ts';

// The double-booking check of every scheduling save (F023, spec #459, Q24): a trainer can be in one
// place at a time. It is a warning, never a block: a save that would overlap answers
// `409 trainer_conflict` with the overlapping sessions of this workspace, and saves when the caller
// sends `allowConflicts`. The save is the check, so a form that has been open for a while warns too
// and the web and both apps warn the same way. The rule is `findTrainerConflicts` in
// @fivvi/domain; this reads the sessions through the workspace scope, so a trainer's sessions in
// another workspace never come into it (AC4), and shapes the answer.

export const TrainerConflictItemSchema = z
  .object({
    sessionId: z.uuid().openapi({ description: 'The overlapping session’s ID.' }),
    type: z.enum(['private', 'group', 'open_gym']).openapi({
      description: 'The kind of the overlapping session.',
    }),
    startsAt: z.iso.datetime().openapi({ description: 'The start, a UTC instant.' }),
    endsAt: z.iso.datetime().openapi({ description: 'The end, a UTC instant.' }),
    displayName: z.string().openapi({
      description:
        'Who or what the session is: the client’s name of a private session, the class’s Dutch ' +
        'name of a class date.',
    }),
    displayNameEn: z
      .string()
      .nullable()
      .openapi({
        description:
          'The class’s English name of a class date, `null` without one and for any other ' +
          'session. Show it to a viewer whose language is English, else `displayName` ' +
          '(`pickContentLanguage`).',
      }),
  })
  .openapi('TrainerConflictItem', {
    description: 'A session of this workspace that the trainer already has at that time.',
  });

export const TrainerConflictSchema = z
  .object({
    code: z.enum(['trainer_conflict']),
    conflicts: z.array(TrainerConflictItemSchema).openapi({
      description:
        'The overlapping sessions, soonest first, of this workspace only. A weekly repeat or a ' +
        'change from a date on lists the sessions that overlap any of its dates.',
    }),
  })
  .openapi('TrainerConflict', {
    description:
      'The trainer already has something at that time (PS-07, a soft warning). Nothing was ' +
      'stored; send the request again with `allowConflicts: true` to save anyway. Contains no ' +
      'user-facing text.',
  });

/** The `409` a scheduling route documents when it checks for double booking. */
export const trainerConflictResponse = {
  description:
    'The trainer already has something at that time, and `allowConflicts` was not set. Nothing ' +
    'was stored.',
  content: { 'application/json': { schema: TrainerConflictSchema } },
};

/** The request field every scheduling save takes. */
export const allowConflictsField = z
  .boolean()
  .optional()
  .openapi({
    description:
      'Save even if the trainer already has something at that time (*Toch opslaan*, PS-07). Left ' +
      'out or `false`, an overlap with a scheduled session of this workspace answers `409` with ' +
      'the code `trainer_conflict` and the sessions, and nothing is stored. Back-to-back ' +
      'sessions and cancelled sessions never overlap.',
  });

/** Where a trainer is needed: the time a save would put them in. */
export interface TrainerSlot {
  /** The trainer profile (not the team-member ID). */
  readonly trainerProfileId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The session the slot is for, when it exists already: it never conflicts with itself. */
  readonly sessionId?: string;
}

export type TrainerConflictAnswer = z.infer<typeof TrainerConflictSchema>;

/**
 * The `409` body for the slots a save would put trainers in, or `undefined` when none overlaps.
 * `moving` are sessions the save moves too (the dates of a series): they are not read at their old
 * time, only as the slot they get.
 */
export async function trainerConflictsOf(
  scope: WorkspaceScope,
  slots: readonly TrainerSlot[],
  moving: readonly string[] = [],
): Promise<TrainerConflictAnswer | undefined> {
  const leaving = new Set(moving);
  const found = new Map<string, TrainerSessionView>();
  const trainers = new Set(slots.map((slot) => slot.trainerProfileId));
  for (const trainerProfileId of trainers) {
    const own = slots.filter((slot) => slot.trainerProfileId === trainerProfileId);
    const from = new Date(Math.min(...own.map((slot) => slot.startsAt.getTime())));
    const to = new Date(Math.max(...own.map((slot) => slot.endsAt.getTime())));
    if (to.getTime() <= from.getTime()) continue;
    const pool = (await listTrainerSessionsBetween(scope, trainerProfileId, { from, to })).filter(
      (session) => !leaving.has(session.id),
    );
    for (const slot of own) {
      for (const session of findTrainerConflicts(
        pool,
        trainerProfileId,
        slot.startsAt,
        slot.endsAt,
        slot.sessionId,
      )) {
        found.set(session.id, session);
      }
    }
  }
  if (found.size === 0) return undefined;
  return {
    code: 'trainer_conflict',
    conflicts: [...found.values()]
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.endsAt.getTime() - b.endsAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((session) => ({
        sessionId: session.id,
        type: session.type,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        displayName: session.displayName,
        displayNameEn: session.displayNameEn,
      })),
  };
}

/**
 * Checks a save for double booking unless the caller allowed it. Returns the `409` body, after
 * recording `double_booking_warned`, or `undefined` when the save may go on. The event is tracked
 * at once, not after the commit: a `409` rolls the request back, and the warning is what it
 * measures. It holds the workspace ID and the surface only, the surface as for the other
 * scheduling events (the web sends no bearer token; an app names its surface, and one that names
 * none records nothing).
 */
export async function checkDoubleBooking(
  c: Context<WorkspaceEnv>,
  request: {
    allowConflicts: boolean | undefined;
    surface: 'ios' | 'android' | undefined;
    slots: readonly TrainerSlot[];
    moving?: readonly string[];
  },
): Promise<TrainerConflictAnswer | undefined> {
  if (request.allowConflicts === true || request.slots.length === 0) return undefined;
  const scope = c.get('scope');
  const conflict = await trainerConflictsOf(scope, request.slots, request.moving);
  if (!conflict) return undefined;
  const surface = c.req.header('authorization') ? request.surface : 'web';
  if (surface !== undefined) {
    c.get('dependencies').productEvents.track({
      event: 'double_booking_warned',
      distinctId: c.get('account').id,
      properties: { workspace_id: scope.workspaceId, surface },
    });
  }
  return conflict;
}

/**
 * How many of the slots the trainer already has something in (F023, the later dates a change from
 * a date on would put them on): one read of the trainer's sessions over the slots' window, the
 * rule applied to each slot. The slots' own sessions (`sessionId`) never conflict with themselves.
 */
export async function countConflictingSlots(
  scope: WorkspaceScope,
  slots: readonly TrainerSlot[],
): Promise<number> {
  if (slots.length === 0) return 0;
  const [first] = slots;
  if (!first) return 0;
  const from = new Date(Math.min(...slots.map((slot) => slot.startsAt.getTime())));
  const to = new Date(Math.max(...slots.map((slot) => slot.endsAt.getTime())));
  const pool = await listTrainerSessionsBetween(scope, first.trainerProfileId, { from, to });
  return slots.filter(
    (slot) =>
      findTrainerConflicts(pool, slot.trainerProfileId, slot.startsAt, slot.endsAt, slot.sessionId)
        .length > 0,
  ).length;
}
