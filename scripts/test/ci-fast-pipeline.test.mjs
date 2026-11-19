import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

// ADR-034: the pipeline switch (.github/pipeline.json) in ci.yml. With `ci: fast` the UI tests of a pull request and a merge group
// are left out and run every night; with `ci: full` every run runs them, as before. "Detect changes" reads the switch
// (scripts/test/scripts.test.mjs runs its step in both modes) and outputs `ui_tests`; this file checks what each job does with it,
// and runs the shell of the steps that decide something (the quarantine lists, the Android gate) in both modes.

const ROOT = join(import.meta.dirname, '../..');
const SCRIPTS = join(ROOT, 'scripts');
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

const jobsSection = ci.slice(ci.indexOf('\njobs:\n'));
const keys = [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
const jobs = Object.fromEntries(
  keys.map((key, i) => [
    key[1],
    jobsSection.slice(key.index, i + 1 < keys.length ? keys[i + 1].index : undefined),
  ]),
);
const steps = (job) => job.split(/\n(?= {6}- )/).slice(1);
const stepNamed = (job, name) => {
  const found = steps(job).filter((step) => step.includes(`name: ${name}\n`));
  assert.equal(found.length, 1, `one step named ${name}`);
  return found[0];
};
const stepIf = (step) => step.match(/^ {8}if: (.+)$/m)?.[1] ?? '';
const jobIf = (job) => job.match(/^ {4}if: (.+)$/m)?.[1] ?? '';
const runOf = (step) => step.match(/^ {8}run: (.+)$/m)?.[1];
/** The shell of a `run: |` block, de-indented. */
const script = (step) => {
  const lines = step.split('\n');
  const start = lines.findIndex((line) => /^ {8}run: \|$/.test(line));
  assert.ok(start >= 0, 'a run block');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith(' '.repeat(10))) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
};

const UI = "needs.changes.outputs.ui_tests == 'true'";
const NO_UI = "needs.changes.outputs.ui_tests != 'true'";

describe('ADR-034 the schedule', () => {
  it('runs CI every night at 02:00 UTC, on top of the other events', () => {
    assert.match(ci, /^ {2}schedule:\n {4}- cron: '0 2 \* \* \*'$/m);
    for (const event of ['pull_request', 'push', 'merge_group', 'workflow_dispatch']) {
      assert.match(ci, new RegExp(`^ {2}${event}:`, 'm'), event);
    }
  });

  it('gives the nightly run a concurrency group of its own, and cancels no run but a superseded pull request run', () => {
    assert.match(
      ci,
      /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| \(github\.event_name == 'schedule' && 'nightly'\) \|\| github\.ref \}\}/,
    );
    assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  it('every condition on the event is for the five known events: the nightly run is not a push', () => {
    const events = new Set(
      [...ci.matchAll(/github\.event_name (?:==|!=) '(\w+)'/g)].map((m) => m[1]),
    );
    assert.deepEqual([...events].sort(), ['pull_request', 'push', 'schedule']);
    assert.doesNotMatch(
      ci,
      /github\.event_name == 'push' \|\| github\.event_name == 'schedule'/,
      'a scheduled run behaves like workflow_dispatch, not like a push',
    );
  });
});

describe('ADR-034 Detect changes', () => {
  it('outputs ui_tests, from the step that asks scripts/pipeline.sh ui-tests, the one place of the rule', () => {
    assert.match(jobs.changes, /^ {6}ui_tests: \$\{\{ steps\.filter\.outputs\.ui_tests \}\}$/m);
    const filter = script(stepNamed(jobs.changes, 'Filter paths'));
    assert.match(filter, /ui_tests="\$\(scripts\/pipeline\.sh ui-tests --event "\$EVENT"\)"/);
    assert.doesNotMatch(filter, /ci_mode.*==.*'fast'/);
  });

  it('forces the Linux E2E decision in the nightly run like on demand', () => {
    assert.match(
      stepNamed(jobs.changes, 'Filter paths'),
      /\[\[ "\$EVENT" == 'workflow_dispatch' \|\| "\$EVENT" == 'schedule' \|\| "\$RUN_NATIVE" == 'true' \]\]; then affected_args\+=\(--force\)/,
    );
  });
});

describe('ADR-034 iOS tests', () => {
  for (const name of ['ios-tests', 'ios-tests-retry']) {
    describe(name, () => {
      const job = jobs[name];
      const full = stepNamed(job, 'Unit and UI tests (${{ matrix.locale }} ${{ matrix.shard }}/2)');
      const fast = stepNamed(job, 'Unit tests (${{ matrix.locale }}), no UI tests in this run');

      it('waits for Detect changes too, for its decision', () => {
        assert.match(job, /^ {4}needs: \[changes, (ios-build, ios-build-retry|ios-tests-plan)\]$/m);
      });

      it('runs its part of every test with UI tests, and in part 1 the unit tests with --unit-only without them (#1447)', () => {
        assert.equal(stepIf(full), UI);
        assert.equal(
          runOf(full),
          'scripts/test-ios.sh test ${{ matrix.locale }} --shard ${{ matrix.shard }}/2',
        );
        assert.equal(stepIf(fast), `${NO_UI} && matrix.shard == 1`);
        assert.equal(runOf(fast), 'scripts/test-ios.sh test ${{ matrix.locale }} --unit-only');
      });

      it('keeps the matrix, the timeout and the name of a part', () => {
        assert.match(
          job,
          /^ {4}name: iOS tests \(\$\{\{ matrix\.locale \}\} \$\{\{ matrix\.shard \}\}\/2\)( \(retry\))?$/m,
        );
        assert.match(job, /^ {4}timeout-minutes: 44$/m);
        assert.match(
          job,
          /^ {8}(locale: \[nl, en\]\n {8}shard: \[1, 2\]|include: \$\{\{ fromJSON)/m,
        );
      });
    });
  }

  it('the build job is unchanged: it builds and packs the bundle with the UI test target in it', () => {
    assert.match(jobs['ios-build'], /run: scripts\/test-ios\.sh build\n/);
    assert.equal(jobIf(jobs['ios-build']), "needs.changes.outputs.ios == 'true'");
  });
});

describe('ADR-034 Android', () => {
  const tests = jobs['android-tests'];

  it('without UI tests, Android tests verifies --no-ui with the build tools only: no KVM, no emulator, no AVD cache', () => {
    const verify = stepNamed(tests, 'Unit tests and release bundle, no UI tests in this run');
    assert.equal(runOf(verify), 'scripts/android.sh verify --no-ui');
    assert.equal(stepIf(verify), `github.event_name != 'push' && ${NO_UI}`);
    const tools = stepNamed(tests, 'Android SDK build tools');
    assert.equal(runOf(tools), 'scripts/android.sh setup --build-only');
    assert.equal(stepIf(tools), NO_UI);
    // Every step for the emulator is for a run with UI tests only.
    for (const name of [
      'Free disk space',
      'Enable KVM',
      'Android SDK packages and emulator',
      'Emulator cache key',
      'Cache the emulator',
      'Boot the emulator',
    ]) {
      assert.equal(stepIf(stepNamed(tests, name)), UI, name);
    }
    assert.equal(stepIf(stepNamed(tests, 'Stop the emulator')), `always() && ${UI}`);
    assert.equal(
      stepIf(stepNamed(tests, 'The Compose UI test that ran last')),
      `failure() && ${UI}`,
    );
  });

  it('with UI tests, it runs the steps of the full pipeline, with the same commands and timeouts', () => {
    const verify = stepNamed(tests, 'Unit tests, release bundle and Compose UI tests');
    assert.equal(runOf(verify), 'scripts/android.sh verify');
    assert.equal(stepIf(verify), `github.event_name != 'push' && ${UI}`);
    assert.match(verify, /^ {8}timeout-minutes: 40$/m);
    assert.equal(
      runOf(stepNamed(tests, 'Android SDK packages and emulator')),
      'scripts/android.sh setup',
    );
    assert.equal(runOf(stepNamed(tests, 'Boot the emulator')), 'scripts/android.sh emulator');
    assert.match(tests, /^ {4}timeout-minutes: 50$/m);
  });

  it('what both modes need has no condition: the checkout, Java and Gradle, and the reports and step durations that run always', () => {
    const unconditional = steps(tests)
      .filter((step) => stepIf(step) === '')
      .map((step) => step.match(/uses: ([^@\s]+)/)?.[1]);
    assert.deepEqual(unconditional, [
      'actions/checkout',
      'actions/setup-java',
      'gradle/actions/setup-gradle',
    ]);
    for (const name of ['Upload Android reports', 'Step durations']) {
      assert.equal(stepIf(stepNamed(tests, name)), 'always()', name);
    }
  });

  it('Android Maestro runs only with UI tests, and Android build builds and uploads the Maestro app only then', () => {
    assert.equal(
      jobIf(jobs['android-maestro']),
      `needs.changes.outputs.android == 'true' && github.event_name != 'push' && ${UI}`,
    );
    const build = jobs['android-build'];
    for (const name of ['Debug app for Maestro', 'Upload the debug app']) {
      assert.equal(stepIf(stepNamed(build, name)), `github.event_name != 'push' && ${UI}`, name);
    }
    assert.equal(
      runOf(stepNamed(build, 'ktlint, checks and debug build')),
      'scripts/android.sh build',
    );
  });
});

describe('ADR-034 E2E (Linux)', () => {
  it('runs only when the web app is affected and the run has UI tests; the name is the required check', () => {
    assert.match(jobs.e2e, /^ {4}name: E2E \(Linux\)$/m);
    assert.equal(jobIf(jobs.e2e), `needs.changes.outputs.e2e == 'true' && ${UI}`);
  });
});

// The two Quarantine jobs wait for no other job (#1361 AC2, #1363 AC1), so each reads the switch itself: `scripts/pipeline.sh get ci`
// and the event, and decides whether the UI lists run. The decision is the one "Detect changes" makes for `ui_tests`.
describe('ADR-034 the Quarantine jobs read the switch themselves', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the shell of `step` in a repo with the real pipeline scripts, the given switch and the stub `scriptFile`. */
  const runLists = (step, { ci: mode, event }, scriptFile, stub) => {
    const dir = mkdtempSync(join(tmpdir(), 'quarantine-lists-'));
    dirs.push(dir);
    spawnSync('git', ['init', '--quiet', dir]);
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, '.github'));
    for (const file of ['pipeline.sh', '_lib.sh'])
      cpSync(join(SCRIPTS, file), join(dir, 'scripts', file));
    if (mode !== undefined)
      writeFileSync(
        join(dir, '.github/pipeline.json'),
        JSON.stringify({ ci: mode, review: 'split' }),
      );
    writeFileSync(join(dir, 'scripts', scriptFile), stub);
    const output = join(dir, 'output');
    const summary = join(dir, 'summary');
    writeFileSync(output, '');
    writeFileSync(summary, '');
    const result = spawnSync('bash', ['-c', script(step)], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        EVENT: event,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return {
      outputs: Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.split('=')),
      ),
      summary: readFileSync(summary, 'utf8'),
    };
  };

  // The events and settings in which a run has UI tests: full always, fast only in the nightly run and on demand.
  const WITH_UI = [
    { ci: 'full', event: 'pull_request' },
    { ci: 'full', event: 'merge_group' },
    { ci: 'fast', event: 'schedule' },
    { ci: 'fast', event: 'workflow_dispatch' },
  ];
  const WITHOUT_UI = [
    { ci: 'fast', event: 'pull_request' },
    { ci: 'fast', event: 'merge_group' },
  ];

  describe('Quarantine (Android)', () => {
    const job = jobs['quarantine-android'];
    const lists = stepNamed(job, 'Read the quarantine lists');
    const read = (setting, counts) =>
      runLists(
        lists,
        setting,
        'quarantine-android.mjs',
        `console.log(${JSON.stringify(counts)}[process.argv[3]]);\n`,
      );

    it('waits for no job and has no job condition beyond a push: the lists step reads the switch', () => {
      assert.doesNotMatch(job, /^ {4}needs:/m);
      assert.equal(jobIf(job), "github.event_name != 'push'");
      assert.match(lists, /^ {10}EVENT: \$\{\{ github\.event_name \}\}$/m);
      // One rule, one helper (scripts/pipeline.sh ui-tests): the step does not repeat it.
      assert.match(script(lists), /scripts\/pipeline\.sh ui-tests --event "\$EVENT"/);
      assert.doesNotMatch(script(lists), /pipeline\.sh get ci|workflow_dispatch/);
    });

    it('with UI tests (full, nightly, on demand) it reads both lists as before', () => {
      for (const setting of WITH_UI) {
        const { outputs } = read(setting, { compose: 2, maestro: 1 });
        assert.deepEqual(
          outputs,
          { compose: '2', maestro: '1', any: 'true' },
          JSON.stringify(setting),
        );
      }
    });

    it('without UI tests (fast on a pull request or in a merge group) nothing runs and the summary says why', () => {
      for (const setting of WITHOUT_UI) {
        const { outputs, summary } = read(setting, { compose: 2, maestro: 1 });
        assert.deepEqual(
          outputs,
          { compose: '0', maestro: '0', any: 'false' },
          JSON.stringify(setting),
        );
        assert.match(summary, /nightly run/);
      }
    });

    it('an unreadable switch leaves the lists out, never runs them on a guess', () => {
      const { outputs } = read(
        { ci: 'sometimes', event: 'pull_request' },
        { compose: 2, maestro: 1 },
      );
      assert.equal(outputs.any, 'false');
      assert.equal(
        read({ event: 'pull_request' }, { compose: 2, maestro: 1 }).outputs.any,
        'false',
      );
    });
  });

  describe('Quarantine', () => {
    const lists = stepNamed(jobs.quarantine, 'Read the quarantine lists');
    const reporter = stepNamed(jobs.quarantine, 'Report the quarantined tests');
    const read = (setting, counts) =>
      runLists(
        lists,
        setting,
        'quarantine.mjs',
        `console.log(${JSON.stringify(counts)}[process.argv[3]]);\n`,
      );

    it('waits for no job, has no condition and reads the switch itself', () => {
      assert.doesNotMatch(jobs.quarantine, /^ {4}(needs|if):/m);
      assert.match(lists, /^ {10}EVENT: \$\{\{ github\.event_name \}\}$/m);
      // One rule, one helper (scripts/pipeline.sh ui-tests): the step does not repeat it.
      assert.match(script(lists), /scripts\/pipeline\.sh ui-tests --event "\$EVENT"/);
      assert.doesNotMatch(script(lists), /pipeline\.sh get ci|workflow_dispatch/);
    });

    it('with UI tests (full, nightly, on demand) it reads both lists as before', () => {
      for (const setting of WITH_UI) {
        const { outputs, summary } = read(setting, { vitest: 2, playwright: 3 });
        assert.deepEqual(
          outputs,
          { vitest: '2', playwright: '3', playwright_later: '0', any: 'true' },
          JSON.stringify(setting),
        );
        assert.equal(summary, '');
      }
    });

    it('without UI tests (fast on a pull request or in a merge group) it runs the Vitest list only and leaves the Playwright list for the nightly run', () => {
      for (const setting of WITHOUT_UI) {
        const { outputs } = read(setting, { vitest: 2, playwright: 3 });
        assert.deepEqual(
          outputs,
          { vitest: '2', playwright: '0', playwright_later: '3', any: 'true' },
          JSON.stringify(setting),
        );
      }
    });

    it('an unreadable or unknown switch leaves the Playwright list out', () => {
      for (const setting of [
        { ci: 'sometimes', event: 'pull_request' },
        { event: 'pull_request' },
        { ci: 'sometimes', event: 'push' },
      ]) {
        assert.equal(read(setting, { vitest: 0, playwright: 1 }).outputs.playwright, '0');
      }
    });

    it('with no Vitest entries and Playwright entries left for later, nothing runs and the summary says why', () => {
      const setting = { ci: 'fast', event: 'pull_request' };
      const { outputs, summary } = read(setting, { vitest: 0, playwright: 4 });
      assert.equal(outputs.any, 'false');
      assert.match(summary, /4 listed Playwright test\(s\) run in the nightly run only/);
      assert.doesNotMatch(summary, /Nothing is quarantined/);
      assert.match(read(setting, { vitest: 0, playwright: 0 }).summary, /Nothing is quarantined/);
    });

    it('the Playwright steps wait for `playwright` not being 0, so the output above turns them all off', () => {
      for (const name of ['Read Playwright version', 'Restore turbo cache']) {
        assert.match(
          stepIf(stepNamed(jobs.quarantine, name)),
          /steps\.lists\.outputs\.playwright != '0'/,
          name,
        );
      }
    });

    it('the report says the Playwright list was left for the nightly run, and reports it as before when it ran', () => {
      const run = (env) => {
        const dir = mkdtempSync(join(tmpdir(), 'quarantine-report-'));
        dirs.push(dir);
        const summary = join(dir, 'summary');
        writeFileSync(summary, '');
        const result = spawnSync('bash', ['-c', script(reporter)], {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            VITEST_LISTED: '1',
            VITEST: 'success',
            VITEST_STATUS: '0',
            E2E: 'skipped',
            E2E_STATUS: '',
            ...env,
          },
        });
        assert.equal(result.status, 0, result.stderr);
        return readFileSync(summary, 'utf8');
      };
      const later = run({ PLAYWRIGHT_LISTED: '0', PLAYWRIGHT_LATER: '3' });
      assert.match(
        later,
        /Playwright: 3 listed, not run here: the UI tests run in the nightly run/,
      );
      assert.doesNotMatch(later, /nothing listed/);
      const ran = run({
        PLAYWRIGHT_LISTED: '3',
        PLAYWRIGHT_LATER: '0',
        E2E: 'success',
        E2E_STATUS: '0',
      });
      assert.match(ran, /Playwright: all 3 quarantined test\(s\) passed/);
    });
  });
});

describe('ADR-034 the gate Android', () => {
  const gate = jobs.android;
  const step = stepNamed(gate, 'Combined result of the Android jobs');
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('keeps its name, its needs and its condition', () => {
    assert.match(gate, /^ {4}name: Android$/m);
    assert.match(gate, /^ {4}needs: \[changes, android-build, android-tests, android-maestro\]$/m);
    assert.equal(
      jobIf(gate),
      "always() && needs.changes.outputs.android == 'true' && github.event_name != 'push'",
    );
  });

  // Runs the step's shell, in a copy of the scripts, with the results of the jobs and the decision of Detect changes.
  const runGate = ({
    ui,
    build = 'success',
    tests = 'success',
    maestro = 'success',
    changes = 'success',
  }) => {
    const dir = mkdtempSync(join(tmpdir(), 'android-gate-'));
    dirs.push(dir);
    cpSync(SCRIPTS, join(dir, 'scripts'), { recursive: true });
    const result = spawnSync('bash', ['-c', script(step)], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        CHANGES: changes,
        BUILD: build,
        TESTS: tests,
        MAESTRO: maestro,
        UI_TESTS: ui,
      },
    });
    return result;
  };

  it('full (ui_tests true): passes when all three parts succeeded, and a skipped Maestro fails it', () => {
    assert.equal(runGate({ ui: 'true' }).status, 0);
    const skipped = runGate({ ui: 'true', maestro: 'skipped' });
    assert.equal(skipped.status, 1);
    assert.match(
      skipped.stdout,
      /Android failed: 1 of 4 parts did not succeed \(Android Maestro=skipped\)/,
    );
  });

  it('fast (ui_tests false): a skipped Maestro passes, nothing else that was skipped does', () => {
    const passed = runGate({ ui: 'false', maestro: 'skipped' });
    assert.equal(passed.status, 0, passed.stdout);
    assert.match(passed.stdout, /Android Maestro: skipped on purpose/);
    for (const part of [{ build: 'skipped' }, { tests: 'skipped' }, { changes: 'skipped' }]) {
      assert.equal(
        runGate({ ui: 'false', maestro: 'skipped', ...part }).status,
        1,
        JSON.stringify(part),
      );
    }
  });

  it('fast: a failed, cancelled or unrun build or tests part fails the gate, and so does a Maestro that ran and failed', () => {
    for (const bad of ['failure', 'cancelled']) {
      assert.equal(runGate({ ui: 'false', maestro: 'skipped', tests: bad }).status, 1, bad);
      assert.equal(runGate({ ui: 'false', maestro: 'skipped', build: bad }).status, 1, bad);
      assert.equal(runGate({ ui: 'false', maestro: bad }).status, 1, bad);
    }
  });

  it('is fail-closed: a skipped Maestro passes only when ui_tests is exactly false', () => {
    for (const ui of ['', 'true', 'maybe', 'False']) {
      assert.equal(runGate({ ui, maestro: 'skipped' }).status, 1, `ui_tests '${ui}'`);
    }
  });
});

describe('ADR-034 the nightly report job', () => {
  const report = jobs['nightly-report'];

  it('is the last job and runs on the schedule only, after the other jobs whatever became of them', () => {
    assert.match(report, /^ {4}name: Nightly report$/m);
    assert.equal(jobIf(report), "always() && github.event_name == 'schedule'");
    assert.equal(Object.keys(jobs).at(-1), 'nightly-report');
  });

  it('needs every other job of the workflow', () => {
    const needs = [...report.match(/^ {4}needs:\n((?: {6}- .+\n)+)/m)[1].matchAll(/- (\S+)/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      [...needs].sort(),
      Object.keys(jobs)
        .filter((name) => name !== 'nightly-report')
        .sort(),
    );
  });

  it('is the only job that can write issues, and nothing else', () => {
    for (const [name, job] of Object.entries(jobs)) {
      // Comments are left out: the last lines of a job's text are the comment of the next one.
      const writes = /^[^#\n]*issues: write/m.test(job);
      assert.equal(writes, name === 'nightly-report', name);
    }
    assert.doesNotMatch(ci.slice(0, ci.indexOf('\njobs:\n')), /issues: write/);
    assert.match(report, /^ {6}issues: write/m);
    assert.match(report, /^ {6}contents: read$/m);
    assert.doesNotMatch(report, /(contents|actions|pull-requests): write/);
  });

  it('runs scripts/nightly-report.sh with the needs context and its own token, and nothing from a person', () => {
    const run = stepNamed(report, 'Open or update the issue of a failed nightly run');
    assert.equal(runOf(run), 'scripts/nightly-report.sh');
    assert.match(run, /^ {10}NEEDS: \$\{\{ toJSON\(needs\) \}\}$/m);
    assert.match(run, /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
    assert.doesNotMatch(report, /secrets\./);
    assert.match(report, /^ {4}continue-on-error: \$\{\{ github\.event_name == 'push' \}\}$/m);
  });
});
