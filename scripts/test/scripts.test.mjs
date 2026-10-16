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

describe('CI path filters (ci.yml)', () => {
  // A `decide <output>` filter of the "Detect changes" job, as the ERE that grep -E runs.
  const pathFilter = (output) => {
    const ci = readFileSync(join(SCRIPTS, '../.github/workflows/ci.yml'), 'utf8');
    const filter = ci.match(new RegExp(`^ +decide ${output} apps/${output} '([^']+)'$`, 'm'))?.[1];
    assert.ok(filter, `ci.yml has no \`decide ${output}\` filter`);
    return new RegExp(filter);
  };

  it('E008 AC9: the iOS job runs for the app and its generated inputs, including the Swift design tokens', () => {
    const ios = pathFilter('ios');
    for (const path of [
      'apps/ios/TrainerHub/Hello/HelloView.swift',
      'packages/contract/swift/Sources/TrainerHubAPI/Generated/Client.swift',
      'packages/i18n/generated/ios/Localizable.xcstrings',
      'packages/design-tokens/TrainerHubDesignTokens/Package.swift',
      'packages/design-tokens/TrainerHubDesignTokens/Sources/TrainerHubDesignTokens/Generated/Colors.swift',
      'scripts/test-ios.sh',
      '.github/workflows/ci.yml',
    ]) {
      assert.match(path, ios, path);
    }
    for (const path of [
      'docs/product/FEATURES.md',
      'packages/design-tokens/generated/web/tokens.css',
      'packages/design-tokens/kotlin/generated/nl/trainerhub/designtokens/Colors.kt',
      'packages/i18n/generated/android/values/strings.xml',
    ]) {
      assert.doesNotMatch(path, ios, path);
    }
  });

  it('E008 AC9: the Android job runs for the app and its generated inputs, including the Kotlin design tokens', () => {
    const android = pathFilter('android');
    for (const path of [
      'apps/android/app/src/main/kotlin/nl/trainerhub/app/MainActivity.kt',
      'packages/contract/kotlin/generated/nl/trainerhub/api/apis/HelloApi.kt',
      'packages/i18n/generated/android/values/strings.xml',
      'packages/design-tokens/kotlin/generated/nl/trainerhub/designtokens/Colors.kt',
      'e2e/maestro/hello.yaml',
      'scripts/android.sh',
      '.github/workflows/ci.yml',
    ]) {
      assert.match(path, android, path);
    }
    for (const path of [
      'docs/product/FEATURES.md',
      'packages/design-tokens/generated/web/tokens.css',
      'packages/design-tokens/TrainerHubDesignTokens/Sources/TrainerHubDesignTokens/Generated/Colors.swift',
      'packages/i18n/generated/ios/Localizable.xcstrings',
    ]) {
      assert.doesNotMatch(path, android, path);
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
    // Like the real one, `xcodebuild test` boots its destination simulator when it isn't booted.
    script(
      join(bin, 'xcodebuild'),
      `echo "$*" >>"${state}/xcodebuild.log"
case "$*" in
  *-showBuildSettings*) printf '    TRAINER_HUB_API_BASE_URL = https://example.test/api\\n    INFOPLIST_FILE = Info.plist\\n    TRAINER_HUB_SENTRY_DSN = https://public@o0.ingest.de.sentry.io/1\\n    TRAINER_HUB_SENTRY_ENVIRONMENT = production\\n' ;;
  test\\ *) for arg; do case "$arg" in id=*) xcrun simctl bootstatus "\${arg#id=}" -b ;; esac; done
    ${outcome} ;;
esac
exit 0`,
    );
    script(join(bin, 'plutil'), 'exit 1');
    script(join(bin, 'java'), 'echo "openjdk version \\"21\\"" >&2');
    for (const tool of ['sleep', 'docker', 'pnpm', 'curl']) script(join(bin, tool), 'exit 0');
    script(
      join(home, '.maestro/bin/maestro'),
      `echo "$*" >>"${state}/maestro.log"
case " $* " in *" test "*) ${outcome} ;; esac`,
    );
    script(
      join(sdk, 'platform-tools/adb'),
      `echo "$*" >>"${state}/adb.log"
case "$*" in
  get-state) [ -e "${state}/booted" ] && echo device || exit 1 ;;
  "shell getprop sys.boot_completed") [ -e "${state}/booted" ] && echo 1 || exit 1 ;;
  "shell getprop persist.sys.locale") echo en-US ;;
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
      .find((line) => / test /.test(` ${line} `))
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
    const destinations = fake.log('xcodebuild').filter((line) => line.startsWith('test '));
    assert.deepEqual(
      destinations.map((line) => testedOn([line])),
      [simulator.udid, simulator.udid],
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
