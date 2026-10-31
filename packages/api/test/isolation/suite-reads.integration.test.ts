import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWorld, type World } from './harness.ts';
import { ISOLATION_CASES } from './isolation-cases.ts';
import { runIsolationSuite } from './suite.ts';

// The suite is a few hundred calls in a row, each waiting on the database, so the round trips it
// makes decide how long it takes when the machine is busy: the self-test hit its 30 s limit in a
// full check run (#369). This holds the reads of the stored rows to one statement, made only when
// the state may have changed since the last one, so a slow machine cannot multiply them again.

describe('E011 the suite reads the stored rows once per call', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    await world?.close();
  });

  it('reads every table in one statement, and a call starts from the rows the last one left', async () => {
    const statements: string[] = [];
    // The pool under the privileged connection sees every statement the suite sends.
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
});
