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

describe('#413 ios-parts.sh <language>: did a hosted runner pick up the build and that language', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const env = (rules) => ({
    ...gh.env(rules),
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
  });
  const run = (locale, jobs, args = []) => {
    const result = spawnSync(join(ROOT, 'scripts/ios-parts.sh'), [locale, ...args], {
      encoding: 'utf8',
      env: env([
        { match: '^api repos/owner/repo/actions/runs/123/attempts/2/jobs', out: { jobs } },
      ]),
    });
    const output = Object.fromEntries(
      result.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    return { ...result, output };
  };

  it('reports success and no retry when the build and the tests of the language ran and passed', () => {
    for (const locale of ['nl', 'en']) {
      const result = run(locale, [
        ran('iOS build', 'success'),
        ran('iOS tests (nl)', 'success'),
        ran('iOS tests (en)', 'success'),
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.output,
        { build: 'success', tests: 'success', retry: 'false' },
        locale,
      );
    }
  });

  it('marks a test job cancelled with no runner and no step as unacquired, and retries only that language', () => {
    const jobs = [
      ran('iOS build', 'success'),
      ran('iOS tests (nl)', 'success'),
      unacquired('iOS tests (en)'),
    ];
    const en = run('en', jobs);
    assert.equal(en.status, 0, en.stderr);
    assert.deepEqual(en.output, { build: 'success', tests: 'unacquired', retry: 'true' });
    assert.match(en.stderr, /iOS tests \(en\): no hosted runner picked it up/);
    // The other language reads only its own job: it does not retry, and does not wait for the one that has no runner.
    const nl = run('nl', jobs);
    assert.deepEqual(nl.output, { build: 'success', tests: 'success', retry: 'false' });
  });

  it('retries a language whose build had no runner, because its tests never started', () => {
    for (const locale of ['nl', 'en']) {
      const result = run(locale, [
        unacquired('iOS build'),
        skipped('iOS tests (nl)'),
        skipped('iOS tests (en)'),
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.output,
        { build: 'unacquired', tests: 'unacquired', retry: 'true' },
        locale,
      );
      assert.match(result.stderr, /iOS build: no hosted runner picked it up/);
    }
  });

  it('does not mistake a cancel after the job started (a timeout) for a missing runner', () => {
    const jobs = [
      ran('iOS build', 'success'),
      ran('iOS tests (nl)', 'cancelled'),
      ran('iOS tests (en)', 'failure'),
    ];
    assert.deepEqual(run('nl', jobs).output, {
      build: 'success',
      tests: 'cancelled',
      retry: 'false',
    });
    assert.deepEqual(run('en', jobs).output, {
      build: 'success',
      tests: 'failure',
      retry: 'false',
    });
  });

  it('does not retry a failed build, and reports the tests that never started as skipped', () => {
    const result = run('nl', [
      ran('iOS build', 'failure'),
      skipped('iOS tests (nl)'),
      skipped('iOS tests (en)'),
    ]);
    assert.deepEqual(result.output, { build: 'failure', tests: 'skipped', retry: 'false' });
  });

  it('--force reports the build and the language as unacquired, so a run on demand exercises the retry', () => {
    for (const locale of ['nl', 'en']) {
      const result = run(
        locale,
        [skipped('iOS build'), skipped('iOS tests (nl)'), skipped('iOS tests (en)')],
        ['--force'],
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.output, { build: 'unacquired', tests: 'unacquired', retry: 'true' });
      assert.match(result.stderr, /forced/);
    }
  });

  it("fails, printing nothing, when the run's jobs cannot be read: the retry never starts on a guess", () => {
    const result = spawnSync(join(ROOT, 'scripts/ios-parts.sh'), ['nl'], {
      encoding: 'utf8',
      env: env([{ match: '^api ', status: 1 }]),
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /could not read the run's jobs/);
  });

  it('refuses a missing or unknown language and an unknown argument', () => {
    assert.notEqual(run('', []).status, 0);
    assert.notEqual(run('fr', []).status, 0);
    assert.notEqual(run('nl', [], ['--nope']).status, 0);
  });
});
