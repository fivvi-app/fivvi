import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const lib = (expression) =>
  execFileSync('bash', ['-c', `source "${SCRIPTS}/_lib.sh"; ${expression}`], {
    encoding: 'utf8',
  }).trim();
const succeeds = (expression) =>
  spawnSync('bash', ['-c', `source "${SCRIPTS}/_lib.sh"; ${expression}`]).status === 0;

describe('naming rules', () => {
  it('accepts ticket and plain branches, rejects others', () => {
    for (const name of [
      'feature/57-hold-a-spot',
      'fix/12-hold-expiry',
      'chore/ci-cache',
      'docs/roadmap',
    ]) {
      assert.ok(succeeds(`is_branch_name ${name}`), name);
    }
    for (const name of ['feature/F031-open-gym', 'feat/57-x', 'feature/57_Hold', 'main']) {
      assert.ok(!succeeds(`is_branch_name ${name}`), name);
    }
  });

  it('reads the issue number from a ticket branch', () => {
    assert.equal(lib('branch_issue feature/57-hold-a-spot'), '57');
    assert.equal(lib('branch_issue docs/roadmap'), '');
  });

  it('accepts Conventional Commits with an ID scope', () => {
    for (const subject of [
      'feat(F031): hold a spot',
      'fix: keep the hold',
      'docs(E006): record the check',
      'feat!: drop v0',
    ]) {
      assert.ok(succeeds(`is_conventional "${subject}"`), subject);
    }
    for (const subject of [
      'Add a thing',
      'feat:missing space',
      'feature(F031): wrong type',
      `feat: ${'x'.repeat(100)}`,
    ]) {
      assert.ok(!succeeds(`is_conventional "${subject}"`), subject);
    }
  });

  it('turns issue titles into branch slugs', () => {
    assert.equal(
      lib('slugify "[F031] Hold a spot while verifying!"'),
      'hold-a-spot-while-verifying',
    );
  });

  it('gives each worktree a stable e2e port, and the main checkout 3100', () => {
    const port = Number(lib('e2e_port /tmp/a'));
    assert.equal(Number(lib('e2e_port /tmp/a')), port);
    assert.ok(port >= 3200 && port < 3900);
    assert.equal(lib('e2e_port "$MAIN_ROOT"'), '3100');
  });
});

describe('usage', () => {
  it('prints the commands of every script, never its code', () => {
    for (const script of [
      'flow',
      'issue',
      'wt',
      'pr',
      'skills',
      'risk',
      'github-settings',
      'android',
      'maestro',
    ]) {
      const result = spawnSync(join(SCRIPTS, `${script}.sh`), [], { encoding: 'utf8' });
      assert.equal(result.status, 1, script);
      assert.match(result.stderr, new RegExp(`${script}\\.sh [\\w<]`), script);
      assert.doesNotMatch(result.stderr, /set -euo|source /, script);
    }
  });
});

const script = (path, body) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
};

// A fake Android SDK in its own folder per test. Its tools find AVDs the way the real ones do: avdmanager
// (cmdline-tools) in ANDROID_AVD_HOME or ~/.android/avd, the emulator in ANDROID_AVD_HOME or, when XDG_CONFIG_HOME is
// set (GitHub's Ubuntu runners), under that. sdkmanager logs its arguments and installs cmdline-tools when asked; without
// them in the SDK, setup takes sdkmanager from (fake) Homebrew.
describe('android.sh setup', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const fakeSdk = ({ cmdlineTools = true, emulatorFindsAvds = true } = {}) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'android-setup-')));
    dirs.push(base);
    const home = join(base, 'home');
    const sdk = join(base, 'sdk');
    const log = join(base, 'sdkmanager.log');
    const avdmanager = `dir="\${ANDROID_AVD_HOME:-$HOME/.android/avd}"
while [ $# -gt 0 ]; do [ "$1" = --name ] && name="$2"; shift; done
mkdir -p "$dir/$name.avd" && touch "$dir/$name.ini"
printf "%s\\n" "disk.dataPartition.path=<temp>" "disk.dataPartition.size=6G" "hw.cpu.ncore=4" >"$dir/$name.avd/config.ini"`;
    const sdkmanager = `echo "$*" >>"${log}"
for arg; do case "$arg" in --sdk_root=*) root="\${arg#--sdk_root=}" ;; esac; done
case " $* " in *" cmdline-tools;latest "*)
  mkdir -p "$root/cmdline-tools/latest/bin" && printf '%s\\n' '#!/usr/bin/env bash' '${avdmanager.replaceAll("'", "'\\''")}' >"$root/cmdline-tools/latest/bin/avdmanager"
  chmod +x "$root/cmdline-tools/latest/bin/avdmanager" ;;
esac`;
    mkdirSync(join(sdk, 'platform-tools'), { recursive: true });
    mkdirSync(join(base, 'jdk'));
    if (cmdlineTools) {
      script(join(sdk, 'cmdline-tools/latest/bin/sdkmanager'), sdkmanager);
      script(join(sdk, 'cmdline-tools/latest/bin/avdmanager'), avdmanager);
    }
    script(
      join(base, 'brew/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager'),
      sdkmanager,
    );
    script(join(base, 'bin/brew'), `[ "$1" = --prefix ] && echo "${join(base, 'brew')}"; exit 0`);
    script(
      join(sdk, 'emulator/emulator'),
      emulatorFindsAvds
        ? `dir="\${ANDROID_AVD_HOME:-\${XDG_CONFIG_HOME:+$XDG_CONFIG_HOME/.android/avd}}"
[ "$1" = -list-avds ] && for f in "\${dir:-$HOME/.android/avd}"/*.ini; do [ -e "$f" ] && basename "$f" .ini; done
exit 0`
        : 'exit 0',
    );
    script(join(base, 'bin/java'), 'echo "openjdk version \\"21\\"" >&2');
    script(join(home, '.maestro/bin/maestro'), 'echo 2.11.0');
    const env = {
      PATH: `${join(base, 'bin')}:${process.env.PATH}`,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      ANDROID_HOME: sdk,
      JAVA_HOME: join(base, 'jdk'),
    };
    const setup = () =>
      spawnSync(join(SCRIPTS, 'android.sh'), ['setup'], { encoding: 'utf8', env });
    const installed = () => readFileSync(log, 'utf8');
    const config = join(home, '.android/avd/trainer-hub.avd/config.ini');
    return { env, setup, installed, config };
  };

  it('creates an AVD that the emulator finds in later steps, also with XDG_CONFIG_HOME set', () => {
    const { env, setup } = fakeSdk();
    const result = setup();
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const found = spawnSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_android.sh"; android_env; avd_exists`,
      ],
      { encoding: 'utf8', env },
    );
    assert.equal(found.status, 0, found.stdout + found.stderr);
  });

  it('fails when the emulator still cannot find the AVD it created', () => {
    const result = fakeSdk({ emulatorFindsAvds: false }).setup();

    assert.equal(result.status, 1);
    assert.match(result.stdout, /created, but the emulator can't find it/);
  });

  // GitHub's runners have 2 cores; the device profile asks for 4. The data partition stays as the emulator wants it:
  // it creates 6 GB on the first boot whatever config.ini or -partition-size say (CI frees disk space for it).
  it('gives the AVD 2 cores, keeping its other settings', () => {
    const { setup, config } = fakeSdk();

    assert.equal(setup().status, 0);

    assert.deepEqual(readFileSync(config, 'utf8').split('\n').filter(Boolean).sort(), [
      'disk.dataPartition.path=<temp>',
      'disk.dataPartition.size=6G',
      'hw.cpu.ncore=2',
    ]);
  });

  it('sets the cores of an AVD created before, on every setup', () => {
    const { setup, config } = fakeSdk();
    assert.equal(setup().status, 0);
    writeFileSync(
      config,
      'disk.dataPartition.size = 6442450944\nhw.cpu.ncore = 4\nhw.ramSize=2G\n',
    );

    assert.equal(setup().status, 0);

    assert.deepEqual(readFileSync(config, 'utf8').split('\n').filter(Boolean).sort(), [
      'disk.dataPartition.size = 6442450944',
      'hw.cpu.ncore=2',
      'hw.ramSize=2G',
    ]);
  });

  it('installs cmdline-tools only when the SDK has none', () => {
    const present = fakeSdk();
    assert.equal(present.setup().status, 0);
    assert.doesNotMatch(present.installed(), /cmdline-tools;latest/);

    const absent = fakeSdk({ cmdlineTools: false });
    const result = absent.setup();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(absent.installed(), /cmdline-tools;latest/);
  });
});

// The boot wait against a fake emulator, adb and sleep (no real waiting: sleep returns at once and logs each call).
// FAKE_EMULATOR picks what the emulator does: `exit` (fails at once, as without KVM), `hang` (runs but never boots) or
// `boot`. It records its pid, so a test can check it was stopped.
describe('android.sh emulator', () => {
  const dirs = [];
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  after(() => {
    for (const dir of dirs) {
      const pidFile = join(dir, 'state/pid');
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, 'utf8'));
        if (alive(pid)) process.kill(pid);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const boot = (mode, extraEnv = {}) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'android-emulator-')));
    dirs.push(base);
    const state = join(base, 'state');
    const sdk = join(base, 'sdk');
    mkdirSync(state);
    mkdirSync(join(base, 'jdk'));
    script(join(base, 'bin/java'), 'echo "openjdk version \\"21\\"" >&2');
    script(join(base, 'bin/sleep'), `echo "$*" >>"${join(state, 'sleeps')}"`);
    script(
      join(sdk, 'platform-tools/adb'),
      `case "$1 $2 $3" in
  "get-state "*) [ -e "${state}/booted" ] && echo device || exit 1 ;;
  "shell getprop sys.boot_completed") [ -e "${state}/booted" ] && echo 1 || exit 1 ;;
  "devices "*) printf 'List of devices attached\\nemulator-5554\\tdevice\\n' ;;
esac
exit 0`,
    );
    script(
      join(sdk, 'emulator/emulator'),
      `case "$1" in
  -list-avds) echo trainer-hub ;;
  -accel-check) echo 'accel: KVM (fake) is installed and usable' ;;
  *) echo $$ >"${state}/pid"
     case "$FAKE_EMULATOR" in
       exit) echo 'FATAL | x86_64 emulation currently requires hardware acceleration!'; exit 1 ;;
       hang) echo 'INFO | booting (fake)'; exec /bin/sleep 60 ;;
       boot) echo 'INFO | booted (fake)'; touch "${state}/booted"; exec /bin/sleep 60 ;;
     esac ;;
esac`,
    );
    const env = {
      PATH: `${join(base, 'bin')}:${process.env.PATH}`,
      HOME: join(base, 'home'),
      ANDROID_HOME: sdk,
      JAVA_HOME: join(base, 'jdk'),
      EMULATOR_LOG: join(base, 'emulator.log'),
      FAKE_EMULATOR: mode,
      ...extraEnv,
    };
    const result = spawnSync(join(SCRIPTS, 'android.sh'), ['emulator'], { encoding: 'utf8', env });
    const read = (file) =>
      existsSync(join(state, file)) ? readFileSync(join(state, file), 'utf8') : '';
    const sleeps = read('sleeps').split('\n').filter(Boolean);
    return { ...result, pid: Number(read('pid')), sleeps };
  };

  it('fails at once with the emulator log and the acceleration check when the emulator exits', () => {
    const result = boot('exit');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /the emulator exited while booting/);
    assert.match(result.stderr, /x86_64 emulation currently requires hardware acceleration/);
    assert.match(result.stderr, /KVM \(fake\) is installed and usable/);
    assert.match(result.stderr, /Free space for the emulator \(.*\.android\/avd\):\n.*Filesystem/);
  });

  it('gives up after EMULATOR_BOOT_TIMEOUT, shows the log and stops the emulator', () => {
    const result = boot('hang', { EMULATOR_BOOT_TIMEOUT: '4' });

    assert.equal(result.status, 1);
    assert.deepEqual(result.sleeps, ['2', '2'], 'polls every 2 s until 4 s have passed');
    assert.match(result.stderr, /the emulator didn't boot in 4s/);
    assert.match(result.stderr, /booting \(fake\)/);
    assert.ok(result.pid > 0 && !alive(result.pid), 'the emulator was stopped');
  });

  it('waits for the boot and leaves the emulator running', () => {
    const result = boot('boot');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /emulator-5554\tdevice/);
    assert.ok(alive(result.pid), 'the emulator keeps running for the next steps');
  });
});

// Maestro names each flow's report folder after the flow (its `name`, else the file name), and CI uploads those
// folders: actions/upload-artifact rejects paths with " : < > | * ? \ or line breaks. Maestro turns / into _.
describe('Maestro flows', () => {
  const flows = join(SCRIPTS, '../e2e/maestro');

  it('have names that upload-artifact accepts as paths', () => {
    const files = readdirSync(flows).filter(
      (file) => /\.ya?ml$/.test(file) && file !== 'config.yaml',
    );
    assert.ok(files.length > 0, 'no flows found');
    for (const file of files) {
      const header = readFileSync(join(flows, file), 'utf8').split(/^---$/m)[0];
      const name = header.match(/^name:\s*["']?(.*?)["']?\s*$/m)?.[1] ?? file;
      assert.doesNotMatch(name, /[":<>|*?\\\r\n]/, `${file}: flow name "${name}"`);
    }
  });
});

describe('commit-msg hook', () => {
  const hook = join(SCRIPTS, '../.githooks/commit-msg');
  const run = (message) => {
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    const file = join(dir, 'MSG');
    writeFileSync(file, `${message}\n\n# comment\n`);
    const result = spawnSync(hook, [file], { cwd: SCRIPTS, encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    return result;
  };

  it('accepts Conventional Commits and merges, rejects the rest', () => {
    assert.equal(run('feat(F031): hold a spot').status, 0);
    assert.equal(run('Merge branch main').status, 0);
    const bad = run('Hold a spot');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Conventional Commit/);
  });
});

describe('wt.sh done', () => {
  let base;
  let repo;
  let bin;

  const git = (cwd, ...args) =>
    execFileSync(
      'git',
      ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      {
        encoding: 'utf8',
      },
    ).trim();

  const fakeGh = (state, headRefOid) => {
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash\necho '${JSON.stringify([{ number: 60, state, headRefOid }])}' | jq -r "\${@: -1}"\n`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
  };
  const done = (...args) =>
    spawnSync(join(repo, 'scripts/wt.sh'), ['done', 'feature/57-hold', ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'wt-done-')));
    const origin = join(base, 'origin.git');
    repo = join(base, 'repo');
    bin = join(base, 'bin');
    mkdirSync(bin);
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin]);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'test\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: init');
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '--quiet', '-u', 'origin', 'main');
    git(
      repo,
      'worktree',
      'add',
      '--quiet',
      '-b',
      'feature/57-hold',
      join(repo, '.worktrees/feature-57-hold'),
    );
    writeFileSync(join(repo, '.worktrees/feature-57-hold/hold.txt'), 'hold\n');
    git(join(repo, '.worktrees/feature-57-hold'), 'add', '.');
    git(join(repo, '.worktrees/feature-57-hold'), 'commit', '--quiet', '-m', 'feat(F031): hold');
    git(
      join(repo, '.worktrees/feature-57-hold'),
      'push',
      '--quiet',
      '-u',
      'origin',
      'feature/57-hold',
    );
  });

  after(() => rmSync(base, { recursive: true, force: true }));

  it('refuses while the PR is not merged', () => {
    fakeGh('OPEN', git(repo, 'rev-parse', 'feature/57-hold'));
    const result = done();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PR #60 is OPEN, not merged/);
  });

  it('refuses when the local branch has commits that are not in the PR', () => {
    fakeGh('MERGED', git(repo, 'rev-parse', 'main'));
    const result = done();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /commits that are not in PR #60/);
  });

  it('accepts a local branch that is behind the PR head (GitHub updated the branch)', () => {
    const worktree = join(repo, '.worktrees/feature-57-hold');
    writeFileSync(join(worktree, 'update.txt'), 'merged main in on GitHub\n');
    git(worktree, 'add', '.');
    git(worktree, 'commit', '--quiet', '-m', 'chore: update branch');
    git(worktree, 'push', '--quiet', 'origin', 'feature/57-hold');
    const prHead = git(worktree, 'rev-parse', 'HEAD');
    git(worktree, 'reset', '--quiet', '--hard', 'HEAD~1');
    fakeGh('MERGED', prHead);
    const result = done('--check');
    assert.equal(result.status, 0, result.stderr);
    git(worktree, 'reset', '--quiet', '--hard', prHead);
  });

  it('removes the worktree and both branches once merged', () => {
    fakeGh('MERGED', git(repo, 'rev-parse', 'feature/57-hold'));
    assert.equal(done('--check').status, 0);
    assert.ok(existsSync(join(repo, '.worktrees/feature-57-hold')), '--check changes nothing');

    const result = done();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(repo, '.worktrees/feature-57-hold')));
    assert.equal(git(repo, 'branch', '--list', 'feature/57-hold'), '');
    assert.equal(git(repo, 'ls-remote', '--heads', 'origin', 'feature/57-hold'), '');
  });
});
