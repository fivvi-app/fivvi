import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');

// What turbo prints for a task: every line behind "<package>:<task>: ".
const task = (name, ...lines) => lines.map((line) => `${name}: ${line}`);
const vitest = (pkg, task_, summary) =>
  task(
    `@fivvi/${pkg}:${task_}`,
    '$ vitest run',
    ' ✓ test/a.test.ts (3 tests) 10ms',
    '',
    ' Test Files  1 passed (1)',
    `      Tests  ${summary}`,
    '   Start at  13:20:00',
    '   Duration  693ms (import 74%, tests 3%)',
  );
const node = (pass, fail, skipped) =>
  task(
    '//:test:root',
    '  ✔ does a thing (1.2ms)',
    `ℹ tests ${pass + fail + skipped}`,
    'ℹ suites 4',
    `ℹ pass ${pass}`,
    `ℹ fail ${fail}`,
    'ℹ cancelled 0',
    `ℹ skipped ${skipped}`,
    'ℹ todo 0',
  );
const playwright = (...lines) => task('@fivvi/web:test:e2e', 'Running 15 tests', ...lines);
const failed = (name) => [
  `@fivvi/${name}: [ELIFECYCLE] Test failed. See above for more details.`,
  `@fivvi/${name.replace(':', '#')}:  ERROR  command (/x/y) pnpm run test exited (1)`,
];

const suite = (name, kind, status, passed, failed_, skipped) => ({
  name,
  kind,
  status,
  passed,
  failed: failed_,
  skipped,
});

describe('E002 #112 test-summary.sh', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'test-summary-'));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  let n = 0;
  const summarize = (lines, ...args) => {
    const log = join(dir, `${n++}.log`);
    const json = join(dir, `${n}.json`);
    writeFileSync(log, `${lines.join('\n')}\n`);
    const result = spawnSync(join(SCRIPTS, 'test-summary.sh'), ['--json', json, ...args, log], {
      encoding: 'utf8',
    });
    return { ...result, json: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null };
  };

  it('E002 #112 AC1: counts what each unit suite passed, failed and skipped, in the JSON and in a table', () => {
    const result = summarize(
      [
        ...vitest('ui', 'test', '33 passed (33)'),
        ...node(260, 0, 2),
        ...vitest('api', 'test', '29 passed (29)'),
      ],
      '--run',
      'unit',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.json, {
      suites: [
        suite('root', 'unit', 'pass', 260, 0, 2),
        suite('api', 'unit', 'pass', 29, 0, 0),
        suite('ui', 'unit', 'pass', 33, 0, 0),
      ],
      total: { passed: 322, failed: 0, skipped: 2 },
    });
    assert.match(result.stdout, /root\s+pass\s+260\s+0\s+2\n/);
    assert.match(result.stdout, /ui\s+pass\s+33\s+0\s+0\n/);
  });

  it('#293 AC13: lists a suite the change does not affect as skipped (not affected), not as not-run', () => {
    const result = summarize(
      vitest('api', 'test', '29 passed (29)'),
      '--run',
      'unit',
      '--expect',
      '@fivvi/api:test',
      '--unaffected',
      '@fivvi/ui:test',
      '--unaffected',
      '@fivvi/web:test:e2e',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.json.suites, [
      suite('api', 'unit', 'pass', 29, 0, 0),
      suite('ui', 'unit', 'skipped (not affected)', null, null, null),
      suite('web e2e', 'e2e', 'skipped (not affected)', null, null, null),
    ]);
    assert.match(result.stdout, /ui\s+skipped \(not affected\)\s+-\s+-\s+-\n/);
    assert.deepEqual(result.json.total, { passed: 29, failed: 0, skipped: 0 });
  });

  it('#293: an unaffected suite that ran anyway (a cached or pulled-in task) is reported with its counts', () => {
    const result = summarize(node(260, 0, 0), '--run', 'unit', '--unaffected', '//:test:root');
    assert.deepEqual(result.json.suites, [suite('root', 'unit', 'pass', 260, 0, 0)]);
  });

  it('#293: a kind left out by --skip is listed once, also when its suites are unaffected', () => {
    const result = summarize(
      [],
      '--skip',
      'e2e',
      '--unaffected',
      '@fivvi/web:test:e2e',
      '--unaffected',
      '@fivvi/cron:test:e2e',
    );
    assert.deepEqual(result.json.suites, [suite('e2e', 'e2e', 'skipped', null, null, null)]);
  });

  it('E002 #112 AC1: reports a failing suite with its failures, next to the suites that passed', () => {
    const result = summarize(
      [
        ...vitest('ui', 'test', '1 failed | 34 passed | 1 skipped (36)'),
        ...failed('ui:test'),
        ...vitest('api', 'test', '29 passed (29)'),
      ],
      '--run',
      'unit',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.json.suites, [
      suite('api', 'unit', 'pass', 29, 0, 0),
      suite('ui', 'unit', 'fail', 34, 1, 1),
    ]);
    assert.deepEqual(result.json.total, { passed: 63, failed: 1, skipped: 1 });
    assert.match(result.stdout, /ui\s+fail\s+34\s+1\s+1\n/);
  });

  it('E002 #112 AC1: reports a suite that failed before it printed counts as failed, with no counts', () => {
    const result = summarize(
      [...task('@fivvi/ui:test', '$ vitest run'), ...failed('ui:test')],
      '--run',
      'unit',
    );
    assert.deepEqual(result.json.suites, [
      { name: 'ui', kind: 'unit', status: 'fail', passed: null, failed: null, skipped: null },
    ]);
    assert.match(result.stdout, /ui\s+fail\s+-\s+-\s+-\n/);
  });

  it('E002 #112 AC1: counts node:test cancelled tests as failed and todo tests as skipped', () => {
    const result = summarize(
      task(
        '//:test:root',
        'ℹ tests 10',
        'ℹ pass 6',
        'ℹ fail 1',
        'ℹ cancelled 2',
        'ℹ skipped 0',
        'ℹ todo 1',
      ),
      '--run',
      'unit',
    );
    assert.deepEqual(result.json.suites, [suite('root', 'unit', 'fail', 6, 3, 1)]);
  });

  it('E002 #112 AC1: keeps integration and e2e suites apart from the unit suite of the same package', () => {
    const result = summarize(
      [
        ...vitest('api', 'test', '29 passed (29)'),
        ...vitest('api', 'test:integration', '12 passed (12)'),
        ...vitest('database', 'test:integration', '1 failed | 8 passed (9)'),
        ...playwright('  1 skipped', '  2 flaky', '  12 passed (3.2s)'),
      ],
      '--run',
      'unit',
      '--run',
      'integration',
      '--run',
      'e2e',
    );
    assert.deepEqual(result.json.suites, [
      suite('api', 'unit', 'pass', 29, 0, 0),
      suite('api integration', 'integration', 'pass', 12, 0, 0),
      suite('database integration', 'integration', 'fail', 8, 1, 0),
      suite('web e2e', 'e2e', 'pass', 14, 0, 1),
    ]);
    assert.deepEqual(result.json.total, { passed: 63, failed: 1, skipped: 1 });
  });

  it('E002 #112 AC1: counts failed Playwright tests', () => {
    const result = summarize(
      playwright('  2 failed', '    [chromium] › a.spec.ts:3:1 › one', '  13 passed (4s)'),
      '--run',
      'e2e',
    );
    assert.deepEqual(result.json.suites, [suite('web e2e', 'e2e', 'fail', 13, 2, 0)]);
  });

  it('E002 #112 AC1: lists the kinds it was told to skip as skipped, without counts', () => {
    const result = summarize(
      vitest('ui', 'test', '33 passed (33)'),
      '--run',
      'unit',
      '--skip',
      'integration',
      '--skip',
      'e2e',
    );
    assert.deepEqual(result.json.suites, [
      suite('ui', 'unit', 'pass', 33, 0, 0),
      {
        name: 'integration',
        kind: 'integration',
        status: 'skipped',
        passed: null,
        failed: null,
        skipped: null,
      },
      { name: 'e2e', kind: 'e2e', status: 'skipped', passed: null, failed: null, skipped: null },
    ]);
    assert.deepEqual(result.json.total, { passed: 33, failed: 0, skipped: 0 });
    assert.match(result.stdout, /integration\s+skipped\s+-\s+-\s+-\n/);
  });

  it('E002 #112 AC1: reports a kind that ran but printed no counts as having no results', () => {
    const result = summarize(['Docker is not running — start it'], '--run', 'integration');
    assert.deepEqual(result.json.suites, [
      {
        name: 'integration',
        kind: 'integration',
        status: 'no-results',
        passed: null,
        failed: null,
        skipped: null,
      },
    ]);
  });

  it('E002 #112 AC1: lists expected suites with no output as not-run, unless their kind was skipped', () => {
    const result = summarize(
      vitest('ui', 'test', '33 passed (33)'),
      '--run',
      'unit',
      '--skip',
      'integration',
      '--expect',
      '@fivvi/ui:test',
      '--expect',
      '@fivvi/api:test',
      '--expect',
      '@fivvi/api:test:integration',
    );
    assert.deepEqual(
      result.json.suites.map(({ name, status }) => [name, status]),
      [
        ['api', 'not-run'],
        ['ui', 'pass'],
        ['integration', 'skipped'],
      ],
    );
  });

  const cancelled = (pkg) =>
    task(
      `@fivvi/${pkg}:test`,
      'cache miss, executing 5edc6df4868ce48f',
      '$ vitest run',
      '',
      ' RUN  v5.0.1 /x/y',
    );

  it('E002 #112 AC1: lists a task that started and was cancelled, with no counts and no error, as not-run', () => {
    const result = summarize(
      [...vitest('ui', 'test', '33 passed (33)'), ...cancelled('api')],
      '--run',
      'unit',
    );
    assert.deepEqual(result.json.suites, [
      { name: 'api', kind: 'unit', status: 'not-run', passed: null, failed: null, skipped: null },
      suite('ui', 'unit', 'pass', 33, 0, 0),
    ]);
  });

  it('E002 #112 AC1: ignores colours and the output of other tasks', () => {
    const result = summarize(
      [
        '@fivvi/ui:lint: Checked 9 files in 4ms. No fixes applied.',
        ...vitest('ui', 'test', '\u001b[32m33 passed\u001b[39m (33)').map((line) =>
          line.replace('      Tests', '\u001b[2m      Tests\u001b[22m'),
        ),
      ],
      '--run',
      'unit',
    );
    assert.deepEqual(result.json.suites, [suite('ui', 'unit', 'pass', 33, 0, 0)]);
  });

  it('E002 #112 AC1: exits non-zero, with no JSON, on an unknown option', () => {
    const json = join(dir, 'unknown-option.json');
    const result = spawnSync(join(SCRIPTS, 'test-summary.sh'), ['--json', json, '--nope'], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.ok(!existsSync(json), 'no JSON is written');
  });
});

describe('E002 #112 check.sh prints and writes the test summary', () => {
  let base;
  const bin = () => join(base, 'bin');
  const repo = () => join(base, 'repo');

  const write = (path, text, mode) => {
    writeFileSync(path, text);
    if (mode) chmodSync(path, mode);
  };

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'check-summary-')));
    mkdirSync(bin());
    // The fake runners: pnpm answers each turbo run with the canned log and exit code of the scenario.
    write(
      join(bin(), 'pnpm'),
      `#!/usr/bin/env bash
# turbo's dry run (check.sh asks whether the e2e suite is a cache hit): the scenario's answer, if it has one.
case "$*" in *"--dry=json"*) cat "$FAKE_RUNS/dry.json" 2>/dev/null; exit 0 ;; esac
printf '%s\\n' "\${TURBO_FORCE:-}" >> "$FAKE_RUNS/turbo-force"
case "$*" in
  *"run lint"*) name=unit ;;
  *"test:integration"*) name=integration ;;
  *"test:e2e"*) name=e2e ;;
  *) exit 0 ;;
esac
[ ! -f "$FAKE_RUNS/$name.log" ] || cat "$FAKE_RUNS/$name.log"
exit "$(cat "$FAKE_RUNS/$name.exit" 2>/dev/null || echo 0)"
`,
      0o755,
    );
    for (const fake of ['docker', 'shellcheck'])
      write(join(bin(), fake), '#!/bin/sh\nexit 0\n', 0o755);
    // sleep notes that a run slept (the e2e queue polls with it): a test that holds the queue can then
    // let go after the first poll, not after a time that a loaded machine can outlast.
    write(
      join(bin(), 'sleep'),
      '#!/bin/sh\n[ -z "${FAKE_RUNS:-}" ] || touch "$FAKE_RUNS/slept"\nexec /bin/sleep "$@"\n',
      0o755,
    );

    mkdirSync(join(repo(), 'scripts'), { recursive: true });
    mkdirSync(join(repo(), '.githooks'));
    mkdirSync(join(repo(), 'node_modules'));
    mkdirSync(join(repo(), 'packages/database'), { recursive: true });
    // The workspace whose suites check.sh expects: the root, api (unit and integration), ui (unit) and web (e2e).
    const workspace = {
      'packages/api': { test: 'vitest run', 'test:integration': 'vitest run' },
      'packages/ui': { test: 'vitest run' },
      'apps/web': { 'test:e2e': 'playwright test', lint: 'biome lint' },
    };
    write(join(repo(), 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
    for (const [dir, scripts] of Object.entries(workspace)) {
      mkdirSync(join(repo(), dir), { recursive: true });
      const name = `@fivvi/${dir.split('/')[1]}`;
      write(join(repo(), dir, 'package.json'), JSON.stringify({ name, scripts }));
    }
    for (const file of [
      'check.sh',
      '_lib.sh',
      '_shellcheck.sh',
      'test-summary.sh',
      'test-summary.jq',
      'affected.mjs',
      'doc-anchors.mjs',
      'doc-lists.mjs',
      'quarantine.mjs',
    ]) {
      copyFileSync(join(SCRIPTS, file), join(repo(), 'scripts', file));
    }
    // The other checks are not under test here.
    for (const other of ['skills', 'agents', 'emails', 'secrets']) {
      write(join(repo(), 'scripts', `${other}.sh`), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    }
    write(join(repo(), 'scripts/secrets-in-tests.mjs'), 'process.exit(0);\n');
    write(join(repo(), '.githooks/pre-push'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    write(join(repo(), 'packages/database/.env'), 'DATABASE_URL=postgres://test\n');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo()], { env: gitEnv() });
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore(E002): fake repo');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  // No identity or config of the machine: not the git identity, not HOME's config.
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

  let n = 0;
  const check = (runs, args = ['--all'], setup = () => {}, extraEnv = {}, timeout = undefined) => {
    const dir = join(base, `runs-${n++}`);
    mkdirSync(dir);
    for (const [name, { lines, exit = 0, latin1 = false }] of Object.entries(runs)) {
      // latin1: the log keeps a byte that is not UTF-8 (a \xff in the text of a failure).
      const text = `${lines.join('\n')}\n`;
      write(join(dir, `${name}.log`), latin1 ? Buffer.from(text, 'latin1') : text);
      write(join(dir, `${name}.exit`), `${exit}\n`);
    }
    rmSync(join(repo(), '.work'), { recursive: true, force: true });
    setup();
    const { CHECK_FROM: from = repo(), ...env } = extraEnv;
    const result = spawnSync(join(from, 'scripts/check.sh'), args, {
      encoding: 'utf8',
      cwd: from,
      // A run that hangs fails its test instead of the whole suite.
      timeout: timeout ?? 120_000,
      killSignal: 'SIGKILL',
      env: { ...gitEnv(), PATH: `${bin()}:${process.env.PATH}`, FAKE_RUNS: dir, ...env },
    });
    const file = join(repo(), '.work/check-summary.json');
    const forced = join(dir, 'turbo-force');
    return {
      ...result,
      turboForce: existsSync(forced)
        ? readFileSync(forced, 'utf8').split('\n').filter(Boolean)
        : [],
      summary: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null,
    };
  };

  const unit = () => ({
    lines: [
      ...node(260, 0, 0),
      ...vitest('api', 'test', '29 passed (29)'),
      ...vitest('ui', 'test', '33 passed (33)'),
    ],
  });
  const integration = {
    lines: vitest('api', 'test:integration', '12 passed (12)'),
  };
  const e2e = { lines: playwright('  15 passed (3.2s)') };

  it('E002 #112 AC1: prints a table and writes the JSON when every suite passes', () => {
    const result = check({ unit: unit(), integration, e2e });
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(result.summary, {
      suites: [
        suite('root', 'unit', 'pass', 260, 0, 0),
        suite('api', 'unit', 'pass', 29, 0, 0),
        suite('ui', 'unit', 'pass', 33, 0, 0),
        suite('api integration', 'integration', 'pass', 12, 0, 0),
        suite('web e2e', 'e2e', 'pass', 15, 0, 0),
      ],
      total: { passed: 349, failed: 0, skipped: 0 },
    });
    assert.match(result.stdout, /root\s+pass\s+260\s+0\s+0\n/);
    assert.match(result.stdout, /web e2e\s+pass\s+15\s+0\s+0\n/);
    assert.ok(
      result.stdout.indexOf('web e2e') > result.stdout.indexOf('✓ e2e tests'),
      'the table comes after the checks',
    );
  });

  const failingUnit = {
    lines: [
      ...node(260, 0, 0),
      ...task('@fivvi/api:test', 'PASSING-API-OUTPUT', ' Tests  29 passed (29)'),
      ...task(
        '@fivvi/ui:test',
        'FAILING-UI-OUTPUT',
        ' Tests  1 failed | 34 passed (35)',
        '[ELIFECYCLE] Test failed. See above for more details.',
      ),
      '@fivvi/ui#test:  ERROR  command (/x/ui) pnpm run test exited (1)',
      '',
      ' Tasks:    3 successful, 4 total',
      'Failed:    @fivvi/ui#test',
    ],
    exit: 1,
  };

  it('E002 #112 AC1: writes the summary of a failing run, and check.sh still fails', () => {
    const result = check({ unit: failingUnit, integration, e2e });
    assert.equal(result.status, 1);
    assert.deepEqual(
      result.summary.suites.filter((s) => s.status === 'fail'),
      [suite('ui', 'unit', 'fail', 34, 1, 0)],
    );
    assert.match(result.stdout, /ui\s+fail\s+34\s+1\s+0\n/);
  });

  it('E002 #570 AC1: a suite the summary lists as failed fails check.sh, whatever exit code turbo gave', () => {
    // turbo exited 0 while the root suite's log counts one failed test (seen in a factory run on 5 November 2026).
    const exitsZero = { lines: node(259, 1, 0), exit: 0 };
    const result = check({ unit: exitsZero, integration, e2e });
    assert.deepEqual(
      result.summary.suites.filter((s) => s.status === 'fail'),
      [suite('root', 'unit', 'fail', 259, 1, 0)],
    );
    assert.match(result.stdout, /root\s+fail\s+259\s+1\s+0\n/);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /✗ test summary: root failed/);
  });

  it('E002 #570 AC1: a failed suite behind a passing turbo run names the turbo cache and how to rerun it', () => {
    // The cause in the factory run: a cache entry holding the log of concurrent runs, replayed by every cache hit.
    const result = check({ unit: { lines: node(259, 1, 0), exit: 0 }, integration, e2e });
    assert.match(result.stdout, /replayed from the turbo cache/);
    assert.match(result.stdout, /pnpm turbo run \/\/#test:root --force/);
  });

  it('E002 #570 AC1: the rerun command of a failed package unit suite is its task, filtered and forced', () => {
    const uiFails = {
      lines: [...node(260, 0, 0), ...vitest('ui', 'test', '1 failed | 32 passed (33)')],
      exit: 0,
    };
    const result = check({ unit: uiFails, integration, e2e });
    assert.match(result.stdout, /pnpm turbo run test --filter=@fivvi\/ui --force/);
  });

  it('E002 #570 AC1: a failure turbo reported itself gets no cache hint', () => {
    const result = check({ unit: failingUnit, integration, e2e });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /turbo cache/);
  });

  describe('E002 #570: one check.sh per worktree', () => {
    // The lock is a symbolic link to the pid of its owner: creating it fails when it exists, in one step.
    const lock = () => join(repo(), '.work/check.lock');
    const lockExists = () => {
      try {
        lstatSync(lock());
        return true;
      } catch {
        return false;
      }
    };
    const holdLock = (pid) => () => {
      mkdirSync(join(repo(), '.work'), { recursive: true });
      symlinkSync(String(pid), lock());
    };
    const deadPid = () => spawnSync('true').pid;
    // A live process whose command line names check.sh, like a check.sh run, for as long as the test needs it.
    const runningCheck = () =>
      spawn('bash', ['-c', 'sleep 20; :', 'scripts/check.sh'], { stdio: 'ignore' });

    it('stops when another check.sh holds the lock, runs nothing, and leaves the lock to its holder', () => {
      const holder = runningCheck();
      try {
        const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(holder.pid));
        assert.equal(result.status, 1, result.stdout);
        assert.match(
          result.stdout,
          new RegExp(`another scripts/check\\.sh runs in this worktree \\(pid ${holder.pid}\\)`),
        );
        assert.match(result.stdout, /delete \.work\/check\.lock/);
        assert.doesNotMatch(result.stdout, /✓/);
        assert.equal(result.summary, null);
        assert.ok(lockExists(), 'the holder keeps its lock');
      } finally {
        holder.kill();
      }
    });

    it('takes over the lock of a check.sh that is gone', () => {
      const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(deadPid()));
      assert.equal(result.status, 0, result.stdout);
      assert.ok(!lockExists(), 'released at the end');
    });

    it('takes over a lock whose pid now belongs to a process that is not a check.sh', () => {
      // After a kill -9 the pid can be reused: this test process is alive and is not a check.sh.
      const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(process.pid));
      assert.equal(result.status, 0, result.stdout);
      assert.ok(!lockExists(), 'released at the end');
    });

    it('releases the lock when the run passes and when it fails', () => {
      assert.equal(check({ unit: unit(), integration, e2e }).status, 0);
      assert.ok(!lockExists());
      assert.equal(check({ unit: failingUnit, integration, e2e }).status, 1);
      assert.ok(!lockExists());
    });
  });

  describe('E001 #1336: one e2e suite at a time on the machine', () => {
    // Several worktrees running their suites at once load the machine until timing-sensitive tests time out
    // (a factory run with 4-6 builders, load average 20-45). The suites queue on a lock shared by all worktrees
    // (the main checkout's .work/e2e.lock), a symbolic link to the pid of the check.sh whose suite runs.
    const lock = () => join(repo(), '.work/e2e.lock');
    const lockExists = () => {
      try {
        lstatSync(lock());
        return true;
      } catch {
        return false;
      }
    };
    const holdLock = (pid) => () => {
      mkdirSync(join(repo(), '.work'), { recursive: true });
      symlinkSync(String(pid), lock());
    };
    const deadPid = () => spawnSync('true').pid;
    // A live process whose command line names check.sh, for as long as the test needs it.
    const runningCheck = (seconds) =>
      spawn('bash', ['-c', `sleep ${seconds}; :`, 'scripts/check.sh'], { stdio: 'ignore' });
    // The same, but it ends after the run under test has polled the queue once (the fake sleep leaves a mark).
    const checkUntilPolled = (slept) =>
      spawn(
        'bash',
        [
          '-c',
          'for _ in $(seq 600); do [ -e "$1" ] && exit 0; /bin/sleep 0.1; done',
          'scripts/check.sh',
          slept,
        ],
        { stdio: 'ignore' },
      );
    const fast = { E2E_QUEUE_POLL_SECONDS: '0.2' };

    it('AC2: waits for the check.sh whose suite runs, says so, and then runs its own', () => {
      let holder;
      try {
        const result = check(
          { unit: unit(), integration, e2e },
          ['--all'],
          () => {
            // The next run's directory is runs-<n - 1> once check() has counted it.
            holder = checkUntilPolled(join(base, `runs-${n - 1}`, 'slept'));
            holdLock(holder.pid)();
          },
          fast,
        );
        assert.equal(result.status, 0, result.stdout);
        assert.match(
          result.stdout,
          new RegExp(`waiting for the e2e queue: the suite of pid ${holder.pid} runs`),
        );
        assert.match(result.stdout, /✓ e2e tests/);
        assert.ok(!lockExists(), 'released at the end');
      } finally {
        holder?.kill();
      }
    });

    it('AC2: runs at once when nobody holds the queue, and prints no waiting line', () => {
      const result = check({ unit: unit(), integration, e2e }, ['--all'], () => {}, fast);
      assert.equal(result.status, 0, result.stdout);
      assert.doesNotMatch(result.stdout, /waiting for the e2e queue/);
    });

    it('AC2: takes over the queue of a check.sh that is gone, and of a pid that is not a check.sh now', () => {
      for (const pid of [deadPid(), process.pid]) {
        const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(pid), fast);
        assert.equal(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /waiting for the e2e queue/);
        assert.ok(!lockExists(), 'released at the end');
      }
    });

    it('AC2: gives up after the queue timeout, names the holder, runs no e2e and leaves the holder its lock', () => {
      const holder = runningCheck(120);
      try {
        const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(holder.pid), {
          ...fast,
          E2E_QUEUE_TIMEOUT_SECONDS: '1',
        });
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stdout, /✗ e2e tests/);
        assert.match(result.stdout, new RegExp(`still held by pid ${holder.pid} after 1 s`));
        assert.ok(lockExists(), 'the holder keeps its lock');
        assert.equal(result.summary.suites.find((s) => s.kind === 'e2e').status, 'not-run');
      } finally {
        holder.kill();
      }
    });

    it('AC2: stops after three failed takeovers of a stale queue lock instead of spinning', () => {
      // A stale lock (its pid is gone) that cannot be removed: rm fails on it, as on a read-only .work.
      const failingRm = join(base, 'failing-rm');
      mkdirSync(failingRm, { recursive: true });
      write(
        join(failingRm, 'rm'),
        '#!/bin/sh\ncase "$*" in *e2e.lock*) exit 1 ;; esac\nexec /bin/rm "$@"\n',
        0o755,
      );
      const result = check({ unit: unit(), integration, e2e }, ['--all'], holdLock(deadPid()), {
        ...fast,
        PATH: `${failingRm}:${bin()}:${process.env.PATH}`,
      });
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /✗ e2e tests/);
      assert.match(result.stdout, /could not take the e2e queue .*e2e\.lock.* 3 times/);
      assert.equal(result.summary.suites.find((s) => s.kind === 'e2e').status, 'not-run');
    });

    it('AC2: the cap counts takeovers in a row: a live holder in between resets it', () => {
      // The fake rm leaves a stale lock twice, then a live holder's lock; once that holder is done, the lock is stale
      // again. That is four takeovers in all, but never more than three in a row.
      const fakeRm = join(base, 'resetting-rm');
      mkdirSync(fakeRm, { recursive: true });
      const holderPid = join(fakeRm, 'holder-pid');
      const counter = join(fakeRm, 'count');
      write(
        join(fakeRm, 'rm'),
        `#!/bin/bash
case "$*" in *e2e.lock*) ;; *) exec /bin/rm "$@" ;; esac
lock="\${!#}"
c=$(( $(cat "${counter}" 2>/dev/null || echo 0) + 1 ))
echo "$c" > "${counter}"
if [ "$c" -le 2 ]; then /bin/rm -f "$lock"; ln -s ${deadPid()} "$lock"; exit 0; fi
if [ "$c" -eq 3 ]; then /bin/rm -f "$lock"; ln -s "$(cat "${holderPid}")" "$lock"; exit 0; fi
exec /bin/rm "$@"
`,
        0o755,
      );
      rmSync(counter, { force: true });
      let holder;
      try {
        const result = check(
          { unit: unit(), integration, e2e },
          ['--all'],
          () => {
            holder = checkUntilPolled(join(base, `runs-${n - 1}`, 'slept'));
            writeFileSync(holderPid, String(holder.pid));
            holdLock(deadPid())();
          },
          { ...fast, PATH: `${fakeRm}:${bin()}:${process.env.PATH}` },
        );
        assert.equal(result.status, 0, result.stdout);
        assert.match(result.stdout, /✓ e2e tests/);
        assert.doesNotMatch(result.stdout, /could not take the e2e queue/);
        assert.ok(!lockExists(), 'released at the end');
      } finally {
        holder?.kill();
      }
    });

    it('AC2: the queue is shared by the worktrees: a run in a linked worktree waits for a lock in the main checkout', () => {
      const linked = join(base, 'linked-worktree');
      git('worktree', 'add', '--quiet', '--detach', linked);
      mkdirSync(join(linked, 'node_modules'), { recursive: true });
      let holder;
      try {
        const dir = join(base, `runs-${n}`);
        const result = check(
          { unit: unit(), integration, e2e },
          ['--all'],
          () => {
            holder = checkUntilPolled(join(dir, 'slept'));
            holdLock(holder.pid)();
          },
          { ...fast, CHECK_FROM: linked },
        );
        assert.equal(result.status, 0, result.stdout);
        assert.match(
          result.stdout,
          new RegExp(`waiting for the e2e queue: the suite of pid ${holder.pid} runs`),
        );
        assert.match(result.stdout, /✓ e2e tests/);
        assert.ok(!lockExists(), 'released at the end');
        assert.ok(
          !existsSync(join(linked, '.work/e2e.lock')),
          'no queue of its own in the worktree',
        );
      } finally {
        holder?.kill();
        git('worktree', 'remove', '--force', linked);
      }
    });

    const dryRun = (status) =>
      JSON.stringify({
        tasks: [
          { taskId: '@fivvi/web#build', task: 'build', cache: { status: 'MISS' } },
          // Turbo lists test:e2e for every package; those without the script have no command and never hit the cache.
          {
            taskId: '@fivvi/api#test:e2e',
            task: 'test:e2e',
            command: '<NONEXISTENT>',
            cache: { status: 'MISS' },
          },
          {
            taskId: '@fivvi/web#test:e2e',
            task: 'test:e2e',
            command: 'playwright test',
            cache: { status },
          },
        ],
      });
    const withDryRun = (status) => () => {
      write(join(base, `runs-${n - 1}`, 'dry.json'), dryRun(status));
    };

    it('AC2: a suite that is a turbo cache hit replays its log at once and does not wait for the queue', () => {
      const holder = runningCheck(120);
      try {
        const result = check(
          { unit: unit(), integration, e2e },
          ['--all'],
          () => {
            withDryRun('HIT')();
            holdLock(holder.pid)();
          },
          fast,
        );
        assert.equal(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /waiting for the e2e queue/);
        assert.match(result.stdout, /✓ e2e tests/);
        assert.ok(lockExists(), 'the holder keeps its lock');
      } finally {
        holder.kill();
      }
    });

    it('AC2: a cache miss, and a forced run, still wait for the queue', () => {
      for (const [status, extraEnv] of [
        ['MISS', {}],
        ['HIT', { TURBO_FORCE: '1' }],
      ]) {
        const holder = runningCheck(120);
        try {
          const result = check(
            { unit: unit(), integration, e2e },
            ['--all'],
            () => {
              withDryRun(status)();
              holdLock(holder.pid)();
            },
            { ...fast, ...extraEnv, E2E_QUEUE_TIMEOUT_SECONDS: '1' },
          );
          assert.equal(result.status, 1, `${status}: ${result.stdout}`);
          assert.match(result.stdout, /still held by pid/);
        } finally {
          holder.kill();
        }
      }
    });

    it('AC2: releases the queue when the suite passes and when it fails', () => {
      assert.equal(check({ unit: unit(), integration, e2e }, ['--all'], () => {}, fast).status, 0);
      assert.ok(!lockExists());
      const e2eFails = { lines: playwright('  14 passed (3.2s)', '  1 failed'), exit: 1 };
      assert.equal(
        check({ unit: unit(), integration, e2e: e2eFails }, ['--all'], () => {}, fast).status,
        1,
      );
      assert.ok(!lockExists());
    });

    it('AC2: a run without e2e (--fast, or no web change) never waits for the queue', () => {
      const holder = runningCheck(120);
      try {
        const result = check(
          { unit: unit(), integration, e2e },
          ['--all', '--fast'],
          holdLock(holder.pid),
          fast,
        );
        assert.equal(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /waiting for the e2e queue/);
        assert.ok(lockExists(), 'the holder keeps its lock');
      } finally {
        holder.kill();
      }
    });
  });

  it('E002 #570 AC1: the rerun of a failed e2e suite is check.sh itself, forced, which sets the e2e port', () => {
    const e2eFails = { lines: playwright('  14 passed (3.2s)', '  1 failed'), exit: 0 };
    const result = check({ unit: unit(), integration, e2e: e2eFails });
    assert.match(result.stdout, /TURBO_FORCE=1 scripts\/check\.sh/);
    assert.doesNotMatch(result.stdout, /turbo run test:e2e/);
  });

  it('E002 #570 AC1: TURBO_FORCE=1 reaches every turbo run of check.sh', () => {
    const result = check({ unit: unit(), integration, e2e }, ['--all'], () => {}, {
      TURBO_FORCE: '1',
    });
    assert.equal(result.status, 0, result.stdout);
    assert.ok(result.turboForce.length > 0);
    assert.ok(
      result.turboForce.every((value) => value === '1'),
      result.turboForce.join(','),
    );
  });

  it('E002 #570 AC1: a failed integration or e2e suite fails check.sh the same way', () => {
    const e2eFails = { lines: playwright('  14 passed (3.2s)', '  1 failed'), exit: 0 };
    const result = check({ unit: unit(), integration, e2e: e2eFails });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /✗ test summary: web e2e failed/);
  });

  it('E002 #570 AC1: suites that were skipped or not run do not fail check.sh by themselves', () => {
    const result = check({ unit: unit(), integration, e2e }, ['--all', '--fast']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('E002 #112 AC1: shows the output of a failing task, and not of the tasks that passed', () => {
    const result = check({ unit: failingUnit, integration, e2e });
    assert.match(result.stdout, /✗ lint, types, unit tests/);
    assert.match(result.stdout, /FAILING-UI-OUTPUT/);
    assert.match(result.stdout, /ui#test:\s+ERROR/);
    assert.match(result.stdout, /Failed:\s+@fivvi\/ui#test/);
    assert.doesNotMatch(result.stdout, /PASSING-API-OUTPUT/);
    assert.doesNotMatch(result.stdout, /ℹ pass 260/);
    // The parser still read the passing suites from the log it did not print.
    assert.deepEqual(
      result.summary.suites.find((s) => s.name === 'api'),
      suite('api', 'unit', 'pass', 29, 0, 0),
    );
  });

  it('E001 #1336: shows the failure of a task with a very long log without minutes of processing', () => {
    // bash 3.2 (macOS) takes minutes to replace the newlines of a log of 4000 lines in one expansion; a failing
    // root test run (about 200 KB) made check.sh look hung for 40 minutes in a factory run.
    const longLog = Array.from({ length: 6000 }, (_, i) => `//:test:root: line ${i} of a long log`);
    const result = check({
      unit: {
        lines: [...longLog, '//#test:root:  ERROR  command (/x) pnpm run test exited (1)'],
        exit: 1,
      },
      integration,
      e2e,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /\n {4}\/\/:test:root: line 5999 of a long log\n/);
  });

  it('E002 #112 AC1: shows the output of a failing root test run', () => {
    const rootFails = {
      lines: [
        ...task('//:test:root', 'FAILING-ROOT-OUTPUT', 'ℹ pass 5', 'ℹ fail 1'),
        '//#test:root:  ERROR  command (/x) pnpm run test:root exited (1)',
        ' Tasks:    1 successful, 2 total',
      ],
      exit: 1,
    };
    const result = check({ unit: rootFails, integration, e2e });
    assert.match(result.stdout, /FAILING-ROOT-OUTPUT/);
    assert.match(result.stdout, /Tasks:\s+1 successful/);
  });

  it('E002 #112 AC1: lists the suites turbo did not run after a failure as not-run', () => {
    const rootFails = {
      lines: [
        ...task('//:test:root', 'ℹ pass 5', 'ℹ fail 1', 'ℹ skipped 0'),
        '//#test:root:  ERROR  command (/x) pnpm run test:root exited (1)',
      ],
      exit: 1,
    };
    const result = check({ unit: rootFails, integration, e2e });
    assert.deepEqual(
      result.summary.suites.map(({ name, status }) => [name, status]),
      [
        ['root', 'fail'],
        ['api', 'not-run'],
        ['ui', 'not-run'],
        ['api integration', 'pass'],
        ['web e2e', 'pass'],
      ],
    );
    assert.match(result.stdout, /api\s+not-run\s+-\s+-\s+-\n/);
  });

  it('E002 #112 AC1: lists the tasks turbo started and then cancelled after a failure as not-run', () => {
    const cancelledApi = task(
      '@fivvi/api:test',
      'cache miss, executing 5edc6df4868ce48f',
      '$ vitest run',
      ' RUN  v5.0.1 /x/api',
    );
    const uiFails = {
      lines: [
        ...cancelledApi,
        ...task('@fivvi/ui:test', ' Tests  1 failed | 34 passed (35)'),
        '@fivvi/ui#test:  ERROR  command (/x/ui) pnpm run test exited (1)',
      ],
      exit: 1,
    };
    const result = check({ unit: uiFails, integration, e2e });
    assert.deepEqual(
      result.summary.suites
        .filter((s) => s.kind === 'unit')
        .map(({ name, status }) => [name, status]),
      [
        ['root', 'not-run'],
        ['api', 'not-run'],
        ['ui', 'fail'],
      ],
    );
    assert.match(result.stdout, /api\s+not-run\s+-\s+-\s+-\n/);
    assert.doesNotMatch(result.stdout, /no-results/);
  });

  it('E002 #112 AC1: leaves no stale summary when check.sh stops early', () => {
    const stale = join(repo(), '.work/check-summary.json');
    const result = check({}, ['--all'], () => {
      mkdirSync(join(repo(), '.work'), { recursive: true });
      write(stale, '{"stale":true}\n');
      rmSync(join(repo(), 'node_modules'), { recursive: true });
    });
    mkdirSync(join(repo(), 'node_modules'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /no node_modules/);
    assert.ok(!existsSync(stale), 'the summary of the earlier run is gone');
  });

  it('E002 #112 AC1: lists the integration and e2e suites as skipped with --fast', () => {
    const result = check({ unit: unit() }, ['--all', '--fast']);
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(
      result.summary.suites.map(({ name, status }) => [name, status]),
      [
        ['root', 'pass'],
        ['api', 'pass'],
        ['ui', 'pass'],
        ['integration', 'skipped'],
        ['e2e', 'skipped'],
      ],
    );
    assert.match(result.stdout, /e2e\s+skipped\s+-\s+-\s+-\n/);
  });

  describe('E002 #109 the pinned shellcheck (scripts/_shellcheck.sh)', () => {
    const PINNED = execFileSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_shellcheck.sh"; echo "$SHELLCHECK_VERSION"`,
      ],
      { encoding: 'utf8' },
    ).trim();
    const log = () => join(base, 'shellcheck.log');

    // A shellcheck that reports `version`, records who it is when run on files, and passes.
    const fakeShellcheck = (path, version, who) =>
      write(
        path,
        `#!/bin/sh\ncase "$1" in --version) printf 'version: ${version}\\n' ;; *) echo ${who} >> "${log()}" ;; esac\n`,
        0o755,
      );
    const WARNING = /shellcheck 0\.9\.0 found, CI runs /;

    afterEach(() => {
      rmSync(join(repo(), '.tools'), { recursive: true, force: true });
      rmSync(log(), { force: true });
      write(join(bin(), 'shellcheck'), '#!/bin/sh\nexit 0\n', 0o755);
    });

    it('warns about a different local version, names the fix, and still passes', () => {
      const result = check({ unit: unit(), integration, e2e }, ['--all'], () =>
        fakeShellcheck(join(bin(), 'shellcheck'), '0.9.0', 'system'),
      );
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, WARNING);
      assert.match(result.stdout, new RegExp(`CI runs ${PINNED.replaceAll('.', '\\.')}`));
      assert.match(result.stdout, /run: scripts\/bootstrap\.sh/);
      assert.match(result.stdout, /✓ shellcheck\n/);
    });

    it('is silent when the local version is the pinned one', () => {
      const result = check({ unit: unit(), integration, e2e }, ['--all'], () =>
        fakeShellcheck(join(bin(), 'shellcheck'), PINNED, 'system'),
      );
      assert.equal(result.status, 0, result.stdout);
      assert.doesNotMatch(result.stdout, /⚠️/);
    });

    it('runs the pinned binary from the tools directory in place of the one on PATH, without a warning', () => {
      const result = check({ unit: unit(), integration, e2e }, ['--all'], () => {
        fakeShellcheck(join(bin(), 'shellcheck'), '0.9.0', 'system');
        mkdirSync(join(repo(), '.tools', `shellcheck-${PINNED}`), { recursive: true });
        fakeShellcheck(
          join(repo(), '.tools', `shellcheck-${PINNED}`, 'shellcheck'),
          PINNED,
          'pinned',
        );
      });
      assert.equal(result.status, 0, result.stdout);
      assert.doesNotMatch(result.stdout, /⚠️/);
      assert.equal(readFileSync(log(), 'utf8').trim(), 'pinned');
    });
  });

  it('E001 #1368 AC1/AC2: a failed check with a 20,000-line log is indented in linear time, under bash 3.2', (t) => {
    // macOS /bin/bash is 3.2, whose ${var//$'\n'/...} is quadratic: 2,000 lines took 96 s and 8,000 never finished.
    if (!existsSync('/bin/bash')) return t.skip('no /bin/bash');
    const bash = join(base, 'bash-3');
    mkdirSync(bash, { recursive: true });
    if (!existsSync(join(bash, 'bash'))) symlinkSync('/bin/bash', join(bash, 'bash'));
    const lines = Array.from({ length: 20000 }, (_, i) => `e2e line ${i}: ${'x'.repeat(30)}`);
    // The 60 s timeout is the assert on time: the quadratic substitution never finished 8,000 lines.
    const result = check(
      { unit: unit(), integration, e2e: { lines, exit: 1 } },
      ['--all'],
      () => {},
      { PATH: `${bash}:${bin()}:${process.env.PATH}` },
      60_000,
    );
    assert.equal(result.status, 1);
    const shown = result.stdout.split('\n');
    assert.ok(
      shown.includes('    e2e line 0: ' + 'x'.repeat(30)),
      'the first line is indented by four spaces',
    );
    assert.ok(shown.includes('    e2e line 19999: ' + 'x'.repeat(30)), 'so is the last');
  });

  it('E001 #1368: a failed check whose log has a non-UTF-8 byte is still shown, and the summary is still printed (bash 3.2, UTF-8 locale)', (t) => {
    // BSD sed in a UTF-8 locale fails on an illegal byte; under set -e and pipefail that ended check.sh with no output.
    if (!existsSync('/bin/bash')) return t.skip('no /bin/bash');
    const bash = join(base, 'bash-3');
    mkdirSync(bash, { recursive: true });
    if (!existsSync(join(bash, 'bash'))) symlinkSync('/bin/bash', join(bash, 'bash'));
    const result = check(
      {
        unit: unit(),
        integration,
        e2e: {
          // Shaped like turbo's: the failure line, the footer, and a line of the failed task with the byte.
          lines: [
            '@fivvi/web:test:e2e: e2e before',
            '@fivvi/web#test:e2e:  ERROR  command (/x/web) pnpm run test:e2e exited (1)',
            '',
            ' Tasks:    0 successful, 1 total',
            'Failed:    @fivvi/web#test:e2e',
            '@fivvi/web:test:e2e: e2e bad byte: \xff here',
            '@fivvi/web:test:e2e: e2e after',
            '@fivvi/api:test: api failure output',
            '@fivvi/api#test:  ERROR  command (/x/api) pnpm run test exited (1)',
          ],
          exit: 1,
          latin1: true,
        },
      },
      ['--all'],
      () => {},
      { PATH: `${bash}:${bin()}:${process.env.PATH}`, LC_ALL: 'en_US.UTF-8' },
      60_000,
    );
    assert.equal(result.status, 1, result.stderr);
    const shown = result.stdout.split('\n');
    assert.ok(
      shown.includes(
        '    @fivvi/web#test:e2e:  ERROR  command (/x/web) pnpm run test:e2e exited (1)',
      ),
      'the failure line is shown, indented',
    );
    assert.ok(
      shown.includes('    @fivvi/web:test:e2e: e2e before'),
      'the lines before the byte are shown',
    );
    assert.ok(
      shown.some((l) => l.startsWith('    @fivvi/web:test:e2e: e2e bad byte: ')),
      'so is the line with the byte',
    );
    assert.ok(shown.includes('    @fivvi/web:test:e2e: e2e after'), 'so are the lines after it');
    // sed stopping at the byte would drop the prefix of a task whose ERROR line comes after it.
    assert.ok(
      shown.includes('    @fivvi/api:test: api failure output'),
      'so is the output of a second failed task',
    );
    assert.doesNotMatch(result.stderr, /illegal byte/, 'no tool complains about the byte');
    assert.match(result.stdout, /^root +/m, 'the summary table is printed');
  });

  it('E002 #112 AC1: is git-ignored: the summary goes to .work/', () => {
    assert.match(readFileSync(join(SCRIPTS, '../.gitignore'), 'utf8'), /^\.work\/$/m);
  });

  it('E002 #112 AC2: tells builders to quote the summary, with a row as check.sh prints it', () => {
    const build = readFileSync(join(SCRIPTS, '../docs/agents/build.md'), 'utf8');
    assert.match(build, /Quote that summary/);
    assert.match(build, /\.work\/check-summary\.json/);
    const example = build.match(/`(root +pass +\d+ +\d+ +\d+)`/);
    assert.ok(example, 'build.md shows a row of the table');
    // The same row, to the column, as check.sh prints it (the counts differ).
    const digits = (text) => text.replace(/\d/g, '9');
    const printed = check({ unit: unit(), integration, e2e }).stdout.split('\n');
    assert.ok(printed.some((line) => digits(line) === digits(example[1])));
  });
});
