// The double-booking rule (F023, spec #459, Q24): a trainer can be in one place at a time. It is
// a warning, never a block: a route answers `409 trainer_conflict` with these sessions and saves
// anyway when the caller sends `allowConflicts`. One place, on the server, so the web and both apps
// warn the same way (user story 15). Pure: the caller reads the sessions of the workspace it is in
// and nothing else, so a trainer's sessions in another workspace never reach the rule (AC4).

/** What the rule needs to know of a session; a caller may carry more (a name) and gets it back. */
export interface TrainerBusySession {
  readonly id: string;
  readonly type: 'private' | 'group' | 'open_gym';
  readonly status: 'scheduled' | 'cancelled';
  /** The trainer profile the session points at; `null` for a session without a trainer. */
  readonly trainerProfileId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * The sessions in `workspaceSessions` that the trainer already has at `[start, end)`, soonest
 * first. Intervals are half-open, so back-to-back sessions (one ends when the next starts) do not
 * overlap; only `scheduled` sessions count, a cancelled one never does; `excludeSessionId` is the
 * session being saved (a move does not conflict with its old self). The caller passes the sessions
 * of one workspace.
 */
export function findTrainerConflicts<T extends TrainerBusySession>(
  workspaceSessions: readonly T[],
  trainerProfileId: string,
  start: Date,
  end: Date,
  excludeSessionId?: string,
): T[] {
  // An empty or inverted window holds no time.
  if (end.getTime() <= start.getTime()) return [];
  return workspaceSessions
    .filter(
      (session) =>
        session.status === 'scheduled' &&
        session.trainerProfileId === trainerProfileId &&
        session.id !== excludeSessionId &&
        session.startsAt.getTime() < end.getTime() &&
        start.getTime() < session.endsAt.getTime(),
    )
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.endsAt.getTime() - b.endsAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}
