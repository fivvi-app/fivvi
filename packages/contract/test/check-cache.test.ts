import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { CONTRACT_ROOT } from '../scripts/pipeline.ts';

// The drift check (`pnpm check`) takes minutes in CI, so Turborepo caches its result. That is
// only safe while the task hash covers everything that can change the result: these tests read
// turbo's own dry run, the same plan CI uses.
type DryRunTask = {
  taskId: string;
  inputs: Record<string, string>;
  dependencies: string[];
  resolvedTaskDefinition: { cache: boolean };
};

const run = promisify(execFile);

async function checkTask(): Promise<DryRunTask> {
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

describe('the contract drift check in Turborepo', () => {
  it('is cached', async () => {
    expect((await checkTask()).resolvedTaskDefinition.cache).toBe(true);
  });

  it('hashes the pipeline, the generator pins and settings, and the committed output', async () => {
    const inputs = Object.keys((await checkTask()).inputs);
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
        'openapi.json',
        'src/generated/schema.ts',
        'swift/Sources/TrainerHubAPI/Generated/Client.swift',
        'kotlin/generated/nl/trainerhub/api/apis/HelloApi.kt',
      ]),
    );
  });

  it('depends on the API package, so a route or schema change re-runs it', async () => {
    expect((await checkTask()).dependencies).toEqual(
      expect.arrayContaining(['@trainer-hub/api#build', '@trainer-hub/typescript-generator#build']),
    );
  });
});
