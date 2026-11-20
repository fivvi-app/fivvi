import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// E001 #1483, AC7 of spec #1481: the export list of this package is kept in one fixed order, so two
// PRs that add a module edit different lines and don't conflict. Biome's `organizeImports` action
// (biome.json, `assist`) holds the order: modules by path, names inside an export by name. This
// test runs that one action on the real index.ts, so the package's own `pnpm test` fails with the
// command that fixes it, and on a scrambled copy, so it proves the action still catches a disorder.
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
const SPAWN_TIMEOUT_MS = 60_000;
const FIX =
  'pnpm --filter @fivvi/domain exec biome check --linter-enabled=false --formatter-enabled=false --write src/index.ts';

type Diagnostic = { category: string };

/** The diagnostics of the sorting action alone (no lint rules, no formatter) for `target`. */
async function sortingDiagnostics(cwd: string, target: string): Promise<Diagnostic[]> {
  const output = await promisify(execFile)(
    process.execPath,
    [
      biome,
      'check',
      '--linter-enabled=false',
      '--formatter-enabled=false',
      '--reporter=json',
      target,
    ],
    { cwd, env: { ...process.env, NO_COLOR: '1' } },
  ).catch((error: { stdout: string }) => error);
  return JSON.parse(output.stdout).diagnostics;
}

describe('E001 #1483 the export list of the domain package stays in order', () => {
  it(
    'has every export of src/index.ts in order',
    async () => {
      const diagnostics = await sortingDiagnostics(packageRoot, 'src/index.ts');
      expect(
        diagnostics.map((d) => d.category),
        `the exports of packages/domain/src/index.ts are out of order. Fix: ${FIX}`,
      ).toEqual([]);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'finds an export out of order, with the configuration of the repo',
    async () => {
      const source = await readFile(path.join(packageRoot, 'src/index.ts'), 'utf8');
      const blocks = source.split(/(?<=;\n)(?=export )/);
      expect(blocks.length).toBeGreaterThan(2);
      const scrambled = [blocks[1], blocks[0], ...blocks.slice(2)].join('');
      const dir = await mkdtemp(path.join(tmpdir(), 'domain-index-order-'));
      try {
        const root = JSON.parse(await readFile(path.join(repoRoot, 'biome.json'), 'utf8'));
        await writeFile(path.join(dir, 'biome.json'), JSON.stringify({ assist: root.assist }));
        await writeFile(path.join(dir, 'index.ts'), scrambled);
        const diagnostics = await sortingDiagnostics(dir, 'index.ts');
        expect(diagnostics.map((d) => d.category)).toEqual(['assist/source/organizeImports']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    SPAWN_TIMEOUT_MS,
  );
});
