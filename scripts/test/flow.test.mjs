import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const labels = (...names) => names.map((name) => ({ name }));

describe('flow.sh next', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const next = () =>
    spawnSync(join(SCRIPTS, 'flow.sh'), ['next'], {
      encoding: 'utf8',
      env: gh.env([
        { match: '^issue list .*--assignee @me', out: [] },
        {
          match: '^issue list .*--label spec ',
          out: [
            {
              number: 50,
              title: '[F031] Open Gym booking',
              labels: labels('spec', 'spec-approved'),
              subIssuesSummary: { completed: 1, total: 3 },
            },
            {
              number: 70,
              title: '[F040] Waiting list',
              labels: labels('spec'),
              subIssuesSummary: { completed: 0, total: 0 },
            },
          ],
        },
        { match: '^issue list .*--label ready-for-agent', out: [] },
        {
          match: '^issue list .*--label needs-info',
          out: [{ number: 72, title: 'Which reminder time?' }],
        },
        {
          match: '^pr list .*--state open',
          out: [
            { number: 60, title: '[F031] Hold a spot', isDraft: false },
            { number: 61, title: '[F031] Show the hold', isDraft: false },
            { number: 62, title: '[F031] Draft', isDraft: true },
          ],
        },
        { match: '^api repos/[^ ]+/pulls/60/files', out: [{ filename: 'scripts/pr.sh' }] },
        { match: '^api repos/[^ ]+/pulls/61/files', out: [{ filename: 'apps/web/page.tsx' }] },
        {
          match: '^pr view 6[01] ',
          out: { headRefName: 'docs/no-issue', closingIssuesReferences: [] },
        },
      ]),
    });

  it('lists what waits on the owner: specs to approve, high-risk PRs, questions', () => {
    const result = next();
    assert.equal(result.status, 0, result.stderr);
    const owner = result.stdout.slice(result.stdout.indexOf('== Waiting on the owner'));
    assert.equal(
      owner,
      [
        '== Waiting on the owner',
        'Approve spec #70 [F040] Waiting list (add spec-approved)',
        'Merge PR #60 [F031] Hold a spot (high-risk: scripts/pr.sh: guardrails (/scripts))',
        'Answer #72 Which reminder time? (needs-info)',
        '',
      ].join('\n'),
    );
  });
});
