import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const labels = (...names) => names.map((name) => ({ name }));

describe('issue.sh', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const issueSh = (rules, ...args) => {
    const result = spawnSync(join(SCRIPTS, 'issue.sh'), args, {
      encoding: 'utf8',
      input: 'body\n',
      env: gh.env(rules),
    });
    return { ...result, calls: gh.calls().map((call) => call.args) };
  };
  const edit = (calls) => calls.find((args) => args[0] === 'issue' && args[1] === 'edit');
  const create = (calls) => calls.find((args) => args[0] === 'issue' && args[1] === 'create');
  const viewOf = (number, names, extra = {}) => ({
    match: `^issue view ${number} `,
    out: { number, labels: labels(...names), ...extra },
  });

  describe('update', () => {
    const rules = (names) => [viewOf(50, names), { match: '^issue edit ', out: '' }];

    it('removes spec-approved from a changed spec, so the owner approves again', () => {
      const result = issueSh(rules(['spec', 'spec-approved']), 'update', '50', '--body-file', '-');
      assert.equal(result.status, 0, result.stderr);
      assert.ok(edit(result.calls).includes('--remove-label'));
      assert.equal(
        edit(result.calls)[edit(result.calls).indexOf('--remove-label') + 1],
        'spec-approved',
      );
      assert.match(result.stdout, /removed spec-approved/);
    });

    it('keeps the approval for a --minor change such as a typo fix', () => {
      const result = issueSh(
        rules(['spec', 'spec-approved']),
        'update',
        '50',
        '--title',
        '[F031] Open Gym booking',
        '--minor',
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!edit(result.calls).includes('--remove-label'));
    });

    it("changes nothing when it can't read the labels", () => {
      const result = issueSh(
        [
          { match: '^issue view 50 ', out: '', status: 1 },
          { match: '^issue edit ', out: '' },
        ],
        'update',
        '50',
        '--body-file',
        '-',
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /could not read the labels of #50/);
      assert.equal(edit(result.calls), undefined);
    });

    it('leaves the labels of a ticket or an unapproved spec alone', () => {
      for (const names of [['ready-for-agent'], ['spec']]) {
        const result = issueSh(rules(names), 'update', '50', '--body-file', '-');
        assert.ok(!edit(result.calls).includes('--remove-label'), names.join());
      }
    });
  });

  describe('create ticket', () => {
    const rules = (names) => [
      viewOf(50, names),
      { match: '^issue create ', out: 'https://github.com/example/trainer-hub/issues/57' },
    ];
    const ticket = (names) =>
      issueSh(
        rules(names),
        'create',
        'ticket',
        '--title',
        '[F031] Hold a spot',
        '--body-file',
        '-',
        '--parent',
        '50',
      );

    it('labels a ticket of an approved spec ready-for-agent', () => {
      const result = ticket(['spec', 'spec-approved']);
      assert.equal(result.status, 0, result.stderr);
      const args = create(result.calls);
      assert.equal(args[args.indexOf('--label') + 1], 'ready-for-agent');
    });

    it('refuses to cut a ticket from a spec the owner has not approved', () => {
      const result = ticket(['spec']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /spec #50 is not approved/);
      assert.equal(create(result.calls), undefined);
    });

    it("refuses when it can't read the spec's labels", () => {
      const result = issueSh(
        [{ match: '^issue view 50 ', out: '', status: 1 }, ...rules(['spec', 'spec-approved'])],
        'create',
        'ticket',
        '--title',
        '[F031] Hold a spot',
        '--body-file',
        '-',
        '--parent',
        '50',
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /could not read the labels of #50/);
      assert.equal(create(result.calls), undefined);
    });
  });

  describe('ready', () => {
    const item = (number, names, parent) => ({
      match: `^issue view ${number} `,
      out: {
        number,
        title: `issue ${number}`,
        labels: labels(...names),
        assignees: [],
        parent,
        subIssues: { totalCount: 0, nodes: [] },
        blockedBy: { nodes: [] },
      },
    });

    it('leaves out tickets of unapproved specs and unapproved specs built as their own ticket', () => {
      const result = issueSh(
        [
          {
            match: '^issue list ',
            out: [{ number: 51 }, { number: 52 }, { number: 60 }, { number: 61 }],
          },
          item(51, ['ready-for-agent'], { number: 50 }),
          item(52, ['ready-for-agent'], { number: 49 }),
          item(60, ['spec', 'ready-for-agent'], null),
          item(61, ['spec', 'spec-approved', 'ready-for-agent'], null),
          viewOf(50, ['spec', 'spec-approved']),
          viewOf(49, ['spec']),
        ],
        'ready',
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '51\tissue 51\n61\tissue 61\n');
    });

    it("fails instead of listing a ticket whose spec's labels it can't read", () => {
      const result = issueSh(
        [
          { match: '^issue list ', out: [{ number: 51 }] },
          item(51, ['ready-for-agent'], { number: 50 }),
          { match: '^issue view 50 ', out: '', status: 1 },
        ],
        'ready',
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /could not read the labels of #50/);
    });
  });
});
