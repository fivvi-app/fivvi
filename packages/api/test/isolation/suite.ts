import { sql } from 'drizzle-orm';
import { buildOpenApiDocument } from '../../src/index.ts';
import { type Actor, type Scenario, seedActors } from './actors.ts';
import { type ContractDocument, describeOperations } from './coverage.ts';
import {
  type CallFacts,
  expectedCall,
  mayChangeWorkspaces,
  mayShow,
  REFUSAL_BODIES,
  type RecordKind,
  type TokenOwner,
  type XAccess,
} from './expectations.ts';
import type { World } from './harness.ts';
import type { IsolationCase } from './isolation-cases.ts';

// The isolation suite (E011, AC11), as a function that returns what it found, so the test of the
// suite can pass it a leaky route and assert it reports a failure (AC16). It calls every
// workspace and account operation of the test app (the real routes of `createApp` plus the
// probe routes) as the standard actors and checks, for each call:
//
//   1. the status is the one `expectations.ts` derives from the route's access and the actor's place;
//   2. a refusal is exactly its machine-readable body, and no response holds a record the actor may
//      not see (an id or a marker of the other workspace, or of another client);
//   3. no row of any workspace changed, except those a successful write may change.
//
// What it knows about the data it reads from Postgres through the privileged connection, never
// from the API under test.

export interface SuiteResult {
  /** One sentence per problem. Empty when every call got the right answer. */
  failures: string[];
  /** The number of calls made. */
  calls: number;
  /** The operations that were called. */
  operations: string[];
}

interface StoredRow {
  table: string;
  workspaceId: string;
  row: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every row of every table that holds a workspace's data, read as the privileged role. */
async function readRows(world: World, tables: readonly string[]): Promise<StoredRow[]> {
  const rows: StoredRow[] = [];
  for (const table of tables) {
    const { rows: found } = await world.admin.db.execute(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t`,
    );
    for (const { row } of found as { row: Record<string, unknown> }[]) {
      const workspaceId = (table === 'organizations' ? row.id : row.organization_id) as string;
      rows.push({ table, workspaceId, row });
    }
  }
  return rows;
}

/** `organizations` and every table in `public` with an `organization_id`, including probe tables. */
async function businessTables(world: World): Promise<string[]> {
  const { rows } = await world.admin.db.execute(
    sql`select distinct table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'organization_id'`,
  );
  return ['organizations', ...(rows as { table_name: string }[]).map((row) => row.table_name)];
}

type Ledger = Map<string, TokenOwner & { clientIds: Set<string> }>;

/**
 * The ids and markers of every record of every workspace, and whose they are: a row's uuids
 * belong to its workspace, and to its client where it has a `client_id` (or is a client).
 * Markers of accounts (email, name) belong to wherever the account id appears.
 */
function buildLedger(rows: StoredRow[], scenario: Scenario): Ledger {
  const ledger: Ledger = new Map();
  const claim = (token: string, workspaceId: string, clientId: string | undefined) => {
    const entry = ledger.get(token) ?? { workspaceId, clientIds: new Set<string>() };
    if (entry.workspaceId !== workspaceId) {
      throw new Error(`${token} appears in two workspaces: the scenario shares a record.`);
    }
    if (clientId) entry.clientIds.add(clientId);
    ledger.set(token, entry);
  };
  for (const { table, workspaceId, row } of rows) {
    claim(workspaceId, workspaceId, undefined);
    const clientId =
      typeof row.client_id === 'string' ? row.client_id : table === 'clients' ? String(row.id) : '';
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && UUID.test(value) && value !== workspaceId) {
        claim(value, workspaceId, clientId || undefined);
      }
    }
  }
  for (const account of scenario.accounts) {
    const entry = ledger.get(account.id);
    if (!entry) continue;
    ledger.set(account.email, entry);
    ledger.set(account.marker, entry);
  }
  return ledger;
}

/** A's rows (or B's), as one string, to compare before and after a call. */
function snapshots(rows: StoredRow[]): Map<string, string> {
  const byWorkspace = new Map<string, string[]>();
  for (const { table, workspaceId, row } of rows) {
    byWorkspace.set(workspaceId, [
      ...(byWorkspace.get(workspaceId) ?? []),
      `${table} ${JSON.stringify(row)}`,
    ]);
  }
  return new Map([...byWorkspace].map(([id, lines]) => [id, lines.sort().join('\n')]));
}

interface PlannedCall {
  actor: Actor;
  /** The workspace in the path, for a workspace route. */
  workspaceId: string;
  /** The seeded records to name in the path: `[workspace, client]`. */
  records: [workspaceId: string, clientId: string] | undefined;
  kind: RecordKind;
}

/** The calls made to a workspace route: who, in whose path, naming whose records. */
function planWorkspaceCalls(s: Scenario, hasRecords: boolean): PlannedCall[] {
  const { actors } = s;
  const calls: PlannedCall[] = [
    // A's own people, who may be allowed: so a policy that is too strict fails too.
    {
      actor: actors.ownerA,
      workspaceId: s.a,
      records: [s.a, s.clients.a.other],
      kind: 'other-client',
    },
    {
      actor: actors.trainerA,
      workspaceId: s.a,
      records: [s.a, s.clients.a.other],
      kind: 'other-client',
    },
    { actor: actors.clientA, workspaceId: s.a, records: [s.a, s.clients.a.own], kind: 'own' },
    {
      actor: actors.clientA,
      workspaceId: s.a,
      records: [s.a, s.clients.a.other],
      kind: 'other-client',
    },
    // Everyone else, calling A's path with A's records.
    ...[actors.ownerB, actors.trainerB, actors.clientB, actors.outsider, actors.anonymous].map(
      (actor): PlannedCall => ({
        actor,
        workspaceId: s.a,
        records: [s.a, s.clients.a.other],
        kind: 'other-client',
      }),
    ),
    // B's own people on B's path, with A's record ids and with their own.
    ...[actors.ownerB, actors.trainerB, actors.clientB].map(
      (actor): PlannedCall => ({
        actor,
        workspaceId: s.b,
        records: [s.a, s.clients.a.other],
        kind: 'foreign-workspace',
      }),
    ),
    {
      actor: actors.ownerB,
      workspaceId: s.b,
      records: [s.b, s.clients.b.other],
      kind: 'other-client',
    },
    {
      actor: actors.trainerB,
      workspaceId: s.b,
      records: [s.b, s.clients.b.other],
      kind: 'other-client',
    },
    { actor: actors.clientB, workspaceId: s.b, records: [s.b, s.clients.b.own], kind: 'own' },
  ];
  if (hasRecords) return calls;
  // A route that names no record: one call per actor and path.
  const seen = new Set<string>();
  return calls
    .map((call): PlannedCall => ({ ...call, records: undefined, kind: 'none' }))
    .filter((call) => {
      const key = `${call.actor.name} ${call.workspaceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Every signed-in actor and the anonymous one call an account route. */
function planAccountCalls(s: Scenario): PlannedCall[] {
  return Object.values(s.actors).map((actor) => ({
    actor,
    workspaceId: s.a,
    records: undefined,
    kind: 'none',
  }));
}

export async function runIsolationSuite(
  world: World,
  cases: Readonly<Record<string, IsolationCase>>,
): Promise<SuiteResult> {
  const failures: string[] = [];
  const result: SuiteResult = { failures, calls: 0, operations: [] };
  const scenario = await seedActors(world);
  const tables = await businessTables(world);
  const document = buildOpenApiDocument(world.api) as unknown as ContractDocument;
  const operations = describeOperations(document).filter(
    (operation) => operation.access?.type === 'workspace' || operation.access?.type === 'account',
  );

  for (const operation of operations) {
    const isolationCase = cases[operation.name];
    if (!isolationCase) {
      failures.push(`${operation.name} has no isolation case.`);
      continue;
    }
    result.operations.push(operation.name);
    const access = operation.access as XAccess;
    const hasRecords = Object.keys(isolationCase.params ?? {}).length > 0;

    // The route's records in A and B, for every client of each.
    const seeded = new Map<string, Record<string, string>>();
    for (const [workspaceId, clients] of [
      [scenario.a, scenario.clients.a],
      [scenario.b, scenario.clients.b],
    ] as const) {
      for (const clientId of [clients.own, clients.other]) {
        seeded.set(
          `${workspaceId} ${clientId}`,
          (await isolationCase.seed?.(world.admin.db, { workspaceId, clientId })) ?? {},
        );
      }
    }

    const plan =
      access.type === 'account'
        ? planAccountCalls(scenario)
        : planWorkspaceCalls(scenario, hasRecords);
    for (const planned of plan) {
      const values = planned.records ? (seeded.get(planned.records.join(' ')) ?? {}) : {};
      const path = operation.path
        .replaceAll('{workspaceId}', planned.workspaceId)
        .replaceAll(/{(\w+)}/g, (_match, name: string) => {
          const value = values[isolationCase.params?.[name] ?? ''];
          return value ?? `0197c0de-0000-7000-8000-0000000000ff`;
        });
      const facts: CallFacts = {
        access,
        method: operation.method,
        workspaceId: planned.workspaceId,
        signedIn: planned.actor.account !== undefined,
        places: planned.actor.places,
        record: planned.kind,
        self: planned.actor.account
          ? [planned.actor.account.id, planned.actor.account.email, planned.actor.account.marker]
          : [],
      };
      const where =
        access.type === 'account' ? '' : ` in ${scenario.labels[planned.workspaceId] ?? '?'}`;
      const label = `${operation.name} as ${planned.actor.name}${where}${planned.kind === 'none' ? '' : ` (${planned.kind} record)`}`;

      const rows = await readRows(world, tables);
      const before = snapshots(rows);
      const ledger = buildLedger(rows, scenario);
      const response = await world.request(planned.actor.account, path, {
        method: operation.method,
        ...(isolationCase.query ? { query: isolationCase.query } : {}),
        ...(isolationCase.body !== undefined ? { body: isolationCase.body } : {}),
      });
      const text = await response.text();
      const after = snapshots(await readRows(world, tables));
      result.calls += 1;

      // 1. The status, and a refusal's body.
      const expected = expectedCall(facts);
      if (expected.status === 'success') {
        if (response.status < 200 || response.status >= 300) {
          failures.push(`${label}: expected success, got ${response.status}.`);
        }
      } else {
        if (response.status !== expected.status) {
          failures.push(`${label}: expected ${expected.status}, got ${response.status}.`);
        } else if (text !== JSON.stringify(REFUSAL_BODIES[expected.status])) {
          failures.push(`${label}: a ${expected.status} must be exactly its refusal body.`);
        }
      }

      // 2. Nothing of a record the actor may not see.
      const leaked = [...ledger].filter(
        ([token, owner]) => text.includes(token) && !mayShow(facts, token, owner),
      );
      if (leaked.length > 0) {
        const [token, owner] = leaked[0] as [string, TokenOwner];
        const whose = scenario.labels[owner.workspaceId] ?? 'another workspace';
        failures.push(
          `${label}: the response holds ${leaked.length} id or marker the actor may not see, for example ${token} of ${whose}${owner.clientIds.size > 0 ? ' (a client’s record)' : ''}.`,
        );
      }

      // 3. Nothing changed that the call may not change.
      const mayChange = new Set(mayChangeWorkspaces(facts));
      for (const workspaceId of new Set([...before.keys(), ...after.keys()])) {
        if (mayChange.has(workspaceId)) continue;
        if (before.get(workspaceId) !== after.get(workspaceId)) {
          failures.push(
            `${label}: rows of ${scenario.labels[workspaceId] ?? workspaceId} changed, and this call may not change them.`,
          );
        }
      }
    }
  }
  return result;
}
