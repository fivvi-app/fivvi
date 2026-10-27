import { APP_ROLE, createClient } from '@fivvi/database';
import { selectEverythingInScope } from '@fivvi/database/testing';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineRoute, type WorkspaceEnv } from '../../src/access.ts';
import { toValidationError } from '../../src/errors.ts';
import { createWorld, type World } from './harness.ts';
import { ISOLATION_CASES, type IsolationCase } from './isolation-cases.ts';
import { runIsolationSuite } from './suite.ts';

// The self-test of the isolation suite (E011, AC16): a green run only means something if the
// suite can fail. Everything that leaks below exists only here, in this file and in this test's
// own database: a probe route that reads a business table without the request context, a probe
// table without a policy, a probe table whose policy matches nothing, and a route that leaks only
// the text of a note.

const PROTECTED = 'probe_notes_protected';
const UNPROTECTED = 'probe_notes_unprotected';
const STRICT = 'probe_notes_strict';

const Body = z.looseObject({}).openapi('SelfTestResponse');
const route = (path: string, operationId: string) => ({
  method: 'get' as const,
  path: `/v1/workspaces/{workspaceId}${path}`,
  operationId,
  responses: {
    200: { description: 'It ran.', content: { 'application/json': { schema: Body } } },
  },
});
const team = { type: 'workspace', roles: ['owner', 'trainer'], client: 'none' } as const;

/**
 * Creates a note of the workspace in a probe table, through the privileged connection. Returns
 * its id for the suite to look for in a listing, unless `reportId` is false.
 */
const seedNote =
  (table: string, reportId = true): IsolationCase['seed'] =>
  async (db, { workspaceId }) => {
    const { rows } = await db.execute(
      sql`insert into ${sql.identifier(table)} (organization_id, body)
          values (${workspaceId}, ${`note-${crypto.randomUUID()}`}) returning id`,
    );
    const note: Record<string, string> = reportId ? { note: (rows[0] as { id: string }).id } : {};
    return note;
  };

const SELF_TEST_CASES: Record<string, IsolationCase> = {
  probeLeakyClients: {},
  probeLeakyBodies: { seed: seedNote(PROTECTED, false) },
  probeWritingGet: {},
  [`probeNotes_${PROTECTED}`]: { seed: seedNote(PROTECTED) },
  [`probeNotes_${UNPROTECTED}`]: { seed: seedNote(UNPROTECTED) },
  [`probeNotes_${STRICT}`]: { seed: seedNote(STRICT) },
};

/** The workspace policy of `tenant-policies.ts`, by hand, for the control table. */
async function createProbeTables(world: World) {
  const { db } = world.admin;
  for (const table of [PROTECTED, UNPROTECTED, STRICT]) {
    await db.execute(
      sql`create table ${sql.identifier(table)} (
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations (id),
            body text not null)`,
    );
    await db.execute(
      sql`grant select, insert, update, delete on ${sql.identifier(table)} to ${sql.identifier(APP_ROLE)}`,
    );
  }
  // Only the control table gets the policy; the other has RLS off, as a table nobody remembered.
  await db.execute(sql`alter table ${sql.identifier(PROTECTED)} enable row level security`);
  await db.execute(sql`alter table ${sql.identifier(PROTECTED)} force row level security`);
  await db.execute(
    sql`create policy probe_notes_workspace on ${sql.identifier(PROTECTED)}
        as permissive for all to ${sql.identifier(APP_ROLE)}
        using (organization_id = any (app_workspace_ids()))
        with check (organization_id = any (app_workspace_ids()))`,
  );
  // A policy that is too strict: it matches nothing, so the table can never be read.
  await db.execute(sql`alter table ${sql.identifier(STRICT)} enable row level security`);
  await db.execute(sql`alter table ${sql.identifier(STRICT)} force row level security`);
  await db.execute(
    sql`create policy probe_notes_nothing on ${sql.identifier(STRICT)}
        as permissive for all to ${sql.identifier(APP_ROLE)}
        using (false) with check (false)`,
  );
}

function registerLeakyRoutes(world: World) {
  const app = new OpenAPIHono<WorkspaceEnv>({
    defaultHook: (result, c) =>
      result.success || !result.error ? undefined : c.json(toValidationError(result.error), 400),
  });
  // Leaks: reads the clients table through the privileged connection, not the request's scope.
  app.openapi(defineRoute(route('/probe/leaky/clients', 'probeLeakyClients'), team), async (c) =>
    c.json({ clients: await world.admin.db.query.clients.findMany() }, 200),
  );
  // Leaks only the text of the notes of every workspace, not their ids: the marker in the body
  // is all the suite has to find it by.
  app.openapi(defineRoute(route('/probe/leaky/bodies', 'probeLeakyBodies'), team), async (c) => {
    const { rows } = await world.admin.db.execute(
      sql`select body from ${sql.identifier(PROTECTED)}`,
    );
    return c.json({ bodies: (rows as { body: string }[]).map((row) => row.body) }, 200);
  });
  // Changes rows on a read: the suite must notice A's rows are not what they were.
  app.openapi(defineRoute(route('/probe/writing-get', 'probeWritingGet'), team), async (c) =>
    c.json({ client: await createClient(c.get('scope'), {}) }, 200),
  );
  // Reads every row of a probe table through the request's scope, with no workspace filter: a
  // forgotten filter. With the policy, RLS stops it; without, it leaks.
  for (const table of [PROTECTED, UNPROTECTED, STRICT]) {
    app.openapi(
      defineRoute(route(`/probe/notes/${table}`, `probeNotes_${table}`), team),
      async (c) => c.json({ notes: await selectEverythingInScope(c.get('scope'), table) }, 200),
    );
  }
  world.api.route('/', app);
}

describe('E011 the suite can fail', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await createProbeTables(world);
    registerLeakyRoutes(world);
  });

  afterAll(async () => {
    await world?.close();
  });

  it('AC16: the suite fails on a leaky probe route and an unprotected probe table', async () => {
    const result = await runIsolationSuite(world, { ...ISOLATION_CASES, ...SELF_TEST_CASES });

    const failuresOf = (operation: string) =>
      result.failures.filter((failure) => failure.startsWith(`${operation} as `));
    // The suite reports a failure...
    expect(result.failures.length).toBeGreaterThan(0);
    // ...for the route that reads a business table without the request context: B's people are
    // handed A's clients, and A's people B's...
    expect(failuresOf('probeLeakyClients')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^probeLeakyClients as B’s owner in B: the response holds .* of A\b/),
        expect.stringMatching(/^probeLeakyClients as A’s owner in A: the response holds .* of B\b/),
      ]),
    );
    // ...for the table with no policy, where a forgotten filter leaks too...
    expect(failuresOf(`probeNotes_${UNPROTECTED}`)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/as B’s owner in B: the response holds .* of A\b/),
      ]),
    );
    // ...for a read that changes rows...
    expect(failuresOf('probeWritingGet')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^probeWritingGet as A’s owner in A: rows of A changed/),
      ]),
    );
    // ...for a route that leaks only the text of a note, found by the marker in it...
    expect(failuresOf('probeLeakyBodies')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^probeLeakyBodies as A’s owner in A: the response holds .* of B\b/),
        expect.stringMatching(/^probeLeakyBodies as B’s owner in B: the response holds .* of A\b/),
      ]),
    );
    // ...for a policy that matches nothing: the listing is empty, and the suite says what is
    // missing from it...
    expect(failuresOf(`probeNotes_${STRICT}`)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/as A’s owner in A: the response lacks .* of A\b/),
        expect.stringMatching(/as B’s trainer in B: the response lacks .* of B\b/),
      ]),
    );
    // ...and for nothing else: the same route over a table with the policy is clean, and so is
    // every other route of the suite.
    expect(failuresOf(`probeNotes_${PROTECTED}`)).toEqual([]);
    const others = result.failures.filter(
      (failure) =>
        !failure.startsWith('probeLeakyClients as ') &&
        !failure.startsWith('probeLeakyBodies as ') &&
        !failure.startsWith(`probeNotes_${STRICT} as `) &&
        !failure.startsWith('probeWritingGet as ') &&
        !failure.startsWith(`probeNotes_${UNPROTECTED} as `),
    );
    expect(others).toEqual([]);
  });
});
