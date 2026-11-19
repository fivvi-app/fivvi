import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'nightly-report.sh');
const TITLE = 'Nightly UI tests failed';
const REPO = 'example-org/fivvi';
const RUN = '4242';
const RUN_URL = `https://github.com/${REPO}/actions/runs/${RUN}`;

describe('nightly-report.sh (ADR-034, ADR-035): the issue for a failed nightly run', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());
  chmodSync(SCRIPT, 0o755);

  const needs = (results) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([job, result]) => [job, { result, outputs: {} }]),
      ),
    );
  const jobsRule = (jobs) => ({
    match: `^api repos/${REPO}/actions/runs/${RUN}/jobs`,
    out: { jobs },
  });
  const run = (rules, results, extraEnv = {}) => {
    const result = spawnSync(SCRIPT, [], {
      encoding: 'utf8',
      env: {
        ...gh.env(rules),
        GITHUB_REPOSITORY: REPO,
        GITHUB_RUN_ID: RUN,
        NEEDS: needs(results),
        ...extraEnv,
      },
    });
    return { ...result, calls: gh.calls().map((call) => call.args) };
  };
  const command = (calls, ...words) =>
    calls.find((args) => words.every((word, i) => args[i] === word));
  const flag = (args, name) => args[args.indexOf(name) + 1];
  const flags = (args, name) => args.flatMap((arg, i) => (arg === name ? [args[i + 1]] : []));

  const failedJobs = [
    { name: 'Checks (Linux)', conclusion: 'success' },
    { name: 'iOS tests (nl)', conclusion: 'failure' },
    { name: 'Android Maestro', conclusion: 'cancelled' },
    { name: 'iOS tests (en)', conclusion: 'success' },
    { name: 'Nightly report', conclusion: null },
  ];
  const noOpenIssue = { match: '^issue list ', out: [] };
  const created = { match: '^issue create ', out: `https://github.com/${REPO}/issues/77` };

  it('does nothing, and calls no gh, when every job passed or was skipped', () => {
    const result = run([], {
      changes: 'success',
      checks: 'success',
      'ios-tests-retry': 'skipped',
      'android-maestro': 'success',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, []);
    assert.match(result.stdout, /passed: nothing to report/);
  });

  it('opens one issue with the exact title, the labels bug and ready-for-agent, the run, the failing jobs and the acceptance criterion', () => {
    const result = run([jobsRule(failedJobs), noOpenIssue, created], {
      changes: 'success',
      'ios-tests': 'failure',
      'android-maestro': 'cancelled',
      checks: 'success',
    });

    assert.equal(result.status, 0, result.stderr);
    const create = command(result.calls, 'issue', 'create');
    assert.ok(create, 'an issue is opened');
    assert.equal(flag(create, '--title'), TITLE);
    assert.deepEqual(flags(create, '--label').sort(), ['bug', 'ready-for-agent']);
    assert.equal(flag(create, '--repo'), REPO);
    const body = flag(create, '--body');
    assert.ok(body.includes(RUN_URL), 'the run URL');
    assert.match(body, /^- iOS tests \(nl\)$/m);
    assert.match(body, /^- Android Maestro$/m);
    assert.doesNotMatch(
      body,
      /Checks \(Linux\)|iOS tests \(en\)|Nightly report/,
      'only the failing jobs',
    );
    assert.match(
      body,
      /^## Acceptance criteria\n\n- \[ \] The nightly run of ci\.yml passes on main$/m,
    );
    assert.equal(command(result.calls, 'issue', 'comment'), undefined);
    assert.match(result.stdout, /issues\/77/);
  });

  it('comments on the open issue with that title instead, and opens none', () => {
    const open = {
      match: '^issue list ',
      out: [
        { number: 90, title: 'Nightly UI tests failed again' },
        { number: 80, title: TITLE },
        { number: 70, title: TITLE },
      ],
    };
    const result = run([jobsRule(failedJobs), open, { match: '^issue comment ', out: '' }], {
      'ios-tests': 'failure',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(command(result.calls, 'issue', 'create'), undefined);
    const comment = command(result.calls, 'issue', 'comment');
    assert.equal(comment[2], '70', 'the oldest open issue of that exact title');
    const body = flag(comment, '--body');
    assert.ok(body.includes(RUN_URL));
    assert.match(body, /^- iOS tests \(nl\)$/m);
  });

  it('looks only at open issues, by the exact title', () => {
    const result = run([jobsRule(failedJobs), noOpenIssue, created], { checks: 'failure' });

    const list = command(result.calls, 'issue', 'list');
    assert.equal(flag(list, '--state'), 'open');
    assert.ok(flag(list, '--search').includes(TITLE));
    // The fake does not search: a different title in the answer is never taken for the issue.
    const other = run(
      [
        jobsRule(failedJobs),
        { match: '^issue list ', out: [{ number: 5, title: 'Other' }] },
        created,
      ],
      { checks: 'failure' },
    );
    assert.ok(command(other.calls, 'issue', 'create'));
  });

  it('treats failure, cancelled and abandoned as failed, and skipped and success as passed', () => {
    for (const bad of ['failure', 'cancelled', 'abandoned']) {
      const result = run([jobsRule(failedJobs), noOpenIssue, created], {
        job: bad,
        other: 'skipped',
      });
      assert.ok(command(result.calls, 'issue', 'create'), bad);
    }
    for (const fine of ['success', 'skipped']) {
      assert.deepEqual(run([], { job: fine }).calls, [], fine);
    }
  });

  it('names the job ids when the names of the run cannot be read, and still reports', () => {
    const result = run([{ match: '^api ', out: '', status: 1 }, noOpenIssue, created], {
      'ios-tests': 'failure',
      'android-maestro': 'cancelled',
      checks: 'success',
    });

    assert.equal(result.status, 0, result.stderr);
    const body = flag(command(result.calls, 'issue', 'create'), '--body');
    assert.match(body, /^- android-maestro$/m);
    assert.match(body, /^- ios-tests$/m);
    assert.doesNotMatch(body, /checks/);
  });

  it('fails when the open issues cannot be listed, so the job turns red instead of staying silent', () => {
    const result = run([jobsRule(failedJobs), { match: '^issue list ', out: '', status: 1 }], {
      'ios-tests': 'failure',
    });
    assert.notEqual(result.status, 0);
    assert.equal(command(result.calls, 'issue', 'create'), undefined);
  });

  it('holds no log, address of a person or other data: the body is the run, the job names and the criterion', () => {
    const result = run([jobsRule(failedJobs), noOpenIssue, created], { 'ios-tests': 'failure' });
    const body = flag(command(result.calls, 'issue', 'create'), '--body');
    assert.equal(
      body.replace(/^- (?!\[ \]).*$/gm, '-').replace(RUN_URL, '<run>'),
      [
        'The nightly run of `ci.yml` on `main` failed: <run>',
        '',
        'Failing suites:',
        '',
        '-',
        '',
        'Failing jobs:',
        '',
        '-',
        '-',
        '',
        '## Acceptance criteria',
        '',
        '- [ ] The nightly run of ci.yml passes on main',
      ].join('\n'),
    );
  });

  describe('names the suite that failed (ADR-035: the integration tests run in Checks (Linux) only in this run)', () => {
    const suites = (body) =>
      body
        .match(/Failing suites:\n\n((?:- .+\n?)+)/)[1]
        .trim()
        .split('\n');
    const bodyOf = (jobs, results) => {
      const result = run([jobsRule(jobs), noOpenIssue, created], results);
      assert.equal(result.status, 0, result.stderr);
      return flag(command(result.calls, 'issue', 'create'), '--body');
    };

    it('a failed Checks (Linux) is the integration tests and the other Linux checks, and no UI suite', () => {
      const body = bodyOf([{ name: 'Checks (Linux)', conclusion: 'failure' }], {
        checks: 'failure',
        'ios-tests': 'success',
      });
      const [line, ...rest] = suites(body);
      assert.match(line, /^- Integration tests and the other Linux checks: Checks \(Linux\)/);
      assert.deepEqual(rest, []);
      assert.match(body, /^- Checks \(Linux\)$/m, 'still in the failing jobs');
    });

    it('a failed UI job is the UI tests and native jobs, and no integration suite', () => {
      const body = bodyOf(failedJobs, { 'ios-tests': 'failure', 'android-maestro': 'cancelled' });
      const [line, ...rest] = suites(body);
      assert.match(line, /^- UI tests and native jobs: Android Maestro, iOS tests \(nl\)$/);
      assert.deepEqual(rest, []);
      assert.doesNotMatch(body, /Integration tests/);
    });

    it('both at once name both suites, and the fallback to job ids sorts them the same way', () => {
      const body = bodyOf(
        [
          { name: 'Checks (Linux)', conclusion: 'failure' },
          { name: 'E2E (Linux)', conclusion: 'failure' },
        ],
        { checks: 'failure', e2e: 'failure' },
      );
      assert.equal(suites(body).length, 2);
      assert.match(body, /^- Integration tests and the other Linux checks: Checks \(Linux\)/m);
      assert.match(body, /^- UI tests and native jobs: E2E \(Linux\)$/m);
      const ids = run([{ match: '^api ', out: '', status: 1 }, noOpenIssue, created], {
        checks: 'failure',
        'android-tests': 'failure',
      });
      const idBody = flag(command(ids.calls, 'issue', 'create'), '--body');
      assert.match(idBody, /^- Integration tests and the other Linux checks: checks$/m);
      assert.match(idBody, /^- UI tests and native jobs: android-tests$/m);
    });

    it('the comment on an open issue names the suites of that night too', () => {
      const open = { match: '^issue list ', out: [{ number: 70, title: TITLE }] };
      const result = run(
        [
          jobsRule([{ name: 'Checks (Linux)', conclusion: 'failure' }]),
          open,
          { match: '^issue comment ', out: '' },
        ],
        { checks: 'failure' },
      );
      const body = flag(command(result.calls, 'issue', 'comment'), '--body');
      assert.match(body, /Integration tests and the other Linux checks: Checks \(Linux\)/);
    });

    it('a failed Detect changes is named for itself, not as a test suite', () => {
      const body = bodyOf([{ name: 'Detect changes', conclusion: 'failure' }], {
        changes: 'failure',
      });
      assert.match(body, /^- Detect changes: Detect changes$/m);
    });
  });

  it('needs its environment and takes no argument', () => {
    for (const env of [{ GITHUB_REPOSITORY: '' }, { GITHUB_RUN_ID: '' }, { NEEDS: '' }]) {
      assert.notEqual(run([], { 'ios-tests': 'failure' }, env).status, 0, JSON.stringify(env));
    }
    const arg = spawnSync(SCRIPT, ['extra'], { encoding: 'utf8', env: gh.env([]) });
    assert.notEqual(arg.status, 0);
  });

  it('fails on a NEEDS that is not JSON', () => {
    const result = run([], {}, { NEEDS: 'not json' });
    assert.notEqual(result.status, 0);
  });
});
