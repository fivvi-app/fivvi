import { readFileSync } from 'node:fs';
import {
  classSeries,
  createDatabase,
  type DatabaseClient,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import { addClient, addSession } from '@fivvi/database/testing';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
  updateDate,
} from './group-classes-world.ts';

// F023 (spec #459), first ticket (#535): the double-booking check through the API. Synthetic people:
// John (Owner of John's Gym, also trains), Sarah and Tom (Trainers), the clients Anna de Vries and
// Mark Jansen, Mike (Owner of Fit Studio). Tom has Mark on Thursday 8 October 2026, 09:00 to 10:00
// (Europe/Amsterdam). "Now" is Monday 28 September 2026.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface ConflictBody {
  code: string;
  conflicts: {
    sessionId: string;
    type: string;
    startsAt: string;
    endsAt: string;
    displayName: string;
  }[];
}

const amsterdam = (local: string) => zonedTime(local).toISOString();

describe('F023 the double-booking check through the API', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 12 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** John's Gym as the group class tests have it, with Anna and Mark as clients and Mark booked with Tom. */
  async function world(options: { markStatus?: 'scheduled' | 'cancelled' } = {}) {
    const people = await groupClassWorld(admin);
    const anna = await addClient(admin.db, { workspaceId: people.gym.id, name: 'Anna de Vries' });
    const mark = await addClient(admin.db, { workspaceId: people.gym.id, name: 'Mark Jansen' });
    const profileOf = async (teamMemberId: string) => {
      const [profile] = await admin.db
        .select({ id: trainerProfiles.id })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.teamMemberId, teamMemberId));
      if (!profile) throw new Error('No trainer profile.');
      return profile.id;
    };
    const tomProfile = await profileOf(people.tomRole.id);
    const sarahProfile = await profileOf(people.sarahRole.id);
    const marksSession = await addSession(admin.db, {
      workspaceId: people.gym.id,
      clientId: mark.id,
      trainerProfileId: tomProfile,
      startsAt: new Date(amsterdam('2026-10-08T09:00')),
      status: options.markStatus ?? 'scheduled',
    });
    return {
      ...people,
      anna,
      mark,
      tomProfile,
      sarahProfile,
      marksSession,
      ...setupGroupClassApi(admin, app),
    };
  }

  const stored = (workspaceId: string) =>
    admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.organizationId, workspaceId))
      .orderBy(asc(sessions.startsAt), asc(sessions.id));

  const planFor = (
    w: Awaited<ReturnType<typeof world>>,
    who: { id: string } | undefined,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) =>
    call(
      w.server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/private`,
      who,
      {
        clientId: w.anna.id,
        trainerId: w.tomRole.id,
        localDate: '2026-10-08',
        localStart: '09:30',
        durationMinutes: 60,
        notify: false,
        ...body,
      },
      headers,
    );

  const conflictWithMark = (w: Awaited<ReturnType<typeof world>>): ConflictBody => ({
    code: 'trainer_conflict',
    conflicts: [
      {
        sessionId: w.marksSession.id,
        type: 'private',
        startsAt: amsterdam('2026-10-08T09:00'),
        endsAt: amsterdam('2026-10-08T10:00'),
        displayName: 'Mark Jansen',
      },
    ],
  });

  describe('AC5: planning a private session', () => {
    it('AC5: Anna at 09:30 for Tom overlaps Mark 09:00 to 10:00: 409 trainer_conflict naming Mark, and nothing is stored', async () => {
      const w = await world();

      const response = await planFor(w, w.john, {});

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(conflictWithMark(w));
      expect(await stored(w.gym.id)).toHaveLength(1);
    });

    it('AC5: 10:00 to 11:00 right after Mark does not conflict', async () => {
      const w = await world();

      const response = await planFor(w, w.john, { localStart: '10:00' });

      expect(response.status).toBe(201);
      expect(await stored(w.gym.id)).toHaveLength(2);
    });

    it('AC7: with allowConflicts it saves, and both sessions are there', async () => {
      const w = await world();

      const response = await planFor(w, w.john, { allowConflicts: true });

      expect(response.status).toBe(201);
      expect(await stored(w.gym.id)).toHaveLength(2);
    });

    it('AC7: allowConflicts false is the same as leaving it out', async () => {
      const w = await world();

      expect((await planFor(w, w.john, { allowConflicts: false })).status).toBe(409);
    });

    it('AC7: a cancelled session never conflicts', async () => {
      const w = await world({ markStatus: 'cancelled' });

      expect((await planFor(w, w.john, {})).status).toBe(201);
    });

    it('AC7: another trainer’s session at the same time is no conflict', async () => {
      const w = await world();

      expect((await planFor(w, w.john, { trainerId: w.sarahRole.id })).status).toBe(201);
    });

    it('AC6: a Trainer planning for themself overlapping their own session gets the same 409; the check is on the save, so a stale form warns too', async () => {
      const w = await world();

      const response = await planFor(w, w.tom, { trainerId: undefined });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(conflictWithMark(w));
    });

    it('AC7: a refusal that comes first (unknown client, 403 for another trainer) is not hidden by the check', async () => {
      const w = await world();

      expect((await planFor(w, w.tom, { trainerId: w.sarahRole.id })).status).toBe(403);
      expect((await planFor(w, w.john, { clientId: crypto.randomUUID() })).status).toBe(404);
    });

    it('AC7: the 409 names every overlapping session, soonest first, class dates by their class', async () => {
      const w = await world();
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, kracht(w.tomRole.id))
      ).json()) as CreatedClassBody;
      await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-08',
        localStart: '09:45',
        allowConflicts: true,
      });

      const response = await planFor(w, w.john, { localStart: '09:30', durationMinutes: 120 });

      expect(response.status).toBe(409);
      const body = (await response.json()) as ConflictBody;
      expect(body.conflicts.map(({ type, displayName }) => [type, displayName])).toEqual([
        ['private', 'Mark Jansen'],
        ['group', 'Kracht'],
      ]);
    });
  });

  describe('AC7: rescheduling a private session', () => {
    const reschedule = (
      w: Awaited<ReturnType<typeof world>>,
      sessionId: string,
      body: Record<string, unknown>,
    ) =>
      call(
        w.server,
        'POST',
        `/v1/workspaces/${w.gym.id}/sessions/${sessionId}/reschedule`,
        w.john,
        {
          localDate: '2026-10-08',
          localStart: '09:30',
          durationMinutes: 60,
          notify: false,
          version: 1,
          ...body,
        },
      );

    /** Tom's session with Anna on Friday 9 October 2026, 09:00 to 10:00. */
    const tomsSession = (w: Awaited<ReturnType<typeof world>>) =>
      addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.anna.id,
        trainerProfileId: w.tomProfile,
        startsAt: new Date(amsterdam('2026-10-09T09:00')),
      });

    it('AC7: moving it onto Mark’s hour answers 409 trainer_conflict and the session stays', async () => {
      const w = await world();
      const session = await tomsSession(w);

      const response = await reschedule(w, session.id, {});

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(conflictWithMark(w));
      const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(row?.startsAt.toISOString()).toBe(amsterdam('2026-10-09T09:00'));
      expect(row?.version).toBe(1);
    });

    it('AC7: with allowConflicts it moves', async () => {
      const w = await world();
      const session = await tomsSession(w);

      const response = await reschedule(w, session.id, { allowConflicts: true });

      expect(response.status).toBe(200);
      const moved = (await response.json()) as { session: SessionBody };
      expect(moved.session.startsAt).toBe(amsterdam('2026-10-08T09:30'));
    });

    it('AC7: a session never conflicts with its own old time', async () => {
      const w = await world();
      const session = await tomsSession(w);

      const response = await reschedule(w, session.id, {
        localDate: '2026-10-09',
        localStart: '09:30',
      });

      expect(response.status).toBe(200);
    });

    it('AC7: a stale form still gets the version 409 first, with the reloaded session', async () => {
      const w = await world();
      const session = await tomsSession(w);

      const response = await reschedule(w, session.id, { version: 7 });

      expect(response.status).toBe(409);
      expect(((await response.json()) as { code: string }).code).toBe('session_changed');
    });

    it('AC7: a session without a trainer has nobody to double-book', async () => {
      const w = await world();
      const session = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.anna.id,
        trainerProfileId: null,
        startsAt: new Date(amsterdam('2026-10-09T09:00')),
      });

      expect((await reschedule(w, session.id, {})).status).toBe(200);
    });
  });

  describe('AC7: classes on dates', () => {
    async function aClassWithTom(w: Awaited<ReturnType<typeof world>>) {
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, kracht(w.tomRole.id))
      ).json()) as CreatedClassBody;
      return groupClass;
    }

    it('AC7: putting the class on a date at 09:30 for Tom answers 409; with allowConflicts it is scheduled', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);
      const date = { localDate: '2026-10-08', localStart: '09:30' };

      const refused = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, date);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual(conflictWithMark(w));
      expect(await stored(w.gym.id)).toHaveLength(1);

      const saved = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        ...date,
        allowConflicts: true,
      });
      expect(saved.status).toBe(201);
      expect(await stored(w.gym.id)).toHaveLength(2);
    });

    it('AC7: a date for *Trainer nodig* has no one to double-book', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);

      const response = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-08',
        localStart: '09:30',
        trainerId: null,
      });

      expect(response.status).toBe(201);
    });

    it('AC7: a weekly repeat checks all 12 dates: one overlap on 20 October answers 409 and creates no series; allowConflicts makes all 12', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);
      const other = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.anna.id,
        trainerProfileId: w.tomProfile,
        startsAt: new Date(amsterdam('2026-10-20T18:30')),
      });
      const weekly = { localDate: '2026-10-06', localStart: '18:00', repeat: 'weekly' };

      const refused = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, weekly);
      expect(refused.status).toBe(409);
      const body = (await refused.json()) as ConflictBody;
      expect(body.conflicts.map((item) => item.sessionId)).toEqual([other.id]);
      expect(await admin.db.select().from(classSeries)).toEqual([]);
      expect(await stored(w.gym.id)).toHaveLength(2);

      const saved = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        ...weekly,
        allowConflicts: true,
      });
      expect(saved.status).toBe(201);
      expect(((await saved.json()) as { datesAdded: number }).datesAdded).toBe(12);
    });

    it('AC7: creating a class with a first date follows the same rule, and a refused date leaves no class behind', async () => {
      const w = await world();
      const body = {
        ...kracht(w.tomRole.id),
        firstDate: { localDate: '2026-10-08', localStart: '09:30' },
      };

      const refused = await createClass(w.server, w.gym.id, w.john, body);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual(conflictWithMark(w));
      const listed = await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/group-classes`,
        w.john,
      );
      expect(await listed.json()).toEqual([]);

      const saved = await createClass(w.server, w.gym.id, w.john, {
        ...body,
        allowConflicts: true,
      });
      expect(saved.status).toBe(201);
    });

    it('AC7: editing one date: a new start that overlaps answers 409; allowConflicts saves; a capacity change alone is never checked', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);
      const date = (await (
        await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
          localDate: '2026-10-08',
          localStart: '12:00',
        })
      ).json()) as SessionBody;

      const refused = await updateDate(w.server, w.gym.id, date.id, w.john, {
        version: 1,
        localStart: '09:30',
        localEnd: '10:30',
      });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual(conflictWithMark(w));

      const saved = await updateDate(w.server, w.gym.id, date.id, w.john, {
        version: 1,
        localStart: '09:30',
        localEnd: '10:30',
        allowConflicts: true,
      });
      expect(saved.status).toBe(200);

      // The overlap exists now; changing the capacity alone does not warn about it again.
      const capacity = await updateDate(w.server, w.gym.id, date.id, w.john, {
        version: 2,
        capacity: 5,
      });
      expect(capacity.status).toBe(200);
    });

    it('AC7: this and following checks every date it moves: Tom’s private session on 20 October at 18:30 blocks moving Kracht to 18:30 from 13 October', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);
      const first = (await (
        await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
          localDate: '2026-10-06',
          localStart: '18:00',
          repeat: 'weekly',
        })
      ).json()) as SessionBody;
      const thirteenth = (
        await admin.db
          .select()
          .from(sessions)
          .where(
            and(eq(sessions.organizationId, w.gym.id), eq(sessions.occurrenceDate, '2026-10-13')),
          )
      )[0];
      const other = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.anna.id,
        trainerProfileId: w.tomProfile,
        startsAt: new Date(amsterdam('2026-10-20T18:30')),
      });
      expect(first.version).toBe(1);

      const edit = { version: 1, localStart: '18:30', localEnd: '19:30', scope: 'following' };
      const refused = await updateDate(w.server, w.gym.id, thirteenth?.id ?? '', w.john, edit);
      expect(refused.status).toBe(409);
      const body = (await refused.json()) as ConflictBody;
      expect(body.conflicts.map((item) => item.sessionId)).toEqual([other.id]);
      // Nothing moved.
      const [unchanged] = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, thirteenth?.id ?? ''));
      expect(unchanged?.startsAt.toISOString()).toBe(amsterdam('2026-10-13T18:00'));

      const saved = await updateDate(w.server, w.gym.id, thirteenth?.id ?? '', w.john, {
        ...edit,
        allowConflicts: true,
      });
      expect(saved.status).toBe(200);
    });

    it('AC7: a cancelled date of the series is not checked, as it does not move', async () => {
      const w = await world();
      const groupClass = await aClassWithTom(w);
      await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
        repeat: 'weekly',
      });
      const twentieth = (
        await admin.db
          .select()
          .from(sessions)
          .where(
            and(eq(sessions.organizationId, w.gym.id), eq(sessions.occurrenceDate, '2026-10-20')),
          )
      )[0];
      const thirteenth = (
        await admin.db
          .select()
          .from(sessions)
          .where(
            and(eq(sessions.organizationId, w.gym.id), eq(sessions.occurrenceDate, '2026-10-13')),
          )
      )[0];
      await admin.db
        .update(sessions)
        .set({ status: 'cancelled' })
        .where(eq(sessions.id, twentieth?.id ?? ''));
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.anna.id,
        trainerProfileId: w.tomProfile,
        startsAt: new Date(amsterdam('2026-10-20T18:30')),
        status: 'cancelled',
      });

      const response = await updateDate(w.server, w.gym.id, thirteenth?.id ?? '', w.john, {
        version: 1,
        localStart: '18:30',
        localEnd: '19:30',
        scope: 'following',
      });

      expect(response.status).toBe(200);
    });
  });

  it('AC15: every scheduling route has the 409 trainer_conflict and takes allowConflicts in the committed contract', () => {
    const routes = [
      ['/v1/workspaces/{workspaceId}/sessions/private', 'post'],
      ['/v1/workspaces/{workspaceId}/sessions/{sessionId}/reschedule', 'post'],
      ['/v1/workspaces/{workspaceId}/group-classes', 'post'],
      ['/v1/workspaces/{workspaceId}/group-classes/{classId}/dates', 'post'],
      ['/v1/workspaces/{workspaceId}/sessions/{sessionId}', 'patch'],
    ] as const;
    const schemas = contract.components.schemas;
    expect(schemas.TrainerConflict.properties.code.enum).toEqual(['trainer_conflict']);
    for (const [path, method] of routes) {
      const operation = contract.paths[path][method];
      const answered = JSON.stringify(operation.responses['409']);
      expect(answered, `${method} ${path}`).toContain('TrainerConflict');
      const body = JSON.stringify(operation.requestBody);
      expect(body, `${method} ${path}`).toBeTruthy();
    }
    for (const request of [
      'PlanPrivateSessionRequest',
      'ReschedulePrivateSessionRequest',
      'CreateGroupClassRequest',
      'ScheduleGroupClassDateRequest',
      'UpdateGroupClassDateRequest',
    ]) {
      expect(schemas[request].properties.allowConflicts.type, request).toBe('boolean');
      expect(schemas[request].required ?? [], request).not.toContain('allowConflicts');
    }
  });
});
