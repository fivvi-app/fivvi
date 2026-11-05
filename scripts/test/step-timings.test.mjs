import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const ROOT = join(import.meta.dirname, '../..');

const step = (name, start, end) => ({
  name,
  started_at: start && `2026-10-17T10:00:${start}Z`,
  completed_at: end && `2026-10-17T10:0${end}Z`,
});

const JOBS = {
  jobs: [
    {
      name: 'Android',
      runner_name: 'GitHub Actions 7',
      steps: [step('Other job step', '00', '9:00')],
    },
    {
      name: 'iOS',
      runner_name: 'GitHub Actions 3',
      steps: [
        step('Set up job', '00', '0:02'),
        step('SwiftLint, build and tests (nl and en)', '02', '6:32'),
        step('Skipped step', null, null),
        step('Step timings', '32', null),
      ],
    },
  ],
};

describe('E002 #91 step-timings.sh', () => {
  const gh = fakeGh();
  const dirs = [];
  after(() => {
    gh.cleanup();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const run = (rules, env = {}, args = []) => {
    const dir = mkdtempSync(join(tmpdir(), 'step-timings-'));
    dirs.push(dir);
    const summary = join(dir, 'summary.md');
    const result = spawnSync(join(ROOT, 'scripts/step-timings.sh'), args, {
      encoding: 'utf8',
      env: {
        ...gh.env(rules),
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '2',
        RUNNER_NAME: 'GitHub Actions 3',
        GITHUB_STEP_SUMMARY: summary,
        ...env,
      },
    });
    let written = '';
    try {
      written = readFileSync(summary, 'utf8');
    } catch {}
    return { ...result, written };
  };

  it("writes the duration of each finished step of this runner's job to the job summary", () => {
    const result = run([
      { match: '^api repos/owner/repo/actions/runs/123/attempts/2/jobs', out: JOBS },
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.written,
      [
        '### Step durations: iOS',
        '',
        '| Step | Duration |',
        '|---|--:|',
        '| Set up job | 0 min 2 s |',
        '| SwiftLint, build and tests (nl and en) | 6 min 30 s |',
        '| **Total** | **6 min 32 s** |',
        '',
      ].join('\n'),
    );
  });

  it('never fails the job: a GitHub API error leaves no table', () => {
    const result = run([{ match: '^api ', status: 1 }]);

    assert.equal(result.status, 0);
    assert.equal(result.written, '');
    assert.match(result.stderr, /could not read the run's jobs/);
  });

  it('says so when no job runs on this runner', () => {
    const result = run([{ match: '^api ', out: JOBS }], { RUNNER_NAME: 'somewhere else' });

    assert.equal(result.status, 0);
    assert.equal(result.written, '');
    assert.match(result.stderr, /no job on runner 'somewhere else'/);
  });

  describe('E008 #519 warns when a step nears its cap', () => {
    const rules = [{ match: '^api repos/owner/repo/actions/runs/123/attempts/2/jobs', out: JOBS }];
    const longStep = 'SwiftLint, build and tests (nl and en)'; // 6 min 30 s in JOBS

    it('warns, with the time used and the budget, when a named step used more than two thirds of it', () => {
      const result = run(rules, {}, [`${longStep}=9`]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /^::warning::SwiftLint, build and tests \(nl and en\) took 6 min 30 s of its 9 min budget/m,
      );
      assert.match(result.written, /### Step durations: iOS/);
      assert.doesNotMatch(result.written, /::warning::/);
    });

    it('stays quiet at two thirds of the budget or less, for a step that did not run and for no argument', () => {
      assert.doesNotMatch(run(rules, {}, [`${longStep}=10`]).stdout, /::warning::/);
      assert.doesNotMatch(run(rules, {}, [`${longStep}=30`]).stdout, /::warning::/);
      assert.doesNotMatch(run(rules, {}, ['No such step=1']).stdout, /::warning::/);
      assert.doesNotMatch(run(rules).stdout, /::warning::/);
    });

    it('warns for every step that is over, and still never fails the job', () => {
      const two = {
        jobs: [
          {
            name: 'Android',
            runner_name: 'GitHub Actions 3',
            steps: [step('Boot', '00', '0:50'), step('Flows', '50', '9:00')],
          },
        ],
      };
      const result = run([{ match: '^api ', out: two }], {}, ['Boot=1', 'Flows=10', 'Flows=20']);

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.stdout.match(/^::warning::.*$/gm), [
        '::warning::Boot took 0 min 50 s of its 1 min budget (more than two thirds): it nears its cap',
        '::warning::Flows took 8 min 10 s of its 10 min budget (more than two thirds): it nears its cap',
      ]);
    });

    it('refuses a budget that is not a number of minutes', () => {
      const result = run(rules, {}, [`${longStep}=soon`]);

      assert.notEqual(result.status, 0);
    });
  });
});
