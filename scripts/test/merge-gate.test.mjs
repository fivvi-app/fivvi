import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const GATE_JQ = join(import.meta.dirname, '../merge-gate.jq');

// scripts/pr.sh passes these; the gate has no copy of them.
const MARKS = [
  ['review_mark', 'Self-review'],
  ['smoke_mark', 'Railway preview smoke check'],
  ['no_preview', 'no preview for this PR'],
].flatMap(([name, value]) => ['--arg', name, value]);

const gate = (facts) =>
  JSON.parse(
    execFileSync('jq', ['-c', ...MARKS, '-f', GATE_JQ], {
      input: JSON.stringify(facts),
      encoding: 'utf8',
    }),
  );

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const REQUIRED = ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android'];

const run = (name, conclusion = 'SUCCESS', status = 'COMPLETED') => ({
  __typename: 'CheckRun',
  name,
  status,
  conclusion: status === 'COMPLETED' ? conclusion : '',
});
const status = (context, state) => ({ __typename: 'StatusContext', context, state });

const reviewed = (sha = HEAD) =>
  `**Self-review:** standards and spec reviewers clean on \`${sha}\` ✅`;
const noPreview = (sha = HEAD) =>
  `**Railway preview smoke check:** on \`${sha}\`: no preview for this PR (it touches no Railway watch pattern).`;
const smoked = (sha = HEAD) =>
  `**Railway preview smoke check:** on \`${sha}\`: \`curl -fsS https://web-trainer-hub-pr-60.up.railway.app/api/v1/health\` → \`{"status":"ok"}\` ✅`;

const facts = (overrides = {}) => ({
  head: HEAD,
  default_branch: 'main',
  pr: {
    number: 60,
    state: 'OPEN',
    draft: false,
    base: 'main',
    body: `Closes #57\n\n${reviewed()}\n\n${noPreview()}`,
  },
  risk: { risk: 'low', reasons: [] },
  required: REQUIRED,
  checks: [
    run('Detect changes'),
    run('Checks (Linux)'),
    run('E2E (Linux)'),
    run('iOS', 'SKIPPED'),
    run('Android', 'SKIPPED'),
    run('GitGuardian Security Checks'),
  ],
  preview: 'no',
  behind: 0,
  threads: 0,
  ...overrides,
});
const withPr = (pr) => facts({ pr: { ...facts().pr, ...pr } });

const failed = (decision) => decision.conditions.filter((c) => !c.ok).map((c) => c.name);

describe('merge gate', () => {
  it('merges a low-risk, green, self-reviewed, up-to-date PR without a preview', () => {
    const decision = gate(facts());
    assert.equal(decision.merge, true);
    assert.deepEqual(failed(decision), []);
    assert.deepEqual(
      decision.conditions.map((c) => c.name),
      [
        'low-risk',
        'checks passed',
        'self-review clean',
        'preview smoke-checked',
        'up to date',
        'no open threads',
        'ready for review',
      ],
    );
  });

  it('keeps a high-risk PR for the owner, with the reasons', () => {
    const decision = gate(
      facts({ risk: { risk: 'high', reasons: ['scripts/pr.sh: guardrails (/scripts)'] } }),
    );
    assert.equal(decision.merge, false);
    assert.deepEqual(failed(decision), ['low-risk']);
    assert.match(decision.conditions[0].detail, /scripts\/pr\.sh: guardrails/);
  });

  it('refuses failing, pending or missing checks on the head commit', () => {
    const failing = facts({
      checks: [...facts().checks.slice(0, 5), run('GitGuardian Security Checks', 'FAILURE')],
    });
    assert.deepEqual(failed(gate(failing)), ['checks passed']);
    assert.match(gate(failing).conditions[1].detail, /failing: GitGuardian Security Checks/);

    const pending = facts({
      checks: [...facts().checks.slice(0, 4), run('Android', '', 'IN_PROGRESS')],
    });
    assert.match(gate(pending).conditions[1].detail, /pending: Android/);

    const missing = facts({ checks: facts().checks.filter((c) => c.name !== 'E2E (Linux)') });
    assert.deepEqual(failed(gate(missing)), ['checks passed']);
    assert.match(gate(missing).conditions[1].detail, /missing: E2E \(Linux\)/);

    const railway = facts({ checks: [...facts().checks, status('trainer-hub - cron', 'ERROR')] });
    assert.match(gate(railway).conditions[1].detail, /failing: trainer-hub - cron/);
  });

  it('requires a self-review record for the head commit, and rejects a stale one', () => {
    const none = withPr({ body: `Closes #57\n\n${noPreview()}` });
    assert.deepEqual(failed(gate(none)), ['self-review clean']);
    assert.match(gate(none).conditions[2].detail, /no self-review record/);

    const stale = withPr({ body: `Closes #57\r\n\r\n${reviewed(OLD)}\r\n\r\n${noPreview()}` });
    assert.deepEqual(failed(gate(stale)), ['self-review clean']);
    assert.match(gate(stale).conditions[2].detail, /bbbbbbb.*not the head aaaaaaa/);
  });

  it('requires a smoke record for the head commit, also when there is no preview', () => {
    const body = `Closes #57\n\n${reviewed()}`;
    const none = withPr({ body });
    assert.deepEqual(failed(gate(none)), ['preview smoke-checked']);
    assert.match(gate(none).conditions[3].detail, /no smoke check record/);

    const stale = withPr({ body: `${body}\n\n${noPreview(OLD)}` });
    assert.deepEqual(failed(gate(stale)), ['preview smoke-checked']);
    assert.match(gate(stale).conditions[3].detail, /bbbbbbb.*not the head aaaaaaa/);
  });

  it('requires a passed smoke check for the head commit when the PR has a preview', () => {
    const body = `Closes #57\n\n${reviewed()}`;
    const recorded = (record) =>
      facts({ preview: 'yes', pr: { ...facts().pr, body: `${body}\n\n${record}` } });

    const unchecked = facts({ preview: 'yes', pr: { ...facts().pr, body } });
    assert.deepEqual(failed(gate(unchecked)), ['preview smoke-checked']);

    assert.deepEqual(failed(gate(recorded(smoked(OLD)))), ['preview smoke-checked']);

    const noPreviewRecorded = gate(recorded(noPreview()));
    assert.deepEqual(failed(noPreviewRecorded), ['preview smoke-checked']);
    assert.match(noPreviewRecorded.conditions[3].detail, /has a preview/);

    assert.equal(gate(recorded(smoked())).merge, true);
  });

  it('takes whether the PR has a preview from pr.sh, not from the checks', () => {
    // Railway posts a green `trainer-hub - web` status also when it skips the deploy (no preview).
    const skipped = facts({
      checks: [...facts().checks, status('trainer-hub - web', 'SUCCESS')],
      preview: 'no',
    });
    assert.equal(gate(skipped).merge, true);
  });

  it('refuses while the preview is deploying, or when nobody knows whether there is one', () => {
    const deploying = gate(facts({ preview: 'pending' }));
    assert.deepEqual(failed(deploying), ['preview smoke-checked']);
    assert.match(deploying.conditions[3].detail, /still deploying/);

    for (const preview of [undefined, null, '', 'maybe']) {
      const unknown = gate(facts({ preview }));
      assert.deepEqual(failed(unknown), ['preview smoke-checked'], String(preview));
      assert.match(unknown.conditions[3].detail, /unknown/, String(preview));
    }
  });

  it('fails closed without a head commit, required checks or a commit in a record', () => {
    const noSha = withPr({
      body: 'Closes #57\n\n**Self-review:** clean ✅\n\n**Railway preview smoke check:** no preview for this PR.',
    });
    assert.deepEqual(failed(gate(noSha)), ['self-review clean', 'preview smoke-checked']);
    assert.match(gate(noSha).conditions[2].detail, /names no commit/);

    for (const head of [null, '', 'abc1234', 'A'.repeat(40)]) {
      const unknown = gate({ ...facts({ head }), pr: noSha.pr });
      assert.equal(unknown.merge, false, String(head));
      assert.deepEqual(
        failed(unknown),
        ['checks passed', 'self-review clean', 'preview smoke-checked'],
        String(head),
      );
      assert.match(unknown.conditions[1].detail, /head commit is unknown/, String(head));
    }

    const noRequired = gate(facts({ required: [] }));
    assert.deepEqual(failed(noRequired), ['checks passed']);
    assert.match(noRequired.conditions[1].detail, /no required checks/);

    const nothing = gate(facts({ head: null, required: [], checks: [], pr: noSha.pr }));
    assert.equal(nothing.merge, false);
  });

  it('refuses a branch behind main, open threads, a draft, a closed PR or another base', () => {
    assert.deepEqual(failed(gate(facts({ behind: 2 }))), ['up to date']);
    assert.deepEqual(failed(gate(facts({ threads: 1 }))), ['no open threads']);
    assert.deepEqual(failed(gate(withPr({ draft: true }))), ['ready for review']);
    assert.deepEqual(failed(gate(withPr({ state: 'MERGED' }))), ['ready for review']);
    assert.deepEqual(failed(gate(withPr({ base: 'release' }))), ['ready for review']);
  });
});
