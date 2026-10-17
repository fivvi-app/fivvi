import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
import { basename, join } from 'node:path';
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

describe('iOS toolchain (_ios.sh)', () => {
  it('fails loudly when DEVELOPER_DIR is set but not a usable Xcode, instead of using another Xcode', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_ios.sh"; use_xcode; echo "status=$? dir=$DEVELOPER_DIR"`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, DEVELOPER_DIR: '/nonexistent/Xcode_0.0.app/Contents/Developer' },
      },
    );
    assert.match(
      result.stdout,
      /status=1 dir=\/nonexistent\/Xcode_0\.0\.app\/Contents\/Developer$/m,
    );
    assert.match(
      result.stderr,
      /DEVELOPER_DIR=\/nonexistent\/Xcode_0\.0\.app\/Contents\/Developer is not a usable Xcode/,
    );
  });
});

describe('CI path filters (scripts/native-jobs.sh, run by ci.yml)', () => {
  // The native jobs scripts/native-jobs.sh runs for the changed paths on stdin, as {ios, android}.
  const nativeJobs = (paths, args = []) => {
    const result = spawnSync(join(SCRIPTS, 'native-jobs.sh'), args, {
      input: paths.join('\n'),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return {
      ...Object.fromEntries(
        result.stdout
          .trim()
          .split('\n')
          .map((line) => line.split('=')),
      ),
      log: result.stderr,
    };
  };
  const runs = (job, path) => nativeJobs([path])[job] === 'true';

  it('E008 AC9: the iOS job runs for the app and its generated inputs, including the Swift design tokens', () => {
    for (const path of [
      'apps/ios/TrainerHub/Hello/HelloView.swift',
      'packages/contract/swift/Sources/TrainerHubAPI/Generated/Client.swift',
      'packages/i18n/generated/ios/Localizable.xcstrings',
      'packages/design-tokens/TrainerHubDesignTokens/Package.swift',
      'packages/design-tokens/TrainerHubDesignTokens/Sources/TrainerHubDesignTokens/Generated/Colors.swift',
      'scripts/test-ios.sh',
      'scripts/_ios.sh',
    ]) {
      assert.ok(runs('ios', path), path);
    }
    for (const path of [
      'docs/product/FEATURES.md',
      'packages/design-tokens/generated/web/tokens.css',
      'packages/design-tokens/kotlin/generated/nl/trainerhub/designtokens/Colors.kt',
      'packages/i18n/generated/android/values/strings.xml',
    ]) {
      assert.ok(!runs('ios', path), path);
    }
  });

  it('E008 AC9: the Android job runs for the app and its generated inputs, including the Kotlin design tokens', () => {
    for (const path of [
      'apps/android/app/src/main/kotlin/nl/trainerhub/app/MainActivity.kt',
      'packages/contract/kotlin/generated/nl/trainerhub/api/apis/HelloApi.kt',
      'packages/i18n/generated/android/values/strings.xml',
      'packages/design-tokens/kotlin/generated/nl/trainerhub/designtokens/Colors.kt',
      'e2e/maestro/hello.yaml',
      'scripts/android.sh',
      'scripts/_android.sh',
      'scripts/maestro.sh',
    ]) {
      assert.ok(runs('android', path), path);
    }
    for (const path of [
      'docs/product/FEATURES.md',
      'packages/design-tokens/generated/web/tokens.css',
      'packages/design-tokens/TrainerHubDesignTokens/Sources/TrainerHubDesignTokens/Generated/Colors.swift',
      'packages/i18n/generated/ios/Localizable.xcstrings',
    ]) {
      assert.ok(!runs('android', path), path);
    }
  });

  it('E002 #91: shared files (ci.yml, _lib.sh, this list) run neither native job on their own', () => {
    const jobs = nativeJobs([
      '.github/workflows/ci.yml',
      'scripts/_lib.sh',
      'scripts/native-jobs.sh',
    ]);
    assert.equal(jobs.ios, 'false');
    assert.equal(jobs.android, 'false');
  });

  it('E002 #91: a push to main runs neither native job; the PR ran them on the same up-to-date commit', () => {
    const jobs = nativeJobs(
      ['apps/ios/TrainerHub/App.swift', 'apps/android/app/build.gradle.kts'],
      ['--event', 'push'],
    );
    assert.equal(jobs.ios, 'false');
    assert.equal(jobs.android, 'false');
    assert.match(jobs.log, /push to main/);
  });

  it('E002 #91: workflow_dispatch and the run-native label run both native jobs, whatever changed', () => {
    for (const args of [
      ['--event', 'workflow_dispatch'],
      ['--event', 'pull_request', '--run-native'],
    ]) {
      const jobs = nativeJobs(['docs/product/FEATURES.md'], args);
      assert.equal(jobs.ios, 'true', args.join(' '));
      assert.equal(jobs.android, 'true', args.join(' '));
    }
    const pr = nativeJobs(['docs/product/FEATURES.md'], ['--event', 'pull_request']);
    assert.equal(pr.ios, 'false');
    assert.equal(pr.android, 'false');
  });

  const ci = () => readFileSync(join(SCRIPTS, '../.github/workflows/ci.yml'), 'utf8');

  it('E002 #91: the job names stay, and ci.yml has no path list of its own', () => {
    assert.match(ci(), /^ {2}workflow_dispatch:/m);
    assert.doesNotMatch(ci(), /^ +decide /m);
    assert.deepEqual(
      [...ci().matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1]),
      ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android'],
    );
  });

  // Runs the `Filter paths` step of the Detect changes job as it is in ci.yml, in a repo whose last commit changed
  // `changed`, with the event and label the workflow would pass; returns what it writes to $GITHUB_OUTPUT.
  const detectChanges = ({ event, label = false, changed = ['docs/product/FEATURES.md'] }) => {
    const lines = ci().split('\n');
    const start = lines.findIndex((line) => line.includes('name: Filter paths'));
    const run = lines.findIndex((line, i) => i > start && /^ +run: \|$/.test(line));
    const body = [];
    for (const line of lines.slice(run + 1)) {
      if (line.trim() !== '' && !line.startsWith(' '.repeat(10))) break;
      body.push(line.slice(10));
    }
    const env = (name) => ci().match(new RegExp(`^ +${name}: (.+)$`, 'm'))[1];
    assert.equal(env('EVENT'), '${{ github.event_name }}');
    assert.equal(
      env('RUN_NATIVE'),
      "${{ contains(github.event.pull_request.labels.*.name, 'run-native') }}",
    );

    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'detect-')));
    try {
      const git = (...args) =>
        execFileSync(
          'git',
          ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
          { encoding: 'utf8' },
        );
      git('init', '--quiet', '--initial-branch=main');
      cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
      for (const dir of ['apps/ios', 'apps/android'])
        mkdirSync(join(repo, dir), { recursive: true });
      writeFileSync(join(repo, 'apps/ios/.keep'), '');
      writeFileSync(join(repo, 'apps/android/.keep'), '');
      git('add', '.');
      git('commit', '--quiet', '-m', 'chore: base');
      for (const path of changed) {
        mkdirSync(join(repo, path, '..'), { recursive: true });
        writeFileSync(join(repo, path), 'changed\n');
      }
      git('add', '.');
      git('commit', '--quiet', '-m', 'chore: change');
      const output = join(repo, '..', `${basename(repo)}.out`);
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', body.join('\n')], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: repo,
          EVENT: event,
          BEFORE: '',
          RUN_NATIVE: String(label),
          GITHUB_OUTPUT: output,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      const outputs = Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.split('=')),
      );
      rmSync(output);
      return outputs;
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  };

  it('E002 #91: ci.yml passes the event and the run-native label to scripts/native-jobs.sh', () => {
    assert.deepEqual(detectChanges({ event: 'pull_request' }), { ios: 'false', android: 'false' });
    assert.deepEqual(detectChanges({ event: 'pull_request', label: true }), {
      ios: 'true',
      android: 'true',
    });
    assert.deepEqual(detectChanges({ event: 'workflow_dispatch' }), {
      ios: 'true',
      android: 'true',
    });
    assert.deepEqual(
      detectChanges({ event: 'push', changed: ['apps/ios/App.swift', 'apps/android/App.kt'] }),
      { ios: 'false', android: 'false' },
    );
    assert.deepEqual(detectChanges({ event: 'pull_request', changed: ['apps/ios/App.swift'] }), {
      ios: 'true',
      android: 'false',
    });
    assert.deepEqual(
      detectChanges({ event: 'pull_request', changed: ['.github/workflows/ci.yml'] }),
      {
        ios: 'false',
        android: 'false',
      },
    );
  });
});

describe('E002 #91 the native jobs in ci.yml', () => {
  const ci = readFileSync(join(SCRIPTS, '../.github/workflows/ci.yml'), 'utf8');
  const ios = ci.slice(ci.indexOf('\n  ios:\n'), ci.indexOf('\n  android:\n'));
  const android = ci.slice(ci.indexOf('\n  android:\n'));

  it('caches the iOS DerivedData and Swift packages by Package.resolved, Xcode version and runner OS', () => {
    assert.match(ios, /apps\/ios\/\.build\/DerivedData/);
    assert.match(ios, /apps\/ios\/\.build\/SourcePackages/);
    const key = ios.match(/^ +key: (ios-build-.+)$/m)?.[1] ?? '';
    assert.match(key, /runner\.os/);
    assert.match(key, /steps\.xcode\.outputs\.version/);
    assert.match(key, /hashFiles\('apps\/ios\/.*Package\.resolved'\)/);
    assert.match(
      ios,
      /restore-keys: \|\n +ios-build-\$\{\{ runner\.os \}\}-\$\{\{ steps\.xcode\.outputs\.version \}\}-\n/,
    );
  });

  it('runs the iOS tests through scripts/test-ios.sh and uploads the results of both locales on failure', () => {
    assert.match(ios, /run: scripts\/test-ios\.sh/);
    assert.match(ios, /if: failure\(\)[\s\S]*apps\/ios\/\.build\/TestResults-\*\.xcresult/);
  });

  it('caches the AVD with its snapshot, boots with snapshots on and stops the emulator before the cache is saved', () => {
    assert.match(android, /android\.sh avd-key/);
    assert.match(
      android,
      /path: ~\/\.android\/avd\n +key: avd-v1-\$\{\{ runner\.os \}\}-\$\{\{ steps\.avd\.outputs\.key \}\}/,
    );
    const boot = android.slice(android.indexOf('name: Boot the emulator'));
    assert.match(boot.slice(0, boot.indexOf('- name:', 10)), /AVD_SNAPSHOT: '1'/);
    const order = [
      'name: Cache the emulator',
      'name: Boot the emulator',
      'name: Stop the emulator',
    ].map((name) => android.indexOf(name));
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.ok(order.every((index) => index > 0));
    assert.match(android, /name: Stop the emulator\n +if: always\(\)/);
  });

  it('prints the step durations of both native jobs in the job summary', () => {
    for (const section of [ios, android]) {
      assert.match(section, /actions: read/);
      assert.match(
        section,
        /if: always\(\)\n +continue-on-error: true\n +env:\n +GH_TOKEN: \$\{\{ github\.token \}\}\n +run: scripts\/step-timings\.sh/,
      );
    }
  });
});

describe('iOS local Swift packages (apps/ios)', () => {
  it('E008 #57: every local package the Xcode project links has its own package identity', () => {
    // Xcode names a local package by its directory name, case-insensitively: two local packages whose
    // directories share a name (the design tokens and the API client were both `swift`) can't both link.
    const root = join(SCRIPTS, '..');
    const ios = join(root, 'apps/ios');
    const project = readFileSync(join(ios, 'TrainerHub.xcodeproj/project.pbxproj'), 'utf8');
    const packages = [
      ...project.matchAll(/isa = XCLocalSwiftPackageReference;\s*relativePath = "?([^";]+)"?;/g),
    ].map(([, dir]) => join(ios, dir));
    for (const dir of [
      'packages/contract/swift',
      'packages/design-tokens/TrainerHubDesignTokens',
    ]) {
      assert.ok(packages.includes(join(root, dir)), `the app links ${dir}`);
    }
    for (const dir of packages) {
      assert.ok(existsSync(join(dir, 'Package.swift')), `${dir} has a Package.swift`);
    }
    const identities = packages.map((dir) => basename(dir).toLowerCase());
    assert.deepEqual([...new Set(identities)], identities, `package identities: ${identities}`);
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

  const boot = (mode, extraEnv = {}, { snapshot = false } = {}) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'android-emulator-')));
    dirs.push(base);
    const state = join(base, 'state');
    const sdk = join(base, 'sdk');
    mkdirSync(state);
    mkdirSync(join(base, 'jdk'));
    script(join(base, 'bin/java'), 'echo "openjdk version \\"21\\"" >&2');
    script(join(base, 'bin/sleep'), `echo "$*" >>"${join(state, 'sleeps')}"`);
    const snapshots = join(base, 'home/.android/avd/trainer-hub.avd/snapshots/default_boot');
    if (snapshot) {
      mkdirSync(snapshots, { recursive: true });
      writeFileSync(join(snapshots, 'snapshot.pb'), '');
    }
    script(
      join(sdk, 'platform-tools/adb'),
      `echo "$*" >>"${join(state, 'adb.log')}"
case "$1 $2 $3" in
  "emu avd snapshot") mkdir -p "${snapshots}" && touch "${snapshots}/snapshot.pb" ;;
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
     echo "$*" >>"${state}/emulator.log"
     mode="$FAKE_EMULATOR"
     # FAKE_SNAPSHOT: what the emulator does when it is asked to load a snapshot.
     case " $* " in *" -snapshot "*) [ -z "$FAKE_SNAPSHOT" ] || mode="$FAKE_SNAPSHOT" ;; esac
     case "$mode" in
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
    const launches = read('emulator.log').split('\n').filter(Boolean);
    const adb = read('adb.log').split('\n').filter(Boolean);
    return {
      ...result,
      pid: Number(read('pid')),
      sleeps,
      launches,
      adb,
      snapshotSaved: existsSync(join(snapshots, 'snapshot.pb')),
    };
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

  describe('E002 #91 snapshot boot (AVD_SNAPSHOT=1, set by CI)', () => {
    const withSnapshots = { AVD_SNAPSHOT: '1' };

    it('boots cold without snapshots by default, as it does locally, and saves nothing', () => {
      const result = boot('boot', {}, { snapshot: true });

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.launches.length, 1);
      assert.match(result.launches[0], /(^| )-no-snapshot( |$)/);
      assert.doesNotMatch(result.launches[0], /-snapshot default_boot/);
      assert.deepEqual(
        result.adb.filter((call) => call.startsWith('emu')),
        [],
      );
    });

    it('boots from the cached snapshot and saves nothing', () => {
      const result = boot('boot', withSnapshots, { snapshot: true });

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.launches.length, 1);
      assert.match(
        result.launches[0],
        /^-avd trainer-hub -snapshot default_boot -no-snapshot-save /,
      );
      assert.match(result.stdout, /Emulator booted from its snapshot in \d+s/);
      assert.deepEqual(
        result.adb.filter((call) => call.startsWith('emu')),
        [],
      );
    });

    it('boots cold without a snapshot, then saves one for the cache', () => {
      const result = boot('boot', withSnapshots);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.launches.length, 1);
      assert.match(result.launches[0], /^-avd trainer-hub -no-snapshot-load -no-snapshot-save /);
      assert.match(result.stdout, /Emulator booted cold in \d+s/);
      assert.ok(result.adb.includes('emu avd snapshot save default_boot'), result.adb.join('\n'));
      assert.ok(result.snapshotSaved);
    });

    for (const [name, snapshotBehaviour, extraEnv] of [
      ['crashes the emulator', 'exit', {}],
      ['does not boot in SNAPSHOT_BOOT_TIMEOUT', 'hang', { SNAPSHOT_BOOT_TIMEOUT: '4' }],
    ]) {
      it(`falls back to a cold boot and replaces the snapshot when it ${name}`, () => {
        const result = boot(
          'boot',
          { ...withSnapshots, FAKE_SNAPSHOT: snapshotBehaviour, ...extraEnv },
          { snapshot: true },
        );

        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(result.launches.length, 2, result.launches.join('\n'));
        assert.match(result.launches[0], /-snapshot default_boot/);
        assert.match(result.launches[1], /-no-snapshot-load/);
        assert.match(result.stdout, /::warning::The emulator snapshot didn't load/);
        assert.match(result.stdout, /Emulator booted cold in \d+s/);
        assert.ok(result.adb.includes('emu avd snapshot save default_boot'));
      });
    }

    it('still fails with the emulator log when the cold boot fails too', () => {
      const result = boot('exit', withSnapshots, { snapshot: true });

      assert.equal(result.status, 1);
      assert.equal(result.launches.length, 2);
      assert.match(result.stderr, /the emulator exited while booting/);
    });
  });
});

// The cache key of CI's cached AVD (E002 #91): it changes with whatever makes a snapshot stop loading.
describe('E002 #91 android.sh avd-key', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const key = ({ emulator = '35.4.9', image = '14', missing = false } = {}) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'android-key-')));
    dirs.push(base);
    const sdk = join(base, 'sdk');
    mkdirSync(join(sdk, 'platform-tools'), { recursive: true });
    mkdirSync(join(base, 'jdk'));
    script(join(base, 'bin/java'), 'echo "openjdk version \\"21\\"" >&2');
    if (!missing) {
      mkdirSync(join(sdk, 'emulator'));
      writeFileSync(join(sdk, 'emulator/source.properties'), `Pkg.Revision=${emulator}\n`);
      for (const abi of ['x86_64', 'arm64-v8a']) {
        const dir = join(sdk, 'system-images/android-35/google_apis', abi);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'source.properties'), `Pkg.Revision=${image}\n`);
      }
    }
    return spawnSync(join(SCRIPTS, 'android.sh'), ['avd-key'], {
      encoding: 'utf8',
      env: {
        PATH: `${join(base, 'bin')}:${process.env.PATH}`,
        HOME: join(base, 'home'),
        ANDROID_HOME: sdk,
        JAVA_HOME: join(base, 'jdk'),
      },
    });
  };

  it('names the system image, its revision, the emulator revision and the settings', () => {
    const result = key();

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout.trim(),
      /^system-images-android-35-google_apis-(x86_64|arm64-v8a)-r14-emulator35\.4\.9-\d+$/,
    );
  });

  it('changes with the emulator and with the system image', () => {
    const keys = [key(), key({ emulator: '36.1.2' }), key({ image: '15' })].map((r) => r.stdout);

    assert.equal(new Set(keys).size, 3, keys.join(''));
  });

  it('fails when the emulator or the system image is not installed', () => {
    const result = key({ missing: true });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /isn't installed/);
  });
});

// A fake `xcrun simctl` that keeps each simulator as a JSON file in <state>/devices and logs its arguments.
const fakeSimctl = (state) => `[ "$1" = simctl ] || exit 1
shift
echo "$*" >>"${state}/xcrun.log"
devices="${state}/devices"
set_state() { jq --arg s "$2" '.state = $s' "$devices/$1" >"$devices/$1.partial" && mv "$devices/$1.partial" "$devices/$1"; }
case "$1" in
  list) cat "$devices"/* 2>/dev/null | jq -s 'reduce .[] as $d ({}; .[$d.runtime] += [$d | del(.runtime)]) | {devices: .}' ;;
  create) udid="SIM-$RANDOM$RANDOM"
    jq -n --arg u "$udid" --arg n "$2" --arg t "$3" --arg r "$4" \\
      '{udid: $u, name: $n, deviceTypeIdentifier: $t, runtime: $r, state: "Shutdown"}' >"$devices/$udid"
    echo "$udid" ;;
  bootstatus) set_state "$2" Booted ;;
  shutdown) set_state "$2" Shutdown ;;
  delete) rm "$devices/$2" ;;
  spawn) case "$*" in *"defaults export"*) touch "\${@: -1}" ;; esac ;;
esac
exit 0`;

const iPhone = (udid, model, runtime, state = 'Shutdown') => ({
  udid,
  name: model,
  state,
  deviceTypeIdentifier: `com.apple.CoreSimulator.SimDeviceType.${model.replaceAll(' ', '-')}`,
  runtime: `com.apple.CoreSimulator.SimRuntime.iOS-${runtime}`,
});

// The native test commands in a copy of the repo with fake toolchains: simctl above, an emulator that records its pid,
// and an xcodebuild, gradlew, adb and Maestro that log their arguments. FAKE_RESULT makes each command's last step
// pass, fail or hang (until a Ctrl-C to the whole process group, as in a terminal), so a test can check what the
// command leaves running.
describe('E008 #71 native test commands clean up after themselves', () => {
  const dirs = [];
  const pids = [];
  const running = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  after(() => {
    for (const pid of pids) if (running(pid)) process.kill(pid);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const checkout = ({ simulatorBooted = false, emulatorRunning = false } = {}) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'native-')));
    dirs.push(base);
    const repo = join(base, 'repo');
    const state = join(base, 'state');
    const bin = join(base, 'bin');
    const sdk = join(base, 'sdk');
    const home = join(base, 'home');
    const outcome = `case "$FAKE_RESULT" in
  fail) exit 1 ;;
  hang) exec perl -e 'open my $f, ">", shift; close $f; sleep 30' "${state}/running" ;;
esac`;
    mkdirSync(join(state, 'devices'), { recursive: true });
    for (const device of [
      iPhone('IPHONE-17', 'iPhone 17', '26-5'),
      iPhone('IPHONE-18', 'iPhone 18 Pro', '27-0', simulatorBooted ? 'Booted' : 'Shutdown'),
    ]) {
      writeFileSync(join(state, 'devices', device.udid), JSON.stringify(device));
    }
    if (emulatorRunning) writeFileSync(join(state, 'booted'), '');

    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    for (const path of [
      'apps/ios/lint',
      'apps/ios/Config',
      'apps/ios/TrainerHub.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
      'packages/i18n/nl-NL.json',
      'packages/i18n/en.json',
    ]) {
      cpSync(join(SCRIPTS, '..', path), join(repo, path), { recursive: true });
    }
    // The web server maestro.sh starts: it runs until it's stopped.
    mkdirSync(join(repo, 'apps/web/.next/standalone/apps/web'), { recursive: true });
    writeFileSync(
      join(repo, 'apps/web/.next/standalone/apps/web/server.js'),
      'setInterval(() => {}, 1000);\n',
    );
    mkdirSync(join(repo, 'packages/database'));
    writeFileSync(join(repo, 'packages/database/.env'), '');
    const swiftlint = readFileSync(join(SCRIPTS, '_ios.sh'), 'utf8').match(
      /^SWIFTLINT_VERSION=(\S+)/m,
    )[1];
    // SwiftLint flags exactly the fixture lines marked `// expect: <rule>`, as the real rules must.
    script(
      join(repo, `apps/ios/.build/swiftlint-${swiftlint}/swiftlint`),
      `for arg; do case "$arg" in *.swift)
  grep -n '// expect: [a-z_]*$' "$arg" | while IFS=: read -r line text; do echo "$arg:$line:1: error: (\${text##*expect: })"; done
  exit 2 ;; esac; done`,
    );
    script(
      join(repo, 'apps/android/gradlew'),
      `echo "$*" >>"${state}/gradle.log"
case "$*" in *connectedDebugAndroidTest*) ${outcome} ;; esac`,
    );
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', [
      '-C',
      repo,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'chore: init',
    ]);

    script(join(bin, 'xcrun'), fakeSimctl(state));
    // build-for-testing leaves the .xctestrun file that test-without-building runs; FAKE_BUILD=fail makes it fail.
    script(
      join(bin, 'xcodebuild'),
      `echo "$*" >>"${state}/xcodebuild.log"
case "$*" in
  *-showBuildSettings*) printf '    TRAINER_HUB_API_BASE_URL = https://example.test/api\\n    INFOPLIST_FILE = Info.plist\\n    TRAINER_HUB_SENTRY_DSN = https://public@o0.ingest.de.sentry.io/1\\n    TRAINER_HUB_SENTRY_ENVIRONMENT = production\\n' ;;
  build-for-testing\\ *) [ "$FAKE_BUILD" != fail ] || { echo 'error: build failed (fake)'; exit 1; }
    mkdir -p .build/DerivedData/Build/Products && touch .build/DerivedData/Build/Products/TrainerHub.xctestrun
    printf 'Build Timing Summary\\n\\nSwiftCompile (1 task) | 1.000 seconds\\n\\n** TEST BUILD SUCCEEDED **\\n' ;;
  test-without-building\\ *) ${outcome} ;;
esac
exit 0`,
    );
    script(join(bin, 'plutil'), 'exit 1');
    script(join(bin, 'java'), 'echo "openjdk version \\"21\\"" >&2');
    for (const tool of ['sleep', 'docker', 'pnpm']) script(join(bin, tool), 'exit 0');
    // calls.log has the curl, adb and Maestro calls in the order they ran. FAKE_HELLO=fail: GET /api/v1/hello fails.
    script(
      join(bin, 'curl'),
      `echo "curl $*" >>"${state}/calls.log"
case "$*" in *"/api/v1/hello"*) [ "$FAKE_HELLO" != fail ] || exit 22 ;; esac
exit 0`,
    );
    script(
      join(home, '.maestro/bin/maestro'),
      `echo "$*" >>"${state}/maestro.log"
echo "maestro $*" >>"${state}/calls.log"
case " $* " in *" test "*) ${outcome} ;; esac`,
    );
    script(
      join(sdk, 'platform-tools/adb'),
      `echo "$*" >>"${state}/adb.log"
echo "adb $*" >>"${state}/calls.log"
case "$*" in
  get-state) [ -e "${state}/booted" ] && echo device || exit 1 ;;
  "shell getprop sys.boot_completed") [ -e "${state}/booted" ] && echo 1 || exit 1 ;;
  "shell getprop persist.sys.locale") echo en-US ;;
  "shell settings get global hide_error_dialogs") echo null ;;
  "emu kill") kill "$(cat "${state}/pid")"; rm -f "${state}/booted" ;;
esac
exit 0`,
    );
    script(
      join(sdk, 'emulator/emulator'),
      `case "$1" in
  -list-avds) echo trainer-hub ;;
  -accel-check) ;;
  *) echo $$ >"${state}/pid"; touch "${state}/booted"; exec /bin/sleep 60 ;;
esac`,
    );
    mkdirSync(join(base, 'jdk'));

    const run = (command, args, extraEnv = {}, { cwd = repo, interrupt = false } = {}) =>
      new Promise((resolve) => {
        const child = spawn(join(cwd, command), args, {
          cwd,
          detached: true,
          env: {
            PATH: `${bin}:${process.env.PATH}`,
            HOME: home,
            ANDROID_HOME: sdk,
            JAVA_HOME: join(base, 'jdk'),
            EMULATOR_LOG: join(base, 'emulator.log'),
            E2E_PORT: '3999',
            ...extraEnv,
          },
        });
        let output = '';
        child.stdout.on('data', (data) => {
          output += data;
        });
        child.stderr.on('data', (data) => {
          output += data;
        });
        const ctrlC = setInterval(() => {
          if (interrupt && existsSync(join(state, 'running'))) {
            clearInterval(ctrlC);
            process.kill(-child.pid, 'SIGINT');
          }
        }, 50);
        child.on('close', (status) => {
          clearInterval(ctrlC);
          rmSync(join(state, 'running'), { force: true });
          if (existsSync(join(state, 'pid'))) pids.push(Number(readFileSync(join(state, 'pid'))));
          resolve({ status, output });
        });
      });
    const log = (name) =>
      existsSync(join(state, `${name}.log`))
        ? readFileSync(join(state, `${name}.log`), 'utf8')
            .split('\n')
            .filter(Boolean)
        : [];
    const simulators = () =>
      readdirSync(join(state, 'devices')).map((udid) =>
        JSON.parse(readFileSync(join(state, 'devices', udid), 'utf8')),
      );
    const simulator = (udid) => simulators().find((device) => device.udid === udid);
    const emulator = () => ({
      booted: existsSync(join(state, 'booted')),
      pid: existsSync(join(state, 'pid')) ? Number(readFileSync(join(state, 'pid'))) : 0,
    });
    const worktree = (branch) => {
      const path = join(repo, '.worktrees', branch.replace('/', '-'));
      execFileSync('git', ['-C', repo, 'worktree', 'add', '--quiet', '-b', branch, path]);
      return path;
    };
    return { repo, run, log, simulators, simulator, emulator, worktree };
  };

  const endings = [
    ['passes', 'pass', 0],
    ['fails', 'fail', 1],
    ['is interrupted (Ctrl-C)', 'hang', 130],
  ];
  const testedOn = (xcodebuildOrMaestro) =>
    xcodebuildOrMaestro
      .find((line) => / test(-without-building)? /.test(` ${line} `))
      ?.match(/(?:id=|--device )(\S+)/)?.[1];

  for (const [name, command, args, testLog] of [
    ['pnpm test:ios', 'scripts/test-ios.sh', [], 'xcodebuild'],
    ['maestro.sh ios', 'scripts/maestro.sh', ['ios'], 'maestro'],
  ]) {
    for (const [ending, result, status] of endings) {
      it(`AC1: ${name} shuts down the simulator it booted when it ${ending}`, async () => {
        const fake = checkout();

        const run = await fake.run(
          command,
          args,
          { FAKE_RESULT: result },
          {
            interrupt: result === 'hang',
          },
        );

        assert.equal(run.status, status, run.output);
        assert.equal(
          testedOn(fake.log(testLog)),
          'IPHONE-18',
          'the main checkout uses the newest iPhone',
        );
        assert.equal(fake.simulator('IPHONE-18').state, 'Shutdown');
      });
    }

    it(`AC1: ${name} leaves a simulator that was already booted running`, async () => {
      const fake = checkout({ simulatorBooted: true });

      const run = await fake.run(command, args);

      assert.equal(run.status, 0, run.output);
      assert.equal(fake.simulator('IPHONE-18').state, 'Booted');
    });
  }

  it('AC4: KEEP_DEVICE=1 leaves the simulator pnpm test:ios booted running', async () => {
    const fake = checkout();

    const run = await fake.run('scripts/test-ios.sh', [], { KEEP_DEVICE: '1' });

    assert.equal(run.status, 0, run.output);
    assert.equal(fake.simulator('IPHONE-18').state, 'Booted');
  });

  describe('E002 #91 pnpm test:ios builds once and tests nl and en without building', () => {
    const configs = (fake) =>
      fake
        .log('xcodebuild')
        .filter((line) => line.startsWith('test-without-building '))
        .map((line) => line.match(/-only-test-configuration (\S+)/)?.[1]);
    const commands = (fake) =>
      fake
        .log('xcodebuild')
        .map((line) => line.split(' ')[0])
        .filter((command) => !command.startsWith('-'));

    it('runs build-for-testing once, then nl and en one after the other on one simulator', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh');

      assert.equal(run.status, 0, run.output);
      assert.deepEqual(commands(fake), [
        'build-for-testing',
        'test-without-building',
        'test-without-building',
      ]);
      assert.deepEqual(configs(fake), ['nl', 'en']);
      const [build] = fake
        .log('xcodebuild')
        .filter((line) => line.startsWith('build-for-testing '));
      assert.match(build, /-showBuildTimingSummary/);
      assert.match(build, /-derivedDataPath \.build\/DerivedData/);
      assert.equal(fake.simulators().length, 2, 'no second simulator');
      assert.match(run.output, /Build Timing Summary/);
    });

    it('keeps a result bundle per locale and prints the steps with their durations', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh');

      const bundles = fake
        .log('xcodebuild')
        .filter((line) => line.startsWith('test-without-building '))
        .map((line) => line.match(/-resultBundlePath (\S+)/)?.[1]);
      assert.deepEqual(bundles, [
        '.build/TestResults-nl.xcresult',
        '.build/TestResults-en.xcresult',
      ]);
      assert.match(run.output, /Step durations:\n( +\d+ s {2}.+\n)+ +\d+ s {2}Total/);
      assert.match(run.output, /\d+ s {2}Build for testing/);
      assert.match(run.output, /\d+ s {2}Unit and UI tests in nl and en/);
    });

    it('writes the step durations and the build timing to the job summary on GitHub Actions', async () => {
      const fake = checkout();
      const summary = join(fake.repo, '..', 'summary.md');

      const run = await fake.run('scripts/test-ios.sh', [], { GITHUB_STEP_SUMMARY: summary });

      assert.equal(run.status, 0, run.output);
      const written = readFileSync(summary, 'utf8');
      assert.match(written, /### iOS build timing/);
      assert.match(written, /SwiftCompile \(1 task\)/);
      assert.match(
        written,
        /### iOS steps\n\n\| Step \| Duration \|\n\|---\|--:\|\n\| SwiftLint \| \d+ s \|/,
      );
      assert.match(written, /\| \*\*Total\*\* \| \*\*\d+ s\*\* \|/);
    });

    it('does not test when the build fails, and still shuts the simulator down', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh', [], { FAKE_BUILD: 'fail' });

      assert.equal(run.status, 1, run.output);
      assert.match(run.output, /error: build failed \(fake\)/);
      assert.deepEqual(configs(fake), []);
      assert.equal(fake.simulator('IPHONE-18').state, 'Shutdown');
    });

    it('runs the second locale when the first fails, and fails', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh', [], { FAKE_RESULT: 'fail' });

      assert.equal(run.status, 1, run.output);
      assert.deepEqual(configs(fake), ['nl', 'en']);
    });

    for (const [name, env] of [
      ['IOS_PARALLEL=1', { IOS_PARALLEL: '1' }],
      ['CI', { CI: 'true' }],
    ]) {
      it(`${name}: tests nl and en at the same time on two simulators, and deletes the second`, async () => {
        const fake = checkout();

        const run = await fake.run('scripts/test-ios.sh', [], env);

        assert.equal(run.status, 0, run.output);
        const tests = fake
          .log('xcodebuild')
          .filter((line) => line.startsWith('test-without-building '));
        assert.deepEqual(configs(fake).sort(), ['en', 'nl']);
        assert.ok(tests.some((line) => testedOn([line]) === 'IPHONE-18'));
        assert.notEqual(testedOn([tests[0]]), testedOn([tests[1]]), 'one simulator each');
        assert.equal(fake.simulators().length, 2, 'the second simulator is deleted');
        assert.equal(fake.simulator('IPHONE-18').state, 'Shutdown');
        assert.match(run.output, /::group::Tests in nl/);
      });
    }

    it('IOS_PARALLEL=0 keeps CI on one simulator', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh', [], { CI: 'true', IOS_PARALLEL: '0' });

      assert.equal(run.status, 0, run.output);
      assert.equal(fake.simulators().length, 2);
      assert.deepEqual(configs(fake), ['nl', 'en']);
    });

    it('fails when one locale fails in parallel, with both outputs shown', async () => {
      const fake = checkout();

      const run = await fake.run('scripts/test-ios.sh', [], {
        IOS_PARALLEL: '1',
        FAKE_RESULT: 'fail',
      });

      assert.equal(run.status, 1, run.output);
      assert.equal(configs(fake).length, 2);
      assert.equal(fake.simulators().length, 2, 'the second simulator is deleted');
    });
  });

  it('AC3: pnpm test:ios runs a worktree on its own simulator, named after it and created on first use', async () => {
    const fake = checkout();
    const worktree = fake.worktree('feature/9-own-simulator');
    const own = () =>
      fake.simulators().filter((device) => device.name === 'Trainer Hub feature-9-own-simulator');

    const first = await fake.run('scripts/test-ios.sh', [], {}, { cwd: worktree });
    const second = await fake.run('scripts/test-ios.sh', [], {}, { cwd: worktree });

    assert.equal(first.status, 0, first.output);
    assert.equal(second.status, 0, second.output);
    assert.equal(own().length, 1, 'created once, then reused');
    const [simulator] = own();
    assert.deepEqual(
      [simulator.deviceTypeIdentifier, simulator.runtime],
      [fake.simulator('IPHONE-18').deviceTypeIdentifier, fake.simulator('IPHONE-18').runtime],
      'a copy of the newest iPhone',
    );
    const destinations = fake
      .log('xcodebuild')
      .filter((line) => line.startsWith('test-without-building '));
    assert.deepEqual(
      destinations.map((line) => testedOn([line])),
      Array(4).fill(simulator.udid),
      'nl and en, on each of the two runs',
    );
    assert.equal(simulator.state, 'Shutdown');
    assert.ok(
      fake.log('xcrun').every((line) => !line.includes('IPHONE-18')),
      'the shared simulator is never touched',
    );
  });

  it('AC3: IOS_SIMULATOR overrides the worktree simulator', async () => {
    const fake = checkout();
    const worktree = fake.worktree('feature/9-own-simulator');

    const run = await fake.run(
      'scripts/test-ios.sh',
      [],
      { IOS_SIMULATOR: 'iPhone 17' },
      { cwd: worktree },
    );

    assert.equal(run.status, 0, run.output);
    assert.equal(testedOn(fake.log('xcodebuild')), 'IPHONE-17');
    assert.equal(fake.simulators().length, 2, 'no simulator created');
    assert.equal(fake.simulator('IPHONE-17').state, 'Shutdown');
  });

  const gradleDaemonsStopped = (fake) => {
    const calls = fake.log('gradle');
    const registry = calls[0]?.match(/-Dorg\.gradle\.daemon\.registry\.base=(\S+)/)?.[1] ?? '';
    assert.ok(
      registry.startsWith(`${fake.repo}/`),
      `the daemons have a registry of their own, in this checkout: ${calls[0]}`,
    );
    assert.ok(
      calls.every((call) => call.includes(`-Dorg.gradle.daemon.registry.base=${registry} `)),
      calls.join('\n'),
    );
    assert.match(calls.at(-1), /(^| )--stop( |$)/, 'the daemons are stopped last');
  };

  for (const [name, command, args] of [
    ['pnpm test:android', 'scripts/android.sh', ['test']],
    ['pnpm test:maestro', 'scripts/maestro.sh', ['android']],
  ]) {
    for (const [ending, result, status] of endings) {
      it(`AC2: ${name} kills the emulator it started and stops its Gradle daemons when it ${ending}`, async () => {
        const fake = checkout();

        const run = await fake.run(
          command,
          args,
          { FAKE_RESULT: result },
          {
            interrupt: result === 'hang',
          },
        );

        assert.equal(run.status, status, run.output);
        const { pid, booted } = fake.emulator();
        assert.ok(pid > 0, 'the emulator was started');
        assert.ok(fake.log('adb').includes('emu kill'));
        assert.ok(!booted && !running(pid), 'the emulator is gone');
        gradleDaemonsStopped(fake);
      });
    }

    it(`AC2: ${name} leaves an emulator that was already running, and still stops its Gradle daemons`, async () => {
      const fake = checkout({ emulatorRunning: true });

      const run = await fake.run(command, args);

      assert.equal(run.status, 0, run.output);
      assert.ok(!fake.log('adb').includes('emu kill'));
      assert.ok(fake.emulator().booted);
      gradleDaemonsStopped(fake);
    });
  }

  it('AC4: KEEP_DEVICE=1 leaves the emulator and the Gradle daemons pnpm test:android started running', async () => {
    const fake = checkout();

    const run = await fake.run('scripts/android.sh', ['test'], { KEEP_DEVICE: '1' });

    assert.equal(run.status, 0, run.output);
    assert.ok(!fake.log('adb').includes('emu kill'));
    assert.ok(running(fake.emulator().pid));
    assert.ok(fake.log('gradle').every((call) => !/(^| )--stop( |$)/.test(call)));
  });

  // #89: the first locale's flow didn't see the greeting within its 20 s. The app's first screen calls
  // GET /api/v1/hello?locale=<its language>, and the flow started while Android was still busy after the framework
  // restart that sets the device language (System UI stopped responding and its dialog covered the app).
  const isFlow = (call) => / test /.test(` ${call} `) && call.startsWith('maestro ');
  const hello = (locale) => `http://127.0.0.1:3999/api/v1/hello?locale=${locale}`;

  for (const [name, args] of [
    ['maestro.sh android', ['android']],
    ['maestro.sh ios', ['ios']],
  ]) {
    it(`#89: ${name} warms up GET /api/v1/hello in nl-NL and en before the first flow`, async () => {
      const fake = checkout();

      const run = await fake.run('scripts/maestro.sh', args);

      assert.equal(run.status, 0, run.output);
      const calls = fake.log('calls');
      const firstFlow = calls.findIndex(isFlow);
      const health = calls.findIndex((call) => call.includes('/api/v1/health'));
      assert.ok(firstFlow > 0, calls.join('\n'));
      for (const locale of ['nl-NL', 'en']) {
        const warmUp = calls.findIndex(
          (call) => call.startsWith('curl ') && call.includes(` ${hello(locale)}`),
        );
        assert.ok(
          health < warmUp && warmUp < firstFlow,
          `GET ${hello(locale)} after the health check, before the first flow:\n${calls.join('\n')}`,
        );
      }
    });

    it(`#89: ${name} runs no flow when GET /api/v1/hello fails`, async () => {
      const fake = checkout({ emulatorRunning: true, simulatorBooted: true });

      const run = await fake.run('scripts/maestro.sh', args, { FAKE_HELLO: 'fail' });

      assert.equal(run.status, 1, run.output);
      assert.match(run.output, /\/api\/v1\/hello\?locale=nl-NL/);
      assert.ok(!fake.log('calls').some(isFlow), fake.log('calls').join('\n'));
    });
  }

  it('#89: maestro.sh android waits for Android to deliver its broadcasts after each language change, before the flow', async () => {
    const fake = checkout();

    const run = await fake.run('scripts/maestro.sh', ['android']);

    assert.equal(run.status, 0, run.output);
    const steps = fake
      .log('calls')
      .map((call) => {
        if (isFlow(call)) return `flow ${call.match(/android-(\S+)\.xml/)[1]}`;
        if (/setprop persist\.sys\.locale \S+;/.test(call))
          return `language ${call.match(/persist\.sys\.locale ([^;]+);/)[1]}`;
        if (call === 'adb shell am wait-for-broadcast-idle') return 'settled';
        return '';
      })
      .filter(Boolean);
    assert.deepEqual(steps, [
      'language nl-NL',
      'settled',
      'flow nl-NL',
      'language en',
      'settled',
      'flow en',
    ]);
  });

  it("#89: maestro.sh android hides Android's error dialogs for the flows, then restores the setting", async () => {
    const fake = checkout({ emulatorRunning: true });

    const run = await fake.run('scripts/maestro.sh', ['android']);

    assert.equal(run.status, 0, run.output);
    const calls = fake.log('calls');
    const hidden = calls.indexOf('adb shell settings put global hide_error_dialogs 1');
    const restored = calls.lastIndexOf('adb shell settings delete global hide_error_dialogs');
    const firstLanguage = calls.findIndex((call) =>
      call.includes('setprop persist.sys.locale nl-NL;'),
    );
    const ownLanguage = calls.findIndex((call) =>
      call.includes('setprop persist.sys.locale en-US;'),
    );
    assert.ok(
      hidden >= 0 && hidden < firstLanguage,
      `hidden before the first flow and its framework restart:\n${calls.join('\n')}`,
    );
    assert.ok(
      ownLanguage > calls.findLastIndex(isFlow) && restored > ownLanguage,
      `the setting the device had (none) is back, after its language's framework restart:\n${calls.join('\n')}`,
    );
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

  // #89: the flake is fixed in maestro.sh, not by waiting longer or asserting less: the hello flow still fails when the
  // greeting doesn't appear within 20 s, and then checks its text.
  it('#89: hello waits at most 20 s for the greeting and requires it', () => {
    const steps = readFileSync(join(flows, 'hello.yaml'), 'utf8').split(/^---$/m)[1];
    assert.doesNotMatch(steps, /optional:\s*true/);
    const wait = steps.match(
      /- extendedWaitUntil:\n\s+visible:\n\s+id: hello\\\.greeting\n\s+timeout: (\d+)\n/,
    );
    assert.ok(wait, steps);
    assert.ok(Number(wait[1]) <= 20000, `timeout ${wait[1]} ms`);
    assert.match(
      steps.slice(wait.index),
      /- assertVisible:\n\s+id: hello\\\.greeting\n\s+text: \$\{HELLO_TITLE\}\n/,
    );
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
    // The worktree's own simulator (pnpm test:ios), booted, next to the shared one.
    mkdirSync(join(base, 'state/devices'), { recursive: true });
    for (const device of [
      iPhone('OWN', 'Trainer Hub feature-57-hold', '27-0', 'Booted'),
      iPhone('SHARED', 'iPhone 18 Pro', '27-0', 'Booted'),
    ]) {
      writeFileSync(join(base, 'state/devices', device.udid), JSON.stringify(device));
    }
    writeFileSync(join(bin, 'xcrun'), `#!/usr/bin/env bash\n${fakeSimctl(join(base, 'state'))}\n`);
    writeFileSync(join(bin, 'xcodebuild'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(bin, 'xcrun'), 0o755);
    chmodSync(join(bin, 'xcodebuild'), 0o755);
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

  it('removes the worktree, both branches and the worktree simulator once merged (E008 #71 AC3)', () => {
    const simulators = () => readdirSync(join(base, 'state/devices')).sort();
    fakeGh('MERGED', git(repo, 'rev-parse', 'feature/57-hold'));
    assert.equal(done('--check').status, 0);
    assert.ok(existsSync(join(repo, '.worktrees/feature-57-hold')), '--check changes nothing');
    assert.deepEqual(simulators(), ['OWN', 'SHARED'], '--check changes nothing');

    const result = done();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(repo, '.worktrees/feature-57-hold')));
    assert.equal(git(repo, 'branch', '--list', 'feature/57-hold'), '');
    assert.equal(git(repo, 'ls-remote', '--heads', 'origin', 'feature/57-hold'), '');
    assert.deepEqual(simulators(), ['SHARED']);
    assert.match(result.stdout, /deleted simulator 'Trainer Hub feature-57-hold'/);
  });
});
