import { selectEverythingInScope } from '@fivvi/database/testing';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineRoute, type WorkspaceEnv } from '../src/index.ts';
import { createWorld, seedScenario, type World } from './isolation/harness.ts';

// F003 AC10 (spec #171): a request to a workspace route runs in a transaction whose RLS context
// holds only the workspaces of the caller's team-member records, and a repository that forgets
// its workspace filter still returns no other workspace's rows. Sam is Trainer of A and Owner of
// B (and a client of A); Mike is Owner of B.

interface Row {
  organization_id: string;
  account_id: string;
}

const Rows = z.looseObject({}).openapi('ForgottenScopeRows');

describe('F003 AC10: requests run with only the account’s workspace IDs', () => {
  let world: World;
  let s: Awaited<ReturnType<typeof seedScenario>>;

  beforeAll(async () => {
    world = await createWorld();
    s = await seedScenario(world);
    // A repository that forgot its filter: it reads every team_members row of the scope.
    const forgetful = new OpenAPIHono<WorkspaceEnv>();
    forgetful.openapi(
      defineRoute(
        {
          method: 'get',
          path: '/v1/workspaces/{workspaceId}/forgotten-scope',
          operationId: 'forgottenScope',
          responses: {
            200: { description: 'It ran.', content: { 'application/json': { schema: Rows } } },
          },
        },
        { type: 'workspace', roles: ['owner', 'trainer'], client: 'none' },
      ),
      async (c) =>
        c.json({ rows: await selectEverythingInScope(c.get('scope'), 'team_members') }, 200),
    );
    world.api.route('/', forgetful);
  });

  afterAll(async () => {
    await world?.close();
  });

  it('holds only the one workspace of a workspace route, not the account’s others', async () => {
    world.observed.length = 0;

    const response = await world.request(s.sam, `/v1/workspaces/${s.a}/probe/team`);

    expect(response.status).toBe(200);
    // Sam has a place in A and B; the request to A holds A alone, in the context and in Postgres.
    expect(world.observed).toHaveLength(1);
    expect(world.observed[0]?.context.workspaceIds).toEqual([s.a]);
    expect(world.observed[0]?.stored).toMatchObject({ accountId: s.sam.id, workspaceIds: [s.a] });
  });

  it('holds only the workspaces of the account’s own team-member records on an account route', async () => {
    world.observed.length = 0;

    await world.request(s.trainerA, '/v1/me');
    await world.request(s.sam, '/v1/me');

    expect(world.observed.map(({ stored }) => stored.workspaceIds?.toSorted())).toEqual([
      [s.a],
      [s.a, s.b].toSorted(),
    ]);
  });

  it('shows no other workspace’s rows to a repository that forgets its scope', async () => {
    const forgotten = async (who: { id: string }) => {
      const response = await world.request(who, `/v1/workspaces/${s.a}/forgotten-scope`);
      expect(response.status).toBe(200);
      return ((await response.json()) as { rows: Row[] }).rows;
    };
    // B's team exists, so what is missing below is RLS at work and not an empty table.
    const all = await world.admin.db.query.teamMembers.findMany();
    expect(new Set(all.map((row) => row.organizationId))).toContain(s.b);

    // A trainer of A alone: A's rows only.
    const ofTrainer = await forgotten(s.trainerA);
    expect(ofTrainer.length).toBeGreaterThan(1);
    expect(new Set(ofTrainer.map((row) => row.organization_id))).toEqual(new Set([s.a]));
    // Sam is on B's team too: the database lets an account read its own rows (how the middleware
    // finds its place), and nobody else's outside A, so B's other Owner stays out of sight.
    const ofSam = await forgotten(s.sam);
    const outsideA = ofSam.filter((row) => row.organization_id !== s.a);
    expect(outsideA.map((row) => row.account_id)).toEqual([s.sam.id]);
  });
});
