import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { plan, readWorkspace } from '../affected.mjs';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');

// A small workspace shaped like the real one: web depends on api, database and contract; api and contract on
// database; testing is a dev dependency of the packages with tests; ui stands alone.
const pkg = (name, dir, scripts, dependencies) => ({ name, dir, scripts, dependencies });
const UNIT = ['test'];
const INTEGRATION = ['test', 'test:integration'];
const workspace = [
  pkg('@fivvi/web', 'apps/web', ['test', 'test:integration', 'test:e2e'], [
    '@fivvi/api',
    '@fivvi/database',
    '@fivvi/contract',
    '@fivvi/ui',
    '@fivvi/testing',
  ]),
  pkg('@fivvi/cron', 'apps/cron', INTEGRATION, ['@fivvi/database', '@fivvi/testing']),
  pkg('@fivvi/api', 'packages/api', INTEGRATION, ['@fivvi/database', '@fivvi/testing']),
  pkg('@fivvi/contract', 'packages/contract', UNIT, ['@fivvi/api', '@fivvi/typescript-generator']),
  pkg('@fivvi/typescript-generator', 'packages/contract/tools/typescript-generator', [], []),
  pkg('@fivvi/database', 'packages/database', INTEGRATION, ['@fivvi/testing']),
  pkg('@fivvi/design-tokens', 'packages/design-tokens', UNIT, []),
  pkg('@fivvi/testing', 'packages/testing', INTEGRATION, []),
  pkg('@fivvi/ui', 'packages/ui', UNIT, ['@fivvi/design-tokens']),
];
const decide = (paths, options = {}) => plan({ paths, packages: workspace, ...options });

describe('#293 AC1 AC2: scripts and Markdown changes', () => {
  it('AC1: a change to scripts affects the root scripts and no package, no integration, no e2e', () => {
    const result = decide(['scripts/check.sh', '.githooks/commit-msg']);
    assert.equal(result.root, true);
    assert.equal(result.all, false);
    assert.deepEqual(result.packages, []);
    assert.deepEqual(result.integration, []);
    assert.equal(result.e2e, false);
  });

  it('AC2: Markdown only affects nothing but the hygiene checks', () => {
    const result = decide(['docs/product/PRODUCT.md', 'docs/decisions/ADR-023-x.md', 'GLOSSARY.md']);
    assert.equal(result.docs, true);
    assert.equal(result.root, false);
    assert.deepEqual(result.packages, []);
    assert.equal(result.e2e, false);
  });

  it('a Markdown file the root tests read (agent docs, the registry, an app README) still runs them', () => {
    for (const path of [
      'AGENTS.md',
      'docs/agents/build.md',
      'docs/engineering/TESTING.md',
      'docs/product/FEATURES.md',
      'apps/ios/README.md',
      '.agents/skills/work/SKILL.md',
    ]) {
      const result = decide([path]);
      assert.equal(result.root, true, path);
      assert.equal(result.docs, false, path);
    }
  });

  it('Markdown next to a script change does not hide the script change', () => {
    const result = decide(['docs/product/PRODUCT.md', 'scripts/pr.sh']);
    assert.equal(result.docs, false);
    assert.equal(result.root, true);
  });

  it('a Markdown file in a package affects no package', () => {
    const result = decide(['packages/api/README.md']);
    assert.equal(result.docs, true);
    assert.deepEqual(result.packages, []);
  });

  it('no changed path affects nothing, and is not a docs change', () => {
    const result = decide([]);
    assert.deepEqual(
      { ...result, reasons: undefined },
      {
        all: false,
        root: false,
        docs: false,
        packages: [],
        integration: [],
        e2e: false,
        reasons: undefined,
      },
    );
  });
});

describe('#293 AC3 AC4: packages and their dependents', () => {
  it('AC3: one package affects itself and what depends on it, nothing else', () => {
    const result = decide(['packages/ui/src/button.tsx']);
    assert.deepEqual(result.packages, ['@fivvi/web', '@fivvi/ui']);
    assert.equal(result.root, false);
  });

  it('AC3: a leaf package with no dependents affects only itself, and the web app is not affected', () => {
    const result = decide(['apps/cron/src/job.ts']);
    assert.deepEqual(result.packages, ['@fivvi/cron']);
    assert.equal(result.e2e, false);
    assert.deepEqual(result.integration, ['@fivvi/cron']);
  });

  it('AC4: packages/database affects the integration tests of database and every package that depends on it, and e2e', () => {
    const result = decide(['packages/database/migrations/0007_x.sql']);
    assert.deepEqual(result.integration, [
      '@fivvi/web',
      '@fivvi/cron',
      '@fivvi/api',
      '@fivvi/database',
    ]);
    assert.equal(result.e2e, true);
  });

  it('dependents are followed through a chain: tokens -> ui -> web', () => {
    const result = decide(['packages/design-tokens/src/colours.ts']);
    assert.deepEqual(result.packages, ['@fivvi/web', '@fivvi/design-tokens', '@fivvi/ui']);
    assert.equal(result.e2e, true);
  });

  it('a path under a package inside another package belongs to the inner one (contract/tools)', () => {
    const result = decide(['packages/contract/tools/typescript-generator/src/x.ts']);
    assert.deepEqual(result.packages, [
      '@fivvi/web',
      '@fivvi/contract',
      '@fivvi/typescript-generator',
    ]);
  });

  it('a package change affects the packages only: root tests and shellcheck stay out', () => {
    assert.equal(decide(['packages/api/src/routes.ts']).root, false);
  });

  it('a change to a non-package path (a native app, CI) affects the root scripts but no package', () => {
    for (const path of ['apps/ios/FivviPro/App.swift', '.github/workflows/ci.yml', 'Dockerfile']) {
      const result = decide([path]);
      assert.equal(result.root, true, path);
      assert.deepEqual(result.packages, [], path);
      assert.equal(result.e2e, false, path);
    }
  });
});

describe('#293 AC5 AC6 AC12: everything', () => {
  const everything = workspace.map((p) => p.name);

  it('AC5: the workspace setup affects everything', () => {
    for (const path of [
      'pnpm-lock.yaml',
      'package.json',
      'turbo.json',
      'tsconfig.base.json',
      'pnpm-workspace.yaml',
      'biome.json',
      '.nvmrc',
      'packages/testing/src/vitest.ts',
    ]) {
      const result = decide([path]);
      assert.equal(result.all, true, path);
      assert.equal(result.root, true, path);
      assert.equal(result.e2e, true, path);
      assert.deepEqual([...result.packages].sort(), [...everything].sort(), path);
      assert.ok(
        result.reasons.some((reason) => reason.includes(path)),
        `names ${path}`,
      );
    }
  });

  it('a package.json of a package is not the workspace setup', () => {
    assert.equal(decide(['packages/ui/package.json']).all, false);
  });

  it('AC6 AC12: force (check.sh --all, workflow_dispatch, the run-native label) affects everything for any change', () => {
    for (const paths of [[], ['docs/product/PRODUCT.md'], ['scripts/check.sh']]) {
      const result = decide(paths, { force: true });
      assert.equal(result.all, true);
      assert.equal(result.e2e, true);
      assert.equal(result.docs, false);
      assert.equal(result.packages.length, everything.length);
    }
  });
});

describe('#293 AC8 AC13: the e2e decision and the reason of every skip', () => {
  it('AC8: e2e runs when the web app changed, or a package it depends on', () => {
    for (const path of [
      'apps/web/src/app/page.tsx',
      'apps/web/e2e/fake-brevo.ts',
      'packages/api/src/x.ts',
      'packages/i18n/en.json',
    ]) {
      const i18n = pkg('@fivvi/i18n', 'packages/i18n', UNIT, []);
      const result = plan({
        paths: [path],
        packages: [
          ...workspace.map((p) =>
            p.name === '@fivvi/web' ? { ...p, dependencies: [...p.dependencies, '@fivvi/i18n'] } : p,
          ),
          i18n,
        ],
      });
      assert.equal(result.e2e, true, path);
    }
  });

  it('AC8: e2e is skipped when the web app does not depend on the change, and the reason says so', () => {
    for (const path of ['scripts/pr.sh', 'docs/agents/build.md', 'apps/cron/src/x.ts']) {
      const result = decide([path]);
      assert.equal(result.e2e, false, path);
      assert.ok(result.reasons.includes('e2e: skipped (not affected): no web change'), path);
    }
  });

  it('AC13: every skipped suite is named with its reason', () => {
    const { reasons } = decide(['scripts/check.sh']);
    assert.ok(reasons.some((r) => r.startsWith('integration: skipped (not affected)')));
    assert.ok(reasons.some((r) => r.startsWith('e2e: skipped (not affected)')));
  });
});

describe('#293 the workspace is read from the repository', () => {
  const real = readWorkspace(join(SCRIPTS, '..'));

  it('finds the web app with its e2e script and its workspace dependencies', () => {
    const web = real.find((p) => p.name === '@fivvi/web');
    assert.ok(web, 'the web app is a workspace package');
    assert.ok(web.scripts.includes('test:e2e'));
    assert.ok(web.dependencies.includes('@fivvi/database'));
  });

  it('finds the nested contract generators as packages of their own', () => {
    assert.ok(real.some((p) => p.dir.startsWith('packages/contract/tools/')));
  });

  it('the real workspace: a database change affects the web app and its e2e tests', () => {
    const result = plan({ paths: ['packages/database/src/schema.ts'], packages: real });
    assert.equal(result.e2e, true);
    assert.ok(result.integration.includes('@fivvi/api'));
  });
});

describe('#293 the command line', () => {
  const run = (input, args = []) =>
    spawnSync('node', [join(SCRIPTS, 'affected.mjs'), ...args], { input, encoding: 'utf8' });

  it('prints key=value lines the way $GITHUB_OUTPUT wants them, with the reasons on stderr', () => {
    const result = run('scripts/check.sh\n');
    assert.equal(result.status, 0, result.stderr);
    const out = Object.fromEntries(result.stdout.trim().split('\n').map((l) => l.split('=')));
    assert.equal(out.e2e, 'false');
    assert.equal(out.root, 'true');
    assert.equal(out.all, 'false');
    assert.match(result.stderr, /e2e: skipped \(not affected\): no web change/);
  });

  it('--force turns every output on', () => {
    const result = run('docs/product/PRODUCT.md\n', ['--force']);
    const out = Object.fromEntries(result.stdout.trim().split('\n').map((l) => l.split('=')));
    assert.equal(out.e2e, 'true');
    assert.equal(out.all, 'true');
  });

  it('--json prints one JSON object', () => {
    const result = run('packages/database/src/x.ts\n', ['--json']);
    const json = JSON.parse(result.stdout);
    assert.equal(json.e2e, true);
    assert.ok(json.packages.includes('@fivvi/web'));
  });

  it('refuses an unknown option', () => {
    assert.notEqual(run('', ['--nope']).status, 0);
  });
});
