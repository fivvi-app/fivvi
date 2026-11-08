import {
  authUsers,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { manualClock } from '@fivvi/testing/clock';
import { eq } from 'drizzle-orm';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// The setup the group class tests share (F021, spec #427). Synthetic people: John (Owner of John's
// Gym, also trains), Sarah and Tom (Trainers), the client Anna de Vries (with an account), Mike
// (Owner of Fit Studio). Workspace time zone Europe/Amsterdam.

/** A week before the dates below (Tuesday 6 October 2026). */
export const NOW = '2026-09-28T10:00:00.000Z';

export interface ClassBody {
  id: string;
  nameNl: string;
  nameEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  capacity: number;
  durationMinutes: number;
  defaultTrainer?: { id: string; name: string };
}

export interface SessionBody {
  id: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  capacity: number;
  version: number;
  location: { id: string; name: string; isDefault: boolean };
  trainer?: { id: string; name: string };
  groupClass?: { id: string; nameNl: string; nameEn: string | null };
  participants: unknown[];
}

export interface CreatedClassBody {
  groupClass: ClassBody;
  firstDate?: SessionBody;
}

export function setupGroupClassApi(
  admin: DatabaseClient,
  app: DatabaseClient,
  overrides: Partial<ApiDependencies> = {},
) {
  const clock = manualClock(NOW);
  const dependencies: Partial<ApiDependencies> = {
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
    clock,
    ...overrides,
  };
  return { server: createApp({ ...NO_DEPENDENCIES, ...dependencies }), clock };
}

/**
 * John's Gym with John (Owner who trains), Sarah and Tom (Trainers) and the client Anna with an
 * account of her own; Fit Studio with Mike.
 */
export async function groupClassWorld(admin: DatabaseClient) {
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
  const johnRole = await addTeamRole(admin.db, {
    workspaceId: gym.id,
    accountId: john.id,
    role: 'owner',
    trainsHere: true,
  });
  const sarahRole = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
  const tomRole = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
  // An Owner of Fit Studio who trains, so a trainer of another workspace exists to be named.
  const mikeRole = await addTeamRole(admin.db, {
    workspaceId: other.id,
    accountId: mike.id,
    role: 'owner',
    trainsHere: true,
  });
  await addClient(admin.db, { workspaceId: gym.id, accountId: annaAccount.id });
  return {
    gym,
    other,
    john,
    sarah,
    tom,
    mike,
    annaAccount,
    johnRole,
    sarahRole,
    tomRole,
    mikeRole,
  };
}

export type GroupClassServer = ReturnType<typeof setupGroupClassApi>['server'];

export const call = (
  server: GroupClassServer,
  method: string,
  path: string,
  who?: { id: string },
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  server.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(who ? { 'x-test-account': who.id } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const classes = (workspaceId: string) => `/v1/workspaces/${workspaceId}/group-classes`;

export const listClasses = (server: GroupClassServer, workspaceId: string, who?: { id: string }) =>
  call(server, 'GET', classes(workspaceId), who);
export const createClass = (
  server: GroupClassServer,
  workspaceId: string,
  who: { id: string } | undefined,
  body: unknown,
  headers?: Record<string, string>,
) => call(server, 'POST', classes(workspaceId), who, body, headers);
export const readClass = (
  server: GroupClassServer,
  workspaceId: string,
  classId: string,
  who?: { id: string },
) => call(server, 'GET', `${classes(workspaceId)}/${classId}`, who);
export const updateClass = (
  server: GroupClassServer,
  workspaceId: string,
  classId: string,
  who: { id: string } | undefined,
  body: unknown,
) => call(server, 'PATCH', `${classes(workspaceId)}/${classId}`, who, body);
export const scheduleClass = (
  server: GroupClassServer,
  workspaceId: string,
  classId: string,
  who: { id: string } | undefined,
  body: unknown,
  headers?: Record<string, string>,
) => call(server, 'POST', `${classes(workspaceId)}/${classId}/dates`, who, body, headers);
export const readSession = (
  server: GroupClassServer,
  workspaceId: string,
  sessionId: string,
  who?: { id: string },
) => call(server, 'GET', `/v1/workspaces/${workspaceId}/sessions/${sessionId}`, who);
export const updateDate = (
  server: GroupClassServer,
  workspaceId: string,
  sessionId: string,
  who: { id: string } | undefined,
  body: unknown,
) => call(server, 'PATCH', `/v1/workspaces/${workspaceId}/sessions/${sessionId}`, who, body);

/** Kracht / Strength with Sarah, 8, 60 minutes, as John's form sends it (AC1). */
export const kracht = (trainerId?: string) => ({
  nameNl: 'Kracht',
  nameEn: 'Strength',
  descriptionNl: 'Een uur krachttraining',
  ...(trainerId ? { trainerId } : {}),
  capacity: 8,
  durationMinutes: 60,
});
