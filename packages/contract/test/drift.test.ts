import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApp } from '@fivvi/api';
import { createRoute, z } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTRACT_ROOT,
  findDrift,
  GENERATED_PATHS,
  generateSpec,
  generateTypeScript,
  TS_SCHEMA_FILE,
} from '../scripts/pipeline.ts';

// The spec and TypeScript client are checked here, in-process. `pnpm check` runs the same
// comparison for every client, including Swift and Kotlin (needs Swift and Java).
const TS_FILE = `${GENERATED_PATHS.typescript}/${TS_SCHEMA_FILE}`;
const SPEC_AND_TS = [GENERATED_PATHS.spec, GENERATED_PATHS.typescript];

let fresh: string;
beforeEach(async () => {
  fresh = await mkdtemp(join(tmpdir(), 'contract-drift-test-'));
});
afterEach(async () => {
  await rm(fresh, { recursive: true, force: true });
});

describe('E018 contract drift', () => {
  it('committed openapi.json and TypeScript client match the API routes', async () => {
    const spec = await generateSpec(fresh);
    await generateTypeScript(spec, fresh);

    expect(await findDrift(fresh, CONTRACT_ROOT, SPEC_AND_TS)).toEqual([]);
  });

  it('fails when a route changes without regenerating', async () => {
    const app = createApp();
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v1/goodbye',
        responses: {
          200: {
            description: 'A route added without regenerating the contract.',
            content: { 'application/json': { schema: z.object({ bye: z.boolean() }) } },
          },
        },
      }),
      (c) => c.json({ bye: true }, 200),
    );

    const spec = await generateSpec(fresh, app);
    await generateTypeScript(spec, fresh);

    expect(await findDrift(fresh, CONTRACT_ROOT, SPEC_AND_TS)).toEqual([
      { path: GENERATED_PATHS.spec, kind: 'changed' },
      { path: TS_FILE, kind: 'changed' },
    ]);
  });

  it('reports generated files that are missing or no longer generated', async () => {
    const committed = await mkdtemp(join(tmpdir(), 'contract-drift-test-'));
    try {
      await writeFiles(fresh, { 'gen/same.txt': 'a', 'gen/new.txt': 'b' });
      await writeFiles(committed, { 'gen/same.txt': 'a', 'gen/old.txt': 'c' });

      expect(await findDrift(fresh, committed, ['gen'])).toEqual([
        { path: 'gen/new.txt', kind: 'missing' },
        { path: 'gen/old.txt', kind: 'unexpected' },
      ]);
    } finally {
      await rm(committed, { recursive: true, force: true });
    }
  });
});

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}
