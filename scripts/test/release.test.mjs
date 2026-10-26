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

const ROOT = join(import.meta.dirname, '../..');
const RELEASE = join(ROOT, 'scripts/release.sh');

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
    // pnpm test:ios fails: the gate fails and names the suite; nothing else ran.
    fake('pnpm', 'exit 1');
    fake('xcodebuild');
    fake('security');
    fake('sentry-cli');
    const result = run(RELEASE, ['tests', 'ios'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test:ios/);
    assert.deepEqual(calls(), ['pnpm test:ios']);
  });

  it('E017 AC3: runs pnpm test:ios as it is, both locales, and passes when it passes', () => {
    fake('pnpm');
    const result = run(RELEASE, ['tests', 'ios'], DISPATCH_ON_MAIN);
    assert.equal(result.status, 0, result.stderr);
    // No argument or variable narrows it to one locale: test-ios.sh runs nl and en in one run.
    assert.deepEqual(calls(), ['pnpm test:ios']);
  });

  it('E017 AC3: the Android suites run in order and the second does not start after the first fails', () => {
    fake('pnpm', '[ "$1" != test:android ] || exit 1');
    const result = run(RELEASE, ['tests', 'android'], DISPATCH_ON_MAIN);
    assert.notEqual(result.status, 0);
    assert.deepEqual(calls(), ['pnpm test:android']);

    fake('pnpm');
    assert.equal(run(RELEASE, ['tests', 'android'], DISPATCH_ON_MAIN).status, 0);
    assert.deepEqual(calls().slice(1), ['pnpm test:android', 'pnpm test:maestro']);
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
      `PROVISIONING_PROFILE_SPECIFIER=${PROFILE_FIELDS.Name}`,
      `OTHER_CODE_SIGN_FLAGS=--keychain ${keychain()}`,
    ]) {
      assert.ok(archive.includes(part), `missing: ${part}\n${archive}`);
    }
    assert.ok(!/CODE_SIGNING_ALLOWED=NO|Local\.xcconfig/.test(archive));
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
    const { prepare, 'ios-tests': tests, 'android-tests': androidTests, ios } = jobs();
    assert.match(tests, /^ {4}needs: prepare$/m);
    assert.match(tests, /run: scripts\/release\.sh tests ios/);
    // The native suites of both platforms run first (spec #169, AC3): the secret job waits for the iOS and the Android
    // tests, so a failing Android suite uploads no iOS build either. #191's Android job needs both as well.
    assert.match(androidTests, /^ {4}needs: prepare$/m);
    assert.match(androidTests, /^ {4}runs-on: ubuntu-\d+\.\d+$/m);
    assert.match(androidTests, /run: scripts\/release\.sh tests android/);
    assert.ok(!/inputs\.ios/.test(androidTests), 'the Android suites run for every release run');
    assert.match(ios, /^ {4}needs: \[prepare, ios-tests, android-tests\]$/m);
    assert.ok(!/ios-release-test-results|android-release-test-results/.test(ios));
    // The Android suites need the emulator set up the way ci.yml does it.
    for (const command of [
      'scripts/android.sh setup',
      'scripts/android.sh emulator',
      'scripts/android.sh stop',
    ])
      assert.ok(androidTests.includes(command), command);
    assert.match(androidTests, /actions\/setup-java@/);
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
    assert.deepEqual(
      afterFailure(androidTests).map((step) => step.name),
      ['Stop the emulator', 'Upload test results'],
    );
    assert.ok(!/(always|failure|cancelled)\(\)/.test(prepare));
    for (const job of [prepare, tests, androidTests, ios])
      assert.ok(!/continue-on-error/.test(job));
    assert.ok(
      !/^ {4}if: .*(always|failure|cancelled)\(\)/m.test(ios),
      'the release job has no always() condition',
    );
  });

  it('E017 AC3: the iOS tests run in both locales: the plain pnpm test:ios, no single-language mode', () => {
    const script = readFileSync(join(ROOT, 'scripts/release.sh'), 'utf8');
    assert.match(script, /ios\) suite pnpm test:ios ;;/);
    assert.ok(!/IOS_[A-Z_]*LOCALE|--locale|only-test-configuration/.test(script + workflow));
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
      join(ROOT, 'apps/ios/FivviPro/Observability/ErrorReporting.swift'),
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
    const { prepare, 'ios-tests': tests, 'android-tests': androidTests, ios } = jobs();
    for (const job of [prepare, tests, androidTests]) assert.ok(!job.includes('secrets.'));
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
