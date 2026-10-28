import type { Place } from '@fivvi/database';
import { sql } from 'drizzle-orm';
import { buildOpenApiDocument } from '../../src/index.ts';
import { type Actor, type Scenario, seedActors } from './actors.ts';
import { type ContractDocument, describeOperations } from './coverage.ts';
import {
  type CallFacts,
  expectedCall,
  markersIn,
  mayAddWorkspace,
  mayChangeRow,
  mayShow,
  mustShow,
  REFUSAL_BODIES,
  type RecordKind,
  type RowGroup,
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
//   3. no row changed, except those a successful write may change (a team member's: the
//      workspace's; a client's: its own client's);
//   4. a successful read holds the records the case seeded that the actor may see, so a policy
//      or a query that is too strict, and returns nothing, fails too.
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

/** The client a row belongs to: its `client_id`, or its own id for a client. */
function clientOf(table: string, row: Record<string, unknown>): string | undefined {
  if (typeof row.client_id === 'string') return row.client_id;
  return table === 'clients' ? String(row.id) : undefined;
}

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

/**
 * Whose a token is. One owner, except for the tokens of an account that has a place in several
 * workspaces (Sam): its id appears in the rows of each, and each is an owner of it.
 */
type Ledger = Map<string, (TokenOwner & { clientIds: Set<string> })[]>;

/**
 * The ids and markers of every record of every workspace, and whose they are: a row's uuids,
 * and the markers in its text (a name, a note's body), belong to its workspace, and to its
 * client where it has a `client_id` (or is a client). Markers of accounts (email, name) belong
 * to wherever the account id appears. A record shared by two workspaces is an error in the
 * scenario; only an account may appear in several.
 */
function buildLedger(rows: StoredRow[], scenario: Scenario): Ledger {
  const ledger: Ledger = new Map();
  const accountIds = new Set(scenario.accounts.map((account) => account.id));
  const claim = (token: string, workspaceId: string, clientId: string | undefined) => {
    const owners = ledger.get(token) ?? [];
    let entry = owners.find((owner) => owner.workspaceId === workspaceId);
    if (!entry) {
      if (owners.length > 0 && !accountIds.has(token)) {
        throw new Error(`${token} appears in two workspaces: the scenario shares a record.`);
      }
      entry = { workspaceId, clientIds: new Set<string>() };
      owners.push(entry);
    }
    if (clientId) entry.clientIds.add(clientId);
    ledger.set(token, owners);
  };
  for (const { table, workspaceId, row } of rows) {
    claim(workspaceId, workspaceId, undefined);
    const clientId = clientOf(table, row);
    for (const value of Object.values(row)) {
      if (typeof value !== 'string') continue;
      if (UUID.test(value)) {
        if (value !== workspaceId) claim(value, workspaceId, clientId);
      } else {
        for (const marker of markersIn(value)) claim(marker, workspaceId, clientId);
      }
    }
  }
  for (const account of scenario.accounts) {
    const owners = ledger.get(account.id);
    if (!owners) continue;
    ledger.set(account.email, owners);
    ledger.set(account.marker, owners);
  }
  return ledger;
}

/** The rows of each group (a workspace, and a client of it), as one string, to compare before and after a call. */
function snapshots(rows: StoredRow[]): Map<string, { group: RowGroup; text: string }> {
  const groups = new Map<string, { group: RowGroup; lines: string[] }>();
  for (const { table, workspaceId, row } of rows) {
    const clientId = clientOf(table, row);
    const key = `${workspaceId} ${clientId ?? ''}`;
    const entry = groups.get(key) ?? { group: { workspaceId, clientId }, lines: [] };
    entry.lines.push(`${table} ${JSON.stringify(row)}`);
    groups.set(key, entry);
  }
  return new Map(
    [...groups].map(([key, { group, lines }]) => [key, { group, text: lines.sort().join('\n') }]),
  );
}

interface PlannedCall {
  actor: Actor;
  /** The workspace in the path, for a workspace route. */
  workspaceId: string;
  /** The seeded records to name in the path: `[workspace, client]`. */
  records: [workspaceId: string, clientId: string] | undefined;
  kind: RecordKind;
}

/**
 * Sam (trainer in A, owner of B, client of A): in A with another client's record, with his own
 * client's and with B's; in B with another client's and with A's; in C, where he has no place.
 */
function samCalls(s: Scenario): PlannedCall[] {
  const { sam } = s.actors;
  return [
    { actor: sam, workspaceId: s.a, records: [s.a, s.clients.a.other], kind: 'other-client' },
    { actor: sam, workspaceId: s.a, records: [s.a, s.clients.a.sam], kind: 'own' },
    { actor: sam, workspaceId: s.a, records: [s.b, s.clients.b.other], kind: 'foreign-workspace' },
    { actor: sam, workspaceId: s.b, records: [s.b, s.clients.b.other], kind: 'other-client' },
    { actor: sam, workspaceId: s.b, records: [s.a, s.clients.a.other], kind: 'foreign-workspace' },
    { actor: sam, workspaceId: s.c, records: [s.c, s.clients.c.other], kind: 'other-client' },
  ];
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
    // Sam, in each of his workspaces and in C, with its own records and the others'.
    ...samCalls(s),
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

export interface SuiteOptions {
  /** Seeded already, for a run that changed the standard actors first (a team role that ended). */
  scenario?: Scenario;
  /** Make only the calls of the actors this accepts (every record is still seeded and watched). */
  only?: (actor: Actor) => boolean;
}

export async function runIsolationSuite(
  world: World,
  cases: Readonly<Record<string, IsolationCase>>,
  options: SuiteOptions = {},
): Promise<SuiteResult> {
  const failures: string[] = [];
  const result: SuiteResult = { failures, calls: 0, operations: [] };
  const scenario = options.scenario ?? (await seedActors(world));
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
    for (const [workspaceId, clientIds] of [
      [scenario.a, Object.values(scenario.clients.a)],
      [scenario.b, Object.values(scenario.clients.b)],
      [scenario.c, Object.values(scenario.clients.c)],
    ] as const) {
      for (const clientId of clientIds) {
        seeded.set(
          `${workspaceId} ${clientId}`,
          (await isolationCase.seed?.(world.admin.db, { workspaceId, clientId })) ?? {},
        );
      }
    }

    // A seed that answers with a value the suite can't look for would switch the check of 4 off
    // without a word: report it. Account routes (`getMe` reads `auth_*`, which holds no workspace
    // data) may seed nothing; a GET of a workspace must seed something it can show.
    const seedValues = [...new Set([...seeded.values()].flatMap((v) => Object.values(v)))];
    const known = buildLedger(await readRows(world, tables), scenario);
    for (const value of seedValues.filter((v) => !known.has(v))) {
      failures.push(
        `${operation.name}: its seed returns ${value}, which is no id or marker of a stored record; return the id of a row it made, or a \`uniqueMarker\` in one.`,
      );
    }
    if (
      access.type === 'workspace' &&
      operation.method.toUpperCase() === 'GET' &&
      !seedValues.some((v) => known.has(v))
    ) {
      failures.push(
        `${operation.name}: a read of a workspace whose seed returns no record the suite can look for, so a policy that is too strict would pass; seed an id or a marker.`,
      );
    }

    const plan =
      access.type === 'account'
        ? planAccountCalls(scenario)
        : planWorkspaceCalls(scenario, hasRecords);
    const calls = plan.filter(({ actor }) => options.only?.(actor) ?? true);
    // A filter that lets no call through would leave the operation untested and the run green.
    if (options.only && calls.length === 0) {
      failures.push(
        `${operation.name}: no call left for the actors \`only\` accepts, so nothing of it was tested.`,
      );
    }
    for (const planned of calls) {
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
        ...(isolationCase.createsWorkspace ? { createsWorkspace: true } : {}),
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
        ([token, owners]) =>
          text.includes(token) && !owners.some((owner) => mayShow(facts, token, owner)),
      );
      if (leaked.length > 0) {
        const [token, owners] = leaked[0] as [string, TokenOwner[]];
        const owner = owners[0] as TokenOwner;
        const whose = scenario.labels[owner.workspaceId] ?? 'another workspace';
        failures.push(
          `${label}: the response holds ${leaked.length} id or marker the actor may not see, for example ${token} of ${whose}${owner.clientIds.size > 0 ? ' (a client’s record)' : ''}.`,
        );
      }

      // 3. Nothing changed that the call may not change. A route that creates the caller's
      // workspace may add one workspace that did not exist (its rows are a group of their own).
      const added = [...after.keys()].filter((key) => !before.has(key));
      const created = mayAddWorkspace(facts) && response.status >= 200 && response.status < 300;
      if (created && added.length > 0) {
        const [key, ...more] = added;
        const group = after.get(key as string)?.group as RowGroup;
        if (more.length > 0) {
          failures.push(`${label}: it added ${added.length} workspaces; it may add one.`);
        }
        // From now on the caller is the Owner of the workspace it made, for the calls after this one.
        (planned.actor.places as Record<string, Place>)[group.workspaceId] = { teamRole: 'owner' };
      }
      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const group = (before.get(key) ?? after.get(key))?.group as RowGroup;
        if (!before.has(key) && created) continue;
        if (mayChangeRow(facts, group)) continue;
        if (before.get(key)?.text !== after.get(key)?.text) {
          failures.push(
            `${label}: rows of ${scenario.labels[group.workspaceId] ?? group.workspaceId} changed${group.clientId ? ' (of one client)' : ''}, and this call may not change them.`,
          );
        }
      }

      // 4. A successful read holds what the case seeded and the actor may see.
      if (response.status >= 200 && response.status < 300) {
        const seededTokens = [...new Set([...seeded.values()].flatMap((v) => Object.values(v)))]
          .map((token): [string, TokenOwner] | undefined => {
            const owners = ledger.get(token);
            const owner = owners?.find((o) => mayShow(facts, token, o)) ?? owners?.[0];
            return owner ? [token, owner] : undefined;
          })
          .filter((entry) => entry !== undefined);
        const named = Object.values(isolationCase.params ?? {}).flatMap((name) => {
          const value = values[name];
          return value ? [value] : [];
        });
        const missing = mustShow(facts, seededTokens, named).filter(
          (token) => !text.includes(token),
        );
        if (missing.length > 0) {
          const token = missing[0] as string;
          const whose =
            scenario.labels[ledger.get(token)?.[0]?.workspaceId ?? ''] ?? 'the workspace';
          failures.push(
            `${label}: the response lacks ${missing.length} record the actor may see, for example ${token} of ${whose}.`,
          );
        }
      }
    }
  }
  return result;
}
