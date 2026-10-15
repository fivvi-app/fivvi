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
];
// posthog-js, by its package root and by the subpath packages/observability uses.
const POSTHOG_IMPORTS = [
  "import posthog from 'posthog-js';",
  "import { PostHog } from 'posthog-js/dist/module.slim.no-external';",
];

type Diagnostic = { category: string; location: { path: string } };
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
    overrides: root.overrides,
  };
  await mkdir(path.join(packageRoot, 'test-results'), { recursive: true });
  dir = await mkdtemp(path.join(packageRoot, 'test-results', 'lint-'));
  await writeFile(path.join(dir, 'biome.json'), JSON.stringify(config));
  for (const fixture of FIXTURES) {
    await mkdir(path.dirname(path.join(dir, fixture)), { recursive: true });
    await writeFile(
      path.join(dir, fixture),
      `${IMPORTS.join('\n')}\n\nexport const report = [Sentry, ServerRuntimeClient];\n`,
    );
    await writeFile(
      path.join(dir, fixture.replace('/report.', '/page-views.')),
      `${POSTHOG_IMPORTS.join('\n')}\n\nexport const pageViews = [posthog, PostHog];\n`,
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

describe('E009 Sentry SDK boundary', () => {
  it('fails lint when an app or another package imports the Sentry SDK directly', () => {
    const flagged = flaggedFiles().filter((file) => file.includes('/report.'));

    // Each fixture imports a package root and a subpath: both are flagged.
    expect(flagged).toEqual([
      'apps/cron/src/report.ts',
      'apps/cron/src/report.ts',
      'apps/web/app/report.tsx',
      'apps/web/app/report.tsx',
      'packages/api/src/report.ts',
      'packages/api/src/report.ts',
    ]);
  });
});

describe('E009 PostHog browser SDK boundary', () => {
  it('fails lint when an app or another package imports posthog-js directly', () => {
    expect(flaggedFiles().filter((file) => file.includes('/page-views.'))).toEqual([
      'apps/cron/src/page-views.ts',
      'apps/cron/src/page-views.ts',
      'apps/web/app/page-views.tsx',
      'apps/web/app/page-views.tsx',
      'packages/api/src/page-views.ts',
      'packages/api/src/page-views.ts',
    ]);
  });
});

function flaggedFiles(): string[] {
  return diagnostics
    .filter((d) => d.category === 'lint/style/noRestrictedImports')
    .map((d) => d.location.path)
    .sort();
}
