import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the noRestrictedImports rule from the root biome.json, with its override for this
// package, against fixture files laid out like the repo.
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');

const FIXTURES = [
  'apps/cron/src/report.ts',
  'apps/web/app/report.tsx',
  'packages/api/src/report.ts',
  'packages/observability/src/report.ts',
];
const IMPORTS = [
  "import * as Sentry from '@sentry/node';",
  "import { ServerRuntimeClient } from '@sentry/core/server';",
  "import { PostHog } from 'posthog-node';",
  // posthog-js, by its package root and by the subpath packages/observability uses.
  "import posthog from 'posthog-js';",
  "import { PostHog as PostHogBrowser } from 'posthog-js/dist/module.slim.no-external';",
];

type Diagnostic = { category: string; location: { path: string; start: { line: number } } };
let dir: string;
let diagnostics: Diagnostic[];

beforeAll(async () => {
  const root = JSON.parse(await readFile(path.join(repoRoot, 'biome.json'), 'utf8'));
  const config = {
    root: true,
    // Fixtures live in an ignored folder (test-results/), so the repo's own lint skips them.
    vcs: { enabled: false },
    linter: {
      rules: {
        preset: 'none',
        style: { noRestrictedImports: root.linter.rules.style.noRestrictedImports },
      },
    },
    // The overrides of the repo, without the plugins (packages/api/src, E011): a plugin path names a
    // file of the repo, which the fixtures don't have.
    overrides: root.overrides.map(
      ({ plugins: _plugins, ...override }: { plugins?: string[] }) => override,
    ),
  };
  await mkdir(path.join(packageRoot, 'test-results'), { recursive: true });
  dir = await mkdtemp(path.join(packageRoot, 'test-results', 'lint-'));
  await writeFile(path.join(dir, 'biome.json'), JSON.stringify(config));
  for (const fixture of FIXTURES) {
    await mkdir(path.dirname(path.join(dir, fixture)), { recursive: true });
    await writeFile(
      path.join(dir, fixture),
      `${IMPORTS.join('\n')}\n\nexport const report = [Sentry, ServerRuntimeClient, PostHog, posthog, PostHogBrowser];\n`,
    );
  }
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', '.'],
    { cwd: dir },
  ).catch((error: { stdout: string }) => error);
  diagnostics = JSON.parse(output.stdout).diagnostics;
}, 30_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('E009 SDK boundary', () => {
  it('fails lint when an app or another package imports the Sentry or a PostHog SDK directly', () => {
    const flagged = diagnostics
      .filter((d) => d.category === 'lint/style/noRestrictedImports')
      .map((d) => `${d.location.path}:${d.location.start.line}`)
      .sort();

    // Each fixture imports a Sentry package root (line 1) and subpath (2), posthog-node (3), and
    // a posthog-js package root (4) and subpath (5): each is flagged, only outside this package.
    expect(flagged).toEqual(
      ['apps/cron/src/report.ts', 'apps/web/app/report.tsx', 'packages/api/src/report.ts'].flatMap(
        (file) => [1, 2, 3, 4, 5].map((line) => `${file}:${line}`),
      ),
    );
  });
});
