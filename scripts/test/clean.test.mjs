// #668: scripts/clean.sh cleans up what finished work leaves behind. Everything it touches is injectable: `gh` is the
// fake of fake-gh.mjs, `xcrun` a fake simctl over a JSON file, HOME a folder of the test, the repository a throwaway
// clone with a local bare origin. Nothing here reads the real simulators, DerivedData or turbo cache of the machine.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0';
const DAY = 86400 * 1000;

const XCRUN = `#!/usr/bin/env bash
[ "$1" = simctl ] || exit 1
shift
echo "$*" >>"$SIM_STATE/xcrun.log"
case "$1" in
  help) ;;
  list) cat "$SIM_STATE/devices.json" ;;
  shutdown) ;;
  delete)
    jq --arg u "$2" '.devices |= map_values(map(select(.udid != $u)))' "$SIM_STATE/devices.json" >"$SIM_STATE/devices.tmp" \\
      && mv "$SIM_STATE/devices.tmp" "$SIM_STATE/devices.json"
    rm -rf "$SIM_STATE/data/$2" ;;
esac
exit 0
`;

// A process id that is certainly not running: the one of a child that has exited.
const deadPid = () => spawnSync('true').pid;

describe('#668 clean.sh', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  let base;
  let repo;
  let home;
  let bin;
  let sim;
  let prs;

  const git = (cwd, ...args) =>
    execFileSync(
      'git',
      ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      { encoding: 'utf8' },
    ).trim();
  const worktreeOf = (branch) => join(repo, '.worktrees', branch.replace('/', '-'));
  const exists = (path) => existsSync(path);
  const branchExists = (branch) => git(repo, 'branch', '--list', branch) !== '';

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'clean-')));
    repo = join(base, 'repo');
    home = join(base, 'home');
    bin = join(base, 'bin');
    sim = join(base, 'sim');
    prs = {};
    for (const dir of [bin, sim, join(sim, 'data'), home]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(sim, 'devices.json'), JSON.stringify({ devices: { [RUNTIME]: [] } }));
    writeFileSync(join(bin, 'xcrun'), XCRUN);
    writeFileSync(join(bin, 'xcodebuild'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'xcrun'), 0o755);
    chmodSync(join(bin, 'xcodebuild'), 0o755);
    const origin = join(base, 'origin.git');
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin]);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    // Keep the copy small: the tests of the scripts are not needed to run them.
    rmSync(join(repo, 'scripts/test'), { recursive: true, force: true });
    writeFileSync(join(repo, '.gitignore'), '.worktrees/\n.work/\n.turbo/\n*.bin\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: init');
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '--quiet', '-u', 'origin', 'main');
    git(repo, 'remote', 'set-head', 'origin', 'main');
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  // A worktree of `branch`. committed: a commit on top of main; pushed: that commit is on origin; dirty: an uncommitted file.
  const addWorktree = (branch, { committed = false, pushed = false, dirty = false } = {}) => {
    const dir = worktreeOf(branch);
    git(repo, 'worktree', 'add', '--quiet', '-b', branch, dir);
    writeFileSync(join(dir, 'ballast.bin'), Buffer.alloc(3 * 1024 * 1024));
    if (committed) {
      writeFileSync(join(dir, 'change.txt'), `${branch}\n`);
      git(dir, 'add', 'change.txt');
      git(dir, 'commit', '--quiet', '-m', 'feat(F031): change');
    }
    if (pushed) git(dir, 'push', '--quiet', '-u', 'origin', branch);
    if (dirty) writeFileSync(join(dir, 'edit.txt'), 'not committed\n');
    return dir;
  };
  // The PR gh answers for `branch`.
  const pr = (branch, state, number = 200) => {
    prs[branch] = { number, state, headRefOid: git(repo, 'rev-parse', `refs/heads/${branch}`) };
  };
  // A branch without a PR: gh answers an empty list.
  const noPr = (branch) => {
    prs[branch] = null;
  };

  const devices = () =>
    JSON.parse(readFileSync(join(sim, 'devices.json'), 'utf8')).devices[RUNTIME].map(
      ({ name }) => name,
    );
  const addSimulator = (name, udid = `UDID-${name.replaceAll(' ', '-')}`) => {
    const file = join(sim, 'devices.json');
    const all = JSON.parse(readFileSync(file, 'utf8'));
    const dataPath = join(sim, 'data', udid);
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(join(dataPath, 'data.bin'), Buffer.alloc(1024 * 1024));
    all.devices[RUNTIME].push({ name, udid, state: 'Shutdown', dataPath });
    writeFileSync(file, JSON.stringify(all));
  };
  const simctlLog = () =>
    existsSync(join(sim, 'xcrun.log')) ? readFileSync(join(sim, 'xcrun.log'), 'utf8') : '';

  const derivedData = () => join(home, 'Library/Developer/Xcode/DerivedData');
  const addDerivedData = (name, workspace) => {
    const dir = join(derivedData(), name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'build.bin'), Buffer.alloc(512 * 1024));
    if (workspace !== undefined)
      writeFileSync(
        join(dir, 'info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>LastAccessedDate</key>\n\t<date>2026-11-01T10:00:00Z</date>\n\t<key>WorkspacePath</key>\n\t<string>${workspace}</string>\n</dict>\n</plist>\n`,
      );
    return dir;
  };

  const cacheDir = () => join(repo, '.turbo/cache');
  // A turbo cache entry of one hash: its three files, last used `daysAgo` days ago.
  const addCacheEntry = (
    hash,
    daysAgo,
    { files = ['.tar.zst', '-meta.json', '-manifest.json'] } = {},
  ) => {
    mkdirSync(cacheDir(), { recursive: true });
    for (const suffix of files) {
      const file = join(cacheDir(), `${hash}${suffix}`);
      writeFileSync(file, Buffer.alloc(100 * 1024));
      const when = new Date(Date.now() - daysAgo * DAY);
      utimesSync(file, when, when);
    }
  };

  const run = (args = [], env = {}, from = repo) => {
    const ghEnv = gh.env(
      Object.entries(prs).map(([branch, out]) => ({
        match: `^pr list .*--head ${branch} `,
        out: out === null ? [] : [out],
      })),
    );
    return spawnSync(join(from, 'scripts/clean.sh'), args, {
      cwd: from,
      encoding: 'utf8',
      env: {
        ...ghEnv,
        PATH: `${bin}:${ghEnv.PATH}`,
        SIM_STATE: sim,
        HOME: home,
        GIT_TERMINAL_PROMPT: '0',
        ...env,
      },
    });
  };

  describe('worktrees', () => {
    it('removes the worktree and branch of a merged PR without an issue, through wt.sh done', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      pr('docs/old-note', 'MERGED');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('docs/old-note')), false);
      assert.equal(branchExists('docs/old-note'), false);
      assert.match(result.stdout, /^removed .*docs-old-note/m);
    });

    it('finishes the issue of a merged ticket with flow.sh finish', () => {
      addWorktree('chore/9101-merged', { committed: true, pushed: true });
      pr('chore/9101-merged', 'MERGED');
      // flow.sh finish needs the issue tracker; here it is a stand-in that records the call and removes nothing.
      writeFileSync(
        join(repo, 'scripts/flow.sh'),
        `#!/usr/bin/env bash\necho "$FIVVI_CLEANING $*" >>"${base}/flow.log"\n`,
      );
      chmodSync(join(repo, 'scripts/flow.sh'), 0o755);
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(base, 'flow.log'), 'utf8'), '1 finish 9101\n');
    });

    it('leaves a merged worktree with uncommitted changes and says why', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true, dirty: true });
      pr('docs/old-note', 'MERGED');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('docs/old-note')), true);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*docs\/old-note.*uncommitted changes/);
    });

    it('leaves a merged worktree with commits the PR lacks', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      pr('docs/old-note', 'MERGED');
      // The PR was merged at an older commit than the local branch.
      prs['docs/old-note'].headRefOid = git(repo, 'rev-parse', 'main');
      const result = run();
      assert.equal(exists(worktreeOf('docs/old-note')), true);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*docs\/old-note.*not in PR #200/);
    });

    it('removes the worktree of a closed PR whose branch is pushed and clean, and keeps the branch', () => {
      addWorktree('fix/55-closed', { committed: true, pushed: true });
      pr('fix/55-closed', 'CLOSED');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('fix/55-closed')), false);
      assert.equal(branchExists('fix/55-closed'), true);
      assert.match(result.stdout, /^removed .*fix-55-closed/m);
    });

    it('leaves the worktree of a closed PR with commits that are not pushed, and reports it', () => {
      addWorktree('fix/55-closed', { committed: true });
      pr('fix/55-closed', 'CLOSED');
      const result = run();
      assert.equal(exists(worktreeOf('fix/55-closed')), true);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*fix\/55-closed.*not pushed/);
    });

    it('leaves the worktree of a closed PR with commits pushed only up to an earlier one', () => {
      const dir = addWorktree('fix/55-closed', { committed: true, pushed: true });
      writeFileSync(join(dir, 'more.txt'), 'more\n');
      git(dir, 'add', 'more.txt');
      git(dir, 'commit', '--quiet', '-m', 'feat(F031): more');
      pr('fix/55-closed', 'CLOSED');
      const result = run();
      assert.equal(exists(dir), true);
      assert.match(result.stdout, /fix\/55-closed.*not pushed/);
    });

    it('leaves the worktree of a closed PR with uncommitted changes', () => {
      addWorktree('fix/55-closed', { committed: true, pushed: true, dirty: true });
      pr('fix/55-closed', 'CLOSED');
      const result = run();
      assert.equal(exists(worktreeOf('fix/55-closed')), true);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*fix\/55-closed.*uncommitted changes/);
    });

    it('keeps the worktrees of an open PR and of a branch without a PR', () => {
      addWorktree('feature/60-open', { committed: true });
      addWorktree('feature/61-no-pr');
      pr('feature/60-open', 'OPEN', 60);
      noPr('feature/61-no-pr');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('feature/60-open')), true);
      assert.equal(exists(worktreeOf('feature/61-no-pr')), true);
      assert.match(result.stdout, /^kept .*feature-60-open.*PR #60 is open/m);
      assert.match(result.stdout, /^kept .*feature-61-no-pr.*no PR/m);
    });

    it('does not remove the worktree it runs from', () => {
      const dir = addWorktree('docs/old-note', { committed: true, pushed: true });
      cpSync(join(repo, 'scripts'), join(dir, 'scripts'), { recursive: true });
      pr('docs/old-note', 'MERGED');
      const result = run([], {}, dir);
      assert.equal(exists(dir), true, result.stdout + result.stderr);
    });
  });

  describe('folders in .worktrees/ that are not worktrees', () => {
    it('removes them and keeps registered worktrees', () => {
      addWorktree('feature/60-open');
      pr('feature/60-open', 'OPEN', 60);
      mkdirSync(join(repo, '.worktrees/leftover/node_modules'), { recursive: true });
      writeFileSync(
        join(repo, '.worktrees/leftover/node_modules/x.bin'),
        Buffer.alloc(1024 * 1024),
      );
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(join(repo, '.worktrees/leftover')), false);
      assert.equal(exists(worktreeOf('feature/60-open')), true);
      assert.match(result.stdout, /^removed .*\.worktrees\/leftover/m);
    });

    it('prunes the registration of a worktree whose folder is gone', () => {
      addWorktree('feature/60-open');
      rmSync(worktreeOf('feature/60-open'), { recursive: true, force: true });
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(git(repo, 'worktree', 'list'), /feature-60-open/);
    });

    it('leaves a folder that holds a repository of its own', () => {
      mkdirSync(join(repo, '.worktrees/clone'), { recursive: true });
      git(join(repo, '.worktrees/clone'), 'init', '--quiet');
      const result = run();
      assert.equal(exists(join(repo, '.worktrees/clone')), true);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*\.worktrees\/clone/);
    });
  });

  describe('simulators', () => {
    it('deletes Fivvi simulators without their worktree and those of a run that is gone, and keeps the rest', () => {
      addWorktree('feature/60-open');
      pr('feature/60-open', 'OPEN', 60);
      addSimulator('Fivvi feature-60-open');
      addSimulator('Fivvi feature-61-gone');
      addSimulator(`Fivvi parallel ${deadPid()}`);
      addSimulator(`Fivvi parallel ${process.pid}`);
      addSimulator('iPhone 17 Pro');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(devices().sort(), [
        'Fivvi feature-60-open',
        `Fivvi parallel ${process.pid}`,
        'iPhone 17 Pro',
      ]);
      assert.match(result.stdout, /^removed simulator 'Fivvi feature-61-gone'/m);
    });

    it('deletes the simulator of a worktree it removes in the same run', () => {
      addWorktree('fix/55-closed', { committed: true, pushed: true });
      pr('fix/55-closed', 'CLOSED');
      addSimulator('Fivvi fix-55-closed');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(devices(), []);
    });

    it('does nothing without Xcode', () => {
      addSimulator('Fivvi feature-61-gone');
      rmSync(join(bin, 'xcrun'));
      writeFileSync(join(bin, 'xcrun'), '#!/bin/sh\nexit 1\n');
      chmodSync(join(bin, 'xcrun'), 0o755);
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(devices(), ['Fivvi feature-61-gone']);
    });
  });

  describe('DerivedData', () => {
    it('removes the folders of this repository whose workspace is gone, and keeps the others', () => {
      addWorktree('feature/60-open');
      pr('feature/60-open', 'OPEN', 60);
      const alive = addDerivedData(
        'FivviPro-alive',
        join(worktreeOf('feature/60-open'), 'apps/ios/FivviPro.xcodeproj'),
      );
      mkdirSync(join(worktreeOf('feature/60-open'), 'apps/ios/FivviPro.xcodeproj'), {
        recursive: true,
      });
      const gone = addDerivedData(
        'FivviPro-gone',
        join(repo, '.worktrees/fix-9-gone/apps/ios/FivviPro.xcodeproj'),
      );
      const elsewhere = addDerivedData('Other-gone', '/Users/someone/else/Other.xcodeproj');
      const noPlist = addDerivedData('ModuleCache.noindex');
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(gone), false);
      assert.equal(exists(alive), true);
      assert.equal(exists(elsewhere), true);
      assert.equal(exists(noPlist), true);
      assert.match(result.stdout, /^removed .*DerivedData\/FivviPro-gone/m);
    });

    it('reads a binary property list too', (t) => {
      if (spawnSync('plutil', ['-help']).error) return t.skip('plutil is not available');
      const dir = addDerivedData('FivviPro-binary');
      const xml = join(dir, 'info.xml');
      writeFileSync(
        xml,
        `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>WorkspacePath</key><string>${repo}/.worktrees/gone/FivviPro.xcodeproj</string></dict></plist>`,
      );
      execFileSync('plutil', ['-convert', 'binary1', '-o', join(dir, 'info.plist'), xml]);
      run();
      assert.equal(exists(dir), false);
    });
  });

  describe('turbo cache', () => {
    it('removes entries not used for 7 days, all files of a hash together, and keeps recent ones', () => {
      addCacheEntry('aaaa1111aaaa1111', 10);
      addCacheEntry('bbbb2222bbbb2222', 1);
      // One file of a hash was used lately: the whole entry stays.
      addCacheEntry('cccc3333cccc3333', 10, { files: ['.tar.zst'] });
      addCacheEntry('cccc3333cccc3333', 0, { files: ['-meta.json'] });
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        [...Array(3)].map((_, i) =>
          exists(
            join(cacheDir(), `aaaa1111aaaa1111${['.tar.zst', '-meta.json', '-manifest.json'][i]}`),
          ),
        ),
        [false, false, false],
      );
      for (const file of [
        'bbbb2222bbbb2222.tar.zst',
        'bbbb2222bbbb2222-meta.json',
        'cccc3333cccc3333.tar.zst',
        'cccc3333cccc3333-meta.json',
      ])
        assert.equal(exists(join(cacheDir(), file)), true, file);
      assert.match(result.stdout, /^removed turbo cache: 1 entry/m);
    });

    it('takes the number of days from FIVVI_TURBO_CACHE_DAYS', () => {
      addCacheEntry('aaaa1111aaaa1111', 3);
      addCacheEntry('bbbb2222bbbb2222', 0.5);
      run([], { FIVVI_TURBO_CACHE_DAYS: '2' });
      assert.equal(exists(join(cacheDir(), 'aaaa1111aaaa1111.tar.zst')), false);
      assert.equal(exists(join(cacheDir(), 'bbbb2222bbbb2222.tar.zst')), true);
    });

    it('refuses a number of days that is not a positive integer', () => {
      addCacheEntry('aaaa1111aaaa1111', 30);
      const result = run([], { FIVVI_TURBO_CACHE_DAYS: 'soon' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /FIVVI_TURBO_CACHE_DAYS/);
      assert.equal(exists(join(cacheDir(), 'aaaa1111aaaa1111.tar.zst')), true);
    });

    it('has nothing to do without a cache', () => {
      const result = run();
      assert.equal(result.status, 0, result.stderr);
    });
  });

  describe('--dry-run', () => {
    const everything = () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      pr('docs/old-note', 'MERGED');
      addWorktree('fix/55-closed', { committed: true, pushed: true });
      pr('fix/55-closed', 'CLOSED', 201);
      mkdirSync(join(repo, '.worktrees/leftover'), { recursive: true });
      addSimulator('Fivvi feature-61-gone');
      addDerivedData('FivviPro-gone', join(repo, '.worktrees/gone/FivviPro.xcodeproj'));
      addCacheEntry('aaaa1111aaaa1111', 10);
    };

    it('says what it would remove and removes nothing', () => {
      everything();
      const result = run(['--dry-run']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('docs/old-note')), true);
      assert.equal(branchExists('docs/old-note'), true);
      assert.equal(exists(worktreeOf('fix/55-closed')), true);
      assert.equal(exists(join(repo, '.worktrees/leftover')), true);
      assert.deepEqual(devices(), ['Fivvi feature-61-gone']);
      assert.equal(exists(join(derivedData(), 'FivviPro-gone')), true);
      assert.equal(exists(join(cacheDir(), 'aaaa1111aaaa1111.tar.zst')), true);
      assert.doesNotMatch(simctlLog(), /delete/);
      assert.match(result.stdout, /^would remove .*docs-old-note/m);
      assert.match(result.stdout, /^would remove .*fix-55-closed/m);
      assert.match(result.stdout, /^would remove .*leftover/m);
      assert.match(result.stdout, /^would remove simulator 'Fivvi feature-61-gone'/m);
      assert.match(result.stdout, /^would remove .*DerivedData\/FivviPro-gone/m);
      assert.match(result.stdout, /^would remove turbo cache: 1 entry/m);
      assert.match(result.stdout, /Would free about [\d.]+ (KB|MB|GB)/);
    });

    it('still leaves the dirty and unpushed work out of the list', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true, dirty: true });
      pr('docs/old-note', 'MERGED');
      const result = run(['--dry-run']);
      assert.doesNotMatch(result.stdout, /^would remove .*docs-old-note/m);
      assert.match(result.stdout, /== Left for you\n(.*\n)*.*docs\/old-note.*uncommitted changes/);
    });

    it('refuses any other argument', () => {
      const result = run(['--everything']);
      assert.notEqual(result.status, 0);
    });
  });

  describe('a run', () => {
    it('ends with what it removed and roughly how much space that freed', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      pr('docs/old-note', 'MERGED');
      addSimulator('Fivvi feature-61-gone');
      addCacheEntry('aaaa1111aaaa1111', 10);
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Removed 3 items, freed about [\d.]+ (KB|MB|GB)\.\n$/);
    });

    it('is safe to run again: the second run removes nothing', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      pr('docs/old-note', 'MERGED');
      addSimulator('Fivvi feature-61-gone');
      addCacheEntry('aaaa1111aaaa1111', 10);
      assert.equal(run().status, 0);
      const second = run();
      assert.equal(second.status, 0, second.stderr);
      assert.match(second.stdout, /Nothing to remove\.\n$/);
    });

    it('keeps a worktree of an open PR, its simulator, its DerivedData and recent cache entries', () => {
      const dir = addWorktree('feature/60-open', { committed: true });
      pr('feature/60-open', 'OPEN', 60);
      addSimulator('Fivvi feature-60-open');
      mkdirSync(join(dir, 'apps/ios/FivviPro.xcodeproj'), { recursive: true });
      const dd = addDerivedData('FivviPro-live', join(dir, 'apps/ios/FivviPro.xcodeproj'));
      addCacheEntry('bbbb2222bbbb2222', 1);
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(dir), true);
      assert.deepEqual(devices(), ['Fivvi feature-60-open']);
      assert.equal(exists(dd), true);
      assert.equal(exists(join(cacheDir(), 'bbbb2222bbbb2222.tar.zst')), true);
      assert.match(result.stdout, /Nothing to remove\.\n$/);
    });

    it('leaves a worktree whose PR it cannot read, and says so', () => {
      addWorktree('docs/old-note', { committed: true, pushed: true });
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(exists(worktreeOf('docs/old-note')), true);
      assert.match(
        result.stdout,
        /== Left for you\n(.*\n)*.*docs\/old-note.*could not read its PR/,
      );
    });
  });
});
