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

  // #1268: GitHub now reports a job that no hosted runner took within 15 minutes as `abandoned` in needs.<job>.result
  // (main push run 42795798409, merge_group run 42845596284: "iOS build=abandoned iOS tests (nl)=skipped"), not as
  // cancelled, so the gate named it only by that word and a real failure looked the same.
  it('#1268 names an abandoned build as unacquired, and the tests that never started as skipped', () => {
    const result = run(
      ['abandoned', 'skipped'],
      jobs(skipped('iOS build'), skipped('iOS tests (nl)')),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, [
      'iOS build=unacquired',
      'iOS tests (nl)=skipped',
      'iOS tests (en)=skipped',
    ]);
    assert.match(result.stderr, /iOS build: no hosted runner picked it up/);
  });

  it('#1268 keeps a real failure of the build a failure next to an abandoned test pass', () => {
    const failed = run(['failure', 'skipped'], jobs(ran('iOS build', 'failure')));
    assert.equal(failed.parts[0], 'iOS build=failure');
    assert.doesNotMatch(failed.stderr, /no hosted runner/);
  });

  // The retry (#1268): "iOS build (retry)" runs once when "iOS build" was abandoned. Its result is the third argument.
  it('#1268 reports the build as succeeded when the retry did, and says on stderr that the first try had no runner', () => {
    const result = run(['abandoned', 'success', 'success'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=success',
      'iOS tests (en)=success',
    ]);
    assert.match(
      result.stderr,
      /iOS build: no hosted runner picked up the first try; the retry ran/,
    );
    assert.equal(calls().length, 0, 'nothing that succeeded can be a missing runner');
  });

  it('#1268 reports the build as unacquired when the retry was abandoned too', () => {
    const result = run(['abandoned', 'skipped', 'abandoned'], jobs(unacquired('iOS build')));
    assert.deepEqual(result.parts, [
      'iOS build (retry)=unacquired',
      'iOS tests (nl)=skipped',
      'iOS tests (en)=skipped',
    ]);
    assert.match(result.stderr, /after the retry/);
  });

  it('#1268 reports a retry that failed on a runner as a failure, not as a missing runner', () => {
    const result = run(
      ['abandoned', 'skipped', 'failure'],
      jobs(unacquired('iOS build'), ran('iOS build (retry)', 'failure')),
    );
    assert.equal(result.parts[0], 'iOS build (retry)=failure');
    assert.doesNotMatch(result.stderr, /after the retry/);
  });

  it('#1268 reads the retry job by its own name when it was cancelled', () => {
    const noRunner = run(
      ['abandoned', 'skipped', 'cancelled'],
      jobs(unacquired('iOS build'), unacquired('iOS build (retry)')),
    );
    assert.equal(noRunner.parts[0], 'iOS build (retry)=unacquired');
    const timedOut = run(
      ['abandoned', 'skipped', 'cancelled'],
      jobs(unacquired('iOS build'), ran('iOS build (retry)', 'cancelled')),
    );
    assert.equal(timedOut.parts[0], 'iOS build (retry)=cancelled');
  });

  it('#1268 ignores a retry that was skipped, because the build had a runner', () => {
    const result = run(['success', 'success', 'skipped'], [{ match: '^api ', status: 1 }]);
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=success',
      'iOS tests (en)=success',
    ]);
    assert.equal(
      run(['failure', 'skipped', 'skipped'], jobs(ran('iOS build', 'failure'))).parts[0],
      'iOS build=failure',
    );
  });

  // The retry of a test pass (#1268): "iOS tests (<locale>) (retry)" runs for a language that got no runner, from the
  // bundle already built; the gate takes that language's part from it.
  it('#1268 takes a language from its retry when the retry passed, and says the first try had no runner', () => {
    const result = run(
      ['success', 'abandoned'],
      jobs(
        ran('iOS build', 'success'),
        unacquired('iOS tests (nl)'),
        ran('iOS tests (en)', 'success'),
        ran('iOS tests (nl) (retry)', 'success'),
      ),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl)=success',
      'iOS tests (en)=success',
    ]);
    assert.match(
      result.stderr,
      /iOS tests \(nl\): no hosted runner picked up the first try; the retry ran/,
    );
  });

  it('#1268 names the retry of a language when it failed on a runner, and leaves the other language as it was', () => {
    const result = run(
      ['success', 'failure'],
      jobs(
        ran('iOS build', 'success'),
        unacquired('iOS tests (nl)'),
        ran('iOS tests (en)', 'failure'),
        ran('iOS tests (nl) (retry)', 'failure'),
      ),
    );
    assert.deepEqual(result.parts, [
      'iOS build=success',
      'iOS tests (nl) (retry)=failure',
      'iOS tests (en)=failure',
    ]);
    assert.doesNotMatch(result.stderr, /no hosted runner/);
  });

  it('#1268 names the retry of a language when it got no runner either, or timed out', () => {
    const noRunner = run(
      ['success', 'abandoned'],
      jobs(
        unacquired('iOS tests (nl)'),
        ran('iOS tests (en)', 'success'),
        unacquired('iOS tests (nl) (retry)'),
      ),
    );
    assert.equal(noRunner.parts[1], 'iOS tests (nl) (retry)=unacquired');
    assert.equal(noRunner.parts[2], 'iOS tests (en)=success');
    assert.match(noRunner.stderr, /iOS tests \(nl\) \(retry\): no hosted runner picked it up/);
    assert.match(noRunner.stderr, /after the retry/);
    const timedOut = run(
      ['success', 'abandoned'],
      jobs(
        unacquired('iOS tests (nl)'),
        ran('iOS tests (en)', 'success'),
        ran('iOS tests (nl) (retry)', 'cancelled'),
      ),
    );
    assert.equal(timedOut.parts[1], 'iOS tests (nl) (retry)=cancelled');
  });

  it('#1268 ignores a retry job that was skipped', () => {
    const result = run(
      ['success', 'failure'],
      jobs(
        ran('iOS tests (nl)', 'failure'),
        ran('iOS tests (en)', 'success'),
        skipped('iOS tests (nl) (retry)'),
      ),
    );
    assert.equal(result.parts[1], 'iOS tests (nl)=failure');
  });

  it('#1268 labels the build retry as a retry when it failed, and the build as itself when it passed', () => {
    const failed = run(
      ['abandoned', 'skipped', 'failure'],
      jobs(unacquired('iOS build'), ran('iOS build (retry)', 'failure')),
    );
    assert.equal(failed.parts[0], 'iOS build (retry)=failure');
    const noRunner = run(['abandoned', 'skipped', 'abandoned'], jobs(unacquired('iOS build')));
    assert.equal(noRunner.parts[0], 'iOS build (retry)=unacquired');
  });

  it('refuses `job` as the first argument with two arguments, not reading it as the CI form', () => {
    const result = run(['job', 'x'], [{ match: '^api ', status: 1 }]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.parts, []);
  });

  it('refuses a wrong number of arguments', () => {
    assert.notEqual(run([], []).status, 0);
    assert.notEqual(run(['success', 'success', 'success', 'success'], []).status, 0);
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

  it('#1268 labels an abandoned job as unacquired without reading the jobs', () => {
    const result = run(['iOS tests', 'abandoned'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'iOS tests=unacquired\n');
    assert.match(result.stderr, /iOS tests: no hosted runner picked it up/);
    assert.equal(gh.calls().length, 0);
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

describe('#1268 ios-parts.sh retry-locales: which languages of the tests got no runner', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const JOBS = '^api repos/owner/repo/actions/runs/123/attempts/2/jobs';
  const run = (args, rules) =>
    spawnSync(join(ROOT, 'scripts/ios-parts.sh'), ['retry-locales', ...args], {
      encoding: 'utf8',
      env: {
        ...gh.env(rules),
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '2',
      },
    });
  const jobs = (...list) => [{ match: JOBS, out: { jobs: list } }];

  it('prints the languages whose job was cancelled with no runner and no step, as a JSON array', () => {
    const one = run(
      ['abandoned'],
      jobs(unacquired('iOS tests (nl)'), ran('iOS tests (en)', 'success')),
    );
    assert.equal(one.status, 0, one.stderr);
    assert.equal(one.stdout, '["nl"]\n');
    const both = run(
      ['abandoned'],
      jobs(unacquired('iOS tests (nl)'), unacquired('iOS tests (en)')),
    );
    assert.equal(both.stdout, '["nl","en"]\n');
  });

  it('retries no language that ran, whatever happened to it (a failure or a timeout is no missing runner)', () => {
    const result = run(
      ['failure'],
      jobs(ran('iOS tests (nl)', 'cancelled'), ran('iOS tests (en)', 'failure')),
    );
    assert.equal(result.stdout, '[]\n');
  });

  it('reads the jobs only when the tests did not succeed', () => {
    for (const tests of ['success', 'skipped']) {
      const result = run([tests], [{ match: '^api ', status: 1 }]);
      assert.equal(result.stdout, '[]\n');
    }
    assert.equal(gh.calls().length, 0);
  });

  it("prints no language, exiting 0, when the run's jobs cannot be read", () => {
    const result = run(['abandoned'], [{ match: '^api ', status: 1 }]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '[]\n');
    assert.match(result.stderr, /could not read the run's jobs/);
    assert.equal(run(['abandoned'], [{ match: JOBS, out: 'not json' }]).stdout, '[]\n');
  });

  it('refuses a wrong number of arguments', () => {
    assert.notEqual(run([], []).status, 0);
    assert.notEqual(run(['abandoned', 'x'], []).status, 0);
  });
});
