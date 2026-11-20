import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const ROOT = join(import.meta.dirname, '../..');
const RULESET = JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main.json'), 'utf8'));
const SETTINGS = JSON.parse(readFileSync(join(ROOT, '.github/repo-settings.json'), 'utf8'));
const RELEASE = JSON.parse(readFileSync(join(ROOT, '.github/environments/release.json'), 'utf8'));

describe('the versioned GitHub settings', () => {
  it('keep every label description within the 100 characters GitHub accepts', () => {
    for (const label of SETTINGS.labels) {
      assert.ok(
        label.description.length <= 100,
        `${label.name}: ${label.description.length} characters`,
      );
    }
  });

  it('#407 declare the labels that show which PRs wait on the owner, with a colour and a description', () => {
    for (const name of ['owner-queue', 'owner-decide']) {
      const label = SETTINGS.labels.find((candidate) => candidate.name === name);
      assert.ok(label, `${name} is declared`);
      assert.match(label.color, /^[0-9a-f]{6}$/);
      assert.ok(label.description.length > 0);
    }
  });

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
    // The required checks are jobs of ci.yml. #293 added the parts behind the gates "iOS" and "Android": they are no
    // required checks, the gates are.
    assert.deepEqual(
      jobs.filter((name) => required.includes(name)),
      required,
    );
    assert.deepEqual(
      jobs.filter((name) => !required.includes(name)),
      [
        // Not required, and never to be: the listed flaky tests run here (E002 #1361, TESTING.md §8).
        'Quarantine',
        'iOS build',
        'iOS build (retry)',
        'iOS tests (${{ matrix.locale }} ${{ matrix.shard }}/2)',
        'iOS tests (retry plan)',
        'iOS tests (${{ matrix.locale }} ${{ matrix.shard }}/2) (retry)',
        'Android build',
        'Android tests',
        'Android Maestro',
        // Not required, and never to be: the listed flaky Android tests run here (E002 #1363, TESTING.md §8).
        'Quarantine (Android)',
        // ADR-034: opens the issue of a failed nightly run; runs only on the schedule, and is not required.
        'Nightly report',
      ],
    );
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

  // #1425: one PR per merge stays: GitHub builds every queued entry on its own, so a group of 3 runs no fewer
  // checks (ADR-033, "Merge group size"); HEADGREEN would not change that either.
  it('E002 #119: require the merge queue, squash, one PR per merge, sized for a cold iOS run (~25 min)', () => {
    const queue = RULESET.rules.find((rule) => rule.type === 'merge_queue');
    assert.deepEqual(queue.parameters, {
      merge_method: 'SQUASH',
      grouping_strategy: 'ALLGREEN',
      max_entries_to_build: 4,
      max_entries_to_merge: 1,
      min_entries_to_merge: 1,
      min_entries_to_merge_wait_minutes: 5,
      check_response_timeout_minutes: 160,
    });
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    // The job timeouts as ci.yml sets them (job-level, four spaces): the longest native job starts after
    // Detect changes, and the queue should time out after both, so a hung job fails as itself.
    const timeout = (job) =>
      Number(ci.slice(ci.indexOf(`\n  ${job}:\n`)).match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
    // iOS: the build, then the tests, then the gate. Android: the tests next to the build, then Maestro after the build,
    // then the gate (#293).
    // #1268: a job that no runner took is cancelled by GitHub after 15 minutes and tried once more (the build by
    // ios-build-retry, a test pass by ios-tests-retry, after ios-tests-plan has named it), and the retry may wait for a
    // runner as long. So that chain is the build's two waits and the job, then the tests' (the plan needs the whole
    // ios-tests matrix, so the slower of the wait and the other language's full run, the plan, the retry's wait and the
    // retry), then the gate.
    const NOT_ACQUIRED_WAIT = 15;
    const longestChain = Math.max(
      timeout('ios-build') + timeout('ios-tests') + timeout('ios'),
      2 * NOT_ACQUIRED_WAIT +
        timeout('ios-build-retry') +
        (Math.max(NOT_ACQUIRED_WAIT, timeout('ios-tests')) +
          timeout('ios-tests-plan') +
          NOT_ACQUIRED_WAIT +
          timeout('ios-tests-retry')) +
        timeout('ios'),
      timeout('android-tests') + timeout('android'),
      timeout('android-build') + timeout('android-maestro') + timeout('android'),
      // Checks (Linux) needs no other job and runs beside the native chain (#1490: 25 minutes).
      timeout('checks'),
    );
    assert.ok(
      queue.parameters.check_response_timeout_minutes > timeout('changes') + longestChain,
      'the queue should time out after Detect changes plus the longest native chain, gate included',
    );
  });
});

describe('github-settings.sh apply', () => {
  const gh = fakeGh();
  const dir = mkdtempSync(join(tmpdir(), 'github-settings-'));
  after(() => {
    gh.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const OWNER_ID = 4242;
  // The pipeline switch of the run (ADR-035, `merge`): the ruleset applied is the file's form for it.
  const pipelineFile = (merge) => {
    const file = join(dir, `pipeline-${merge}.json`);
    writeFileSync(file, JSON.stringify({ ci: 'lean', review: 'split', builders: 1, merge }));
    return file;
  };
  const apply = (existing, policies = [], merge = 'queue', extraEnv = {}) => {
    const result = spawnSync(join(ROOT, 'scripts/github-settings.sh'), ['apply'], {
      encoding: 'utf8',
      env: {
        ...gh.env([
          { match: '^api repos/[^ ]+/rulesets$', out: existing },
          { match: '^api users/', out: { id: OWNER_ID } },
          {
            match: '^api repos/[^ ]+/environments/release/deployment-branch-policies( --jq|$)',
            out: { branch_policies: policies },
          },
          { match: '^api --method DELETE ', out: '' },
          { match: '^api --method (POST|PUT|PATCH) ', out: {} },
          { match: '^label create ', out: '' },
        ]),
        ...extraEnv,
        FIVVI_PIPELINE_FILE: pipelineFile(merge),
      },
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

  describe('ADR-035: the form of the ruleset follows `merge` in .github/pipeline.json', () => {
    const applied = (merge) => {
      const [ruleset] = writes(apply([{ id: 7, name: 'main' }], [], merge));
      return JSON.parse(ruleset.input);
    };
    const rule = (ruleset, type) => ruleset.rules.find((r) => r.type === type);

    it('merge queue: exactly the file as it is, with the merge queue and the loose status policy', () => {
      assert.deepEqual(applied('queue'), RULESET);
      assert.equal(
        rule(RULESET, 'required_status_checks').parameters.strict_required_status_checks_policy,
        false,
      );
    });

    it('merge direct: the same file without the merge_queue rule and with the strict status policy', () => {
      const direct = applied('direct');
      assert.deepEqual(
        direct.rules.map((r) => r.type),
        RULESET.rules.map((r) => r.type).filter((type) => type !== 'merge_queue'),
      );
      const checks = rule(direct, 'required_status_checks').parameters;
      assert.equal(checks.strict_required_status_checks_policy, true);
      assert.deepEqual(
        checks.required_status_checks,
        rule(RULESET, 'required_status_checks').parameters.required_status_checks,
      );
      assert.deepEqual(
        checks.required_status_checks.map((c) => c.context),
        ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android'],
      );
    });

    it('merge direct keeps everything else: squash only, a PR, no force-push or deletion, no bypass, the same name and target', () => {
      const direct = applied('direct');
      assert.deepEqual(rule(direct, 'pull_request'), rule(RULESET, 'pull_request'));
      assert.deepEqual(rule(direct, 'pull_request').parameters.allowed_merge_methods, ['squash']);
      for (const type of ['deletion', 'non_fast_forward']) assert.ok(rule(direct, type), type);
      assert.deepEqual(direct.bypass_actors, []);
      for (const key of ['name', 'target', 'enforcement', 'conditions'])
        assert.deepEqual(direct[key], RULESET[key], key);
    });

    it('does not change the file: the direct form is derived at apply time, so there is one source', () => {
      applied('direct');
      assert.ok(RULESET.rules.some((r) => r.type === 'merge_queue'));
      assert.equal(
        JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main.json'), 'utf8')).rules.length,
        RULESET.rules.length,
      );
    });

    it('creates the direct form too when main has no ruleset yet', () => {
      const [ruleset] = writes(apply([], [], 'direct'));
      assert.match(ruleset.args.join(' '), /^api --method POST repos\/[^ ]+\/rulesets /);
      assert.equal(
        rule(JSON.parse(ruleset.input), 'required_status_checks').parameters
          .strict_required_status_checks_policy,
        true,
      );
    });

    it('applies nothing when the switch cannot be read: it fails closed, with the reason', () => {
      const result = spawnSync(join(ROOT, 'scripts/github-settings.sh'), ['apply'], {
        encoding: 'utf8',
        env: { ...gh.env([]), FIVVI_PIPELINE_FILE: join(dir, 'missing.json') },
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /merge/);
      assert.equal(writes(gh.calls()).length, 0);
    });
  });

  it('updates the existing ruleset in place, so running it again changes nothing else', () => {
    const [ruleset, repo] = writes(apply([{ id: 7, name: 'main' }]));
    assert.match(ruleset.args.join(' '), /^api --method PUT repos\/[^ ]+\/rulesets\/7 /);
    assert.deepEqual(JSON.parse(ruleset.input), RULESET);
    assert.match(repo.args.join(' '), /^api --method PATCH repos\/[^/ ]+\/[^/ ]+ /);
    assert.deepEqual(JSON.parse(repo.input), SETTINGS.merge);
  });

  it('creates or updates the spec-approved, owner-merge, owner-only, owner-queue, owner-decide, run-native and owner-task labels', () => {
    const labels = apply([]).filter((call) => call.args[0] === 'label');
    assert.deepEqual(
      labels.map((call) => [call.args[2], call.args.includes('--force')]),
      [
        ['spec-approved', true],
        ['owner-merge', true],
        ['owner-only', true],
        ['owner-queue', true],
        ['owner-decide', true],
        ['run-native', true],
        ['prio-high', true],
        ['prio-medium', true],
        ['prio-low', true],
        ['effort-quick', true],
        ['effort-medium', true],
        ['effort-big', true],
        ['with-pilot-gym', true],
      ],
    );
  });

  describe('E017 AC7: the release environment', () => {
    const env = (calls) =>
      writes(calls).filter((call) => call.args.join(' ').includes('/environments/release'));

    it('is recorded as a versioned file: the owner reviews every deployment, only main deploys', () => {
      assert.equal(RELEASE.name, 'release');
      assert.deepEqual(RELEASE.reviewers, ['thekeyvan']);
      assert.deepEqual(RELEASE.deployment_branches, ['main']);
    });

    it("E017 AC7: admins cannot bypass the protection rules (agents use the owner's admin token)", () => {
      assert.equal(RELEASE.can_admins_bypass, false);
    });

    it('E017 AC7: creates the environment with the owner as the required reviewer, and only custom branch policies', () => {
      const [put] = env(apply([]));
      assert.match(put.args.join(' '), /^api --method PUT repos\/[^ ]+\/environments\/release /);
      assert.deepEqual(JSON.parse(put.input), {
        reviewers: [{ type: 'User', id: OWNER_ID }],
        prevent_self_review: false,
        can_admins_bypass: false,
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      });
    });

    it('E017 AC7: allows deployments from main only', () => {
      const posts = env(apply([])).filter((call) => call.args.includes('POST'));
      assert.equal(posts.length, 1);
      assert.match(posts[0].args.join(' '), /deployment-branch-policies /);
      assert.deepEqual(JSON.parse(posts[0].input), { name: 'main', type: 'branch' });
    });

    it('E017 AC7: running it again adds nothing and removes any other branch policy', () => {
      const calls = env(
        apply(
          [],
          [
            { id: 1, name: 'main' },
            { id: 2, name: 'feature/*' },
          ],
        ),
      );
      assert.equal(calls.filter((call) => call.args.includes('POST')).length, 0);
      const deletes = calls.filter((call) => call.args.includes('DELETE'));
      assert.equal(deletes.length, 1);
      assert.match(deletes[0].args.join(' '), /deployment-branch-policies\/2$/);
    });
  });
});
