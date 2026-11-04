import type { Database } from '@fivvi/database';
import { describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/registry.ts';
import { runCron } from '../src/runner.ts';
import type { CronTask } from '../src/task.ts';

/** The first thing a run does with the database is to ping it: reaching it means the names passed. */
const REACHED_DATABASE = 'reached the database';
const db = {
  execute: () => Promise.reject(new Error(REACHED_DATABASE)),
} as unknown as Database;

const task = (name: string): CronTask => ({ name, kind: 'frequent', run: async () => {} });

function run(tasks: readonly CronTask[]) {
  return runCron({
    db,
    tasks,
    runId: '11111111-1111-4111-8111-111111111111',
    log: vi.fn(),
    errorReporter: { captureError: vi.fn() },
  });
}

describe('E012 cron task names', () => {
  it.each([
    'Upper',
    'with space',
    'with_underscore',
    '1-starts-with-digit',
    '-starts-with-hyphen',
    '',
  ])('rejects the invalid name %j before touching the database', async (name) => {
    await expect(run([task(name)])).rejects.toThrow(`Invalid cron task name: ${name}`);
  });

  it('rejects a duplicate name before touching the database', async () => {
    await expect(run([task('same-name'), task('other'), task('same-name')])).rejects.toThrow(
      'Duplicate cron task: same-name',
    );
  });

  it('accepts lowercase words with hyphens and digits', async () => {
    await expect(run([task('a'), task('send-email-2')])).rejects.toThrow(REACHED_DATABASE);
  });

  it('accepts the real registry: its names are valid and unique', async () => {
    await expect(run(createRegistry({}))).rejects.toThrow(REACHED_DATABASE);
  });
});
