import { createDatabase, type DatabaseClient, trainerProfiles } from '@fivvi/database';
import { addClient, addSession, addTeamRole, createWorkspace } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, groupClassWorld, setupGroupClassApi } from './group-classes-world.ts';

// F023 (spec #459): the isolation and the events of the double-booking check (ticket #535). Synthetic
// people: John (Owner of John's Gym, also trains), Sarah and Tom (Trainers), Sarah also Owner of
// "Sarah Personal Training", the clients Anna de Vries and Mark Jansen. Europe/Amsterdam; "now" is
// Monday 28 September 2026.

const amsterdam = (local: string) => zonedTime(local);

describe('F023 trainer assignment: the double-booking check', () => {
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

  async function world(overrides = {}) {
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
    return {
      ...people,
      anna,
      mark,
      profileOf,
      ...setupGroupClassApi(admin, app, overrides),
    };
  }

  const plan = (
    w: Awaited<ReturnType<typeof world>>,
    who: { id: string },
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
        trainerId: w.sarahRole.id,
        localDate: '2026-10-06',
        localStart: '18:00',
        durationMinutes: 60,
        notify: false,
        ...body,
      },
      headers,
    );

  it('AC4: Sarah’s session in Sarah Personal Training never shows up in John’s Gym: no 409, no name, no ID', async () => {
    const w = await world();
    // Sarah is also the Owner of her own business, with a client and a session at 18:00.
    const businessId = (await createWorkspace(admin.db, { label: 'sarah-personal-training' })).id;
    const sarahsOwnRole = await addTeamRole(admin.db, {
      workspaceId: businessId,
      accountId: w.sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    const secret = await addClient(admin.db, { workspaceId: businessId, name: 'Geheime Klant' });
    const hers = await addSession(admin.db, {
      workspaceId: businessId,
      clientId: secret.id,
      trainerProfileId: await w.profileOf(sarahsOwnRole.id),
      startsAt: amsterdam('2026-10-06T18:00'),
    });

    // John plans Anna with Sarah at the same time: nothing in John's Gym overlaps.
    const response = await plan(w, w.john, {});
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain(hers.id);
    expect(text).not.toContain('Geheime Klant');

    // With a real overlap in John's Gym, the 409 names only John's Gym's session.
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await w.profileOf(w.sarahRole.id),
      startsAt: amsterdam('2026-10-06T18:30'),
    });
    const refused = await plan(w, w.john, { localStart: '18:15' });
    expect(refused.status).toBe(409);
    const body = await refused.text();
    expect(body).toContain('Mark Jansen');
    expect(body).not.toContain(hers.id);
    expect(body).not.toContain('Geheime Klant');
    expect((JSON.parse(body) as { conflicts: unknown[] }).conflicts).toHaveLength(2);
  });

  describe('AC16: events carry no personal data', () => {
    it('AC16: double_booking_warned has the workspace ID and the surface only; a save that is allowed or does not overlap records nothing', async () => {
      const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      const posthog = createProductEventCaptureTransport();
      const productEvents = createProductEvents({
        env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
        transport: posthog,
        errorReporter: createErrorReporter({ env: {} }),
      });
      const w = await world({ productEvents });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        trainerProfileId: await w.profileOf(w.sarahRole.id),
        startsAt: amsterdam('2026-10-06T18:00'),
      });
      const bearer = { authorization: 'Bearer synthetic-token' };

      // No overlap, and an overlap that is allowed: nothing is recorded.
      await plan(w, w.john, { localStart: '19:00' });
      await plan(w, w.john, { allowConflicts: true });
      const warnings = () =>
        posthog.events.filter(({ event }) => event === 'double_booking_warned');
      expect(warnings()).toEqual([]);

      // The web (no bearer token), an app that names its surface, and an app that names none.
      expect((await plan(w, w.john, {})).status).toBe(409);
      expect((await plan(w, w.john, { surface: 'ios' }, bearer)).status).toBe(409);
      expect((await plan(w, w.john, { surface: 'android' }, bearer)).status).toBe(409);
      expect((await plan(w, w.john, {}, bearer)).status).toBe(409);

      expect(warnings()).toHaveLength(3);
      const properties = warnings().map((event) =>
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      );
      expect(properties).toEqual([
        { workspace_id: w.gym.id, surface: 'web' },
        { workspace_id: w.gym.id, surface: 'ios' },
        { workspace_id: w.gym.id, surface: 'android' },
      ]);
      expect(warnings()[0]?.distinct_id).toBe(w.john.id);
      const sent = JSON.stringify(warnings());
      for (const personal of [
        'Mark Jansen',
        'Anna de Vries',
        w.sarah.email,
        w.anna.id,
        '2026-10-06',
      ]) {
        expect(sent).not.toContain(personal);
      }
      for (const log of logs) log.mockRestore();
    });
  });
});
