import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// Spec #292, "Status-only rule (risk)": scripts/status-only.jq decides from a file's patch (the files API's `patch`
// field) whether a change to ROADMAP.md or FEATURES.md only moves status forward. Pure functions, called here with
// the diff shapes the files API returns (hunks with three lines of context), including the FEATURES.md changes of the
// merged PRs #262 and #282.

const SCRIPTS = join(import.meta.dirname, '..');

const decide = (fn, patch) => {
  const result = spawnSync(
    'jq',
    [
      '-c',
      '-L',
      SCRIPTS,
      '--argjson',
      'patch',
      JSON.stringify(patch),
      `include "status-only"; ${fn}`,
    ],
    { input: 'null', encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const roadmap = (patch) => decide('roadmap_status_only($patch)', patch);
const features = (patch) => decide('features_status_only($patch)', patch);

/**
 * A patch as the files API writes it, from hunks of lines (' ' context, '-' removed, '+' added): each hunk gets its
 * header, with the line counts a real one has.
 */
const patchOf = (...hunks) =>
  hunks
    .map((lines, i) => {
      const old = lines.filter((l) => l[0] !== '+').length;
      const added = lines.filter((l) => l[0] !== '-').length;
      return [`@@ -${10 + i * 40},${old} +${10 + i * 40},${added} @@ context`, ...lines].join('\n');
    })
    .join('\n');

describe('roadmap_status_only', () => {
  const tick = (text) => [`-  - [ ] ${text}`, `+  - [x] ${text}`];
  const around = (...change) => [' ', ' - **Owner setup:**', ...change, ' ', ' **Exit criteria**'];

  it('passes a checkbox tick', () => {
    assert.equal(
      roadmap(patchOf(around(...tick('Set `SIGN_UP_ALLOWED_EMAILS` per environment')))),
      true,
    );
  });

  it('passes several ticks, in one run of lines or in several hunks', () => {
    assert.equal(
      roadmap(patchOf(around('-  - [ ] One', '-  - [ ] Two', '+  - [x] One', '+  - [x] Two'))),
      true,
    );
    assert.equal(roadmap(patchOf(around(...tick('One')), around(...tick('Two')))), true);
  });

  it('passes a tick of a top-level item and of a starred item', () => {
    assert.equal(roadmap(patchOf(around('- - [ ] Shadow day', '+ - [x] Shadow day'))), true);
    assert.equal(roadmap(patchOf(around('-* [ ] Shadow day', '+* [x] Shadow day'))), true);
  });

  it('fails when the tick also changes the text of the item (the owner-setup lines of #262)', () => {
    assert.equal(
      roadmap(
        patchOf(
          around(
            '-  - [ ] Set `BETTER_AUTH_SECRET` per environment (a distinct, generated secret).',
            '+  - [x] Set `BETTER_AUTH_SECRET` per environment (a distinct, generated secret). ✅ Set in both (#146).',
          ),
        ),
      ),
      false,
    );
  });

  it('fails when a box is unticked', () => {
    assert.equal(roadmap(patchOf(around('-  - [x] One', '+  - [ ] One'))), false);
  });

  it('fails when the tick moves a different item or the indentation or bullet changes', () => {
    assert.equal(roadmap(patchOf(around('-  - [ ] One', '+  - [x] Two'))), false);
    assert.equal(roadmap(patchOf(around('-  - [ ] One', '+    - [x] One'))), false);
    assert.equal(roadmap(patchOf(around('-  - [ ] One', '+  * [x] One'))), false);
  });

  it('fails on any other changed line: wording, a table row, a date, the version', () => {
    for (const change of [
      ['-| **Version** | 1.24 |', '+| **Version** | 1.25 |'],
      ['-| **Date** | 27 October 2026 |', '+| **Date** | 28 October 2026 |'],
      ['-Goal: ship the thing.', '+Goal: ship the other thing.'],
      [
        '-| 2026-10-27 | 1.24 | **A decision** |',
        '+| 2026-10-27 | 1.24 | **A changed decision** |',
      ],
    ]) {
      assert.equal(roadmap(patchOf(around(...change))), false, change.join(' / '));
    }
  });

  it('fails when a tick comes with another change in the same patch', () => {
    assert.equal(roadmap(patchOf(around(...tick('One')), around('-Goal: a.', '+Goal: b.'))), false);
  });

  it('fails on an added or a removed line, also a checklist item', () => {
    assert.equal(roadmap(patchOf(around('+  - [x] A new item'))), false);
    assert.equal(roadmap(patchOf(around('-  - [ ] An old item'))), false);
    assert.equal(roadmap(patchOf(around('-  - [ ] One', '+  - [x] One', '+  - [x] Extra'))), false);
  });

  it('fails without a patch, with an empty one, or one that changes nothing', () => {
    for (const patch of [null, '', 7, {}, ['@@ -1 +1 @@']]) {
      assert.equal(roadmap(patch), false, JSON.stringify(patch));
    }
    assert.equal(roadmap(patchOf([' only context'])), false);
  });

  it('fails on a truncated patch: fewer lines in a hunk than its header counts', () => {
    const whole = patchOf(around(...tick('One')));
    const cut = whole.split('\n').slice(0, -2).join('\n');
    assert.equal(roadmap(cut), false);
    // Lines before the first hunk header are not a patch either.
    assert.equal(roadmap(`stray line\n${whole}`), false);
  });
});

describe('features_status_only', () => {
  const ID = '[F001](https://github.com/fivvi-app/fivvi/issues/128)';
  const row = (o = {}) => {
    const c = {
      id: 'F002',
      feature: 'Workspaces',
      status: 'PLANNED',
      priority: 'Must',
      milestone: 'M2',
      depends: 'F001',
      nl: '⬜',
      en: '⬜',
      spec: '§5',
      ...o,
    };
    return `| ${[c.id, c.feature, c.status, c.priority, c.milestone, c.depends, c.nl, c.en, c.spec].join(' | ')} |`;
  };
  const enabler = (o = {}) => {
    const c = {
      id: 'E011',
      enabler: 'Tenant isolation',
      status: 'IN PROGRESS',
      milestone: 'M2',
      notes: 'Row-level security.',
      ...o,
    };
    return `| ${[c.id, c.enabler, c.status, c.milestone, c.notes].join(' | ')} |`;
  };
  const featureTable = (...change) => [
    ' | ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |',
    ' |---|---|---|---|---|---|---|---|---|',
    ` | ${ID} | Authentication | IMPLEMENTED | Must | M2 | E004, E006 | ✅ | ✅ | §2.4, §27 |`,
    ...change,
    ` ${row({ id: 'F003', feature: 'Workspace Membership', depends: 'F002' })}`,
    ` ${row({ id: 'F004', feature: 'Roles', depends: 'F003' })}`,
    ` ${row({ id: 'F005', feature: 'Trainer Profile', depends: 'F003' })}`,
  ];
  const enablerTable = (...change) => [
    ' | ID | Enabler | Status | Milestone | Notes |',
    ' |---|---|---|---|---|',
    ` ${enabler({ id: 'E010', enabler: 'Something', status: 'IMPLEMENTED' })}`,
    ...change,
    ` ${enabler({ id: 'E012', enabler: 'Other', status: 'PLANNED' })}`,
  ];
  const swap = (old, now) => [`-${old}`, `+${now}`];
  const featureChange = (old, now) => patchOf(featureTable(...swap(row(old), row(now))));
  const enablerChange = (old, now) => patchOf(enablerTable(...swap(enabler(old), enabler(now))));

  it('passes the status of a feature moving forward (#282: F002 PLANNED to IN PROGRESS)', () => {
    // The real shape of the patch of PR #282.
    const patch = [
      '@@ -25,7 +25,7 @@ The single source of truth for feature status. A status changes **in the same PR',
      ' | ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |',
      ' |---|---|---|---|---|---|---|---|---|',
      ' | [F001](https://github.com/fivvi-app/fivvi/issues/128) | Authentication: sign-in with the emailed link or 6-digit code on the web, and with the code and a bearer token on iOS and Android (ADR-007) | IMPLEMENTED | Must | M2 (+ iOS/Android; native sign-in: separate spec) | E004, E006 | ✅ | ✅ | §2.4, §27 |',
      '-| F002 | Workspaces | PLANNED | Must | M2 | F001 | ⬜ | ⬜ | §5 |',
      '+| F002 | Workspaces | IN PROGRESS | Must | M2 | F001 | ⬜ | ⬜ | §5 |',
      ' | F003 | Workspace Membership | PLANNED | Must | M2 | F002 | ⬜ | ⬜ | §2.9, §6, §9 (team role next to client relationship) |',
      ' | F004 | Roles | PLANNED | Must | M2 | F003 | ⬜ | ⬜ | §9, §50 (Owner and Trainer; Admin is a later role 🔜) |',
      ' | F005 | Trainer Profile | PLANNED | Must | M2 (+ iOS/Android: profile) | F003 | ⬜ | ⬜ | §9 |',
    ].join('\n');
    assert.equal(features(patch), true);
  });

  it('passes the spec that completes: IMPLEMENTED, a final summary and NL/EN ticks (#262: F001)', () => {
    // The real shape of the patch of PR #262.
    const patch = [
      '@@ -24,7 +24,7 @@ The single source of truth for feature status. A status changes **in the same PR',
      ' ',
      ' | ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |',
      ' |---|---|---|---|---|---|---|---|---|',
      '-| [F001](https://github.com/fivvi-app/fivvi/issues/128) | Authentication | PLANNED | Must | M2 (+ iOS/Android; native sign-in: separate spec) | E004, E006 | ⬜ | ⬜ | §2.4, §27 |',
      '+| [F001](https://github.com/fivvi-app/fivvi/issues/128) | Authentication: sign-in with the emailed link or 6-digit code on the web, and with the code and a bearer token on iOS and Android (ADR-007) | IMPLEMENTED | Must | M2 (+ iOS/Android; native sign-in: separate spec) | E004, E006 | ✅ | ✅ | §2.4, §27 |',
      ' | F002 | Workspaces | PLANNED | Must | M2 | F001 | ⬜ | ⬜ | §5 |',
      ' | F003 | Workspace Membership | PLANNED | Must | M2 | F002 | ⬜ | ⬜ | §2.9, §6, §9 (team role next to client relationship) |',
      ' | F004 | Roles | PLANNED | Must | M2 | F003 | ⬜ | ⬜ | §9, §50 (Owner and Trainer; Admin is a later role 🔜) |',
    ].join('\n');
    assert.equal(features(patch), true);
  });

  it('passes each step forward of the lifecycle, and a status that stays', () => {
    const lifecycle = [
      'IDEA',
      'PLANNED',
      'DESIGNED',
      'IN PROGRESS',
      'IN REVIEW',
      'IMPLEMENTED',
      'RELEASED',
    ];
    for (const [from, a] of lifecycle.entries()) {
      for (const [to, b] of lifecycle.entries()) {
        // Only a row that becomes IMPLEMENTED may change its summary; here the summary stays.
        const expected = to >= from;
        assert.equal(
          features(featureChange({ status: a }, { status: b })),
          expected,
          `${a} to ${b}`,
        );
      }
    }
  });

  it('passes the NL and EN ticks, one at a time', () => {
    assert.equal(features(featureChange({ nl: '⬜' }, { nl: '✅' })), true);
    assert.equal(features(featureChange({ en: '⬜' }, { en: '✅' })), true);
    assert.equal(features(featureChange({ nl: '⬜', en: '⬜' }, { nl: '✅', en: '✅' })), true);
  });

  it('passes the ID gaining a link to its spec issue', () => {
    const linked = '[F002](https://github.com/fivvi-app/fivvi/issues/290)';
    assert.equal(features(featureChange({}, { id: linked, status: 'DESIGNED' })), true);
  });

  it('fails an ID that changes other than by gaining the link', () => {
    for (const id of [
      'F022',
      '[F022](https://github.com/fivvi-app/fivvi/issues/290)',
      '[F002](https://example.com/issues/290)',
      '[F002](https://github.com/fivvi-app/fivvi/pull/290)',
      '[F002](https://github.com/fivvi-app/fivvi/issues/290) extra',
      '',
    ]) {
      assert.equal(features(featureChange({}, { id })), false, id);
    }
    // A link already there may not change its target, and may not be removed.
    const old = '[F002](https://github.com/fivvi-app/fivvi/issues/290)';
    assert.equal(
      features(
        featureChange({ id: old }, { id: '[F002](https://github.com/fivvi-app/fivvi/issues/291)' }),
      ),
      false,
    );
    assert.equal(features(featureChange({ id: old }, { id: 'F002' })), false);
    assert.equal(features(featureChange({ id: old }, { id: old, status: 'IN PROGRESS' })), true);
  });

  it('fails a changed Priority, Milestone, Depends on or Spec', () => {
    assert.equal(features(featureChange({}, { priority: 'Should' })), false);
    assert.equal(features(featureChange({}, { milestone: 'M3' })), false);
    assert.equal(features(featureChange({}, { depends: 'F001, F003' })), false);
    assert.equal(features(featureChange({}, { depends: '' })), false);
    assert.equal(features(featureChange({}, { spec: '§6' })), false);
    // Not even on the row that becomes IMPLEMENTED.
    assert.equal(features(featureChange({}, { status: 'IMPLEMENTED', priority: 'Should' })), false);
    assert.equal(features(featureChange({}, { status: 'IMPLEMENTED', depends: 'F009' })), false);
  });

  it('fails a changed Feature cell unless the row becomes IMPLEMENTED', () => {
    assert.equal(features(featureChange({}, { feature: 'Workspaces, rewritten' })), false);
    assert.equal(
      features(featureChange({}, { status: 'IN REVIEW', feature: 'Workspaces, rewritten' })),
      false,
    );
    assert.equal(
      features(featureChange({}, { status: 'IMPLEMENTED', feature: 'Workspaces, rewritten' })),
      true,
    );
    // The row was IMPLEMENTED already: the summary is final.
    assert.equal(
      features(
        featureChange(
          { status: 'IMPLEMENTED' },
          { status: 'IMPLEMENTED', feature: 'Workspaces, rewritten' },
        ),
      ),
      false,
    );
  });

  it('fails a status that moves backwards, or is not in the lifecycle', () => {
    assert.equal(
      features(featureChange({ status: 'IMPLEMENTED' }, { status: 'IN PROGRESS' })),
      false,
    );
    assert.equal(features(featureChange({ status: 'IN PROGRESS' }, { status: 'PLANNED' })), false);
    assert.equal(features(featureChange({}, { status: 'DONE' })), false);
    assert.equal(features(featureChange({ status: 'DONE' }, { status: 'IMPLEMENTED' })), false);
    assert.equal(features(featureChange({}, { status: 'in progress' })), false);
  });

  it('fails NL or EN going back, or to anything but a tick', () => {
    assert.equal(features(featureChange({ nl: '✅' }, { nl: '⬜' })), false);
    assert.equal(features(featureChange({ en: '⬜' }, { en: '—' })), false);
    assert.equal(features(featureChange({ nl: '—' }, { nl: '✅' })), false);
    assert.equal(features(featureChange({ nl: '⬜' }, { nl: 'ok' })), false);
  });

  it('fails an added row, a removed row and a row that is not an existing ID', () => {
    assert.equal(features(patchOf(featureTable(`+${row({ id: 'F099', feature: 'New' })}`))), false);
    assert.equal(features(patchOf(featureTable(`-${row({ id: 'F099', feature: 'Old' })}`))), false);
    assert.equal(
      features(patchOf(featureTable(`-${row({ id: 'F099' })}`, `+${row({ id: 'F098' })}`))),
      false,
    );
    // A row replaced by two, and two by one.
    assert.equal(
      features(
        patchOf(
          featureTable(
            `-${row()}`,
            `+${row({ status: 'IN PROGRESS' })}`,
            `+${row({ id: 'F099' })}`,
          ),
        ),
      ),
      false,
    );
  });

  it('fails rows swapped between themselves', () => {
    const a = row({ id: 'F002' });
    const b = row({ id: 'F003', feature: 'Membership' });
    assert.equal(features(patchOf(featureTable(`-${a}`, `-${b}`, `+${b}`, `+${a}`))), false);
  });

  it('fails a row with an unexpected number of cells, or one that is not a registry row', () => {
    assert.equal(features(patchOf(featureTable(`-${row()}`, `+${row()} extra |`))), false);
    assert.equal(
      features(
        patchOf(
          featureTable(
            '-| F002 | Workspaces | PLANNED | Must |',
            '+| F002 | Workspaces | IN PROGRESS | Must |',
          ),
        ),
      ),
      false,
    );
    assert.equal(
      features(
        patchOf(
          featureTable(
            '-| 1.1 | Waitlists | PLANNED | x |',
            '+| 1.1 | Waitlists | IMPLEMENTED | x |',
          ),
        ),
      ),
      false,
    );
  });

  it('fails any change outside the feature and enabler tables', () => {
    for (const change of [
      ['-- **Priority:** `Must` (MVP cannot ship without it)', '+- **Priority:** `Must` (changed)'],
      [
        '-| MVP | 61 (F001–F061) + 19 enablers | 0 |',
        '+| MVP | 62 (F001–F062) + 19 enablers | 0 |',
      ],
      [
        '-| 1.1 | Waitlists · recurring private appointments |',
        '+| 1.1 | Waitlists · something else |',
      ],
      ['-## MVP: user-facing features', '+## MVP: features'],
      ['+A new paragraph.'],
    ]) {
      assert.equal(features(patchOf([' ', ...change, ' '])), false, change.join(' / '));
    }
    // And next to a valid status change in the same patch.
    assert.equal(
      features(
        patchOf(featureTable(...swap(row(), row({ status: 'IN PROGRESS' }))), [
          ' ',
          '-Intro line.',
          '+Another intro line.',
          ' ',
        ]),
      ),
      false,
    );
  });

  it('passes enabler rows: Status forward, and Notes only on a row that becomes IMPLEMENTED', () => {
    assert.equal(features(enablerChange({ status: 'PLANNED' }, { status: 'IN PROGRESS' })), true);
    assert.equal(
      features(
        enablerChange({ status: 'IN REVIEW' }, { status: 'IMPLEMENTED', notes: 'Final summary.' }),
      ),
      true,
    );
    assert.equal(
      features(
        enablerChange({ status: 'IN REVIEW' }, { status: 'IMPLEMENTED', enabler: 'Renamed' }),
      ),
      true,
    );
    assert.equal(
      features(enablerChange({ status: 'IN PROGRESS' }, { notes: 'A different note.' })),
      false,
    );
    assert.equal(
      features(
        enablerChange({ status: 'IN PROGRESS' }, { status: 'IN REVIEW', enabler: 'Renamed' }),
      ),
      false,
    );
    assert.equal(features(enablerChange({}, { milestone: 'M3' })), false);
    assert.equal(
      features(enablerChange({ status: 'IMPLEMENTED' }, { status: 'IN PROGRESS' })),
      false,
    );
    assert.equal(
      features(
        enablerChange({ status: 'IMPLEMENTED' }, { status: 'IMPLEMENTED', notes: 'Edited later.' }),
      ),
      false,
    );
    assert.equal(features(patchOf(enablerTable(`+${enabler({ id: 'E099' })}`))), false);
  });

  it('passes a patch with a feature row and an enabler row changing, each in its hunk', () => {
    assert.equal(
      features(
        patchOf(
          featureTable(...swap(row(), row({ status: 'IN PROGRESS' }))),
          enablerTable(
            ...swap(enabler({ status: 'IN PROGRESS' }), enabler({ status: 'IN REVIEW' })),
          ),
        ),
      ),
      true,
    );
  });

  it('fails without a patch, with an empty one, or one that changes nothing', () => {
    for (const patch of [null, '', 7, {}]) {
      assert.equal(features(patch), false, JSON.stringify(patch));
    }
    assert.equal(features(patchOf(featureTable())), false);
  });

  it('fails on a truncated patch', () => {
    const whole = featureChange({}, { status: 'IN PROGRESS' });
    const lines = whole.split('\n');
    // The change itself is intact, but the hunk is cut short: the header counts more lines than the patch has.
    assert.equal(features(lines.slice(0, -2).join('\n')), false);
    assert.equal(features(`${lines.join('\n')}\n @@ -90,3 +90,3 @@\n context`), false);
  });
});

describe('status_only', () => {
  const tick = patchOf([' ', '-  - [ ] One', '+  - [x] One', ' ']);

  it('applies the roadmap rule to ROADMAP.md and the registry rule to FEATURES.md, nothing else', () => {
    const run = (path, patch) => decide(`status_only(${JSON.stringify(path)}; $patch)`, patch);
    assert.equal(run('docs/product/ROADMAP.md', tick), true);
    assert.equal(run('docs/product/FEATURES.md', tick), false);
    assert.equal(run('docs/product/PRODUCT.md', tick), false);
    assert.equal(run('docs/decisions/ADR-021.md', tick), false);
    assert.equal(run('ROADMAP.md', tick), false);
    assert.equal(run('docs/product/ROADMAP.md', null), false);
  });
});
