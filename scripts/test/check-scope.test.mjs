import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');

// check.sh runs only what the change affects (#293, ADR-024). Run against a fake repository with a fake pnpm that
// records what it was asked to run, so the tests see the decision and not turbo.
describe('#293 check.sh runs the checks a change can affect', () => {
  let base;
  const bin = () => join(base, 'bin');
  const repo = () => join(base, 'repo');
  const callsFile = () => join(base, 'calls.log');

  const write = (path, text, mode) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    if (mode) chmodSync(path, mode);
  };

  const gitEnv = () => ({
    PATH: process.env.PATH,
    HOME: base,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@users.noreply.github.com',
  });
  const git = (...args) =>
    execFileSync('git', ['-C', repo(), ...args], { encoding: 'utf8', env: gitEnv() });

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'check-scope-')));
    // The fake runners log every call; the tools the checks need exist and succeed.
    write(join(bin(), 'pnpm'), `#!/usr/bin/env bash\necho "pnpm $*" >> "${callsFile()}"\n`, 0o755);
    for (const fake of ['docker', 'shellcheck'])
      write(join(bin(), fake), `#!/bin/sh\necho "${fake} $*" >> "${callsFile()}"\nexit 0\n`, 0o755);
    mkdirSync(join(repo(), 'node_modules'), { recursive: true });
    mkdirSync(join(repo(), '.githooks'));
    mkdirSync(join(repo(), 'scripts'));
    // web depends on api and database; api on database; ui stands alone.
    const packages = {
      'apps/web': {
        scripts: { test: 'x', 'test:integration': 'x', 'test:e2e': 'x', lint: 'x' },
        dependencies: { '@fivvi/api': 'workspace:*', '@fivvi/database': 'workspace:*' },
      },
      'packages/api': {
        scripts: { test: 'x', 'test:integration': 'x' },
        dependencies: { '@fivvi/database': 'workspace:*' },
      },
      'packages/database': { scripts: { test: 'x', 'test:integration': 'x' } },
      'packages/ui': { scripts: { test: 'x' } },
      'packages/contract': { scripts: { test: 'x', check: 'x' } },
    };
    for (const [dir, json] of Object.entries(packages))
      write(
        join(repo(), dir, 'package.json'),
        JSON.stringify({ name: `@fivvi/${dir.split('/')[1]}`, ...json }),
      );
    write(join(repo(), 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
    write(join(repo(), 'package.json'), '{"name":"fivvi"}');
    write(join(repo(), 'pnpm-lock.yaml'), 'lock\n');
    write(join(repo(), 'packages/database/.env'), 'DATABASE_URL=postgres://test\n');
    write(join(repo(), '.githooks/pre-push'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    write(join(repo(), 'docs/product/PRODUCT.md'), '# Product\n');
    for (const file of [
      'check.sh',
      '_lib.sh',
      '_shellcheck.sh',
      'test-summary.sh',
      'test-summary.jq',
      'affected.mjs',
    ])
      copyFileSync(join(SCRIPTS, file), join(repo(), 'scripts', file));
    // The hygiene checks are not under test here, only that they run: each logs its name.
    for (const other of ['skills', 'agents', 'emails', 'secrets'])
      write(
        join(repo(), 'scripts', `${other}.sh`),
        `#!/usr/bin/env bash\necho "${other}.sh $*" >> "${callsFile()}"\n`,
        0o755,
      );
    write(join(repo(), 'scripts/secrets-in-tests.mjs'), 'process.exit(0);\n');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo()], { env: gitEnv() });
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore(E002): fake repo');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  });
  after(() => rmSync(base, { recursive: true, force: true }));
  afterEach(() => {
    git('reset', '--quiet', '--hard', 'origin/main');
    git('clean', '--quiet', '-fd', '-e', 'node_modules', '-e', '.env');
  });

  /** Changes `files` (written, uncommitted) and runs check.sh; returns what it printed, called and summarised. */
  const run = (files, args = []) => {
    rmSync(callsFile(), { force: true });
    rmSync(join(repo(), '.work'), { recursive: true, force: true });
    for (const file of files) write(join(repo(), file), `${file} changed\n`);
    const result = spawnSync(join(repo(), 'scripts/check.sh'), args, {
      encoding: 'utf8',
      cwd: repo(),
      env: { ...gitEnv(), PATH: `${bin()}:${process.env.PATH}` },
    });
    const calls = existsSync(callsFile())
      ? readFileSync(callsFile(), 'utf8').trim().split('\n')
      : [];
    const json = join(repo(), '.work/check-summary.json');
    return {
      ...result,
      calls,
      turbo: calls.filter((call) => call.startsWith('pnpm turbo run')),
      summary: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null,
    };
  };
  const status = (result, name) => result.summary.suites.find((s) => s.name === name)?.status;
  const HYGIENE = [
    'skills.sh check',
    'agents.sh check',
    'emails.sh commits',
    'emails.sh files',
    'secrets.sh files',
  ];
  const runsHygiene = (result) => {
    for (const call of HYGIENE)
      assert.ok(result.calls.includes(call), `${call} ran: ${result.calls.join(' | ')}`);
    assert.match(result.stdout, /✓ doc links/);
  };

  it('AC1: a change to scripts runs shellcheck, the root script tests and the hygiene checks, and skips the suites', () => {
    const result = run(['scripts/new-tool.sh']);
    assert.equal(result.status, 0, result.stdout);
    runsHygiene(result);
    assert.match(result.stdout, /✓ shellcheck/);
    assert.ok(
      result.calls.some((c) => c.startsWith('shellcheck -x') && c.includes('scripts/new-tool.sh')),
      'shellcheck ran on the scripts',
    );
    assert.equal(result.turbo.length, 1, result.turbo.join('\n'));
    assert.match(result.turbo[0], /turbo run \/\/#lint:root \/\/#test:root \/\/#format:check:root/);
    assert.doesNotMatch(result.turbo[0], /--filter/);
    assert.equal(status(result, 'database integration'), 'skipped (not affected)');
    assert.equal(status(result, 'web e2e'), 'skipped (not affected)');
    assert.equal(status(result, 'ui'), 'skipped (not affected)');
    assert.match(result.stdout, /integration tests: skipped \(not affected\)/);
    assert.match(result.stdout, /e2e tests: skipped \(not affected\): no web change/);
    assert.ok(!result.calls.some((c) => c.startsWith('docker')), 'no database was started');
  });

  it('AC2: a change to Markdown only runs the hygiene checks including doc links and no test suite', () => {
    const result = run(['docs/product/PRODUCT.md']);
    assert.equal(result.status, 0, result.stdout);
    runsHygiene(result);
    assert.deepEqual(result.turbo, []);
    assert.ok(!result.calls.some((c) => c.startsWith('shellcheck -x')), 'shellcheck skipped');
    assert.match(result.stdout, /shellcheck: skipped \(not affected\)/);
    for (const suite of result.summary.suites)
      assert.equal(suite.status, 'skipped (not affected)', suite.name);
  });

  it('AC3: a change to one package runs lint, types, unit tests and build for it and its dependents only', () => {
    const result = run(['packages/ui/src/button.ts']);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.turbo[0], /turbo run lint typecheck test format:check build /);
    assert.match(result.turbo[0], /--filter=@fivvi\/ui\b/);
    assert.doesNotMatch(result.turbo[0], /@fivvi\/(api|database|contract)/);
    assert.equal(status(result, 'api'), 'skipped (not affected)');
    assert.equal(status(result, 'ui integration'), undefined);
    assert.equal(status(result, 'web e2e'), 'skipped (not affected)');
    runsHygiene(result);
  });

  it('AC4: a change to packages/database runs the integration tests of it and of what depends on it, and the web e2e tests', () => {
    const result = run(['packages/database/migrations/0001_x.sql']);
    assert.equal(result.status, 0, result.stdout);
    const integration = result.turbo.find((call) => call.includes('test:integration'));
    assert.ok(integration, result.turbo.join('\n'));
    for (const name of ['database', 'api', 'web'])
      assert.match(integration, new RegExp(`--filter=@fivvi/${name}\\b`));
    const e2e = result.turbo.find((call) => call.includes('test:e2e'));
    assert.ok(e2e, 'the web app depends on database: e2e runs');
    assert.equal(status(result, 'ui'), 'skipped (not affected)');
  });

  it('AC4: a change that does not reach the web app skips e2e and says why', () => {
    const result = run(['packages/ui/src/button.ts']);
    assert.ok(!result.turbo.some((call) => call.includes('test:e2e')));
    assert.match(result.stdout, /e2e tests: skipped \(not affected\): no web change/);
  });

  it('AC5: a change to the lockfile, root package.json, turbo.json or the shared test preset runs everything', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'package.json',
      'turbo.json',
      'tsconfig.base.json',
      'packages/testing/src/vitest.ts',
    ]) {
      const result = run([file]);
      assert.equal(result.status, 0, `${file}: ${result.stdout}`);
      assert.match(
        result.turbo[0],
        /turbo run lint typecheck test format:check build --output-logs=full/,
        file,
      );
      assert.doesNotMatch(result.turbo.join('\n'), /--filter=@fivvi\/(ui|api)/, file);
      assert.ok(
        result.turbo.some((c) => c.includes('test:integration')),
        file,
      );
      assert.ok(
        result.turbo.some((c) => c.includes('test:e2e')),
        file,
      );
      assert.match(result.stdout, /✓ shellcheck/, file);
    }
  });

  it('AC6: --all runs everything, whatever changed', () => {
    const result = run(['docs/product/PRODUCT.md'], ['--all']);
    assert.equal(result.status, 0, result.stdout);
    assert.match(
      result.turbo[0],
      /turbo run lint typecheck test format:check build --output-logs=full/,
    );
    assert.ok(result.turbo.some((c) => c.includes('test:integration')));
    assert.ok(result.turbo.some((c) => c.includes('test:e2e')));
    assert.match(result.stdout, /✓ shellcheck/);
    assert.ok(!result.summary.suites.some((s) => s.status === 'skipped (not affected)'));
  });

  it('--fast still skips the integration and e2e tests, also with --all', () => {
    for (const args of [['--fast'], ['--all', '--fast'], ['--fast', '--all']]) {
      const result = run(['packages/database/migrations/0001_x.sql'], args);
      assert.equal(result.status, 0, result.stdout);
      assert.ok(
        !result.turbo.some((c) => c.includes('test:integration') || c.includes('test:e2e')),
        args.join(' '),
      );
      assert.equal(status(result, 'integration'), 'skipped', args.join(' '));
      assert.equal(status(result, 'e2e'), 'skipped', args.join(' '));
    }
  });

  it('a committed change counts as well as an uncommitted one, against the merge base with origin/main', () => {
    write(join(repo(), 'packages/ui/src/committed.ts'), 'x\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'feat(E002): committed');
    const result = run([]);
    assert.match(result.turbo[0], /--filter=@fivvi\/ui\b/);
  });

  // A file that exists on main and is moved by the branch: `git diff --name-only` with rename detection lists only the new
  // path, so the package it left would not count as changed.
  const withFileOnMain = (body) => {
    const original = git('rev-parse', 'origin/main').trim();
    write(join(repo(), 'packages/database/src/schema.ts'), 'a file that is moved\n'.repeat(20));
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore(E002): base file');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    try {
      mkdirSync(join(repo(), 'packages/ui/src'), { recursive: true });
      git('mv', 'packages/database/src/schema.ts', 'packages/ui/src/schema.ts');
      body();
    } finally {
      git('update-ref', 'refs/remotes/origin/main', original);
    }
  };

  it('a file moved out of a package (committed) counts for the package it left', () => {
    withFileOnMain(() => {
      git('commit', '--quiet', '-m', 'refactor(E002): move');
      const result = run([]);
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.turbo[0], /--filter=@fivvi\/database\b/);
      assert.match(result.turbo[0], /--filter=@fivvi\/ui\b/);
      assert.ok(
        result.turbo.some((c) => c.includes('test:e2e')),
        'web depends on database: e2e runs',
      );
    });
  });

  it('a file moved out of a package (staged, not committed) counts for the package it left', () => {
    withFileOnMain(() => {
      const result = run([]);
      assert.match(result.turbo[0], /--filter=@fivvi\/database\b/);
    });
  });

  it('AC13: every skip names its reason in the output', () => {
    const result = run(['scripts/new-tool.sh']);
    assert.match(result.stdout, /- integration tests: skipped \(not affected\)/);
    assert.match(result.stdout, /- e2e tests: skipped \(not affected\): no web change/);
  });

  it('refuses an unknown option', () => {
    const result = run([], ['--nope']);
    assert.notEqual(result.status, 0);
  });
});
