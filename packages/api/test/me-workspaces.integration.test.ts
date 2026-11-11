import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  teamMembers,
} from '@fivvi/database';
import {
  addClient,
  addTeamRole,
  addTrainerProfile,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { capabilitiesOf, type Role } from '@fivvi/domain';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F003 (spec #171): GET /v1/me/workspaces lists the workspaces the account is on the team of,
// with the role. Synthetic people: Sarah is a Trainer of John's Gym and the Owner of her own
// workspace; she is also a client of a third one, which is not listed.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

let database: TestDatabase;
let admin: DatabaseClient;
let app: DatabaseClient;

beforeAll(async () => {
  database = await cloneTemplateDatabase();
  admin = createDatabase({ url: database.url, maxConnections: 2 });
  app = createDatabase({ url: database.appUrl, maxConnections: 4 });
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
  });

const get = (who?: { id: string }) =>
  server().request('/v1/me/workspaces', { headers: who ? { 'x-test-account': who.id } : {} });

describe('F003 GET /v1/me/workspaces', () => {
  it('AC9: lists both workspaces of Sarah with the right role each, by name', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });

    const response = await get(sarah);

    expect(response.status).toBe(200);
    const listed = (await response.json()) as { workspaceId: string; name: string }[];
    expect(listed).toEqual(
      [
        {
          workspaceId: gym.id,
          name: gym.marker,
          slug: gym.marker,
          role: 'trainer',
          capabilities: capabilitiesOf('trainer'),
          trainsHere: true,
        },
        {
          workspaceId: own.id,
          name: own.marker,
          slug: own.marker,
          role: 'owner',
          capabilities: capabilitiesOf('owner'),
          trainsHere: false,
        },
      ].toSorted((a, b) => a.name.localeCompare(b.name)),
    );
  });

  it('F005: tells per workspace whether the account trains there', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });
    const trains = async () =>
      Object.fromEntries(
        ((await (await get(sarah)).json()) as { workspaceId: string; trainsHere: boolean }[]).map(
          ({ workspaceId, trainsHere }) => [workspaceId, trainsHere],
        ),
      );

    expect(await trains()).toEqual({ [gym.id]: true, [own.id]: false });

    await addTrainerProfile(admin.db, {
      workspaceId: own.id,
      teamMemberId: (
        await admin.db.select().from(teamMembers).where(eq(teamMembers.organizationId, own.id))
      )[0]?.id as string,
    });

    expect(await trains()).toEqual({ [gym.id]: true, [own.id]: true });
  });

  it('F005: the contract has trainsHere on MyWorkspace', () => {
    const { properties, required } = contract.components.schemas.MyWorkspace;

    expect(properties.trainsHere.type).toBe('boolean');
    expect(required).toContain('trainsHere');
  });

  it('does not list a workspace the account is only a client of, nor anyone else’s', async () => {
    const gym = await createWorkspace(admin.db, { label: 'gym' });
    const clientOf = await createWorkspace(admin.db, { label: 'client-of' });
    const elsewhere = await createWorkspace(admin.db, { label: 'elsewhere' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    await addClient(admin.db, { workspaceId: clientOf.id, accountId: sarah.id });
    await addTeamRole(admin.db, { workspaceId: elsewhere.id, accountId: mike.id, role: 'owner' });

    const listed = (await (await get(sarah)).json()) as { workspaceId: string }[];

    expect(listed.map(({ workspaceId }) => workspaceId)).toEqual([gym.id]);
  });

  it('answers an empty list for an account without a team role', async () => {
    const nobody = await createAccount(admin.db, { label: 'nobody' });

    const response = await get(nobody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('answers 401 to anonymous', async () => {
    expect((await get()).status).toBe(401);
  });

  it('AC11: is in the contract as an account route with the list as its answer', () => {
    const operation = contract.paths['/v1/me/workspaces'].get;
    expect(operation.operationId).toBe('listMyWorkspaces');
    expect(operation['x-access']).toMatchObject({ type: 'account' });
    expect(operation.responses['200'].content['application/json'].schema.type).toBe('array');
  });
});

describe('F004 capabilities on GET /v1/me/workspaces', () => {
  it('AC8: Sarah has every Owner capability in her own workspace and Trainer ones in John’s Gym', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });

    const listed = (await (await get(sarah)).json()) as {
      workspaceId: string;
      capabilities: string[];
    }[];

    const capabilitiesIn = (id: string) => listed.find((w) => w.workspaceId === id)?.capabilities;
    expect(capabilitiesIn(own.id)).toEqual([
      'workspace.manage',
      'team.view',
      'team.manage',
      'trainers.view',
      'clients.view',
      'clients.manage',
      'location.read',
      'settings.manage',
      'team.invite',
      'session.private.manage.own',
      'session.private.manage.any',
      'class.manage',
      'class.read',
      'join_link.view',
      'join_link.renew',
      'access_log.read',
    ]);
    expect(capabilitiesIn(gym.id)).toEqual([
      'trainers.view',
      'clients.view',
      'clients.manage',
      'location.read',
      'session.private.manage.own',
      'class.read',
      'join_link.view',
    ]);
  });

  it('AC9: capabilities match the matrix', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: own.id, accountId: sarah.id, role: 'owner' });

    const listed = (await (await get(sarah)).json()) as {
      role: Role;
      capabilities: string[];
    }[];

    expect(listed.map(({ role }) => role).toSorted()).toEqual(['owner', 'trainer']);
    for (const { role, capabilities } of listed) {
      expect(capabilities).toEqual(capabilitiesOf(role));
    }
  });

  it('AC9: the contract has no admin role and requires capabilities on both workspace shapes', () => {
    const schemas = contract.components.schemas;
    for (const name of ['MyWorkspace', 'MeWorkspace']) {
      expect(schemas[name].properties.role.enum).toEqual(['owner', 'trainer']);
      expect(schemas[name].properties.capabilities.items.enum).toEqual(capabilitiesOf('owner'));
      expect(schemas[name].required).toContain('capabilities');
    }
  });
});
