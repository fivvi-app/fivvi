import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  trainerProfiles,
} from '@fivvi/database';
import { addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F050 (spec #492, ticket #1025): the account's booking-emails setting through the API. It
// belongs to the account, not to a workspace, and is on until the person switches it off.
// Synthetic people: Sarah is a Trainer of John's Gym and the Owner of her own workspace; John is
// the Owner of John's Gym and trains there.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

describe('F050 bookingEmails on GET and PATCH /v1/me', () => {
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

  const api = (overrides: Partial<ApiDependencies> = {}) =>
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
      ...overrides,
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
    await admin.db.update(authUsers).set({ name: 'Sarah' }).where(eq(authUsers.id, sarah.id));
    await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
      trainsHere: true,
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });
    return { gym, own, john, sarah };
  }

  const patch = (who: { id: string } | undefined, body: unknown, server = api()) =>
    server.request('/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(who ? { 'x-test-account': who.id } : {}) },
      body: JSON.stringify(body),
    });

  const me = async (who: { id: string }) =>
    (await (await api().request('/v1/me', { headers: { 'x-test-account': who.id } })).json()) as {
      name: string | null;
      preferredLocale: string | null;
      bookingEmails: boolean;
    };

  const stored = async (id: string) =>
    (await admin.db.select().from(authUsers).where(eq(authUsers.id, id)))[0];

  it('AC6: a new account has booking emails on, before it ever changed the setting', async () => {
    const { sarah } = await world();

    expect((await me(sarah)).bookingEmails).toBe(true);
    expect((await stored(sarah.id))?.bookingEmails).toBe(true);
  });

  it('AC6: false after switching off, true again after switching back, from every workspace', async () => {
    const { gym, own, sarah } = await world();

    const off = await patch(sarah, { bookingEmails: false });
    expect(off.status).toBe(200);
    expect(((await off.json()) as { bookingEmails: boolean }).bookingEmails).toBe(false);
    expect((await me(sarah)).bookingEmails).toBe(false);
    // The setting is on the account: the same answer whatever workspace she looks from.
    for (const workspace of [gym, own]) {
      const listed = await api().request(`/v1/workspaces/${workspace.id}/trainers`, {
        headers: { 'x-test-account': sarah.id },
      });
      expect(listed.status).toBe(200);
      expect((await me(sarah)).bookingEmails).toBe(false);
    }

    const on = await patch(sarah, { bookingEmails: true });
    expect(((await on.json()) as { bookingEmails: boolean }).bookingEmails).toBe(true);
    expect((await me(sarah)).bookingEmails).toBe(true);
  });

  it('AC6: only the signed-in account changes', async () => {
    const { john, sarah } = await world();

    await patch(sarah, { bookingEmails: false });

    expect((await me(john)).bookingEmails).toBe(true);
    expect((await stored(john.id))?.bookingEmails).toBe(true);
  });

  it('AC6: name, language and "I train here too" stay as they were', async () => {
    const { gym, john } = await world();
    await patch(john, { preferredLocale: 'en' });
    const trainsBefore = await admin.db
      .select({ id: trainerProfiles.teamMemberId })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.organizationId, gym.id));

    const res = await patch(john, { bookingEmails: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'John',
      preferredLocale: 'en',
      bookingEmails: false,
    });
    expect(
      await admin.db
        .select({ id: trainerProfiles.teamMemberId })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.organizationId, gym.id)),
    ).toEqual(trainsBefore);
    expect(trainsBefore).toHaveLength(2);
  });

  it('AC6: a name or language change leaves the setting as it was', async () => {
    const { sarah } = await world();
    await patch(sarah, { bookingEmails: false });

    await patch(sarah, { name: 'Sarah de Vries', preferredLocale: 'nl-NL' });

    expect(await me(sarah)).toMatchObject({
      name: 'Sarah de Vries',
      preferredLocale: 'nl-NL',
      bookingEmails: false,
    });
  });

  it('AC6: the setting can change together with the other fields', async () => {
    const { sarah } = await world();

    const res = await patch(sarah, { name: 'Sarah B', bookingEmails: false });

    expect(await res.json()).toMatchObject({ name: 'Sarah B', bookingEmails: false });
  });

  it.each([
    ['text', 'false'],
    ['a number', 0],
    ['null', null],
    ['an object', {}],
  ])('AC6: %s is not a boolean, answers 400 and nothing changes', async (_, value) => {
    const { sarah } = await world();

    const res = await patch(sarah, { bookingEmails: value });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; issues: { path: string }[] };
    expect(json.code).toBe('validation_failed');
    expect(json.issues).toMatchObject([{ path: 'bookingEmails' }]);
    expect((await stored(sarah.id))?.bookingEmails).toBe(true);
  });

  it('@permission AC6: nobody signed in gets 401, on GET and on PATCH', async () => {
    expect((await patch(undefined, { bookingEmails: false })).status).toBe(401);
    expect((await api().request('/v1/me')).status).toBe(401);
  });

  it('AC9: bookingEmails is in the contract, on the response and on the request', () => {
    const { MeResponse, UpdateMeRequest } = contract.components.schemas;

    expect(MeResponse.properties.bookingEmails).toMatchObject({ type: 'boolean' });
    expect(MeResponse.required).toContain('bookingEmails');
    expect(UpdateMeRequest.properties.bookingEmails).toMatchObject({ type: 'boolean' });
    expect(UpdateMeRequest.required ?? []).not.toContain('bookingEmails');
  });

  it('AC9: no product event for the switch, and nothing of it in a log', async () => {
    const lines: string[] = [];
    const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi
        .spyOn(console, level)
        .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const { sarah } = await world();

    const res = await patch(sarah, { bookingEmails: false }, api({ productEvents }));
    await patch(sarah, { bookingEmails: 'no' }, api({ productEvents }));

    expect(res.status).toBe(200);
    expect(posthog.events).toEqual([]);
    for (const log of logs) log.mockRestore();
    expect(lines.join('\n')).not.toMatch(/bookingEmails|booking_emails/);
  });
});
