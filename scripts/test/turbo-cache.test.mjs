import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
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
import { after, before, describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../..');
const TURBO = join(ROOT, 'node_modules/.bin/turbo');

// #293 AC7: the integration and e2e suites are cacheable. Runs the repository's real turbo.json on a small workspace
// whose suites count their runs, so a cache hit is a run that did not happen.
describe('#293 AC7 turbo caches the integration and e2e suites by their inputs', () => {
  let dir;
  // The cache, the run counters and HOME stay outside the workspace, so they are no input of any task.
  let outside;
  let cache;
  const file = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const counter = (name) => join(outside, `${name}.count`);
  const runs = (name) =>
    existsSync(counter(name)) ? readFileSync(counter(name), 'utf8').length : 0;

  before(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'turbo-cache-')));
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'turbo-cache-out-')));
    cache = join(outside, 'cache');
    copyFileSync(join(ROOT, 'turbo.json'), join(dir, 'turbo.json'));
    file(
      'package.json',
      JSON.stringify({ name: 'fx', private: true, packageManager: 'pnpm@12.5.1' }),
    );
    file('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n');
    // Turbo writes this file on its first run when it is missing, which would change the next run's hash.
    file('pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    file('.gitignore', '.turbo\nnode_modules\n');
    const count = (name) => `node -e "require('node:fs').appendFileSync('${counter(name)}', 'x')"`;
    const noop = 'node -e ""';
    // testing <- database <- api <- web, as in the repository; every package type-checks and builds like the real ones.
    const pkg = (name, deps, scripts) =>
      JSON.stringify({
        name: `@fx/${name}`,
        version: '0.0.0',
        private: true,
        scripts: { typecheck: noop, ...scripts },
        dependencies: Object.fromEntries(deps.map((d) => [`@fx/${d}`, 'workspace:*'])),
      });
    file('packages/testing/package.json', pkg('testing', [], {}));
    file('packages/testing/src/helper.ts', 'export const a = 1;\n');
    file('packages/database/package.json', pkg('database', ['testing'], {}));
    file('packages/database/migrations/0001.sql', 'select 1;\n');
    file(
      'packages/api/package.json',
      pkg('api', ['database'], { 'test:integration': count('api') }),
    );
    file('packages/api/src/a.ts', 'export const a = 1;\n');
    file(
      'apps/web/package.json',
      pkg('web', ['api'], { build: noop, 'test:e2e': count('web-e2e') }),
    );
    file('apps/web/e2e/home.spec.ts', 'x\n');
    const git = (...args) =>
      spawnSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args]);
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore: fixture');
  });
  after(() => {
    if (process.env.KEEP_FIXTURE) return console.log('FIXTURE', dir, outside);
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const turbo = (task, env = {}) => {
    const result = spawnSync(
      TURBO,
      ['run', task, `--cache-dir=${cache}`, '--output-logs=none', '--ui=stream'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: outside,
          TURBO_TELEMETRY_DISABLED: '1',
          TURBO_NO_UPDATE_NOTIFIER: '1',
          TEST_DATABASE_URL: 'postgres://one',
          ...env,
        },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  };

  it('runs an integration suite once, and a second run with nothing changed is a cache hit', () => {
    turbo('test:integration');
    assert.equal(runs('api'), 1);
    const second = turbo('test:integration');
    assert.equal(runs('api'), 1, second);
    assert.match(second, /Cached:\s+4 cached, 4 total/);
  });

  it('the database URL and the e2e port are not part of the hash', () => {
    turbo('test:integration', {
      TEST_DATABASE_URL: 'postgres://two',
      DATABASE_URL: 'postgres://three',
    });
    assert.equal(runs('api'), 1);
  });

  it('a change to the package, to a package it depends on, to migrations or to the test helpers runs it again', () => {
    let expected = 1;
    for (const path of [
      'packages/api/src/a.ts',
      'packages/database/migrations/0001.sql',
      'packages/testing/src/helper.ts',
    ]) {
      appendFileSync(join(dir, path), `\n-- changed ${path}\n`);
      turbo('test:integration');
      expected += 1;
      assert.equal(runs('api'), expected, path);
      turbo('test:integration');
      assert.equal(runs('api'), expected, `${path}: and a cache hit after it`);
    }
  });

  it('an e2e suite is cached by the web app, its e2e folder and what it depends on', () => {
    turbo('test:e2e', { E2E_PORT: '3423' });
    assert.equal(runs('web-e2e'), 1);
    turbo('test:e2e', { E2E_PORT: '4999' });
    assert.equal(runs('web-e2e'), 1, 'a different port is a cache hit');
    for (const [path, expected] of [
      ['apps/web/e2e/home.spec.ts', 2],
      ['packages/api/src/a.ts', 3],
      ['packages/database/migrations/0001.sql', 4],
    ]) {
      appendFileSync(join(dir, path), `\n-- changed ${path}\n`);
      turbo('test:e2e');
      assert.equal(runs('web-e2e'), expected, path);
    }
  });
});
