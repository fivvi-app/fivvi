import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F020 (spec #425), #443: a client's upcoming sessions through the API (AC9, API part). Synthetic
// people: John (Owner of John's Gym), Sarah and Tom (Trainers), the clients Anna de Vries and Mark
// Jansen, Mike (Owner of Fit Studio). The API runs as the app role, so RLS applies.

// Thursday 17 September 2026, 12:00 in Amsterdam.
const NOW = '2026-09-17T10:00:00.000Z';

interface UpcomingBody {
  clientId: string;
  timeZone: string;
  sessions: {
    id: string;
    startsAt: string;
    endsAt: string;
    trainer?: { id: string; name: string };
  }[];
}

describe('F020 a client’s upcoming sessions', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 6 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const server = () =>
    createApp({
      ...NO_DEPENDENCIES,
      findSignedInAccount: async (headers) => {
        const id = headers.get('x-test-account');
        if (!id) return undefined;
        const [row] = await admin.db
          .select({
            id: authUsers.id,
            email: authUsers.email,
            name: authUsers.name,
            preferredLocale: authUsers.preferredLocale,
          })
          .from(authUsers)
          .where(eq(authUsers.id, id));
        return row satisfies SignedInAccount | undefined;
      },
      tenantScopes: createTenantScopes(() => app.db),
      clock: manualClock(NOW),
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const named = async (label: string, name: string) => {
      const account = await createAccount(admin.db, { label });
      await admin.db.update(authUsers).set({ name }).where(eq(authUsers.id, account.id));
      return account;
    };
    const john = await named('john', 'John');
    const sarah = await named('sarah', 'Sarah');
    const tom = await named('tom', 'Tom');
    const mike = await createAccount(admin.db, { label: 'mike' });
    const annaAccount = await createAccount(admin.db, { label: 'anna-account' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    const sarahRole = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, sarahRole.id));
    const anna = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Anna de Vries',
      accountId: annaAccount.id,
    });
    const mark = await addClient(admin.db, { workspaceId: gym.id, name: 'Mark Jansen' });
    const otherClient = await addClient(admin.db, { workspaceId: other.id });
    return {
      gym,
      other,
      john,
      sarah,
      tom,
      mike,
      annaAccount,
      sarahRole,
      sarahProfile: profile?.id ?? null,
      anna,
      mark,
      otherClient,
    };
  }

  const upcoming = (workspaceId: string, clientId: string, who?: { id: string }) =>
    server().request(`/v1/workspaces/${workspaceId}/clients/${clientId}/upcoming-sessions`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const hours = (count: number) => new Date(Date.parse(NOW) + count * 3_600_000);

  it('AC9: next sessions in order: Anna’s three upcoming ones, the past one left out', async () => {
    const { gym, tom, anna, mark, sarahProfile } = await world();
    const plan = (clientId: string, startsAt: Date, extra: Record<string, unknown> = {}) =>
      addSession(admin.db, {
        workspaceId: gym.id,
        clientId,
        trainerProfileId: sarahProfile,
        startsAt,
        ...extra,
      });
    const later = await plan(anna.id, hours(24 * 9));
    const soon = await plan(anna.id, hours(24 * 2));
    const middle = await plan(anna.id, hours(24 * 5), { durationMinutes: 90 });
    await plan(anna.id, hours(-24)); // the past one
    await plan(anna.id, hours(24 * 3), { status: 'cancelled' });
    await plan(mark.id, hours(24)); // another client's

    // Tom (Trainer) may see every client's sessions in the workspace.
    const response = await upcoming(gym.id, anna.id, tom);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientId: anna.id,
      timeZone: 'Europe/Amsterdam',
      sessions: [
        {
          id: soon.id,
          startsAt: hours(48).toISOString(),
          endsAt: hours(49).toISOString(),
          trainer: { id: expect.any(String), name: expect.any(String) },
        },
        {
          id: middle.id,
          startsAt: hours(120).toISOString(),
          endsAt: hours(121.5).toISOString(),
          trainer: { id: expect.any(String), name: expect.any(String) },
        },
        {
          id: later.id,
          startsAt: hours(216).toISOString(),
          endsAt: hours(217).toISOString(),
          trainer: { id: expect.any(String), name: expect.any(String) },
        },
      ],
    });
  });

  it('shows the trainer’s name, and no trainer for a session whose trainer is gone', async () => {
    const { gym, john, anna, sarahRole, sarahProfile } = await world();
    await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      trainerProfileId: sarahProfile,
      startsAt: hours(24),
    });
    await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      trainerProfileId: null,
      startsAt: hours(48),
    });

    const body = (await (await upcoming(gym.id, anna.id, john)).json()) as UpcomingBody;

    expect(body.sessions[0]?.trainer).toEqual({ id: sarahRole.id, name: 'Sarah' });
    expect(body.sessions[1]).not.toHaveProperty('trainer');
  });

  it('AC9: lists the next five only', async () => {
    const { gym, john, anna, sarahProfile } = await world();
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      await addSession(admin.db, {
        workspaceId: gym.id,
        clientId: anna.id,
        trainerProfileId: sarahProfile,
        startsAt: hours(24 * day),
      });
    }

    const body = (await (await upcoming(gym.id, anna.id, john)).json()) as UpcomingBody;

    expect(body.sessions.map(({ startsAt }) => startsAt)).toEqual(
      [1, 2, 3, 4, 5].map((day) => hours(24 * day).toISOString()),
    );
  });

  it('AC9: a client without sessions gets an empty list', async () => {
    const { gym, john, mark } = await world();

    const response = await upcoming(gym.id, mark.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientId: mark.id,
      timeZone: 'Europe/Amsterdam',
      sessions: [],
    });
  });

  it('AC11: another workspace gets 404, anonymous 401, Anna’s own account 403; a client of another workspace is 404', async () => {
    const { gym, other, john, mike, annaAccount, anna, otherClient } = await world();

    expect((await upcoming(gym.id, anna.id, mike)).status).toBe(404);
    expect((await upcoming(gym.id, anna.id)).status).toBe(401);
    expect((await upcoming(gym.id, anna.id, annaAccount)).status).toBe(403);
    // A client ID of another workspace is no client of this one.
    const foreign = await upcoming(gym.id, otherClient.id, john);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ code: 'not_found' });
    expect((await upcoming(other.id, otherClient.id, mike)).status).toBe(200);
  });

  it('AC11: a client ID that is none is a validation error, not a leak', async () => {
    const { gym, john } = await world();

    const response = await upcoming(gym.id, 'not-a-uuid', john);

    expect(response.status).toBe(400);
  });
});
