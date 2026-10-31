import { findClient } from '@fivvi/database';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineRoute, type WorkspaceEnv } from '../../src/access.ts';
import { NOT_FOUND } from '../../src/errors.ts';
import { createWorld, type World } from './harness.ts';
import { ISOLATION_CASES, type IsolationCase } from './isolation-cases.ts';
import { runIsolationSuite } from './suite.ts';

// The suite is a few hundred calls in a row, each waiting on the database, so the round trips it
// makes decide how long it takes when the machine is busy: the self-test hit its 30 s limit in a
// full check run (#369). This holds the reads of the stored rows to one statement, made only when
// the state may have changed since the last one, so a slow machine cannot multiply them again.

// Markers in the list of statements: where a seed ended and where the route ran.
const SEED_DONE = '-- a seed ran';
const REQUEST = '-- the route ran';

describe('E011 the suite reads the stored rows once per call', () => {
  let world: World;

  // A world of its own for each test: the suite seeds the same actors in every run.
  beforeEach(async () => {
    world = await createWorld();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await world?.close();
  });

  /** A route that deletes its record, added before the first request builds the router. */
  function addDeleteRoute(statements: string[]): void {
    const app = new OpenAPIHono<WorkspaceEnv>();
    app.openapi(
      defineRoute(
        {
          method: 'delete',
          path: '/v1/workspaces/{workspaceId}/probe/reseeded/{clientId}',
          operationId: 'probeReseeded',
          request: { params: z.object({ workspaceId: z.uuid(), clientId: z.uuid() }) },
          responses: {
            200: {
              description: 'It ran.',
              content: {
                'application/json': { schema: z.looseObject({}).openapi('ReseededResponse') },
              },
            },
          },
        },
        { type: 'workspace', capability: 'clients.view', client: 'none' },
      ),
      async (c) => {
        statements?.push(REQUEST);
        return (await findClient(c.get('scope'), c.req.valid('param').clientId))
          ? c.json({}, 200)
          : c.json(NOT_FOUND, 404);
      },
    );
    world.api.route('/', app);
  }

  /** Every statement the suite sends, in order. The pool under the privileged connection sees them. */
  function recordStatements(): string[] {
    const statements: string[] = [];
    const { $client: pool } = world.admin.db as unknown as {
      $client: { query: (...args: unknown[]) => unknown };
    };
    const query = pool.query.bind(pool);
    vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
      const first = args[0];
      statements.push(
        typeof first === 'string' ? first : ((first as { text?: string })?.text ?? ''),
      );
      return query(...args);
    }) as never);
    return statements;
  }

  it('reads every table in one statement, and a call starts from the rows the last one left', async () => {
    const statements = recordStatements();

    // One account route, called by every actor: no record is deleted, so nothing is read twice.
    const result = await runIsolationSuite(world, { getMe: ISOLATION_CASES.getMe ?? {} });

    const reads = statements.filter((statement) => statement.includes('to_jsonb'));
    expect(
      result.failures.filter((failure) => !failure.endsWith('has no isolation case.')),
    ).toEqual([]);
    expect(result.calls).toBeGreaterThan(0);
    // The rows once the seeds ran, then the rows after each call.
    expect(reads).toHaveLength(result.calls + 1);
    for (const read of reads) expect(read).toContain('union all');
  });

  it('reads the rows again after any seed, before the next call', async () => {
    const statements = recordStatements();
    addDeleteRoute(statements);
    const reseeded: IsolationCase = {
      params: { clientId: 'client' },
      seed: (_db, { clientId }) => {
        statements.push(SEED_DONE);
        return Promise.resolve({ client: clientId });
      },
    };
    const result = await runIsolationSuite(world, { probeReseeded: reseeded });

    expect(
      result.failures.filter((failure) => !failure.endsWith('has no isolation case.')),
    ).toEqual([]);
    const seeds = statements.filter((statement) => statement === SEED_DONE).length;
    expect(seeds).toBeGreaterThan(result.calls);
    // Between a seed and the next call the suite reads the rows again: a call that started from
    // the rows kept from before the seed would be judged on stale ones.
    let reads = 0;
    let pending = false;
    for (const statement of statements) {
      if (statement === SEED_DONE) {
        pending = true;
        reads = 0;
      } else if (statement.includes('to_jsonb')) {
        reads += 1;
      } else if (statement === REQUEST && pending) {
        expect(reads).toBeGreaterThan(0);
        pending = false;
      }
    }
    // Refused calls never reach the route; the ones it answered each followed a seed.
    expect(statements.filter((statement) => statement === REQUEST).length).toBeGreaterThan(0);
  });
});
