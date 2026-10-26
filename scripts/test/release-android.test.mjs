// E017 #191: the Android release lane (scripts/release-android.sh, scripts/play-publish.mjs) and the Android job of
// .github/workflows/release.yml, run against fake commands (keytool, jarsigner, sdkmanager, gradlew, sentry-cli) that log
// their calls, and against a fake Google Play Developer API (a local HTTP server). Every secret is an obviously fake
// sentinel the tests look for where it must never appear (docs/engineering/TESTING.md; scripts/secrets-in-tests.mjs).
// The lane itself is proven by a real run the owner approves (the AC9 ticket). Its sibling, scripts/test/release.test.mjs,
// has the guard, the build number and the iOS lane.
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../..');
const RELEASE_ANDROID = join(ROOT, 'scripts/release-android.sh');
const PLAY_PUBLISH = join(ROOT, 'scripts/play-publish.mjs');

const base = mkdtempSync(join(tmpdir(), 'release-android-test-'));
after(() => rmSync(base, { recursive: true, force: true }));

let work;
let bin;
let log;
let android;
let counter = 0;
beforeEach(() => {
  work = join(base, `case-${counter++}`);
  bin = join(work, 'bin');
  log = join(work, 'calls.log');
  // A stand-in for apps/android with its own gradlew and, next to it, the version file both apps read.
  android = join(work, 'apps/android');
  mkdirSync(bin, { recursive: true });
  mkdirSync(android, { recursive: true });
  writeFileSync(log, '');
  writeFileSync(join(work, 'apps/Version.xcconfig'), 'MARKETING_VERSION = 0.1.0\n');
});

/** Puts a fake command on the PATH: it logs `name args` and then runs `body` (bash). */
const fake = (name, body = '', dir = bin) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nprintf '%s\\n' "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(path, 0o755);
};
const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);

const run = (args, env = {}) =>
  spawnSync(RELEASE_ANDROID, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: work, ...env },
  });

/** The same, but without blocking this process, which also serves the fake Play API. */
const runAsync = (args, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(RELEASE_ANDROID, args, {
      cwd: ROOT,
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: work, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

// Generated for each test run and never written to the repo: a throwaway key pair for the fake service account.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const FAKE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

const SECRET = {
  keystore: 'synthetic-keystore-bytes-sentinel',
  keystorePassword: 'keystore-password-sentinel-1a2b',
  alias: 'upload-alias-sentinel',
  keyPassword: 'key-password-sentinel-3c4d',
  sentryToken: 'sentry-token-sentinel-3c3c',
  serviceAccount: JSON.stringify({
    type: 'service_account',
    client_email: 'release-bot@example.com',
    private_key: FAKE_PRIVATE_KEY,
  }),
};
const secretValues = () => [
  SECRET.keystore,
  b64(SECRET.keystore),
  SECRET.keystorePassword,
  SECRET.alias,
  SECRET.keyPassword,
  SECRET.sentryToken,
  SECRET.serviceAccount,
  FAKE_PRIVATE_KEY,
  FAKE_PRIVATE_KEY.split('\n')[1],
  b64(SECRET.serviceAccount),
];

const BUNDLE_BYTES = 'synthetic-bundle-bytes-of-the-build';

/** Fakes of the tools the lane runs. `FAKE_FAIL=<tool>` makes one fail. */
const fakeTools = () => {
  fake(
    'keytool',
    `[ "\${FAKE_FAIL:-}" != keytool ] || { echo "keytool error: Keystore was tampered with" >&2; exit 1; }`,
  );
  fake(
    'jarsigner',
    `if [ -n "\${FAKE_UNSIGNED:-}" ]; then echo "jar is unsigned."; else echo "jar verified."; fi`,
  );
  fake(
    'sdkmanager',
    `[ "\${FAKE_FAIL:-}" != sdkmanager ] || exit 1
if [ "$1" = --licenses ]; then head -n 1 >/dev/null; fi`,
  );
  // gradlew runs in apps/android; it writes the bundle where Gradle does, and the mapping when "minified".
  fake(
    'gradlew',
    `[ "\${FAKE_FAIL:-}" != gradlew ] || exit 1
printf 'env: keystore-file=%s store-password=%s alias=%s key-password=%s\\n' \\
  "\${ANDROID_UPLOAD_KEYSTORE_FILE:+yes}" "\${ANDROID_UPLOAD_KEYSTORE_PASSWORD:+yes}" \\
  "\${ANDROID_UPLOAD_KEY_ALIAS:+yes}" "\${ANDROID_UPLOAD_KEY_PASSWORD:+yes}" >> "${log}"
[ -z "\${ANDROID_UPLOAD_KEYSTORE_FILE:-}" ] || printf 'keystore-file=%s\\n' "$ANDROID_UPLOAD_KEYSTORE_FILE" >> "${log}"
[ -z "\${FAKE_NO_BUNDLE:-}" ] || exit 0
mkdir -p app/build/outputs/bundle/release
printf '%s' '${BUNDLE_BYTES}' > app/build/outputs/bundle/release/app-release.aab
if [ -n "\${FAKE_MINIFIED:-}" ]; then
  mkdir -p app/build/outputs/mapping/release
  printf 'synthetic mapping\\n' > app/build/outputs/mapping/release/mapping.txt
fi`,
    android,
  );
  fake(
    'sentry-cli',
    `[ "\${FAKE_FAIL:-}" != "sentry-cli-$1" ] || exit 1
printf 'token-in-environment=%s\\n' "\${SENTRY_AUTH_TOKEN:+yes}" >> "${log}"`,
  );
};

const laneEnv = (overrides = {}) => ({
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  RELEASE_ANDROID_DIR: android,
  RELEASE_WORK_DIR: join(work, 'android-work'),
  RELEASE_BUILD_NUMBER: '107',
  GITHUB_STEP_SUMMARY: join(work, 'summary.md'),
  ANDROID_UPLOAD_KEYSTORE: b64(SECRET.keystore),
  ANDROID_UPLOAD_KEYSTORE_PASSWORD: SECRET.keystorePassword,
  ANDROID_UPLOAD_KEY_ALIAS: SECRET.alias,
  ANDROID_UPLOAD_KEY_PASSWORD: SECRET.keyPassword,
  SENTRY_AUTH_TOKEN: SECRET.sentryToken,
  ...overrides,
});

/** Runs the steps in order with the same environment; stops at the first failure like the workflow does. */
const lane = (steps, env = laneEnv()) => {
  const results = [];
  for (const step of steps) {
    const result = run([step], env);
    results.push({ step, ...result });
    if (result.status !== 0) break;
  }
  return results;
};
const output = (results) => results.map((r) => r.stdout + r.stderr).join('\n');
const statuses = (results) => results.map((r) => r.status);
const keystorePath = () => join(work, 'android-work', 'upload.jks');
const bundleDir = () => join(work, 'android-work', 'bundle');
const summary = () =>
  existsSync(join(work, 'summary.md')) ? readFileSync(join(work, 'summary.md'), 'utf8') : '';

describe('E017 AC2: the upload key and the release App Bundle', () => {
  beforeEach(fakeTools);

  it('E017 AC2: writes the keystore to a temp path for this user only, and checks the alias with the passwords from the environment', () => {
    const [signing] = lane(['signing']);
    assert.equal(signing.status, 0, signing.stderr);
    assert.equal(readFileSync(keystorePath(), 'utf8'), SECRET.keystore);
    assert.equal(statSync(keystorePath()).mode & 0o077, 0, 'readable by this user only');
    assert.ok(!keystorePath().startsWith(ROOT), 'outside the repo');
    const list = calls().find((c) => c.startsWith('keytool '));
    assert.ok(list, 'keytool checked the keystore');
    assert.match(list, /-list/);
    assert.ok(list.includes(`-keystore ${keystorePath()}`));
    assert.ok(list.includes(`-alias ${SECRET.alias}`) || list.includes('-alias:env'));
    assert.match(list, /-storepass:env \w+/, 'the password is read from the environment');
    assert.ok(!list.includes(SECRET.keystorePassword), 'never on a command line');
  });

  it('E017 AC2: refuses each missing secret by name, before it writes anything', () => {
    for (const name of [
      'ANDROID_UPLOAD_KEYSTORE',
      'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
      'ANDROID_UPLOAD_KEY_ALIAS',
      'ANDROID_UPLOAD_KEY_PASSWORD',
    ]) {
      const result = lane(['signing'], laneEnv({ [name]: '' }))[0];
      assert.notEqual(result.status, 0, name);
      assert.ok(result.stderr.includes(name), `${name} is named: ${result.stderr}`);
      assert.ok(!existsSync(keystorePath()), `${name}: no keystore written`);
    }
  });

  it('E017 AC2: refuses a keystore or alias that keytool rejects, and leaves no keystore behind', () => {
    const results = lane(['signing', 'bundle'], laneEnv({ FAKE_FAIL: 'keytool' }));
    assert.notEqual(results[0].status, 0);
    assert.match(results[0].stderr, /keystore|alias/i);
    assert.equal(results.length, 1, 'bundle did not run');
    assert.ok(!existsSync(keystorePath()), 'the keystore is removed again');
    assert.ok(!calls().some((c) => c.startsWith('gradlew')));
  });

  it('E017 AC2: installs only the SDK packages the build needs, the ones compileSdk and buildToolsVersion name', () => {
    const gradle = readFileSync(join(ROOT, 'apps/android/app/build.gradle.kts'), 'utf8');
    const platform = gradle.match(/compileSdk = (\d+)/)[1];
    const tools = gradle.match(/buildToolsVersion = "([^"]+)"/)[1];
    const [sdk] = lane(['sdk']);
    assert.equal(sdk.status, 0, sdk.stderr);
    const installs = calls().filter((c) => c.startsWith('sdkmanager ') && c.includes('--install'));
    assert.equal(installs.length, 1);
    assert.ok(installs[0].includes(`platforms;android-${platform}`), installs[0]);
    assert.ok(installs[0].includes(`build-tools;${tools}`), installs[0]);
    assert.ok(!/emulator|system-images/.test(installs[0]), 'no emulator in the release job');
    assert.ok(calls().some((c) => c === 'sdkmanager --licenses'));
  });

  it('E017 AC2: builds the release bundle with Gradle and the run build number, signed through the environment', () => {
    const results = lane(['signing', 'bundle']);
    assert.deepEqual(statuses(results), [0, 0], output(results));
    const build = calls().find((c) => c.startsWith('gradlew '));
    assert.ok(build, 'gradlew ran');
    // No daemon stays behind with the passwords in its environment.
    for (const part of ['--no-daemon', ':app:bundleRelease', '-Pfivvi.buildNumber=107']) {
      assert.ok(build.includes(part), `missing: ${part}\n${build}`);
    }
    assert.ok(
      calls().includes('env: keystore-file=yes store-password=yes alias=yes key-password=yes'),
      'the signing configuration reaches Gradle by environment',
    );
    assert.ok(calls().includes(`keystore-file=${keystorePath()}`));
    // The alias names a key, it opens nothing: keytool takes it as an argument. Passwords and keys never are.
    for (const value of secretValues().filter((v) => v !== SECRET.alias))
      assert.ok(!calls().some((c) => c.includes(value)), 'no secret on a command line');
    assert.ok(!/fastlane|bundle exec|gem /.test(calls().join('\n')));
  });

  it('E017 AC2: keeps the signed bundle, named by version and build number, alone in its own folder', () => {
    const results = lane(['signing', 'bundle']);
    assert.deepEqual(statuses(results), [0, 0], output(results));
    assert.deepEqual(readdirSync(bundleDir()), ['fivvi-pro-0.1.0-107.aab']);
    assert.equal(readFileSync(join(bundleDir(), 'fivvi-pro-0.1.0-107.aab'), 'utf8'), BUNDLE_BYTES);
    assert.ok(
      calls().some((c) => c.startsWith('jarsigner -verify ')),
      'the signature is verified',
    );
    assert.match(summary(), /107/);
  });

  it('E017 AC2: refuses a bundle that is not signed', () => {
    const results = lane(['signing', 'bundle'], laneEnv({ FAKE_UNSIGNED: '1' }));
    assert.notEqual(results[1].status, 0);
    assert.match(results[1].stderr, /not signed|unsigned/i);
    assert.ok(!existsSync(bundleDir()) || readdirSync(bundleDir()).length === 0);
  });

  it('E017 AC2: refuses a build that produced no bundle, and a failing Gradle build', () => {
    assert.notEqual(lane(['signing', 'bundle'], laneEnv({ FAKE_NO_BUNDLE: '1' }))[1].status, 0);
    assert.notEqual(lane(['signing', 'bundle'], laneEnv({ FAKE_FAIL: 'gradlew' }))[1].status, 0);
  });

  it('E017 AC2: does not take a bundle left over from an earlier build', () => {
    mkdirSync(join(android, 'app/build/outputs/bundle/release'), { recursive: true });
    writeFileSync(join(android, 'app/build/outputs/bundle/release/app-release.aab'), 'old bundle');
    const results = lane(['signing', 'bundle'], laneEnv({ FAKE_NO_BUNDLE: '1' }));
    assert.notEqual(results[1].status, 0, 'a stale bundle must not pass for this build');
  });

  it('E017 AC2: refuses a missing or malformed build number, and a bundle step without signing', () => {
    for (const number of ['', 'abc', '0', '1.5', '007']) {
      const results = lane(['signing', 'bundle'], laneEnv({ RELEASE_BUILD_NUMBER: number }));
      assert.notEqual(results[1].status, 0, `'${number}'`);
    }
    run(['cleanup'], laneEnv());
    log && writeFileSync(log, '');
    const alone = run(['bundle'], laneEnv());
    assert.notEqual(alone.status, 0);
    assert.match(alone.stderr, /signing/);
    assert.ok(!calls().some((c) => c.startsWith('gradlew')));
  });

  it('E017 AC2: refuses a build number beyond what Google Play accepts as versionCode', () => {
    const results = lane(['signing', 'bundle'], laneEnv({ RELEASE_BUILD_NUMBER: '2100000001' }));
    assert.notEqual(results[1].status, 0);
  });

  it('E017 AC2: the keystore is gone after cleanup, also after a failed build; cleanup works when nothing was set up', () => {
    lane(['signing', 'bundle'], laneEnv({ FAKE_FAIL: 'gradlew' }));
    assert.ok(existsSync(keystorePath()), 'the keystore is there while the job runs');
    assert.equal(run(['cleanup'], laneEnv()).status, 0);
    assert.ok(!existsSync(keystorePath()));
    assert.equal(run(['cleanup'], laneEnv()).status, 0);
    // The bundle folder stays: the workflow uploads it after the build, and the signed bundle holds no secret.
  });

  it('E017 AC2: a failed signing step is cleaned up too', () => {
    lane(['signing'], laneEnv({ FAKE_FAIL: 'keytool' }));
    assert.equal(run(['cleanup'], laneEnv()).status, 0);
    assert.ok(!existsSync(keystorePath()));
  });
});

describe('E017 AC6: the R8 mapping to Sentry under the release name the app sends', () => {
  beforeEach(fakeTools);

  it('E017 AC6: with minification off (no mapping file) the step is skipped, says so, and needs no token', () => {
    const results = lane(['signing', 'bundle', 'symbols'], laneEnv({ SENTRY_AUTH_TOKEN: '' }));
    assert.deepEqual(statuses(results), [0, 0, 0], output(results));
    assert.match(results[2].stdout, /skipped/i);
    assert.match(results[2].stdout, /minif/i);
    assert.match(summary(), /skipped/i);
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });

  it('E017 AC6: with minification on, creates the release app.fivvi.pro@<version>+<build> and uploads the mapping to the android project', () => {
    const results = lane(['signing', 'bundle', 'symbols'], laneEnv({ FAKE_MINIFIED: '1' }));
    assert.deepEqual(statuses(results), [0, 0, 0], output(results));
    const cli = calls().filter((c) => c.startsWith('sentry-cli '));
    assert.equal(cli.length, 3);
    assert.match(
      cli[0],
      /^sentry-cli releases new .*--project android .*app\.fivvi\.pro@0\.1\.0\+107$/,
    );
    assert.match(
      cli[1],
      /^sentry-cli upload-proguard .*--project android .*app\/build\/outputs\/mapping\/release\/mapping\.txt$/,
    );
    assert.match(
      cli[2],
      /^sentry-cli releases finalize .*--project android .*app\.fivvi\.pro@0\.1\.0\+107$/,
    );
    assert.ok(calls().filter((c) => c === 'token-in-environment=yes').length >= 3);
    assert.ok(!calls().some((c) => c.includes(SECRET.sentryToken)), 'never on a command line');
  });

  it('E017 AC6: a mapping from an earlier build is not uploaded for this one', () => {
    mkdirSync(join(android, 'app/build/outputs/mapping/release'), { recursive: true });
    writeFileSync(join(android, 'app/build/outputs/mapping/release/mapping.txt'), 'old mapping');
    const results = lane(['signing', 'bundle', 'symbols']);
    assert.deepEqual(statuses(results), [0, 0, 0], output(results));
    assert.match(results[2].stdout, /skipped/i);
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });

  it('E017 AC6: with a mapping it needs the token and uploads nothing without it; a failed upload fails the lane', () => {
    const noToken = lane(
      ['signing', 'bundle', 'symbols'],
      laneEnv({ FAKE_MINIFIED: '1', SENTRY_AUTH_TOKEN: '' }),
    );
    assert.notEqual(noToken[2].status, 0);
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
    const failed = lane(
      ['signing', 'bundle', 'symbols'],
      laneEnv({ FAKE_MINIFIED: '1', FAKE_FAIL: 'sentry-cli-upload-proguard' }),
    );
    assert.notEqual(failed[2].status, 0);
  });

  it('E017 AC6: needs a bundle of this run first', () => {
    assert.notEqual(run(['symbols'], laneEnv())?.status, 0);
  });

  it('E017 AC6: uses the CLI named by SENTRY_CLI (the one pinned by pnpm-lock.yaml)', () => {
    fake('pinned-sentry', 'true');
    lane(
      ['signing', 'bundle', 'symbols'],
      laneEnv({ FAKE_MINIFIED: '1', SENTRY_CLI: join(bin, 'pinned-sentry') }),
    );
    assert.ok(calls().some((c) => c.startsWith('pinned-sentry upload-proguard')));
    assert.ok(!calls().some((c) => c.startsWith('sentry-cli ')));
  });

  it('E017 AC6: the release name is the one Observability.kt sends: <application ID>@<version>+<version code>', () => {
    const kotlin = readFileSync(
      join(ROOT, 'apps/android/app/src/main/kotlin/app/fivvi/pro/observability/Observability.kt'),
      'utf8',
    );
    assert.ok(
      kotlin.includes(
        'release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"',
      ),
    );
    const script = readFileSync(RELEASE_ANDROID, 'utf8');
    assert.match(script, /APPLICATION_ID=app\.fivvi\.pro/);
    assert.match(
      script,
      /release_name\(\) \{ echo "\$APPLICATION_ID@\$\(app_version\)\+\$\(build_number\)"; \}/,
    );
    const gradle = readFileSync(join(ROOT, 'apps/android/app/build.gradle.kts'), 'utf8');
    assert.match(gradle, /applicationId = "app\.fivvi\.pro"/);
  });
});

// --- Publishing to Play internal testing -----------------------------------------------------------------------------

/**
 * A fake Google Play Developer API and OAuth token endpoint. `handlers` replaces the answer to one step:
 * token, insert, upload, track, commit, delete (each `(request) => ({ status, body })`).
 */
const fakePlay = async (handlers = {}) => {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://localhost');
      const request = {
        method: req.method,
        path: url.pathname,
        query: url.search,
        headers: req.headers,
        body,
      };
      requests.push(request);
      const step = (() => {
        if (url.pathname === '/token') return 'token';
        if (/\/edits$/.test(url.pathname) && req.method === 'POST') return 'insert';
        if (/\/bundles$/.test(url.pathname)) return 'upload';
        if (/\/tracks\//.test(url.pathname)) return 'track';
        if (/:commit$/.test(url.pathname)) return 'commit';
        if (req.method === 'DELETE') return 'delete';
        return 'unknown';
      })();
      request.step = step;
      const defaults = {
        token: {
          status: 200,
          body: { access_token: 'fake-access-token-for-tests', expires_in: 3600 },
        },
        insert: { status: 200, body: { id: 'edit-1', expiryTimeSeconds: '9999999999' } },
        upload: { status: 200, body: { versionCode: 107, sha256: 'fake-sha' } },
        track: { status: 200, body: { track: 'internal' } },
        commit: { status: 200, body: { id: 'edit-1' } },
        delete: { status: 204, body: undefined },
        unknown: { status: 404, body: { error: { message: 'no such route' } } },
      };
      const answer = (handlers[step] ?? (() => defaults[step]))(request) ?? defaults[step];
      res.statusCode = answer.status;
      res.setHeader('content-type', 'application/json');
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    requests,
    env: { PLAY_API_BASE: origin, PLAY_TOKEN_URL: `${origin}/token` },
    steps: () => requests.map((r) => r.step),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

/** Runs the lane up to `publish` with the Play API of `play`. */
const publish = async (play, overrides = {}) => {
  const env = laneEnv({
    ...play.env,
    PLAY_SERVICE_ACCOUNT_JSON: SECRET.serviceAccount,
    ...overrides,
  });
  const before = lane(['signing', 'bundle'], env);
  assert.deepEqual(statuses(before), [0, 0], output(before));
  const result = await runAsync(['publish'], env);
  return { ...result, all: output(before) + result.stdout + result.stderr };
};

const assertNoSecret = (text, context) => {
  for (const value of secretValues()) {
    assert.ok(!text.includes(value), `${context} printed: ${value.slice(0, 12)}…`);
  }
  assert.ok(!text.includes('fake-access-token-for-tests'), `${context} printed the access token`);
};

describe('E017 AC2: publishes the bundle to the Play internal testing track', () => {
  beforeEach(fakeTools);

  it('E017 AC2: gets a token with the service account, uploads the bundle, sets the internal track to it and commits', async () => {
    const play = await fakePlay();
    try {
      const result = await publish(play);
      assert.equal(result.status, 0, result.all);
      assert.deepEqual(play.steps(), ['token', 'insert', 'upload', 'track', 'commit']);

      const [token, insert, upload, track, commit] = play.requests;
      // The token request carries a JWT signed with the service account's key, for the publisher scope.
      const form = new URLSearchParams(token.body.toString());
      assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [header, claims, signature] = form.get('assertion').split('.');
      assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
      const payload = JSON.parse(Buffer.from(claims, 'base64url'));
      assert.equal(payload.iss, 'release-bot@example.com');
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/androidpublisher');
      assert.equal(payload.aud, play.env.PLAY_TOKEN_URL);
      assert.ok(payload.exp - payload.iat <= 3600);
      assert.ok(
        verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${claims}`),
          publicKey,
          Buffer.from(signature, 'base64url'),
        ),
        'signed with the service account key',
      );

      const app = '/androidpublisher/v3/applications/app.fivvi.pro';
      assert.equal(insert.path, `${app}/edits`);
      assert.equal(upload.path, `/upload${app}/edits/edit-1/bundles`);
      assert.match(upload.query, /uploadType=media/);
      assert.equal(upload.body.toString(), BUNDLE_BYTES, 'the bundle of this run, byte for byte');
      assert.equal(track.method, 'PUT');
      assert.equal(track.path, `${app}/edits/edit-1/tracks/internal`);
      const release = JSON.parse(track.body.toString());
      assert.equal(release.track, 'internal');
      assert.deepEqual(release.releases.length, 1);
      assert.deepEqual(release.releases[0].versionCodes, ['107']);
      assert.equal(release.releases[0].status, 'completed');
      assert.equal(commit.path, `${app}/edits/edit-1:commit`);
      for (const request of [insert, upload, track, commit])
        assert.equal(request.headers.authorization, 'Bearer fake-access-token-for-tests');
      assertNoSecret(result.all, 'publish');
      assert.match(summary(), /internal/i);
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: publishes nothing when the service account secret is missing, invalid or incomplete', async () => {
    const play = await fakePlay();
    try {
      const incomplete = JSON.stringify({
        type: 'service_account',
        client_email: 'release-bot@example.com',
      });
      for (const value of ['', 'not json at all', '[]', incomplete]) {
        const result = await publish(play, { PLAY_SERVICE_ACCOUNT_JSON: value });
        assert.notEqual(result.status, 0, `'${value.slice(0, 20)}'`);
        assert.match(result.stderr, /PLAY_SERVICE_ACCOUNT_JSON/);
        assertNoSecret(result.all, 'publish');
      }
      assert.deepEqual(play.steps(), [], 'the API was never called');
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: publishes nothing without a bundle of this run, or for another build number', async () => {
    const play = await fakePlay();
    try {
      const env = laneEnv({ ...play.env, PLAY_SERVICE_ACCOUNT_JSON: SECRET.serviceAccount });
      const noBundle = await runAsync(['publish'], env);
      assert.notEqual(noBundle.status, 0);
      assert.match(noBundle.stderr, /bundle/);
      lane(['signing', 'bundle'], env);
      for (const number of ['', 'abc', '108']) {
        const result = await runAsync(['publish'], { ...env, RELEASE_BUILD_NUMBER: number });
        assert.notEqual(result.status, 0, `'${number}'`);
      }
      assert.deepEqual(play.steps(), []);
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: stops when the token is refused, and does not print the account', async () => {
    const play = await fakePlay({
      token: () => ({
        status: 401,
        body: { error: 'invalid_grant', error_description: 'Invalid JWT' },
      }),
    });
    try {
      const result = await publish(play);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /401|invalid_grant/);
      assert.deepEqual(play.steps(), ['token']);
      assertNoSecret(result.all, 'a refused token');
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: says that the first bundle goes up by hand when Google refuses the app, and publishes nothing', async () => {
    const play = await fakePlay({
      upload: () => ({
        status: 404,
        body: { error: { message: 'Package not found: app.fivvi.pro' } },
      }),
    });
    try {
      const result = await publish(play);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /404/);
      assert.match(result.stderr, /by hand|manual/i);
      assert.ok(!play.steps().includes('track') && !play.steps().includes('commit'));
      assertNoSecret(result.all, 'a refused upload');
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: a 403 on the upload points at missing rights or an unfinished app setup, not at the first release', async () => {
    const play = await fakePlay({
      upload: () => ({
        status: 403,
        body: { error: { message: 'The caller does not have permission' } },
      }),
    });
    try {
      const result = await publish(play);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /403/);
      assert.match(result.stderr, /rights/i);
      assert.doesNotMatch(result.stderr, /by hand|first release/i);
      assert.deepEqual(play.steps(), ['token', 'insert', 'upload', 'delete']);
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: stops when Play opens no edit, and calls nothing on an edit that does not exist', async () => {
    const play = await fakePlay({ insert: () => ({ status: 200, body: {} }) });
    try {
      const result = await publish(play);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /no edit/i);
      assert.deepEqual(play.steps(), ['token', 'insert']);
      assert.ok(!play.requests.some((r) => r.path.includes('undefined')));
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: does not release a bundle whose version code is not the build number of the run; the edit is discarded', async () => {
    const play = await fakePlay({ upload: () => ({ status: 200, body: { versionCode: 106 } }) });
    try {
      const result = await publish(play);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /106/);
      assert.match(result.stderr, /107/);
      assert.deepEqual(play.steps(), ['token', 'insert', 'upload', 'delete']);
    } finally {
      await play.close();
    }
  });

  it('E017 AC2: a refused track update or commit fails the lane, and the edit is discarded', async () => {
    for (const [step, expected] of [
      ['track', ['token', 'insert', 'upload', 'track', 'delete']],
      ['commit', ['token', 'insert', 'upload', 'track', 'commit', 'delete']],
    ]) {
      const play = await fakePlay({
        [step]: () => ({
          status: 403,
          body: { error: { message: 'The caller does not have permission' } },
        }),
      });
      try {
        const result = await publish(play);
        assert.notEqual(result.status, 0, step);
        assert.match(result.stderr, /403/);
        assert.deepEqual(play.steps(), expected, step);
        assertNoSecret(result.all, step);
      } finally {
        await play.close();
      }
    }
  });

  it('E017 AC2: asks for the internal track only: no argument or variable names another track', () => {
    const script = readFileSync(PLAY_PUBLISH, 'utf8');
    assert.match(script, /tracks\/internal/);
    assert.ok(!/process\.env\.\w*TRACK/.test(script));
    const shell = readFileSync(RELEASE_ANDROID, 'utf8');
    assert.ok(!/\bTRACK|--track|\b(production|beta|alpha)\b/.test(shell.replace(/^#.*$/gm, '')));
  });

  it('E017 AC2: the publisher is a script with no dependency: no fastlane, no Gradle Play plugin, nothing new to pin', () => {
    const script = readFileSync(PLAY_PUBLISH, 'utf8');
    const imports = [...script.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.ok(
      imports.length > 0 && imports.every((name) => name.startsWith('node:')),
      imports.join(', '),
    );
    const gradle = readFileSync(join(ROOT, 'apps/android/gradle/libs.versions.toml'), 'utf8');
    assert.ok(!/triplet|play-publisher|fastlane/i.test(gradle));
  });
});

describe('E017 AC7: no step echoes a secret', () => {
  beforeEach(fakeTools);

  it('E017 AC7: nothing the lane prints holds a secret, in any form', async () => {
    const play = await fakePlay();
    try {
      const env = laneEnv({
        ...play.env,
        PLAY_SERVICE_ACCOUNT_JSON: SECRET.serviceAccount,
        FAKE_MINIFIED: '1',
      });
      const results = lane(['sdk', 'signing', 'bundle', 'symbols'], env);
      const published = await runAsync(['publish'], env);
      const cleaned = run(['cleanup'], env);
      assert.deepEqual(statuses(results), [0, 0, 0, 0], output(results));
      assert.equal(published.status, 0, published.stderr);
      assert.equal(cleaned.status, 0, cleaned.stderr);
      assertNoSecret(
        output(results) + published.stdout + published.stderr + output([cleaned]),
        'lane',
      );
    } finally {
      await play.close();
    }
  });

  it('E017 AC7: a failing step does not print a secret either', () => {
    for (const fail of [
      'keytool',
      'gradlew',
      'sentry-cli-releases',
      'sentry-cli-upload-proguard',
    ]) {
      const results = lane(
        ['signing', 'bundle', 'symbols'],
        laneEnv({ FAKE_FAIL: fail, FAKE_MINIFIED: '1' }),
      );
      assertNoSecret(output(results), fail);
    }
  });

  it('E017 AC7: the scripts never trace commands', () => {
    for (const script of ['release-android.sh', 'play-publish.mjs']) {
      const text = readFileSync(join(ROOT, 'scripts', script), 'utf8');
      assert.ok(!/set -[a-z]*x|set -o xtrace|bash -x/.test(text), script);
    }
  });
});

// --- The workflow ---------------------------------------------------------------------------------------------------------

const WORKFLOWS = join(ROOT, '.github/workflows');
const workflow = readFileSync(join(WORKFLOWS, 'release.yml'), 'utf8');
const jobs = () => {
  const section = workflow.slice(workflow.indexOf('\njobs:\n') + 7);
  const parts = section.split(/^ {2}([a-z][a-z0-9-]*):$/m);
  const result = {};
  for (let i = 1; i < parts.length; i += 2) result[parts[i]] = parts[i + 1];
  return result;
};
const steps = (job) =>
  job
    .split(/^ {6}- /m)
    .slice(1)
    .map((text) => ({ name: text.match(/name: (.+)/)?.[1] ?? text.split('\n')[0], text }));
const ANDROID_SECRETS = [
  'ANDROID_UPLOAD_KEYSTORE',
  'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
  'ANDROID_UPLOAD_KEY_ALIAS',
  'ANDROID_UPLOAD_KEY_PASSWORD',
  'PLAY_SERVICE_ACCOUNT_JSON',
  'SENTRY_AUTH_TOKEN',
];

describe('E017 AC2: the Android job of the release workflow', () => {
  it('E017 AC2: runs on a GitHub-hosted Linux runner in the release environment, after the same gate as the iOS job', () => {
    const { android, ios, prepare } = jobs();
    assert.ok(android, 'an `android` job');
    assert.match(android, /^ {4}environment: release$/m);
    assert.match(android, /^ {4}runs-on: ubuntu-\d+\.\d+$/m);
    assert.ok(!/self-hosted/.test(workflow));
    // One gate for both platforms: the same jobs, not a copy of them in this job.
    const needs = (job) => job.match(/^ {4}needs: (.+)$/m)?.[1];
    assert.equal(needs(android), '[prepare, ios-tests, android-tests]');
    assert.equal(needs(android), needs(ios));
    assert.match(android, /^ {4}if: inputs\.android$/m);
    assert.ok(!/release\.sh tests/.test(android), 'the suites run once, in the test jobs');
    assert.equal(
      workflow.match(/scripts\/release\.sh tests /g).length,
      2,
      'ios and android, once each',
    );
    assert.ok(!/^ {4}if: .*(always|failure|cancelled)\(\)/m.test(android));
    assert.ok(!/continue-on-error/.test(android));
    // The guard is the first step after the checkout, before any step that reads a secret.
    const all = steps(android);
    const guard = all.findIndex((step) => step.text.includes('scripts/release.sh guard'));
    assert.ok(guard > 0);
    assert.ok(all.slice(0, guard).every((step) => step.text.includes('actions/checkout')));
    assert.ok(all.findIndex((step) => step.text.includes('secrets.')) > guard);
    assert.match(
      android,
      /RELEASE_BUILD_NUMBER: \$\{\{ needs\.prepare\.outputs\.build-number \}\}/,
    );
    assert.ok(prepare.includes('build-number'));
    assert.ok(
      !/build-number|run_number|versionCode/.test(android.replace(/RELEASE_BUILD_NUMBER: .*/, '')),
      'the number is the run`s, computed once by prepare',
    );
  });

  it('E017 AC2: can be left out of a run, or built without publishing, by the inputs of the run', () => {
    const inputs = workflow.slice(workflow.indexOf('inputs:'), workflow.indexOf('\n# One run'));
    assert.match(inputs, /^ {6}android:\n(?: {8}.+\n)*? {8}default: true$/m);
    assert.match(inputs, /^ {6}publish-android:\n(?: {8}.+\n)*? {8}default: true$/m);
    assert.match(inputs, /type: boolean/);
    const publish = steps(jobs().android).find(
      (step) => step.name === 'Publish to Play internal testing',
    );
    assert.ok(publish);
    assert.match(publish.text, /if: inputs\.publish-android/);
    assert.match(publish.text, /run: scripts\/release-android\.sh publish/);
  });

  it('E017 AC2: runs the steps in order: sdk, signing, bundle, artifact, mapping, publish; the keystore is removed whatever failed', () => {
    const all = steps(jobs().android);
    const names = all.map((step) => step.name);
    const order = [
      'Refuse a run outside main',
      'Install the Android SDK packages',
      'Install the upload keystore',
      'Build the signed App Bundle',
      'Upload the App Bundle',
      'Upload the R8 mapping to Sentry',
      'Publish to Play internal testing',
      'Delete the keystore',
    ].map((name) => names.indexOf(name));
    assert.ok(
      order.every((index) => index >= 0),
      names.join(', '),
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    const cleanup = all.at(-1);
    assert.match(cleanup.text, /if: always\(\)\n\s+run: scripts\/release-android\.sh cleanup/);
    assert.deepEqual(
      all
        .filter((step) => /if: .*(always|failure|cancelled)\(\)/.test(step.text))
        .map((s) => s.name),
      ['Delete the keystore'],
    );
    // Java 21, as the tests job; the Gradle cache is read, never written, in the job that holds the signing key.
    assert.match(jobs().android, /actions\/setup-java@/);
    assert.match(jobs().android, /gradle\/actions\/setup-gradle@[\s\S]*?cache-read-only: true/);
    assert.ok(!/actions\/cache(\/save)?@/.test(jobs().android));
  });

  it('E017 AC2: the bundle is an artifact of the run, alone in its folder, without the keystore or any secret', () => {
    const upload = steps(jobs().android).find((step) => step.name === 'Upload the App Bundle');
    assert.match(upload.text, /uses: actions\/upload-artifact@[0-9a-f]{40} # v/);
    assert.match(upload.text, /name: android-app-bundle/);
    assert.match(
      upload.text,
      /path: \$\{\{ runner\.temp \}\}\/fivvi-release-android\/bundle\/\*\.aab/,
    );
    assert.match(upload.text, /if-no-files-found: error/);
    assert.match(upload.text, /retention-days: \d+/);
    assert.ok(!upload.text.includes('secrets.'));
    assert.ok(!/upload\.jks|\.jks|\.keystore|state\.env/.test(upload.text));
    assert.match(
      readFileSync(RELEASE_ANDROID, 'utf8'),
      /\$\{RUNNER_TEMP:-.*\}\/fivvi-release-android\}"/,
    );
    // The folder the artifact is taken from is the one the script fills with the bundle alone (tested above).
    const script = readFileSync(RELEASE_ANDROID, 'utf8');
    assert.match(script, /BUNDLE_DIR="\$WORK\/bundle"/);
  });

  it('E017 AC6: sentry-cli is the one pinned by pnpm-lock.yaml, installed without any secret in the environment', () => {
    const { android } = jobs();
    assert.match(
      android,
      /SENTRY_CLI: \$\{\{ github\.workspace \}\}\/packages\/observability\/node_modules\/\.bin\/sentry-cli/,
    );
    const install = steps(android).find((step) => step.name === 'Install the pinned sentry-cli');
    assert.match(
      install.text,
      /pnpm install --frozen-lockfile --filter @fivvi\/observability\.\.\./,
    );
    assert.ok(!install.text.includes('secrets.'));
  });
});

describe('E017 AC7: the Android secrets stay in the release job', () => {
  it('E017 AC7: only the Android release job reads them, each in the step that needs it, as an env entry', () => {
    const { android, prepare, 'ios-tests': iosTests, 'android-tests': androidTests } = jobs();
    for (const job of [prepare, iosTests, androidTests]) assert.ok(!job.includes('secrets.'));
    const readers = Object.fromEntries(
      steps(android)
        .filter((step) => step.text.includes('secrets.'))
        .map((step) => [
          step.name,
          [...step.text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]),
        ]),
    );
    assert.deepEqual(readers, {
      'Install the upload keystore': [
        'ANDROID_UPLOAD_KEYSTORE',
        'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
        'ANDROID_UPLOAD_KEY_ALIAS',
        'ANDROID_UPLOAD_KEY_PASSWORD',
      ],
      'Build the signed App Bundle': [
        'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
        'ANDROID_UPLOAD_KEY_ALIAS',
        'ANDROID_UPLOAD_KEY_PASSWORD',
      ],
      'Upload the R8 mapping to Sentry': ['SENTRY_AUTH_TOKEN'],
      'Publish to Play internal testing': ['PLAY_SERVICE_ACCOUNT_JSON'],
    });
    const used = [...android.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(used)].sort(), [...ANDROID_SECRETS].sort());
    for (const line of android
      .split('\n')
      .filter((l) => !/^\s*#/.test(l) && l.includes('secrets.'))) {
      assert.match(
        line,
        /^ {10}([A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}$/,
        `an env entry of one step: ${line}`,
      );
    }
  });

  it('E017 AC7: every secret the lane reads is one release-secrets.sh sets', () => {
    const script = readFileSync(join(ROOT, 'scripts/release-secrets.sh'), 'utf8');
    for (const name of ANDROID_SECRETS) assert.ok(script.includes(`${name} `), name);
  });

  it('E017 AC7: no step prints a secret, and no other workflow mentions one', () => {
    const runs = [...jobs().android.matchAll(/^ +run: (?:\|\n((?: {10}.*\n?)+)|(.+))$/gm)].map(
      (m) => m[1] ?? m[2],
    );
    assert.ok(runs.length >= 5);
    for (const text of runs) {
      assert.ok(!/secrets\./.test(text));
      assert.ok(!/\b(echo|printf|cat)\b.*\$\{?(ANDROID_|PLAY_|SENTRY_AUTH)/.test(text), text);
      assert.ok(!/set -[a-z]*x|xtrace/.test(text), text);
    }
    for (const file of readdirSync(WORKFLOWS).filter(
      (f) => /\.ya?ml$/.test(f) && f !== 'release.yml',
    )) {
      const text = readFileSync(join(WORKFLOWS, file), 'utf8');
      for (const name of ANDROID_SECRETS.filter((n) => n !== 'SENTRY_AUTH_TOKEN'))
        assert.ok(!text.includes(name), `${file} mentions ${name}`);
    }
  });
});
