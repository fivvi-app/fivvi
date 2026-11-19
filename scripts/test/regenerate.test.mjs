import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GROUPS } from '../regenerate.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'regenerate.mjs');

// Two PRs that each change a route, a string or a token conflict in the generated files (E001 #1484). The tests build a
// repository in which `main` and a `feature` branch each change the sources of the three generators and regenerate, and
// run the script in the merge. The real generators need Swift and Java, so `pnpm` is a fake on the PATH: each fake
// generator writes the files of its group as a function of the group's sources, and each fake check recomputes them and
// fails on a difference, as the drift checks do.
let base;
let repo;
let calls;

const FAKE_PNPM = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CALLS, args.join(' ') + '\\n');
const read = (path) => readFileSync(path, 'utf8');
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const groups = {
  contract: () => {
    const stamp = '// from ' + JSON.stringify(read('packages/contract/openapi.json')) + '\\n';
    return {
      'packages/contract/src/generated/schema.ts': stamp,
      'packages/contract/swift/Sources/FivviAPI/Generated/Types.swift': stamp,
      'packages/contract/kotlin/generated/app/fivvi/api/models/All.kt': stamp,
    };
  },
  i18n: () => {
    const stamp = '// from ' + JSON.stringify(read('packages/i18n/en.json') + read('packages/i18n/nl-NL.json')) + '\\n';
    return {
      'packages/i18n/generated/ios/Localizable.xcstrings': stamp,
      'packages/i18n/generated/android/values/strings.xml': stamp,
    };
  },
  tokens: () => {
    const stamp = '// from ' + JSON.stringify(read('packages/design-tokens/tokens/color.light.json')) + '\\n';
    return {
      'packages/design-tokens/generated/web/tokens.css': stamp,
      'packages/design-tokens/kotlin/generated/app/fivvi/designtokens/Colors.kt': stamp,
      'packages/design-tokens/FivviDesignTokens/Sources/FivviDesignTokens/Generated/Colors.swift': stamp,
    };
  },
};
const write = (name) => {
  for (const [path, text] of Object.entries(groups[name]())) put(path, text);
};
const check = (name) => {
  const drift = Object.entries(groups[name]()).filter(([path, text]) => {
    try { return read(path) !== text; } catch { return true; }
  });
  for (const [path] of drift) console.error('stale: ' + path);
  process.exit(drift.length ? 1 : 0);
};
const line = args.join(' ');
if (line === 'generate:contract') write('contract');
else if (line === '--filter @fivvi/contract check') check('contract');
else if (line === '--filter @fivvi/i18n generate') {
  write('i18n');
  if (process.env.FAKE_BROKEN_I18N) put('packages/i18n/generated/ios/Localizable.xcstrings', 'wrong\\n');
}
else if (line === '--filter @fivvi/i18n check:generated') check('i18n');
else if (line === '--filter @fivvi/design-tokens generate') write('tokens');
else if (line === '--filter @fivvi/design-tokens exec node src/cli.ts check generated') check('tokens');
else { console.error('fake pnpm: unexpected ' + line); process.exit(3); }
`;

const gitEnv = () => ({
  PATH: process.env.PATH,
  HOME: base,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@users.noreply.github.com',
});
const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitEnv() });
const gitTry = (...args) =>
  spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitEnv() });
const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const read = (path) => readFileSync(join(repo, path), 'utf8');
const commit = (message) => {
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', message);
};

const env = () => ({
  ...gitEnv(),
  PATH: `${join(base, 'bin')}:${process.env.PATH}`,
  FAKE_CALLS: calls,
});
/** The fake generators as a pnpm call, to regenerate on a branch the way a builder does. */
const pnpm = (...args) =>
  execFileSync(join(base, 'bin', 'pnpm'), args, { cwd: repo, env: env(), stdio: 'pipe' });
const regenerateAll = () => {
  pnpm('generate:contract');
  pnpm('--filter', '@fivvi/i18n', 'generate');
  pnpm('--filter', '@fivvi/design-tokens', 'generate');
};
const run = (...args) =>
  spawnSync('node', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env: env() });
const pnpmCalls = () =>
  existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean) : [];
const unmerged = () => git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const staged = () => git('diff', '--cached', '--name-only').split('\n').filter(Boolean);

// A source with keys far apart, so the two branches' edits merge cleanly while the generated file (one line that
// stands for the whole source, as a generated catalog's content does) conflicts.
const spread = (keys) =>
  Object.entries(keys)
    .map(([key, value]) => `"${key}": "${value}",\n${'\n'.repeat(12)}`)
    .join('');
const BASE_KEYS = { a: 'one', m: 'two', z: 'three' };

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'regenerate-')));
  repo = join(base, 'repo');
  calls = join(base, 'calls.log');
  mkdirSync(repo);
  mkdirSync(join(base, 'bin'));
  writeFileSync(join(base, 'bin', 'pnpm'), FAKE_PNPM);
  chmodSync(join(base, 'bin', 'pnpm'), 0o755);
  git('init', '--quiet', '--initial-branch=main');
  write('packages/i18n/en.json', spread(BASE_KEYS));
  write('packages/i18n/nl-NL.json', spread(BASE_KEYS));
  write('packages/contract/openapi.json', spread(BASE_KEYS));
  write('packages/design-tokens/tokens/color.light.json', spread(BASE_KEYS));
  write('README.md', 'base\n');
  regenerateAll();
  commit('chore(E001): base');
  rmSync(calls, { force: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

/** Replaces the value of one key of a source file, as a PR changing a string does. */
const edit = (path, key, value) =>
  write(path, read(path).replace(new RegExp(`"${key}": "[^"]*"`), `"${key}": "${value}"`));

/** `feature` and `main` each change sources and regenerate; the repository is left on `feature`. */
const diverge = ({ own, main }) => {
  git('switch', '--quiet', '-c', 'feature');
  own();
  regenerateAll();
  commit('feat(F050): own');
  git('switch', '--quiet', 'main');
  main();
  regenerateAll();
  commit('feat(F020): main');
  git('switch', '--quiet', 'feature');
  rmSync(calls, { force: true });
};

describe('regenerate.mjs', () => {
  it('regenerates conflicted generated files from the resolved sources and stages them', () => {
    diverge({
      own: () => {
        edit('packages/contract/openapi.json', 'a', 'own route');
        edit('packages/i18n/en.json', 'a', 'own string');
        edit('packages/design-tokens/tokens/color.light.json', 'a', 'own token');
      },
      main: () => {
        edit('packages/contract/openapi.json', 'z', 'main route');
        edit('packages/i18n/en.json', 'z', 'main string');
        edit('packages/design-tokens/tokens/color.light.json', 'z', 'main token');
      },
    });
    const merge = gitTry('merge', 'main');
    assert.notEqual(merge.status, 0, 'the generated files conflict');
    assert.deepEqual(
      unmerged().filter((path) => !/generated|Generated/.test(path)),
      [],
      'only generated files conflict',
    );
    assert.ok(unmerged().length >= 3);

    const result = run();

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /Regenerated and staged: contract, i18n, design tokens/);
    assert.deepEqual(unmerged(), []);
    for (const path of staged().filter((p) => /generated|Generated/.test(p)))
      assert.doesNotMatch(read(path), /^[<>=]{7}/m, `${path} has no conflict markers`);
    assert.match(read('packages/i18n/en.json'), /own string/);
    assert.match(read('packages/i18n/en.json'), /main string/);
    // The drift checks (here the fake ones) pass on the result.
    for (const check of [
      ['--filter', '@fivvi/contract', 'check'],
      ['--filter', '@fivvi/i18n', 'check:generated'],
      ['--filter', '@fivvi/design-tokens', 'exec', 'node', 'src/cli.ts', 'check', 'generated'],
    ])
      pnpm(...check);
    assert.equal(
      git('status', '--porcelain')
        .split('\n')
        .filter((l) => /^.\S/.test(l)).length,
      0,
      'nothing left unstaged',
    );
    git('commit', '--quiet', '--no-edit');
    assert.equal(git('log', '-1', '--format=%P').trim().split(' ').length, 2, 'a merge commit');
  });

  it('runs only the generators whose sources or outputs the merge touched, then their checks', () => {
    diverge({
      own: () => edit('packages/i18n/en.json', 'a', 'own string'),
      main: () => edit('packages/i18n/en.json', 'z', 'main string'),
    });
    gitTry('merge', 'main');

    const result = run();

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(pnpmCalls(), [
      '--filter @fivvi/i18n generate',
      '--filter @fivvi/i18n check:generated',
    ]);
    assert.match(result.stdout, /Regenerated and staged: i18n\b/);
  });

  it('refuses while a source file has a conflict, names it and changes nothing', () => {
    diverge({
      own: () => {
        edit('packages/i18n/en.json', 'm', 'own string');
        edit('packages/contract/openapi.json', 'a', 'own route');
      },
      main: () => {
        edit('packages/i18n/en.json', 'm', 'main string');
        edit('packages/contract/openapi.json', 'z', 'main route');
      },
    });
    gitTry('merge', 'main');
    const before = unmerged();
    assert.ok(before.includes('packages/i18n/en.json'));

    const result = run();

    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/i18n\/en\.json/);
    assert.doesNotMatch(result.stderr, /openapi\.json/, 'names only the conflicted source');
    assert.deepEqual(pnpmCalls(), [], 'no generator ran');
    assert.deepEqual(unmerged(), before);
  });

  it('refuses a conflicted openapi.json, also once it is staged with its markers', () => {
    diverge({
      own: () => edit('packages/contract/openapi.json', 'm', 'own route'),
      main: () => edit('packages/contract/openapi.json', 'm', 'main route'),
    });
    gitTry('merge', 'main');
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/contract\/openapi\.json/);

    // Someone resolved by staging the file with the markers still in it.
    git('add', 'packages/contract/openapi.json');
    assert.match(read('packages/contract/openapi.json'), /^<{7} /m);
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/contract\/openapi\.json/);
    assert.deepEqual(pnpmCalls(), []);
  });

  it('succeeds after the source conflict is resolved', () => {
    diverge({
      own: () => edit('packages/design-tokens/tokens/color.light.json', 'm', 'own token'),
      main: () => edit('packages/design-tokens/tokens/color.light.json', 'm', 'main token'),
    });
    gitTry('merge', 'main');
    assert.equal(run().status, 1);

    edit('packages/design-tokens/tokens/color.light.json', 'm', 'resolved');
    write(
      'packages/design-tokens/tokens/color.light.json',
      read('packages/design-tokens/tokens/color.light.json').replace(/^(<{7}|={7}|>{7}).*\n/gm, ''),
    );
    git('add', 'packages/design-tokens/tokens/color.light.json');
    const result = run();

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(unmerged(), []);
    assert.doesNotMatch(read('packages/design-tokens/generated/web/tokens.css'), /^[<>=]{7}/m);
  });

  it('fails when a drift check fails after the generator ran', () => {
    diverge({
      own: () => edit('packages/i18n/en.json', 'a', 'own string'),
      main: () => edit('packages/i18n/en.json', 'z', 'main string'),
    });
    gitTry('merge', 'main');

    const result = spawnSync('node', [SCRIPT], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env(), FAKE_BROKEN_I18N: '1' },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /i18n drift check failed/);
  });

  it('does nothing outside a merge, and --all regenerates every group', () => {
    let result = run();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /nothing to regenerate/);
    assert.deepEqual(pnpmCalls(), []);

    result = run('--all', '--no-check');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(pnpmCalls(), [
      'generate:contract',
      '--filter @fivvi/i18n generate',
      '--filter @fivvi/design-tokens generate',
    ]);
  });

  it('rejects an unknown flag', () => {
    const result = run('--bogus');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
  });

  it('has every generated path marked linguist-generated in .gitattributes, and no source', () => {
    const attr = (path) =>
      execFileSync('git', ['-C', ROOT, 'check-attr', 'linguist-generated', '--', path], {
        encoding: 'utf8',
      });
    for (const group of GROUPS) {
      for (const path of group.generated)
        assert.match(attr(`${path}/x/File.txt`), /linguist-generated: true/, path);
      for (const path of group.sources)
        assert.doesNotMatch(attr(`${path}/File.txt`), /linguist-generated: true/, path);
    }
  });
});
