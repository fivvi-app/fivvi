import { and, asc, eq, sql } from 'drizzle-orm';
import {
  authUsers,
  groupClasses,
  sessions,
  teamMembers,
  trainerProfiles,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import { findSession, type SessionView } from './sessions.ts';

// The group classes of a workspace and their dates (F021, spec #427), through a workspace scope.
// A class is what the workspace teaches (a name in Dutch and optionally English, a description, the
// usual trainer, capacity and duration); a class on a date is a `sessions` row of type `group` of
// the one engine (F020). The rules (limits, copying the class's defaults, wall-clock time to UTC
// with daylight saving time) are in `packages/domain` (`scheduleClassOnDate`,
// `decideGroupDateEdit`); these functions store and read what the rules decided.

/** A class as the team sees it. */
export interface GroupClassView {
  readonly id: string;
  readonly nameNl: string;
  /** `null` without an English name. */
  readonly nameEn: string | null;
  readonly descriptionNl: string | null;
  readonly descriptionEn: string | null;
  readonly capacity: number;
  readonly durationMinutes: number;
  /** The trainer profile (`findTrainer`), what `default_trainer_profile_id` holds; `null` for *Trainer nodig*. */
  readonly defaultTrainerProfileId: string | null;
  /** The usual trainer: the team-member ID (what the API calls a trainer) and the account's name; `null` for *Trainer nodig*. */
  readonly defaultTrainer: { readonly id: string; readonly name: string } | null;
}

/** What a new class is made of: texts already trimmed (an empty one is `null`) and within the limits. */
export interface NewGroupClass {
  readonly nameNl: string;
  readonly nameEn: string | null;
  readonly descriptionNl: string | null;
  readonly descriptionEn: string | null;
  /** The trainer profile (`findTrainer`), not the team-member ID; `null` for *Trainer nodig*. */
  readonly defaultTrainerProfileId: string | null;
  readonly capacity: number;
  readonly durationMinutes: number;
}

/** The fields of a class to change: a field left out stays, `null` clears an optional one. */
export type GroupClassChanges = Partial<NewGroupClass>;

const classColumns = {
  id: groupClasses.id,
  nameNl: groupClasses.nameNl,
  nameEn: groupClasses.nameEn,
  descriptionNl: groupClasses.descriptionNl,
  descriptionEn: groupClasses.descriptionEn,
  capacity: groupClasses.capacity,
  durationMinutes: groupClasses.durationMinutes,
  defaultTrainerProfileId: groupClasses.defaultTrainerProfileId,
  trainerTeamMemberId: teamMembers.id,
  trainerName: authUsers.name,
};

interface ClassRow {
  readonly id: string;
  readonly nameNl: string;
  readonly nameEn: string | null;
  readonly descriptionNl: string | null;
  readonly descriptionEn: string | null;
  readonly capacity: number;
  readonly durationMinutes: number;
  readonly defaultTrainerProfileId: string | null;
  readonly trainerTeamMemberId: string | null;
  readonly trainerName: string | null;
}

function viewOf(row: ClassRow): GroupClassView {
  const { trainerTeamMemberId, trainerName, ...rest } = row;
  return {
    ...rest,
    defaultTrainer:
      trainerTeamMemberId === null ? null : { id: trainerTeamMemberId, name: trainerName ?? '' },
  };
}

/** The classes of the scope's workspace with their usual trainer; the base of every read. */
function selectClasses(scope: WorkspaceScope) {
  return executorOf(scope)
    .select(classColumns)
    .from(groupClasses)
    .leftJoin(
      trainerProfiles,
      and(
        eq(trainerProfiles.organizationId, groupClasses.organizationId),
        eq(trainerProfiles.id, groupClasses.defaultTrainerProfileId),
      ),
    )
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .leftJoin(authUsers, eq(authUsers.id, teamMembers.accountId));
}

/** The classes of the scope's workspace, by Dutch name (then ID, so the order is stable). */
export async function listGroupClasses(scope: WorkspaceScope): Promise<GroupClassView[]> {
  const rows = await selectClasses(scope)
    .where(eq(groupClasses.organizationId, scope.workspaceId))
    .orderBy(asc(sql`lower(${groupClasses.nameNl})`), asc(groupClasses.id));
  return rows.map(viewOf);
}

/** One class of the scope's workspace; `undefined` when the workspace has no such class. */
export async function findGroupClass(
  scope: WorkspaceScope,
  classId: string,
): Promise<GroupClassView | undefined> {
  const [row] = await selectClasses(scope)
    .where(and(eq(groupClasses.organizationId, scope.workspaceId), eq(groupClasses.id, classId)))
    .limit(1);
  return row ? viewOf(row) : undefined;
}

/** Stores a class of the scope's workspace and returns it as `findGroupClass` shows it. */
export async function createGroupClass(
  scope: WorkspaceScope,
  input: NewGroupClass,
): Promise<GroupClassView> {
  const [created] = await executorOf(scope)
    .insert(groupClasses)
    .values({ organizationId: scope.workspaceId, ...input })
    .returning({ id: groupClasses.id });
  if (!created) throw new Error('The class was not stored.');
  const stored = await findGroupClass(scope, created.id);
  if (!stored) throw new Error('The class was not found after it was stored.');
  return stored;
}

/**
 * Changes the fields given of a class of the scope's workspace and returns it; `undefined` when the
 * workspace has no such class. Dates already planned keep their copies (AC9).
 */
export async function updateGroupClass(
  scope: WorkspaceScope,
  classId: string,
  changes: GroupClassChanges,
): Promise<GroupClassView | undefined> {
  const defined = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(defined).length > 0) {
    const updated = await executorOf(scope)
      .update(groupClasses)
      .set(defined)
      .where(and(eq(groupClasses.organizationId, scope.workspaceId), eq(groupClasses.id, classId)))
      .returning({ id: groupClasses.id });
    if (updated.length === 0) return undefined;
  }
  return findGroupClass(scope, classId);
}

/** What a class on a date is made of: the decisions of `scheduleClassOnDate`. */
export interface NewClassDate {
  readonly groupClassId: string;
  /** The trainer profile (`findTrainer`); `null` for *Trainer nodig*. */
  readonly trainerProfileId: string | null;
  readonly locationId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  /** The team-member record of the person who plans it; `null` for none. */
  readonly createdByTeamMemberId: string | null;
}

/**
 * Stores a class on a date of the scope's workspace (a `group` session, version 1, `scheduled`,
 * no participants) and returns it as `findSession` shows it. The caller has decided it is allowed
 * (`scheduleClassOnDate`) and that the class is the workspace's.
 */
export async function createClassDate(
  scope: WorkspaceScope,
  input: NewClassDate,
): Promise<SessionView> {
  const [created] = await executorOf(scope)
    .insert(sessions)
    .values({
      organizationId: scope.workspaceId,
      type: 'group',
      groupClassId: input.groupClassId,
      trainerProfileId: input.trainerProfileId,
      locationId: input.locationId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      createdByTeamMemberId: input.createdByTeamMemberId,
    })
    .returning({ id: sessions.id });
  if (!created) throw new Error('The session was not stored.');
  const session = await findSession(scope, created.id);
  if (!session) throw new Error('The session was not found after it was stored.');
  return session;
}

/** What one date of a class changes to: the decisions of `decideGroupDateEdit`. */
export interface ClassDateChanges {
  /** The version the writer read: the change applies only if it is still the current one. */
  readonly version: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
}

export type ClassDateUpdate =
  | { readonly outcome: 'updated'; readonly session: SessionView }
  /** The workspace has no class date with that ID (a private session is none). */
  | { readonly outcome: 'not-found' }
  /** The session changed since the writer read it; nothing was written. */
  | { readonly outcome: 'stale' };

/**
 * Changes the start, end and capacity of one class date of the scope's workspace and raises its
 * version, when the version is still the one the writer read (optimistic concurrency: the check is
 * in the `UPDATE`, so two saves from the same version cannot both win). The class is untouched.
 */
export async function updateClassDate(
  scope: WorkspaceScope,
  sessionId: string,
  changes: ClassDateChanges,
): Promise<ClassDateUpdate> {
  const updated = await executorOf(scope)
    .update(sessions)
    .set({
      startsAt: changes.startsAt,
      endsAt: changes.endsAt,
      capacity: changes.capacity,
      version: sql`${sessions.version} + 1`,
    })
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        eq(sessions.id, sessionId),
        eq(sessions.type, 'group'),
        eq(sessions.version, changes.version),
      ),
    )
    .returning({ id: sessions.id });
  if (updated.length === 0) {
    const [existing] = await executorOf(scope)
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.organizationId, scope.workspaceId),
          eq(sessions.id, sessionId),
          eq(sessions.type, 'group'),
        ),
      )
      .limit(1);
    return existing ? { outcome: 'stale' } : { outcome: 'not-found' };
  }
  const session = await findSession(scope, sessionId);
  if (!session) throw new Error('The session was not found after it was changed.');
  return { outcome: 'updated', session };
}
