// E017 #190: the release lane's scripts (scripts/release.sh, scripts/release-ios.sh) and the shape of
// .github/workflows/release.yml, run against fake commands (pnpm, security, plutil, xcodebuild, sentry-cli) that log their
// calls. Every secret is an obviously fake sentinel the tests can look for where it must never appear (docs/engineering/
// TESTING.md; scripts/secrets-in-tests.mjs). The lane itself is proven by a real run the owner approves (the AC9 ticket).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { readRecorder, UNCOVERED_MESSAGE, uncovered } from './turbo-inputs.mjs';

const ROOT = join(import.meta.dirname, '../..');
const RELEASE = join(ROOT, 'scripts/release.sh');
// The iOS files these tests read: turbo caches `//#test:root` by its `inputs`, so each must be one of them (#594).
const { reads: iosReads, note: noteRead } = readRecorder('apps/ios/');
// The Android files these tests read: the same rule, for the properties file of the release address.
const { reads: androidReads, note: noteAndroid } = readRecorder('apps/android/');

const base = mkdtempSync(join(tmpdir(), 'release-test-'));
after(() => rmSync(base, { recursive: true, force: true }));

let work;
let bin;
let log;
let counter = 0;
beforeEach(() => {
  work = join(base, `case-${counter++}`);
  bin = join(work, 'bin');
  log = join(work, 'calls.log');
  mkdirSync(bin, { recursive: true });
  writeFileSync(log, '');
});

/** Puts a fake command on the PATH: it logs `name args` and then runs `body` (bash). */
const fake = (name, body = '') => {
  const path = join(bin, name);
  writeFileSync(path, `#!/usr/bin/env bash\nprintf '%s\\n' "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(path, 0o755);
};
const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);

const run = (script, args, env = {}) =>
  spawnSync(script, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: work, ...env },
  });

const DISPATCH_ON_MAIN = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_NUMBER: '7',
  GITHUB_RUN_ATTEMPT: '1',
};

describe('E017 AC3: the guard', () => {
  it('E017 AC3: a run outside main is refused', () => {
    for (const ref of [
      'refs/heads/feature/190-release',
      'refs/heads/main-2',
      'refs/heads/release/main',
      'refs/tags/main',
      'refs/pull/239/merge',
      '',
    ]) {
      const result = run(RELEASE, ['guard'], { ...DISPATCH_ON_MAIN, GITHUB_REF: ref });
      assert.notEqual(result.status, 0, `ref '${ref}' was accepted`);
      assert.match(result.stderr, /main/);
    }
    const onMain = run(RELEASE, ['guard'], DISPATCH_ON_MAIN);
    assert.equal(onMain.status, 0, onMain.stderr);
  });

  it('E017 AC3: only a hand-started run (workflow_dispatch) passes', () => {
    for (const event of ['push', 'pull_request', 'pull_request_target', 'schedule', '']) {
      const result = run(RELEASE, ['guard'], { ...DISPATCH_ON_MAIN, GITHUB_EVENT_NAME: event });
      assert.notEqual(result.status, 0, `event '${event}' was accepted`);
    }
  });
});

describe('E017 AC4: the build number', () => {
  const buildNumber = (env) => run(RELEASE, ['build-number'], { ...DISPATCH_ON_MAIN, ...env });

  it('E017 AC4: build number is run number plus offset, never lower than a previous run', () => {
    const offset = Number(buildNumber({ GITHUB_RUN_NUMBER: '1' }).stdout.trim()) - 1;
    assert.ok(offset > 0, 'a fixed offset above zero (builds uploaded by hand come first)');
    let previous = offset;
    for (const runNumber of [1, 2, 3, 9, 10, 11, 99, 100, 1234]) {
      const result = buildNumber({ GITHUB_RUN_NUMBER: String(runNumber) });
      assert.equal(result.status, 0, result.stderr);
      const number = Number(result.stdout.trim());
      assert.equal(number, runNumber + offset, `run ${runNumber}`);
      assert.ok(number > previous, `run ${runNumber} is higher than the run before`);
      previous = number;
    }
  });

  it('E017 AC4: a re-run is refused, because it would reuse the number of its first attempt', () => {
    const rerun = buildNumber({ GITHUB_RUN_ATTEMPT: '2' });
    assert.notEqual(rerun.status, 0);
    assert.equal(rerun.stdout, '', 'no number is printed');
    assert.match(rerun.stderr, /new run/i);
    // The guard refuses it too, as the first step of a re-run of the failed jobs only.
    assert.notEqual(
      run(RELEASE, ['guard'], { ...DISPATCH_ON_MAIN, GITHUB_RUN_ATTEMPT: '2' }).status,
      0,
    );
  });

  it('E017 AC4: a missing or non-numeric run number is an error, not a number', () => {
    for (const runNumber of ['', 'abc', '-3', '1.5', '007']) {
      const result = buildNumber({ GITHUB_RUN_NUMBER: runNumber });
      assert.notEqual(result.status, 0, `run number '${runNumber}'`);
      assert.equal(result.stdout, '');
    }
  });

  it('E017 AC4: the same run always gets the same number: it comes from the run, nothing else', () => {
    const first = buildNumber({}).stdout;
    const second = buildNumber({}).stdout;
    assert.equal(first, second);
    assert.notEqual(first, '');
  });
});

describe('E017 AC3: the native suites run first, in both locales', () => {
  it('E017 AC3: no upload when a native suite fails', () => {
    // The iOS build fails: the gate fails and names the suite; nothing else ran, not even the tests.
    fake('pnpm', 'exit 1');
    fake('xcodebuild');
    fake('security');
    fake('sentry-cli');
    const result = run(RELEASE, ['tests', 'ios', 'nl', '1'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test:ios build/);
    assert.deepEqual(calls(), ['pnpm test:ios build']);
  });

  it("E017 AC3 #1403: one part of one locale: the build, then that part's tests, and passes when both pass", () => {
    fake('pnpm');
    for (const locale of ['nl', 'en']) {
      for (const part of ['1', '2']) {
        writeFileSync(log, '');
        const result = run(RELEASE, ['tests', 'ios', locale, part], DISPATCH_ON_MAIN);
        assert.equal(result.status, 0, result.stderr);
        // The two steps of CI's `iOS build` and `iOS tests (<locale> <part>/2)`, in one job: no other locale or part, no
        // all-in-one run. Only the release retries a failed UI test, once (#1433); CI's own calls stay without the flag.
        assert.deepEqual(calls(), [
          'pnpm test:ios build',
          `pnpm test:ios test ${locale} --shard ${part}/2 --retry-failed`,
        ]);
      }
    }
  });

  it('E017 AC3: the tests of the locale do not start after a failed build, and a failed test run fails the suite', () => {
    fake('pnpm', '[ "$2" != build ] || exit 1');
    assert.notEqual(run(RELEASE, ['tests', 'ios', 'en', '2'], DISPATCH_ON_MAIN).status, 0);
    assert.deepEqual(calls(), ['pnpm test:ios build']);

    writeFileSync(log, '');
    fake('pnpm', '[ "$2" != test ] || exit 1');
    const result = run(RELEASE, ['tests', 'ios', 'en', '2'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test:ios test en/);
    assert.deepEqual(calls(), [
      'pnpm test:ios build',
      'pnpm test:ios test en --shard 2/2 --retry-failed',
    ]);
  });

  it('E017 AC3 #1403: iOS needs a locale of nl or en and a part of 1 or 2: anything else is an error that runs nothing', () => {
    fake('pnpm');
    for (const args of [
      [],
      ['nl'], // the whole locale in one run no longer fits the deadline
      ['de', '1'],
      ['nl-NL', '1'],
      ['', '1'],
      ['nl', 'en'],
      ['nl', '0'],
      ['nl', '3'],
      ['nl', '1/2'],
      ['nl', '1', '2'],
    ]) {
      const result = run(RELEASE, ['tests', 'ios', ...args], DISPATCH_ON_MAIN);
      assert.notEqual(result.status, 0, `ios ${args.join(' ')}`);
      assert.match(result.stderr, /release\.sh/);
    }
    assert.deepEqual(calls(), []);
  });

  it('E017 AC3: the Android tests run pnpm test:android and nothing else, and stop at its failure', () => {
    fake('pnpm', '[ "$1" != test:android ] || exit 1');
    const result = run(RELEASE, ['tests', 'android'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test:android/);
    assert.deepEqual(calls(), ['pnpm test:android']);

    fake('pnpm');
    assert.equal(run(RELEASE, ['tests', 'android'], DISPATCH_ON_MAIN).status, 0);
    assert.deepEqual(calls().slice(1), ['pnpm test:android']);
  });

  it('E017 AC3: the Android Maestro flows run pnpm test:maestro on its own, like the CI job Android Maestro', () => {
    fake('pnpm', '[ "$1" != test:maestro ] || exit 1');
    const result = run(RELEASE, ['tests', 'android-maestro'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test:maestro/);
    assert.deepEqual(calls(), ['pnpm test:maestro']);

    fake('pnpm');
    assert.equal(run(RELEASE, ['tests', 'android-maestro'], DISPATCH_ON_MAIN).status, 0);
    assert.deepEqual(calls().slice(1), ['pnpm test:maestro']);
  });

  it('E017 AC3: the Android suites take no argument: the Maestro job runs both locales', () => {
    fake('pnpm');
    for (const args of [
      ['android', 'nl'],
      ['android-maestro', 'nl'],
      ['android-maestro', 'nl', 'en'],
    ])
      assert.notEqual(run(RELEASE, ['tests', ...args], DISPATCH_ON_MAIN).status, 0, args.join(' '));
    assert.deepEqual(calls(), []);
  });

  it('E017 AC3: an unknown suite is an error', () => {
    fake('pnpm');
    assert.notEqual(run(RELEASE, ['tests', 'web'], DISPATCH_ON_MAIN).status, 0);
    assert.deepEqual(calls(), []);
  });
});

// --- The iOS lane -------------------------------------------------------------------------------------------------------

const RELEASE_IOS = join(ROOT, 'scripts/release-ios.sh');

// What `security cms -D` would decode from the provisioning profile, as `key=value` lines: the fake `security` prints the
// profile file as it is, and the fake `plutil` reads these lines.
const PROFILE_FIELDS = {
  UUID: '00000000-0000-4000-8000-000000000190',
  Name: 'Fivvi Pro App Store (example)',
  'TeamIdentifier.0': 'TEAM0EXAMPLE',
  'Entitlements.application-identifier': 'TEAM0EXAMPLE.app.fivvi.pro',
};
const profileText = (overrides = {}) =>
  Object.entries({ ...PROFILE_FIELDS, ...overrides })
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

const SECRET = {
  certificate: 'synthetic-p12-bytes-sentinel',
  certificatePassword: 'cert-password-sentinel-1a2b',
  keyId: 'KEYID-sentinel-X1',
  issuerId: 'ISSUER-sentinel-00aa-bb',
  // Only the PEM header is split, so scripts/secrets.sh doesn't match this fixture.
  apiKey: [
    '-----BEGIN ',
    'PRIVATE KEY-----\nfake-key-body-for-tests\n-----END PRIVATE KEY-----',
  ].join(''),
  sentryToken: 'sentry-token-sentinel-3c3c',
};
const secretValues = (profile = profileText()) => [
  SECRET.certificate,
  b64(SECRET.certificate),
  SECRET.certificatePassword,
  b64(profile),
  SECRET.keyId,
  SECRET.issuerId,
  SECRET.apiKey,
  'fake-key-body-for-tests',
  SECRET.sentryToken,
];

/** Fake macOS tools and sentry-cli. `FAKE_FAIL=<tool>-<subcommand>` makes one call fail. */
const fakeTools = () => {
  fake(
    'security',
    `[ "\${FAKE_FAIL:-}" != "security-$1" ] || exit 1
case "$1" in
  cms) cat "$4" ;;
  create-keychain) touch "$4" ;;
  delete-keychain) rm -f "$2" ;;
  find-identity) echo '  1) 0123456789ABCDEF "Apple Distribution: Fivvi Example (TEAM0EXAMPLE)"'; echo '     1 valid identities found' ;;
  list-keychains) echo '    "/Users/example/Library/Keychains/login.keychain-db"' ;;
esac`,
  );
  // plutil -extract <key> raw -o - <file>
  fake(
    'plutil',
    `line="$(grep -m1 "^$2=" "$6")" || exit 1
printf '%s\\n' "\${line#*=}"`,
  );
  fake(
    'xcodebuild',
    `[ "\${FAKE_FAIL:-}" != "xcodebuild-$1" ] || exit 1
number="" archive=""
while [ $# -gt 0 ]; do
  case "$1" in
    CURRENT_PROJECT_VERSION=*) number="\${1#*=}" ;;
    -archivePath) archive="$2" ;;
  esac
  shift
done
if [ -n "$archive" ] && [ -n "$number" ]; then
  mkdir -p "$archive/Products/Applications/FivviPro.app" "$archive/dSYMs/FivviPro.app.dSYM"
  printf 'CFBundleIdentifier=app.fivvi.pro\\nCFBundleShortVersionString=0.1.0\\nCFBundleVersion=%s\\n' "\${FAKE_ARCHIVED_NUMBER:-$number}" \\
    > "$archive/Products/Applications/FivviPro.app/Info.plist"
fi`,
  );
  fake(
    'sentry-cli',
    `[ "\${FAKE_FAIL:-}" != "sentry-cli-$1" ] || exit 1
printf 'token-in-environment=%s\\n' "\${SENTRY_AUTH_TOKEN:+yes}" >> "${log}"`,
  );
};

const iosEnv = (overrides = {}) => ({
  ...DISPATCH_ON_MAIN,
  RELEASE_WORK_DIR: join(work, 'ios'),
  PROVISIONING_PROFILES_DIR: join(work, 'profiles'),
  RELEASE_BUILD_NUMBER: '107',
  GITHUB_STEP_SUMMARY: join(work, 'summary.md'),
  IOS_DISTRIBUTION_CERTIFICATE: b64(SECRET.certificate),
  IOS_DISTRIBUTION_CERTIFICATE_PASSWORD: SECRET.certificatePassword,
  IOS_PROVISIONING_PROFILE: b64(profileText()),
  APP_STORE_CONNECT_KEY_ID: SECRET.keyId,
  APP_STORE_CONNECT_ISSUER_ID: SECRET.issuerId,
  APP_STORE_CONNECT_API_KEY: SECRET.apiKey,
  SENTRY_AUTH_TOKEN: SECRET.sentryToken,
  ...overrides,
});

/** Runs the steps in order with the same environment; stops at the first failure like the workflow does. */
const lane = (steps, env = iosEnv()) => {
  const results = [];
  for (const step of steps) {
    const result = run(RELEASE_IOS, [step], env);
    results.push({ step, ...result });
    if (result.status !== 0) break;
  }
  return results;
};
const output = (results) => results.map((r) => r.stdout + r.stderr).join('\n');
const keychain = () => join(work, 'ios', 'fivvi-release.keychain-db');
const archivePath = () => join(work, 'ios', 'FivviPro.xcarchive');

describe('E017 AC1: signing, archive and export with xcodebuild', () => {
  beforeEach(fakeTools);

  it('E017 AC1: installs the certificate in a temporary keychain and the profile where Xcode finds it', () => {
    const [signing] = lane(['signing']);
    assert.equal(signing.status, 0, signing.stderr);
    const seen = calls();
    assert.ok(
      seen.some((c) => c.startsWith(`security create-keychain -p `) && c.endsWith(keychain())),
    );
    assert.ok(
      seen.some((c) => c.startsWith('security import ') && c.includes(`-k ${keychain()}`)),
      'the certificate goes into that keychain only',
    );
    assert.ok(seen.some((c) => c.startsWith('security set-key-partition-list ')));
    assert.ok(seen.some((c) => c.startsWith('security list-keychains -d user -s ' + keychain())));
    assert.equal(
      readFileSync(join(work, 'profiles', `${PROFILE_FIELDS.UUID}.mobileprovision`), 'utf8'),
      profileText(),
    );
  });

  it('E017 AC1: refuses a profile that is not an App Store profile for app.fivvi.pro, before anything is signed', () => {
    for (const bad of [
      { 'ProvisionedDevices.0': '00000000-0000000000000000' }, // a development or ad hoc profile
      { 'Entitlements.application-identifier': 'TEAM0EXAMPLE.app.fivvi.other' },
      { 'Entitlements.application-identifier': 'OTHERTEAM.app.fivvi.pro' },
    ]) {
      const result = lane(
        ['signing'],
        iosEnv({ IOS_PROVISIONING_PROFILE: b64(profileText(bad)) }),
      )[0];
      assert.notEqual(result.status, 0, JSON.stringify(bad));
      assert.match(result.stderr, /profile/i);
    }
  });

  it('E017 AC1: refuses a keychain without an Apple Distribution identity', () => {
    fake(
      'security',
      `case "$1" in cms) cat "$4" ;; create-keychain) touch "$4" ;; find-identity) echo '     0 valid identities found' ;; list-keychains) echo '    "/x.keychain-db"' ;; esac`,
    );
    const result = lane(['signing'])[0];
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Apple Distribution/);
  });

  it('E017 AC1: archives Release with the run build number, signed with the distribution identity, no fastlane', () => {
    const results = lane(['signing', 'archive']);
    assert.deepEqual(
      results.map((r) => r.status),
      [0, 0],
      output(results),
    );
    const archive = calls().find((c) => c.startsWith('xcodebuild archive'));
    assert.ok(archive, 'xcodebuild archive ran');
    for (const part of [
      '-project ',
      'apps/ios/FivviPro.xcodeproj',
      '-scheme FivviPro',
      '-configuration Release',
      '-destination generic/platform=iOS',
      '-onlyUsePackageVersionsFromResolvedFile',
      `-archivePath ${archivePath()}`,
      'CURRENT_PROJECT_VERSION=107',
      'CODE_SIGN_STYLE=Manual',
      'CODE_SIGN_IDENTITY=Apple Distribution',
      'DEVELOPMENT_TEAM=TEAM0EXAMPLE',
      `FIVVI_RELEASE_PROFILE=${PROFILE_FIELDS.Name}`,
      `OTHER_CODE_SIGN_FLAGS=--keychain ${keychain()}`,
    ]) {
      assert.ok(archive.includes(part), `missing: ${part}\n${archive}`);
    }
    assert.ok(!/CODE_SIGNING_ALLOWED=NO|Local\.xcconfig/.test(archive));
    // A build setting on the command line reaches every target, the resource bundles of the local Swift packages too, and
    // those refuse a provisioning profile ("does not support provisioning profiles"). The profile goes to the app alone,
    // through FIVVI_RELEASE_PROFILE, which Release.xcconfig turns into the app target's profile specifier.
    assert.ok(
      !archive.includes('PROVISIONING_PROFILE_SPECIFIER'),
      `a global profile specifier: ${archive}`,
    );
    assert.ok(!calls().some((c) => /fastlane|bundle exec|gem /.test(c)));
  });

  it("E017 AC1: stops when the archive carries another build number than the run's", () => {
    const results = lane(['signing', 'archive'], iosEnv({ FAKE_ARCHIVED_NUMBER: '1' }));
    assert.notEqual(results[1].status, 0);
    assert.match(results[1].stderr, /build number/i);
  });

  it('E017 AC1: refuses a missing or malformed build number', () => {
    for (const number of ['', 'abc', '0', '1.5']) {
      const results = lane(['signing', 'archive'], iosEnv({ RELEASE_BUILD_NUMBER: number }));
      assert.notEqual(results[1].status, 0, `'${number}'`);
    }
  });

  it('E017 AC1: exports and uploads to App Store Connect with the API key, which is written outside the repo', () => {
    const results = lane(['signing', 'archive', 'upload']);
    assert.deepEqual(
      results.map((r) => r.status),
      [0, 0, 0],
      output(results),
    );
    const upload = calls().find((c) => c.startsWith('xcodebuild -exportArchive'));
    assert.ok(upload, 'xcodebuild -exportArchive ran');
    const keyPath = join(work, 'ios', `AuthKey_${SECRET.keyId}.p8`);
    for (const part of [
      `-archivePath ${archivePath()}`,
      `-authenticationKeyPath ${keyPath}`,
      `-authenticationKeyID ${SECRET.keyId}`,
      `-authenticationKeyIssuerID ${SECRET.issuerId}`,
    ]) {
      assert.ok(upload.includes(part), `missing: ${part}`);
    }
    const options = readFileSync(join(work, 'ios', 'ExportOptions.plist'), 'utf8');
    for (const part of [
      '<key>method</key><string>app-store-connect</string>',
      '<key>destination</key><string>upload</string>',
      '<key>signingStyle</key><string>manual</string>',
      '<key>teamID</key><string>TEAM0EXAMPLE</string>',
      `<key>app.fivvi.pro</key><string>${PROFILE_FIELDS.Name}</string>`,
      '<key>manageAppVersionAndBuildNumber</key><false/>',
    ]) {
      assert.ok(options.includes(part), `ExportOptions.plist lacks: ${part}`);
    }
    assert.ok(!options.includes(SECRET.keyId) && !options.includes(SECRET.certificatePassword));
    assert.equal(readFileSync(keyPath, 'utf8'), `${SECRET.apiKey}\n`);
    assert.equal(statSync(keyPath).mode & 0o077, 0, 'readable by this user only');
  });

  it('E017 AC1: escapes the profile name in ExportOptions.plist', () => {
    const profile = profileText({ Name: 'Fivvi <Pro> & Co' });
    lane(['signing', 'archive', 'upload'], iosEnv({ IOS_PROVISIONING_PROFILE: b64(profile) }));
    const options = readFileSync(join(work, 'ios', 'ExportOptions.plist'), 'utf8');
    assert.ok(options.includes('Fivvi &lt;Pro&gt; &amp; Co'), options);
  });

  it('E017 AC1: does not export without an archive', () => {
    const result = lane(['signing', 'upload'])[1];
    assert.notEqual(result.status, 0);
    assert.ok(!calls().some((c) => c.startsWith('xcodebuild -exportArchive')));
  });

  it('E017 AC1: the keychain, the profile and the key file are gone after cleanup, also after a failed archive', () => {
    const results = lane(
      ['signing', 'archive', 'upload', 'cleanup'],
      iosEnv({ FAKE_FAIL: 'xcodebuild-archive' }),
    );
    assert.notEqual(results[1].status, 0);
    assert.equal(run(RELEASE_IOS, ['cleanup'], iosEnv()).status, 0);
    assert.ok(calls().includes(`security delete-keychain ${keychain()}`));
    assert.throws(() => readFileSync(keychain()), /ENOENT/);
    assert.throws(
      () => readFileSync(join(work, 'profiles', `${PROFILE_FIELDS.UUID}.mobileprovision`)),
      /ENOENT/,
    );
  });

  it('E017 AC1: the full lane deletes the key file and the keychain at the end', () => {
    lane(['signing', 'archive', 'symbols', 'upload']);
    const keyPath = join(work, 'ios', `AuthKey_${SECRET.keyId}.p8`);
    assert.ok(readFileSync(keyPath, 'utf8'));
    assert.equal(run(RELEASE_IOS, ['cleanup'], iosEnv()).status, 0);
    assert.throws(() => readFileSync(keyPath), /ENOENT/);
    assert.throws(() => readFileSync(keychain()), /ENOENT/);
  });

  it('E017 AC1: the profile is gone after cleanup even when signing failed after it was copied', () => {
    const profile = join(work, 'profiles', `${PROFILE_FIELDS.UUID}.mobileprovision`);
    // The import of the certificate fails: the profile is already where Xcode finds it, and `signing` never finished.
    const [signing] = lane(['signing'], iosEnv({ FAKE_FAIL: 'security-import' }));
    assert.notEqual(signing.status, 0);
    assert.ok(readFileSync(profile, 'utf8'), 'the profile was copied before the failure');
    assert.equal(run(RELEASE_IOS, ['cleanup'], iosEnv()).status, 0);
    assert.throws(() => readFileSync(profile), /ENOENT/);
  });

  it('E017 AC1: cleanup works when nothing was set up', () => {
    const result = run(RELEASE_IOS, ['cleanup'], iosEnv());
    assert.equal(result.status, 0, result.stderr);
  });
});

describe('E017 AC1: the profile of a release reaches the app target alone (apps/ios/Config)', () => {
  // A build setting on the xcodebuild command line reaches every target, and the resource bundles of the local Swift
  // packages refuse a provisioning profile. So the run passes FIVVI_RELEASE_PROFILE, and Release.xcconfig, which only the
  // app target's Release configuration has as its base, turns it into that target's profile specifier.
  const config = join(ROOT, 'apps/ios/Config');
  const project = readFileSync(join(ROOT, 'apps/ios/FivviPro.xcodeproj/project.pbxproj'), 'utf8');

  // The body of the `{ ... }` of the pbxproj object with this id (every object is one flat block of `key = value;` lines).
  const object = (id) => {
    const start = project.search(new RegExp(`^\\t\\t${id} /\\*[^\\n]*\\*/ = \\{$`, 'm'));
    assert.notEqual(start, -1, `no object ${id} in the project`);
    return project.slice(start, project.indexOf('\n\t\t};', start));
  };

  it('Release.xcconfig turns FIVVI_RELEASE_PROFILE into the profile specifier, and never sets the variable itself', () => {
    const release = readFileSync(join(config, 'Release.xcconfig'), 'utf8');
    assert.match(release, /^PROVISIONING_PROFILE_SPECIFIER = \$\(FIVVI_RELEASE_PROFILE\)$/m);
    assert.ok(
      !/^FIVVI_RELEASE_PROFILE\b/m.test(release),
      'the profile comes from the command line, never from the file',
    );
  });

  it('Release.xcconfig is the base of the Release configuration of the app target (app.fivvi.pro), and of no other configuration', () => {
    const target = object(
      project.match(/^\t\t(\w+) \/\* FivviPro \*\/ = \{\n\t\t\tisa = PBXNativeTarget;/m)?.[1],
    );
    const list = object(target.match(/buildConfigurationList = (\w+) /)?.[1]);
    const names = [...list.matchAll(/^\t\t\t\t(\w+) \/\* (\w+) \*\/,$/gm)];
    const release = names.find((m) => m[2] === 'Release');
    assert.ok(release, "the app target's configuration list has a Release configuration");
    const configuration = object(release[1]);
    assert.match(
      configuration,
      /^\t\t\tbaseConfigurationReference = \w+ \/\* Release\.xcconfig \*\/;$/m,
    );
    assert.match(configuration, /^\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = app\.fivvi\.pro;$/m);
    assert.equal(
      project.match(/baseConfigurationReference = \w+ \/\* Release\.xcconfig \*\//g)?.length,
      1,
      'no other configuration has Release.xcconfig as its base',
    );
  });

  it('no target or project setting names a provisioning profile, and Debug builds sign automatically', () => {
    assert.ok(!project.includes('PROVISIONING_PROFILE_SPECIFIER'));
    const debug = readFileSync(join(config, 'Debug.xcconfig'), 'utf8');
    assert.ok(!debug.includes('PROVISIONING_PROFILE'), 'Debug builds sign automatically');
  });
});

describe('E017 AC6: dSYMs to Sentry under the release name the app sends', () => {
  beforeEach(fakeTools);

  it('E017 AC6: creates the release app.fivvi.pro@<version>+<build>, uploads the dSYMs of the archive to the ios project', () => {
    const results = lane(['signing', 'archive', 'symbols']);
    assert.deepEqual(
      results.map((r) => r.status),
      [0, 0, 0],
      output(results),
    );
    const cli = calls().filter((c) => c.startsWith('sentry-cli '));
    assert.equal(cli.length, 3);
    // The name is built the way ErrorReporting.swift builds it: <bundle ID>@<version>+<build>.
    assert.match(
      cli[0],
      /^sentry-cli releases new .*--project ios .*app\.fivvi\.pro@0\.1\.0\+107$/,
    );
    assert.match(
      cli[1],
      new RegExp(`^sentry-cli debug-files upload .*--project ios .*${archivePath()}/dSYMs$`),
    );
    assert.match(
      cli[2],
      /^sentry-cli releases finalize .*--project ios .*app\.fivvi\.pro@0\.1\.0\+107$/,
    );
    assert.ok(
      calls().filter((c) => c === 'token-in-environment=yes').length >= 3,
      'the token reaches the CLI by environment',
    );
    assert.ok(!calls().some((c) => c.includes(SECRET.sentryToken)), 'never on a command line');
  });

  it('E017 AC6: needs the token, and uploads nothing without it', () => {
    assert.notEqual(
      lane(['signing', 'archive', 'symbols'], iosEnv({ SENTRY_AUTH_TOKEN: '' }))[2].status,
      0,
    );
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });

  it('E017 AC6: needs an archive, and uploads nothing without it', () => {
    assert.notEqual(lane(['symbols'])[0].status, 0);
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });

  it('E017 AC6: a failed symbol upload fails the lane', () => {
    const results = lane(
      ['signing', 'archive', 'symbols'],
      iosEnv({ FAKE_FAIL: 'sentry-cli-debug-files' }),
    );
    assert.notEqual(results[2].status, 0);
  });

  it('E017 AC6: uses the CLI named by SENTRY_CLI (the one pinned by pnpm-lock.yaml)', () => {
    fake('pinned-sentry', 'true');
    lane(['signing', 'archive', 'symbols'], iosEnv({ SENTRY_CLI: join(bin, 'pinned-sentry') }));
    assert.ok(calls().some((c) => c.startsWith('pinned-sentry debug-files upload')));
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });
});

describe('E017 AC7: no step echoes a secret', () => {
  beforeEach(fakeTools);

  it('E017 AC7: nothing the lane prints holds a secret, in any form', () => {
    const results = lane(['signing', 'archive', 'symbols', 'upload', 'cleanup']);
    assert.deepEqual(
      results.map((r) => r.status),
      [0, 0, 0, 0, 0],
      output(results),
    );
    for (const value of secretValues()) {
      assert.ok(!output(results).includes(value), `printed: ${value.slice(0, 12)}…`);
    }
  });

  it('E017 AC7: a failing step does not print a secret either', () => {
    for (const fail of [
      'security-import',
      'xcodebuild-archive',
      'xcodebuild-exportArchive',
      'sentry-cli-releases',
    ]) {
      const results = lane(
        ['signing', 'archive', 'symbols', 'upload'],
        iosEnv({ FAKE_FAIL: fail }),
      );
      for (const value of secretValues()) {
        assert.ok(!output(results).includes(value), `${fail} printed: ${value.slice(0, 12)}…`);
      }
    }
  });

  it('E017 AC7: the scripts never trace commands', () => {
    for (const script of ['release.sh', 'release-ios.sh']) {
      const text = readFileSync(join(ROOT, 'scripts', script), 'utf8');
      assert.ok(!/set -[a-z]*x|set -o xtrace|bash -x/.test(text), script);
    }
  });
});

// --- The workflow ---------------------------------------------------------------------------------------------------------
// Read as text, like the native jobs of ci.yml are in scripts.test.mjs: what is checked is what a run may do and read.

const WORKFLOWS = join(ROOT, '.github/workflows');
const workflow = readFileSync(join(WORKFLOWS, 'release.yml'), 'utf8');

/** The text of each job of the workflow, by id. */
const jobs = () => {
  const section = workflow.slice(workflow.indexOf('\njobs:\n') + 7);
  const parts = section.split(/^  ([a-z][a-z0-9-]*):$/m);
  const result = {};
  for (let i = 1; i < parts.length; i += 2) result[parts[i]] = parts[i + 1];
  return result;
};
/** The `name:` and the text of each step of a job. */
const steps = (job) =>
  job
    .split(/^ {6}- /m)
    .slice(1)
    .map((text) => ({ name: text.match(/name: (.+)/)?.[1] ?? text.split('\n')[0], text }));
const RELEASE_SECRETS = [
  'IOS_DISTRIBUTION_CERTIFICATE',
  'IOS_DISTRIBUTION_CERTIFICATE_PASSWORD',
  'IOS_PROVISIONING_PROFILE',
  'APP_STORE_CONNECT_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
  'APP_STORE_CONNECT_API_KEY',
  'SENTRY_AUTH_TOKEN',
];

describe('E017 AC1: the iOS job of the release workflow', () => {
  it('E017 AC1: starts by hand only, on a GitHub-hosted macOS runner, in the release environment', () => {
    const trigger = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\n# One run'));
    assert.match(trigger, /^ {2}workflow_dispatch:/m);
    assert.ok(!/pull_request|push:|schedule:|workflow_run|repository_dispatch/.test(trigger));
    const { ios } = jobs();
    assert.match(ios, /^ {4}environment: release$/m);
    assert.match(ios, /^ {4}runs-on: macos-\d+$/m);
    assert.ok(!/self-hosted/.test(workflow));
  });

  it('E017 AC1: runs the steps in order, the build number from the run, and cleans up whatever failed', () => {
    const names = steps(jobs().ios).map((step) => step.name);
    const order = [
      'Refuse a run outside main',
      'Install the signing certificate and profile',
      'Archive the Release build',
      'Upload the dSYMs to Sentry',
      'Export and upload to App Store Connect',
      'Delete the keychain and the key files',
    ].map((name) => names.indexOf(name));
    assert.ok(
      order.every((index) => index >= 0),
      names.join(', '),
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    const cleanup = steps(jobs().ios).at(-1);
    assert.match(cleanup.text, /if: always\(\)\n\s+run: scripts\/release-ios\.sh cleanup/);
    assert.match(
      jobs().ios,
      /RELEASE_BUILD_NUMBER: \$\{\{ needs\.prepare\.outputs\.build-number \}\}/,
    );
  });

  it('E017 AC1: uses no fastlane, no Ruby and no other signing service', () => {
    assert.ok(
      !/fastlane|bundler|bundle exec|ruby|setup-ruby|\bmatch (appstore|adhoc|development|nuke)|gem install/i.test(
        workflow,
      ),
    );
    for (const script of ['release.sh', 'release-ios.sh']) {
      const text = readFileSync(join(ROOT, 'scripts', script), 'utf8').replace(/^#.*$/gm, '');
      assert.ok(!/fastlane|bundle exec|ruby|gem install/i.test(text), script);
    }
  });
});

describe('E017 AC3: what a run refuses and what stops it', () => {
  it('E017 AC3: a run outside main is refused before any step that reads a secret', () => {
    for (const [id, job] of Object.entries(jobs())) {
      const all = steps(job);
      const guard = all.findIndex((step) => step.text.includes('scripts/release.sh guard'));
      assert.ok(guard >= 0, `${id} has no guard`);
      const firstSecret = all.findIndex((step) => step.text.includes('secrets.'));
      assert.ok(firstSecret < 0 || guard < firstSecret, `${id} reads a secret before its guard`);
    }
    // The only steps before the guard are the ones that fetch the code the guard is in.
    const before = steps(jobs().ios).slice(
      0,
      steps(jobs().ios).findIndex((s) => s.text.includes('release.sh guard')),
    );
    assert.ok(before.every((step) => step.text.includes('actions/checkout')));
    assert.match(jobs().prepare, /scripts\/release\.sh guard/);
  });

  it('E017 AC3: no upload when a native suite fails: the release job needs the test job of both platforms, and only cleanup runs after a failure', () => {
    const {
      prepare,
      'ios-tests': tests,
      'android-tests': androidTests,
      'android-maestro': maestro,
      ios,
    } = jobs();
    assert.match(tests, /^ {4}needs: prepare$/m);
    assert.match(
      tests,
      /run: scripts\/release\.sh tests ios \$\{\{ matrix\.locale \}\} \$\{\{ matrix\.shard \}\}$/m,
    );
    // The native suites of both platforms run first (spec #169, AC3): the secret job waits for the iOS and the Android
    // tests, so a failing Android suite uploads no iOS build either. #191's Android job needs both as well.
    assert.match(androidTests, /^ {4}needs: prepare$/m);
    assert.match(androidTests, /^ {4}runs-on: ubuntu-\d+\.\d+$/m);
    assert.match(androidTests, /run: scripts\/release\.sh tests android$/m);
    assert.match(maestro, /^ {4}needs: prepare$/m);
    assert.match(maestro, /^ {4}runs-on: ubuntu-\d+\.\d+$/m);
    assert.match(maestro, /run: scripts\/release\.sh tests android-maestro$/m);
    assert.ok(
      !/inputs\.ios/.test(androidTests + maestro),
      'the Android suites run for every release run',
    );
    // Both native suites always run: neither test job carries an `if:` on an input, so a later job that needs them is
    // never skipped because a platform was left out of the run.
    for (const [name, job] of [
      ['ios-tests', tests],
      ['android-tests', androidTests],
      ['android-maestro', maestro],
    ])
      assert.ok(!/^ {4}if:.*\binputs\./m.test(job), `${name} must not be gated on an input`);
    assert.match(ios, /^ {4}needs: \[prepare, ios-tests, android-tests, android-maestro\]$/m);
    assert.ok(!/ios-release-test-results|android-release-test-results/.test(ios));
    // Both Android test jobs need the emulator set up the way ci.yml does it.
    for (const job of [androidTests, maestro]) {
      for (const command of [
        'scripts/android.sh setup',
        'scripts/android.sh emulator',
        'scripts/android.sh stop',
      ])
        assert.ok(job.includes(command), command);
      assert.match(job, /actions\/setup-java@/);
    }
    // Nothing that runs after a failure uploads: `always()`, `failure()` and `cancelled()` appear only on cleanup, on
    // stopping the emulator and on the upload of the test reports.
    const afterFailure = (text) =>
      steps(text).filter((step) => /if: .*(always|failure|cancelled)\(\)/.test(step.text));
    assert.deepEqual(
      afterFailure(ios).map((step) => step.name),
      ['Delete the keychain and the key files'],
    );
    assert.deepEqual(
      afterFailure(tests).map((step) => step.name),
      ['Upload test results'],
    );
    for (const job of [androidTests, maestro])
      assert.deepEqual(
        afterFailure(job).map((step) => step.name),
        ['Stop the emulator', 'Upload test results'],
      );
    assert.ok(!/(always|failure|cancelled)\(\)/.test(prepare));
    for (const job of [prepare, tests, androidTests, maestro, ios])
      assert.ok(!/continue-on-error/.test(job));
    assert.ok(
      !/^ {4}if: .*(always|failure|cancelled)\(\)/m.test(ios),
      'the release job has no always() condition',
    );
  });

  it('E017 AC3 #1403: the iOS tests run in both locales, each in two parts, one job each: a matrix of nl and en by 1 and 2, and the release job waits for all four', () => {
    const { 'ios-tests': tests, ios, runners } = jobs();
    assert.match(
      tests,
      /^ {4}name: iOS tests \(\$\{\{ matrix\.locale \}\} \$\{\{ matrix\.shard \}\}\/2\)$/m,
    );
    assert.match(tests, /^ {6}fail-fast: false$/m);
    assert.match(tests, /^ {8}locale: \[nl, en\]$/m);
    assert.match(tests, /^ {8}shard: \[1, 2\]$/m);
    // The same matrix as the one of CI, whose parts the two lanes deal out the same way.
    const ciTests = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');
    assert.match(ciTests, /^ {8}locale: \[nl, en\]\n {8}shard: \[1, 2\]$/m);
    // `needs` on a matrix job waits for every leg and needs all of them to succeed, so a failing locale stops the release.
    assert.match(ios, /^ {4}needs: \[prepare, ios-tests, android-tests, android-maestro\]$/m);
    assert.ok(
      !/^ {4}if: .*(always|failure|cancelled)\(\)/m.test(ios),
      'no condition that lets a failed leg through',
    );
    assert.match(runners, /^ {4}needs: \[ios-tests, ios\]$/m);
    // The script runs the build and the tests of one locale; no single-language narrowing by variable or flag.
    const script = readFileSync(join(ROOT, 'scripts/release.sh'), 'utf8');
    assert.match(script, /suite pnpm test:ios build/);
    assert.match(script, /suite pnpm test:ios test "\$2" --shard "\$3\/2" --retry-failed/);
    assert.ok(!/IOS_[A-Z_]*LOCALE|--locale|only-test-configuration/.test(script + workflow));
  });

  it('E017 AC3 #1403: each iOS test job keeps its own result bundle, named by its locale and part', () => {
    const upload = steps(jobs()['ios-tests']).find((step) => step.name === 'Upload test results');
    assert.match(
      upload.text,
      /^ {10}name: ios-release-test-results-\$\{\{ matrix\.locale \}\}-\$\{\{ matrix\.shard \}\}of2$/m,
    );
    assert.match(upload.text, /apps\/ios\/\.build\/TestResults-\*\.xcresult/);
    assert.match(upload.text, /apps\/ios\/\.build\/build-for-testing\.log/);
  });

  it("E017 AC3 #1403: the job timeout holds the build, one part's tests and the retry of its failed UI tests (#1433)", () => {
    const minutes = (job) => Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
    const ci = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');
    const ciJobs = (id) => ci.slice(ci.indexOf(`\n  ${id}:\n`) + 1).split(/\n  [a-z-]+:\n/)[0];
    const build = minutes(ciJobs('ios-build'));
    const testsOfCi = minutes(ciJobs('ios-tests'));
    // What the release budgets on top of CI's part, as scripts/test-ios.sh has the numbers: the count of the part's tests before the
    // run (select_shard: the enumeration's deadline and grace, twice when the first try gives nothing), then the retry's
    // deadline and grace, plus a minute for what the job spends around the retry (the reports, the summary); the retry
    // boots nothing and settles nothing, and counts nothing again (the part was counted when it was chosen).
    const testIos = readFileSync(join(ROOT, 'scripts/test-ios.sh'), 'utf8');
    const seconds = (name) => Number(testIos.match(new RegExp(`IOS_${name}:-(\\d+)`))[1]);
    const retry = Math.ceil(
      (2 * (seconds('ENUMERATE_DEADLINE') + seconds('TEST_DEADLINE_GRACE')) +
        seconds('RETRY_DEADLINE') +
        seconds('TEST_DEADLINE_GRACE') +
        60) /
        60,
    );
    const timeout = minutes(jobs()['ios-tests']);
    assert.ok(
      timeout >= build + testsOfCi + retry,
      `${timeout} minutes for a build (${build}), the tests of one part (${testsOfCi}), its count and a retry (${retry})`,
    );
    // The comment above the timeout shows the sum, and it is the one this test checks: setup + build + tests + retry.
    const comment = jobs()['ios-tests'].match(/(?:^ {4}#.*\n)+ {4}timeout-minutes:/m)[0];
    const [, setup, built, tests, retried, total] = comment
      .replace(/\n {4}#/g, '')
      .match(/(\d+) \+ (\d+) \+ (\d+) \+ (\d+) = (\d+)/)
      .map(Number);
    assert.equal(setup + built + tests + retried, total, 'the sum in the comment adds up');
    assert.equal(tests, testsOfCi, 'the tests of CI in the comment');
    assert.equal(retried, retry, 'the retry in the comment');
    assert.ok(built >= build, 'the build in the comment');
    assert.ok(timeout >= total, `${timeout} minutes hold the ${total} of the comment`);
    for (const name of ['RETRY_DEADLINE', 'ENUMERATE_DEADLINE']) {
      assert.ok(comment.includes(`${seconds(name)} s`), `${name} in the comment`);
    }
    // A part runs under the one deadline of test-ios.sh, as CI's part does (#1447), so it holds the same 44 minutes: the
    // timeout of CI's parts is what the comment adds, and no more than the deadline alone would need.
    assert.equal(
      testsOfCi,
      Math.ceil((seconds('TEST_DEADLINE') + seconds('TEST_DEADLINE_GRACE') + 310 + 120) / 60),
      "CI's part timeout is the deadline, its grace, the boot and the other steps, and 2 minutes",
    );
  });

  it('E017 #1403: the release pins its iOS test timeout to the parts it runs: 84 minutes for build, one part, its count (two tries) and one retry', () => {
    assert.equal(Number(jobs()['ios-tests'].match(/^ {4}timeout-minutes: (\d+)$/m)[1]), 84);
  });

  it('E017 #1433: only the release retries failed UI tests: CI never passes --retry-failed', () => {
    for (const file of readdirSync(WORKFLOWS).filter(
      (f) => /\.ya?ml$/.test(f) && f !== 'release.yml',
    ))
      assert.ok(
        !/--retry-failed/.test(readFileSync(join(WORKFLOWS, file), 'utf8')),
        `${file} runs the suite itself`,
      );
    const script = readFileSync(join(ROOT, 'scripts/release.sh'), 'utf8');
    assert.match(script, /suite pnpm test:ios test "\$2" --shard "\$3\/2" --retry-failed/);
  });
});

describe('E017 AC3: the Android test jobs fit what they run, like the Android jobs of CI', () => {
  const minutes = (text) => Number(text.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  const stepMinutes = (job, name) =>
    Number(
      steps(job)
        .find((step) => step.name === name)
        .text.match(/^ {8}timeout-minutes: (\d+)$/m)[1],
    );
  const ci = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');
  const ciJobs = (id) => ci.slice(ci.indexOf(`\n  ${id}:\n`) + 1).split(/\n  [a-z-]+:\n/)[0];

  it('the Android tests (ktlint, build, unit tests, Compose UI tests) are a job of their own, apart from the Maestro flows', () => {
    const { 'android-tests': androidTests, 'android-maestro': maestro } = jobs();
    assert.match(androidTests, /^ {4}name: Android tests$/m);
    assert.match(maestro, /^ {4}name: Android Maestro$/m);
    assert.ok(!/release\.sh tests android-maestro/.test(androidTests));
    assert.ok(!/release\.sh tests android$/m.test(maestro));
    assert.ok(
      !/pnpm test:maestro|maestro\.sh/.test(workflow.replace(/^\s*#.*$/gm, '')),
      'only through release.sh',
    );
  });

  it('the tests job holds the build and the unit and Compose UI tests: no lower than CI’s Android build and Android tests', () => {
    const { 'android-tests': androidTests } = jobs();
    const build = stepMinutes(ciJobs('android-build'), 'ktlint, checks and debug build');
    const verify = stepMinutes(
      ciJobs('android-tests'),
      'Unit tests, release bundle and Compose UI tests',
    );
    assert.ok(
      stepMinutes(androidTests, 'ktlint, build, unit tests and Compose UI tests') >= build + verify,
      'the step',
    );
    assert.ok(minutes(androidTests) >= minutes(ciJobs('android-tests')), 'the job');
    // The step has to fit in the job with the setup and the emulator boot (10 at most) before it.
    assert.ok(
      minutes(androidTests) >=
        stepMinutes(androidTests, 'ktlint, build, unit tests and Compose UI tests') + 10 + 5,
    );
  });

  it('the Maestro job holds both locales and the debug build: the CI step (45) plus the build allowance (10), in a job that holds the step, the boot and the setup', () => {
    const { 'android-maestro': maestro } = jobs();
    const flows = stepMinutes(maestro, 'Maestro flows (nl-NL and en)');
    const ciFlows = stepMinutes(
      ciJobs('android-maestro'),
      'Maestro flows (sign-in, anonymous and home; nl-NL and en)',
    );
    const build = stepMinutes(ciJobs('android-build'), 'ktlint, checks and debug build');
    assert.ok(
      flows >= ciFlows + build,
      `${flows} minutes for flows (${ciFlows}) and a build (${build})`,
    );
    assert.ok(minutes(maestro) >= minutes(ciJobs('android-maestro')), 'the job');
    assert.ok(minutes(maestro) >= flows + 10 + 5, 'the job holds the step, the boot and the setup');
  });

  it('no Android test step outgrows its job, and the two jobs do not run in series', () => {
    const { 'android-tests': androidTests, 'android-maestro': maestro } = jobs();
    for (const job of [androidTests, maestro]) {
      const total = steps(job)
        .map((step) => Number(step.text.match(/^ {8}timeout-minutes: (\d+)$/m)?.[1] ?? 0))
        .reduce((a, b) => a + b, 0);
      assert.ok(total < minutes(job), `${total} minutes of steps in a job of ${minutes(job)}`);
    }
    assert.match(androidTests, /^ {4}needs: prepare$/m);
    assert.match(maestro, /^ {4}needs: prepare$/m);
  });
});

describe('E017 AC4: one build number per run, from the run', () => {
  it('E017 AC4: is computed once by `prepare` and passed on, never by a platform job', () => {
    const { prepare, ios } = jobs();
    assert.match(
      prepare,
      /outputs:\n\s+build-number: \$\{\{ steps\.number\.outputs\.build-number \}\}/,
    );
    assert.match(prepare, /scripts\/release\.sh build-number/);
    assert.ok(
      !/build-number|run_number|CURRENT_PROJECT_VERSION/.test(
        ios.replace(/RELEASE_BUILD_NUMBER: .*/, ''),
      ),
    );
  });

  it('E017 AC4: both platforms read the same version', () => {
    const version = readFileSync(join(ROOT, 'apps/Version.xcconfig'), 'utf8');
    assert.match(version, /^MARKETING_VERSION = \d+\.\d+\.\d+$/m);
    const gradle = readFileSync(join(ROOT, 'apps/android/app/build.gradle.kts'), 'utf8');
    assert.match(gradle, /Version\.xcconfig/);
    // The iOS lane passes only the build number; the version is the one both apps read.
    assert.ok(
      !/MARKETING_VERSION/.test(
        readFileSync(join(ROOT, 'scripts/release-ios.sh'), 'utf8').replace(/^#.*$/gm, ''),
      ),
    );
  });
});

describe('E017 AC6: the release name the app sends', () => {
  it('E017 AC6: the lane builds it the way ErrorReporting.swift does: <bundle ID>@<version>+<build>', () => {
    const swift = readFileSync(
      noteRead(
        join(ROOT, 'apps/ios/Packages/FivviShared/Sources/FivviObservability/ErrorReporting.swift'),
      ),
      'utf8',
    );
    assert.match(swift, /release = "\\\(bundleID\)@\\\(version\)\+\\\(build\)"/);
    const script = readFileSync(join(ROOT, 'scripts/release-ios.sh'), 'utf8');
    assert.match(
      script,
      /release_name\(\) \{ echo "\$\(archived_value CFBundleIdentifier\)@\$\(archived_value CFBundleShortVersionString\)\+\$\(archived_value CFBundleVersion\)"; \}/,
    );
  });

  it('E017 AC6: sentry-cli is the one pinned by pnpm-lock.yaml', () => {
    assert.match(
      jobs().ios,
      /SENTRY_CLI: \$\{\{ github\.workspace \}\}\/packages\/observability\/node_modules\/\.bin\/sentry-cli/,
    );
    assert.match(
      readFileSync(join(ROOT, 'packages/observability/package.json'), 'utf8'),
      /"@sentry\/cli"/,
    );
    assert.match(
      readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8'),
      /'@sentry\/cli@\d+\.\d+\.\d+':/,
    );
    assert.match(jobs().ios, /pnpm install --frozen-lockfile --filter @fivvi\/observability\.\.\./);
  });
});

describe('E017 AC7: secrets stay in the release job', () => {
  it('E017 AC7: only the release job reads secrets, each in the step that needs it, none in a command line', () => {
    const {
      prepare,
      'ios-tests': tests,
      'android-tests': androidTests,
      'android-maestro': maestro,
      ios,
    } = jobs();
    for (const job of [prepare, tests, androidTests, maestro]) assert.ok(!job.includes('secrets.'));
    assert.match(ios, /^ {4}environment: release$/m);
    const readers = steps(ios).filter((step) => step.text.includes('secrets.'));
    assert.deepEqual(
      readers.map((step) => step.name),
      [
        'Install the signing certificate and profile',
        'Upload the dSYMs to Sentry',
        'Export and upload to App Store Connect',
      ],
    );
    const used = [...ios.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(used)].sort(), [...RELEASE_SECRETS].sort());
    for (const line of ios.split('\n').filter((l) => !/^\s*#/.test(l) && l.includes('secrets.'))) {
      assert.match(
        line,
        /^ {10}([A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}$/,
        `an env entry of one step: ${line}`,
      );
    }
    assert.ok(!/GITHUB_TOKEN|secrets: inherit|toJSON\(secrets\)|secrets\[/.test(workflow));
  });

  it('E017 AC7: every secret the lane reads is one release-secrets.sh sets', () => {
    const script = readFileSync(join(ROOT, 'scripts/release-secrets.sh'), 'utf8');
    for (const name of RELEASE_SECRETS) assert.ok(script.includes(`${name} `), name);
  });

  it('E017 AC7: no step prints a secret or turns on debug output', () => {
    const runs = [...workflow.matchAll(/^ +run: (?:\|\n((?: {10}.*\n?)+)|(.+))$/gm)].map(
      (m) => m[1] ?? m[2],
    );
    assert.ok(runs.length > 5);
    for (const text of runs) {
      assert.ok(!/secrets\./.test(text));
      assert.ok(
        !/\b(echo|printf|cat)\b.*\$\{?(IOS_|APP_STORE_CONNECT_|SENTRY_AUTH)/.test(text),
        text,
      );
      assert.ok(!/set -[a-z]*x|xtrace/.test(text), text);
    }
    assert.ok(!/ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG|ADD_MASK_OFF/.test(workflow));
  });

  it("E017 AC7: pull-request workflows can't reach the secrets or the environment", () => {
    const others = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f) && f !== 'release.yml');
    assert.ok(others.includes('ci.yml'));
    for (const file of others) {
      const text = readFileSync(join(WORKFLOWS, file), 'utf8');
      assert.ok(!/environment: *release/.test(text), file);
      for (const name of RELEASE_SECRETS)
        assert.ok(!text.includes(name), `${file} mentions ${name}`);
    }
    // No workflow of the repo runs on pull_request_target, which runs with the base branch's secrets on a PR's event.
    for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
      assert.ok(
        !/pull_request_target/.test(
          readFileSync(join(WORKFLOWS, file), 'utf8').replace(/^\s*#.*$/gm, ''),
        ),
        file,
      );
    }
    // The environment itself only deploys from main and the owner approves; admins can't bypass.
    const environment = JSON.parse(
      readFileSync(join(ROOT, '.github/environments/release.json'), 'utf8'),
    );
    assert.deepEqual(environment.deployment_branches, ['main']);
    assert.equal(environment.can_admins_bypass, false);
  });
});

describe('#437 E017: a job that got no hosted macOS runner is named as that', () => {
  const NO_TESTS = (part) =>
    `iOS tests (${part}) got no GitHub-hosted macOS runner; nothing was built or uploaded; start a new Release run (not Re-run)`;
  const NO_RELEASE =
    'iOS release got no GitHub-hosted macOS runner (if nobody cancelled the run); nothing was signed or uploaded for iOS; start a new Release run (not Re-run)';

  it('iOS tests (nl 1/2)=unacquired: the error says no runner and to start a new run, and the run fails', () => {
    const result = run(RELEASE, [
      'runners',
      'iOS tests (nl 1/2)=unacquired',
      'iOS tests (en 2/2)=success',
      'iOS release=skipped',
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stdout.split('\n').includes(`::error::${NO_TESTS('nl 1/2')}`), result.stdout);
    assert.ok(!/iOS release got no|iOS tests \(en 2\/2\) got no/.test(result.stdout));
  });

  it('iOS release=unacquired: the error says nothing was signed and that Android may be out', () => {
    const result = run(RELEASE, [
      'runners',
      'iOS tests (nl 1/2)=success',
      'iOS tests (en 2/2)=success',
      'iOS release=unacquired',
    ]);
    assert.equal(result.status, 1, result.stderr);
    const line = result.stdout.split('\n').find((l) => l.startsWith('::error::'));
    assert.ok(line.startsWith(`::error::${NO_RELEASE}`), line);
    assert.match(
      line.slice(`::error::${NO_RELEASE}`.length),
      /^; an Android build .* may already be out.*leave Android off$/,
    );
    assert.ok(!/iOS tests \(.*\) got no/.test(result.stdout));
  });

  it('every job unacquired: each is named, the language of the tests by its name, and the run fails', () => {
    const result = run(RELEASE, [
      'runners',
      'iOS tests (nl 1/2)=unacquired',
      'iOS tests (en 2/2)=unacquired',
      'iOS release=unacquired',
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.split('\n').filter((l) => l.startsWith('::error::')).length, 3);
  });

  it('#1403: each of the four parts is named when it got no runner, the others stay quiet', () => {
    const parts = ['nl 1/2', 'nl 2/2', 'en 1/2', 'en 2/2'];
    for (const missing of parts) {
      const result = run(RELEASE, [
        'runners',
        ...parts.map(
          (part) => `iOS tests (${part})=${part === missing ? 'unacquired' : 'success'}`,
        ),
        'iOS release=skipped',
      ]);
      assert.equal(result.status, 1, `${missing}: ${result.stderr}`);
      assert.ok(result.stdout.includes(`::error::${NO_TESTS(missing)}`), result.stdout);
      assert.equal(result.stdout.split('\n').filter((l) => l.startsWith('::error::')).length, 1);
    }
  });

  it('the same sentence goes into the step summary, when GITHUB_STEP_SUMMARY is set', () => {
    const summary = join(work, 'summary.md');
    writeFileSync(summary, 'Build number 107\n');
    run(RELEASE, ['runners', 'iOS tests (en 2/2)=unacquired'], { GITHUB_STEP_SUMMARY: summary });
    assert.equal(readFileSync(summary, 'utf8'), `Build number 107\n${NO_TESTS('en 2/2')}\n`);
    run(RELEASE, ['runners', 'iOS release=unacquired'], { GITHUB_STEP_SUMMARY: summary });
    assert.ok(readFileSync(summary, 'utf8').includes(`${NO_RELEASE}; `));
  });

  it('works without GITHUB_STEP_SUMMARY', () => {
    const result = run(RELEASE, ['runners', 'iOS tests (nl 1/2)=unacquired']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
  });

  it('a timeout or a test failure on a runner gets no runner message, and exits 0', () => {
    const summary = join(work, 'summary.md');
    writeFileSync(summary, '');
    for (const parts of [
      ['iOS tests (nl 1/2)=cancelled', 'iOS tests (en 2/2)=success', 'iOS release=skipped'],
      ['iOS tests (nl 1/2)=success', 'iOS tests (en 2/2)=failure', 'iOS release=skipped'],
      ['iOS tests (nl 1/2)=success', 'iOS tests (en 2/2)=success', 'iOS release=failure'],
      ['iOS tests (nl 1/2)=success', 'iOS tests (en 2/2)=success', 'iOS release=success'],
    ]) {
      const result = run(RELEASE, ['runners', ...parts], { GITHUB_STEP_SUMMARY: summary });
      assert.equal(result.status, 0, `${parts}: ${result.stderr}`);
      assert.ok(!/::error::|got no/.test(result.stdout + result.stderr), parts.join(' '));
    }
    assert.equal(readFileSync(summary, 'utf8'), '');
  });

  it('a leg of the tests that got a runner and failed does not hide the other one that got none', () => {
    const result = run(RELEASE, [
      'runners',
      'iOS tests (nl 1/2)=failure',
      'iOS tests (en 2/2)=unacquired',
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stdout.includes(`::error::${NO_TESTS('en 2/2')}`), result.stdout);
    assert.ok(!/iOS tests \(nl 1\/2\) got no/.test(result.stdout));
  });

  it('the old, single name of the tests no longer counts: a part must name its language', () => {
    const result = run(RELEASE, ['runners', 'iOS tests=unacquired']);
    assert.equal(result.status, 0);
    assert.ok(!/got no/.test(result.stdout));
  });

  it('bare results (the jobs could not be read) make no claim about a runner', () => {
    const result = run(RELEASE, ['runners', 'cancelled', 'cancelled']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split('\n').filter(Boolean).length, 1);
    assert.ok(!/::error::|got no|runner was|no runner/i.test(result.stdout));
  });

  it('refuses no parts', () => {
    const result = run(RELEASE, ['runners']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release\.sh runners/);
  });
});

describe('#437 E017: the iOS jobs run on the image and Xcode that CI tests the app on', () => {
  const ci = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');
  const ciJob = ci.slice(ci.indexOf('\n  ios-build:\n'));
  const field = (text, pattern) => text.match(pattern)?.[1];

  it('ios-tests and ios have the runs-on and the DEVELOPER_DIR of the ios-build job of ci.yml', () => {
    const runsOn = field(ciJob, /^ {4}runs-on: (macos-\d+)$/m);
    const developerDir = field(ciJob, /^ {6}DEVELOPER_DIR: (\S+)$/m);
    assert.match(runsOn, /^macos-\d+$/);
    assert.match(developerDir, /^\/Applications\/Xcode_[\d.]+\.app\/Contents\/Developer$/);
    const { 'ios-tests': tests, ios } = jobs();
    for (const [name, job] of [
      ['ios-tests', tests],
      ['ios', ios],
    ]) {
      assert.equal(field(job, /^ {4}runs-on: (\S+)$/m), runsOn, `${name} runs-on`);
      assert.equal(
        field(job, /^ {6}DEVELOPER_DIR: (\S+)$/m),
        developerDir,
        `${name} DEVELOPER_DIR`,
      );
    }
  });

  it('the runners job runs last whatever happened, reads the run and holds no secret', () => {
    const { runners } = jobs();
    assert.ok(runners, 'a job `runners`');
    assert.match(runners, /^ {4}needs: \[ios-tests, ios\]$/m);
    assert.match(runners, /^ {4}if: always\(\)$/m);
    assert.match(runners, /^ {4}runs-on: ubuntu-\d+\.\d+$/m);
    assert.match(runners, /^ {4}timeout-minutes: 5$/m);
    assert.match(runners, /^ {6}contents: read$/m);
    assert.match(runners, /^ {6}actions: read/m);
    assert.ok(!/^ {6}[a-z-]+: write/m.test(runners), 'no write permission');
    assert.ok(!runners.includes('secrets.'));
    assert.ok(!/^ {4}environment:/m.test(runners));
    for (const part of ['nl 1/2', 'nl 2/2', 'en 1/2', 'en 2/2'])
      assert.ok(
        runners.includes(`scripts/ios-parts.sh job "iOS tests (${part})" "$TESTS"`),
        `the job looks up ${part}`,
      );
    assert.match(runners, /scripts\/ios-parts\.sh job "iOS release"/);
    assert.match(runners, /scripts\/release\.sh runners/);
    assert.match(runners, /needs\.ios-tests\.result/);
    assert.match(runners, /needs\.ios\.result/);
    assert.match(runners, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(runners, /persist-credentials: false/);
  });

  it('the names the job looks for are the names of the iOS jobs', () => {
    const { 'ios-tests': tests, ios } = jobs();
    // The matrix names its legs `iOS tests (nl 1/2)` to `iOS tests (en 2/2)`, which `runners` reads one by one.
    assert.match(
      tests,
      /^ {4}name: iOS tests \(\$\{\{ matrix\.locale \}\} \$\{\{ matrix\.shard \}\}\/2\)$/m,
    );
    assert.match(tests, /^ {8}locale: \[nl, en\]$/m);
    assert.match(tests, /^ {8}shard: \[1, 2\]$/m);
    assert.match(ios, /^ {4}name: iOS release$/m);
  });
});

describe('Release builds call the production API on the custom domain, not the Railway domain', () => {
  // The address of the web service is https://fivvi.app (ENVIRONMENTS.md, "Production address"); the Railway domain still
  // answers, so installed builds keep working. Debug and preview addresses stay as they are.
  it('iOS: Release.xcconfig sets FIVVI_API_BASE_URL to https://fivvi.app/api (`$()` keeps `//` from starting a comment)', () => {
    const release = readFileSync(noteRead(join(ROOT, 'apps/ios/Config/Release.xcconfig')), 'utf8');
    assert.match(release, /^FIVVI_API_BASE_URL = https:\/\$\(\)\/fivvi\.app\/api$/m);
    assert.ok(!/railway\.app/.test(release), 'the Railway domain is gone from Release.xcconfig');
  });

  it('Android: gradle.properties sets fivvi.releaseApiBaseUrl to https://fivvi.app/api/ (with the trailing slash)', () => {
    const properties = readFileSync(
      noteAndroid(join(ROOT, 'apps/android/gradle.properties')),
      'utf8',
    );
    assert.match(properties, /^fivvi\.releaseApiBaseUrl=https:\/\/fivvi\.app\/api\/$/m);
    assert.ok(
      !/railway\.app/.test(properties),
      'the Railway domain is gone from gradle.properties',
    );
  });

  it('turbo.json lists as inputs of the root tests the Android file read above', () => {
    assert.ok(androidReads.size >= 1, 'the tests read an Android file');
    assert.deepEqual(uncovered([...androidReads]), [], UNCOVERED_MESSAGE);
  });
});

describe('E017 #594: a change to an iOS file these tests read is not served from the test cache', () => {
  it('turbo.json lists as inputs of the root tests every file of apps/ios read above', () => {
    assert.ok(iosReads.size >= 1, 'the tests read an iOS file');
    assert.deepEqual(uncovered([...iosReads]), [], UNCOVERED_MESSAGE);
  });
});
