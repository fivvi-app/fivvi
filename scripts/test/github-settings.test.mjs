import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const ROOT = join(import.meta.dirname, '../..');
const RULESET = JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main.json'), 'utf8'));
const SETTINGS = JSON.parse(readFileSync(join(ROOT, '.github/repo-settings.json'), 'utf8'));

describe('the versioned GitHub settings', () => {
  it('require exactly the five CI jobs of WORKFLOW.md §7 as checks on main', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const jobs = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1]);
    const required = RULESET.rules
      .find((rule) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map((check) => check.context);
    assert.deepEqual(required, [
      'Detect changes',
      'Checks (Linux)',
      'E2E (Linux)',
      'iOS',
      'Android',
    ]);
    assert.deepEqual(required, jobs);
  });

  it('require a PR, block force-pushes and deletion, squash only', () => {
    const types = RULESET.rules.map((rule) => rule.type);
    assert.deepEqual(types.sort(), [
      'deletion',
      'merge_queue',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ]);
    const pr = RULESET.rules.find((rule) => rule.type === 'pull_request');
    assert.deepEqual(pr.parameters.allowed_merge_methods, ['squash']);
    assert.deepEqual(RULESET.bypass_actors, []);
    assert.deepEqual(SETTINGS.merge, {
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      allow_auto_merge: false,
    });
  });

  it('E002 #119: no longer require an up-to-date branch: the merge queue tests the PR on the latest main', () => {
    const checks = RULESET.rules.find((rule) => rule.type === 'required_status_checks');
    assert.equal(checks.parameters.strict_required_status_checks_policy, false);
  });

  it('E002 #119: require the merge queue, squash, one PR per merge, sized for a cold iOS run (~25 min)', () => {
    const queue = RULESET.rules.find((rule) => rule.type === 'merge_queue');
    assert.deepEqual(queue.parameters, {
      merge_method: 'SQUASH',
      grouping_strategy: 'ALLGREEN',
      max_entries_to_build: 3,
      max_entries_to_merge: 1,
      min_entries_to_merge: 1,
      min_entries_to_merge_wait_minutes: 5,
      check_response_timeout_minutes: 60,
    });
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    // The job timeouts as ci.yml sets them (job-level, four spaces): the longest native job starts after
    // Detect changes, and the queue should time out after both, so a hung job fails as itself.
    const timeout = (job) =>
      Number(ci.slice(ci.indexOf(`\n  ${job}:\n`)).match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
    const longestNative = Math.max(timeout('ios'), timeout('android'));
    assert.ok(
      queue.parameters.check_response_timeout_minutes > timeout('changes') + longestNative,
      'the queue should time out after Detect changes plus the longest native job',
    );
  });
});

describe('github-settings.sh apply', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const apply = (existing) => {
    const result = spawnSync(join(ROOT, 'scripts/github-settings.sh'), ['apply'], {
      encoding: 'utf8',
      env: gh.env([
        { match: '^api repos/[^ ]+/rulesets$', out: existing },
        { match: '^api --method (POST|PUT|PATCH) ', out: {} },
        { match: '^label create ', out: '' },
      ]),
    });
    assert.equal(result.status, 0, result.stderr);
    return gh.calls();
  };
  const writes = (calls) => calls.filter((call) => call.args.includes('--method'));

  it('creates the ruleset when main has none', () => {
    const [ruleset] = writes(apply([{ id: 3, name: 'other' }]));
    assert.match(ruleset.args.join(' '), /^api --method POST repos\/[^ ]+\/rulesets /);
    assert.deepEqual(JSON.parse(ruleset.input), RULESET);
  });

  it('updates the existing ruleset in place, so running it again changes nothing else', () => {
    const [ruleset, repo] = writes(apply([{ id: 7, name: 'main' }]));
    assert.match(ruleset.args.join(' '), /^api --method PUT repos\/[^ ]+\/rulesets\/7 /);
    assert.deepEqual(JSON.parse(ruleset.input), RULESET);
    assert.match(repo.args.join(' '), /^api --method PATCH repos\/[^/ ]+\/[^/ ]+ /);
    assert.deepEqual(JSON.parse(repo.input), SETTINGS.merge);
  });

  it('creates or updates the spec-approved, owner-merge, owner-only and run-native labels', () => {
    const labels = apply([]).filter((call) => call.args[0] === 'label');
    assert.deepEqual(
      labels.map((call) => [call.args[2], call.args.includes('--force')]),
      [
        ['spec-approved', true],
        ['owner-merge', true],
        ['owner-only', true],
        ['run-native', true],
      ],
    );
  });
});
