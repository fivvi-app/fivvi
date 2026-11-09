import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const ROOT = join(import.meta.dirname, '../..');

// The shape of GitHub's jobs API for a job that ran, for one that no hosted runner picked up (run 41518844693,
// "iOS tests (en)": cancelled after 15 minutes, runner_name empty, steps empty; #413) and for one the workflow skipped.
const ran = (name, conclusion) => ({
  name,
  conclusion,
  runner_name: 'GitHub Actions 1000002839',
  steps: [{ name: 'Set up job', conclusion: 'success' }],
});
const unacquired = (name) => ({ name, conclusion: 'cancelled', runner_name: '', steps: [] });
const skipped = (name) => ({ name, conclusion: 'skipped', runner_name: '', steps: [] });

describe('#413 ios-parts.sh: did a hosted runner pick up each iOS part', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const env = (rules) => ({
    ...gh.env(rules),
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
  });
  const JOBS = '^api repos/owner/repo/actions/runs/123/attempts/2/jobs';
  const run = (results, rules) => {
    const result = spawnSync(join(ROOT, 'scripts/ios-parts.sh'), results, {
      encoding: 'utf8',
      env: env(rules),
    });
    return { ...result, parts: result.stdout.split('\n').filter(Boolean) };
  };
  const calls = () => gh.calls();
  const jobs = (...list) => [{ match: JOBS, out: { jobs: list } }];

  it('prints the parts for native-gate.sh, as given, when all succeeded, without reading the jobs', () => {
    const result = run(['success', 'success'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=success',
      'iOS tests (en)=success',
    ]);
    assert.equal(calls().length, 0, 'nothing that succeeded can be a missing runner');
  });

  it('marks a language cancelled with no runner and no step as unacquired, and not the other', () => {
    const result = run(
      ['success', 'cancelled'],
      jobs(
        ran('iOS build', 'success'),
        ran('iOS tests (nl)', 'success'),
        unacquired('iOS tests (en)'),
      ),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=success',
      'iOS tests (en)=unacquired',
    ]);
    assert.match(result.stderr, /iOS tests \(en\): no hosted runner picked it up/);
    assert.match(result.stderr, /cancelled before one did/);
  });

  it('marks the build unacquired, and leaves the tests that never started as skipped', () => {
    const result = run(['cancelled', 'skipped'], jobs(unacquired('iOS build')));
    assert.deepEqual(result.parts, [
      'iOS build=unacquired',
      'iOS tests (nl)=skipped',
      'iOS tests (en)=skipped',
    ]);
  });

  it('does not mistake a cancel after the job started (a timeout) for a missing runner, and reads each language apart', () => {
    const result = run(
      ['success', 'failure'],
      jobs(
        ran('iOS build', 'success'),
        ran('iOS tests (nl)', 'cancelled'),
        ran('iOS tests (en)', 'failure'),
      ),
    );
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=cancelled',
      'iOS tests (en)=failure',
    ]);
  });

  it('never turns a build that did not end cancelled into unacquired, whatever the jobs say', () => {
    const result = run(['failure', 'skipped'], jobs(unacquired('iOS build')));
    assert.equal(result.parts[0], 'iOS build=failure');
  });

  it("falls back to the results as given, exiting 0, when the run's jobs cannot be read", () => {
    const result = run(['success', 'cancelled'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    // Bare results: the gate then claims neither a runner nor the lack of one.
    assert.deepEqual(result.parts, ['success', 'cancelled']);
    assert.match(result.stderr, /could not read the run's jobs/);
  });

  it('falls back the same way when the answer is not the jobs list', () => {
    const result = run(['cancelled', 'skipped'], [{ match: JOBS, out: 'not json' }]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, ['cancelled', 'skipped']);
  });

  it('keeps a result as given when its job is missing from the list', () => {
    const result = run(['cancelled', 'cancelled'], jobs());
    assert.deepEqual(result.parts, [
      'iOS build=cancelled',
      'iOS tests (nl)=cancelled',
      'iOS tests (en)=cancelled',
    ]);
  });

  it('refuses `job` as the first argument with two arguments, not reading it as the CI form', () => {
    const result = run(['job', 'x'], [{ match: '^api ', status: 1 }]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.parts, []);
  });

  it('refuses a wrong number of arguments', () => {
    assert.notEqual(run([], []).status, 0);
    assert.notEqual(run(['success', 'success', 'success'], []).status, 0);
  });
});

describe('#437 ios-parts.sh job: did a hosted runner pick up one job of the run', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const JOBS = '^api repos/owner/repo/actions/runs/123/attempts/2/jobs';
  const run = (args, rules) =>
    spawnSync(join(ROOT, 'scripts/ios-parts.sh'), ['job', ...args], {
      encoding: 'utf8',
      env: {
        ...gh.env(rules),
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '2',
      },
    });
  const jobs = (...list) => [{ match: JOBS, out: { jobs: list } }];

  it('labels a cancelled job with no runner and no step as unacquired, and says so on stderr', () => {
    const result = run(
      ['iOS tests', 'cancelled'],
      jobs(unacquired('iOS tests'), ran('iOS release', 'success')),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'iOS tests=unacquired\n');
    assert.match(result.stderr, /iOS tests: no hosted runner picked it up/);
  });

  it('reads the job of its own name', () => {
    const list = jobs(ran('iOS tests', 'success'), unacquired('iOS release'));
    assert.equal(run(['iOS release', 'cancelled'], list).stdout, 'iOS release=unacquired\n');
    assert.equal(run(['iOS tests', 'cancelled'], list).stdout, 'iOS tests=cancelled\n');
  });

  it('does not mistake a cancel after the job started (a timeout) for a missing runner', () => {
    const result = run(['iOS tests', 'cancelled'], jobs(ran('iOS tests', 'cancelled')));
    assert.equal(result.stdout, 'iOS tests=cancelled\n');
    assert.equal(result.stderr, '');
  });

  it('keeps cancelled when its job is not in the list', () => {
    assert.equal(run(['iOS tests', 'cancelled'], jobs()).stdout, 'iOS tests=cancelled\n');
  });

  it('prints any other result as given, without reading the jobs', () => {
    for (const result of ['success', 'failure', 'skipped']) {
      const answer = run(['iOS release', result], [{ match: '^api ', status: 1 }]);
      assert.equal(answer.status, 0, answer.stderr);
      assert.equal(answer.stdout, `iOS release=${result}\n`);
      assert.equal(
        gh.calls().length,
        0,
        'nothing that did not end cancelled can be a missing runner',
      );
    }
  });

  it("prints the bare result, exiting 0, when the run's jobs cannot be read", () => {
    const result = run(['iOS tests', 'cancelled'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'cancelled\n');
    assert.match(result.stderr, /could not read the run's jobs/);
    const notJobs = run(['iOS tests', 'cancelled'], [{ match: JOBS, out: 'not json' }]);
    assert.equal(notJobs.stdout, 'cancelled\n');
  });

  it('refuses a wrong number of arguments', () => {
    assert.notEqual(run([], []).status, 0);
    assert.notEqual(run(['iOS tests'], []).status, 0);
    assert.notEqual(run(['iOS tests', 'cancelled', 'x'], []).status, 0);
  });
});
