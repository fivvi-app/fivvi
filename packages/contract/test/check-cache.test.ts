import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_ROOT, GENERATED_PATHS } from '../scripts/pipeline.ts';

// #30: the drift check (`pnpm check`) takes minutes in CI, so Turborepo caches its result. That
// is only safe while the task hash covers everything that can change the result: these tests read
// turbo's own dry run, the same plan CI uses.
type DryRunTask = {
  taskId: string;
  inputs: Record<string, string>;
  dependencies: string[];
  resolvedTaskDefinition: { cache: boolean };
};

const run = promisify(execFile);

async function planCheckTask(): Promise<DryRunTask> {
  const { stdout } = await run(
    'pnpm',
    ['exec', 'turbo', 'run', 'check', '--filter=@trainer-hub/contract', '--dry=json'],
    { cwd: join(CONTRACT_ROOT, '../..'), maxBuffer: 16 * 1024 * 1024 },
  );
  const { tasks } = JSON.parse(stdout) as { tasks: DryRunTask[] };
  const task = tasks.find(({ taskId }) => taskId === '@trainer-hub/contract#check');
  if (!task) throw new Error('turbo plans no @trainer-hub/contract#check task');
  return task;
}

describe('#30 cached contract drift check', () => {
  let task: DryRunTask;
  let inputs: string[];

  beforeAll(async () => {
    task = await planCheckTask();
    inputs = Object.keys(task.inputs);
  }, 60_000);

  it('AC1: caches the drift check result in Turborepo', () => {
    expect(task.resolvedTaskDefinition.cache).toBe(true);
  });

  it('AC1: hashes the pipeline, the generator pins and their settings', () => {
    expect(inputs).toEqual(
      expect.arrayContaining([
        'package.json',
        'scripts/check.ts',
        'scripts/pipeline.ts',
        'config/openapi-generator.json',
        'config/kotlin.json',
        'config/swift-openapi-generator.yaml',
        'tools/swift-generator/Package.swift',
        'tools/swift-generator/Package.resolved',
        'tools/typescript-generator/package.json',
      ]),
    );
  });

  it.each(Object.entries(GENERATED_PATHS))(
    'AC1: hashes the committed %s output (%s)',
    (_, path) => {
      expect(inputs.some((input) => input === path || input.startsWith(`${path}/`))).toBe(true);
    },
  );

  it('AC2: re-runs when a route or schema in packages/api changes, through its build', () => {
    expect(task.dependencies).toEqual(
      expect.arrayContaining(['@trainer-hub/api#build', '@trainer-hub/typescript-generator#build']),
    );
  });
});
