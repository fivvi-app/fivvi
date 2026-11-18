import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { filesUnder, readRecorder, UNCOVERED_MESSAGE, uncovered } from './turbo-inputs.mjs';

// E017 AC8 and E002 #242: the application ID of each native app is final (it can't change after the first upload),
// and the app's README records it. That is checked here, on Linux, not by the native builds: CI doesn't run the
// native jobs for a README-only change (scripts/native-jobs.sh), so no native build or test may read a README.

const ROOT = join(import.meta.dirname, '..', '..');
// The native and Maestro files this test reads: turbo caches `//#test:root` by its `inputs`, so each must be one of
// them (last test).
const { reads: nativeReads, note } = readRecorder('apps/android/', 'apps/ios/', 'e2e/maestro/');
const read = (path) => readFileSync(note(join(ROOT, path)), 'utf8');

/** The ID a README records as final: "bundle ID `app.x` (final" (iOS) or "application ID `app.x` (final" (Android). */
const recordedId = (readme, kind) =>
  readme.match(new RegExp(`${kind} ID \`([^\`]+)\` \\(final`))?.[1];

/** The IDs of the app target in project.pbxproj, one per configuration (the test targets' end in .tests, .uitests). */
const iosProjectIds = (pbxproj) =>
  [...pbxproj.matchAll(/^\s*PRODUCT_BUNDLE_IDENTIFIER = ([^;\s]+);/gm)]
    .map((match) => match[1])
    .filter((id) => !/\.(tests|uitests)$/.test(id));

const androidProjectId = (gradle) => gradle.match(/^\s*applicationId = "([^"]+)"/m)?.[1];

/** What disagrees: the README records no ID, or the project doesn't use the ID the README records. */
const iosProblems = (readme, pbxproj) => {
  const recorded = recordedId(readme, 'bundle');
  const ids = iosProjectIds(pbxproj);
  if (!recorded) return ['apps/ios/README.md records no final bundle ID'];
  if (ids.length < 2)
    return [`apps/ios project.pbxproj has ${ids.length} app bundle IDs, not Debug and Release`];
  return ids
    .filter((id) => id !== recorded)
    .map((id) => `bundle ID '${id}' is not the recorded '${recorded}'`);
};
const androidProblems = (readme, gradle) => {
  const recorded = recordedId(readme, 'application');
  const id = androidProjectId(gradle);
  if (!recorded) return ['apps/android/README.md records no final application ID'];
  return id === recorded ? [] : [`application ID '${id}' is not the recorded '${recorded}'`];
};

describe('E017 AC8: the project uses the final ID its README records', () => {
  const iosReadme = read('apps/ios/README.md');
  const pbxproj = read('apps/ios/FivviPro.xcodeproj/project.pbxproj');
  const androidReadme = read('apps/android/README.md');
  const gradle = read('apps/android/app/build.gradle.kts');

  it('iOS: every configuration of the app uses the bundle ID of apps/ios/README.md', () => {
    assert.deepEqual(iosProblems(iosReadme, pbxproj), []);
  });

  it('iOS: no xcconfig overrides the bundle ID of the project', () => {
    const configs = readdirSync(join(ROOT, 'apps/ios/Config'))
      .filter((file) => file.endsWith('.xcconfig'))
      .map((file) => `apps/ios/Config/${file}`);
    assert.ok(configs.length > 0);
    // Debug.xcconfig and Release.xcconfig #include apps/Version.xcconfig, so it is part of what they resolve.
    for (const file of [...configs, 'apps/Version.xcconfig']) {
      assert.doesNotMatch(read(file), /PRODUCT_BUNDLE_IDENTIFIER/, file);
    }
  });

  it('iOS: fails when the README records another ID, or none', () => {
    assert.deepEqual(
      iosProblems(
        iosReadme.replace('bundle ID `app.fivvi.pro` (final', 'bundle ID `app.other` (final'),
        pbxproj,
      ),
      [
        "bundle ID 'app.fivvi.pro' is not the recorded 'app.other'",
        "bundle ID 'app.fivvi.pro' is not the recorded 'app.other'",
      ],
    );
    assert.deepEqual(
      iosProblems(
        iosReadme.replace(
          'bundle ID `app.fivvi.pro` (final',
          'bundle ID `app.fivvi.pro` (provisional',
        ),
        pbxproj,
      ),
      ['apps/ios/README.md records no final bundle ID'],
    );
  });

  it('iOS: fails when one configuration of the app uses another ID', () => {
    const changed = pbxproj.replace(
      'PRODUCT_BUNDLE_IDENTIFIER = app.fivvi.pro;',
      'PRODUCT_BUNDLE_IDENTIFIER = app.other;',
    );
    assert.deepEqual(iosProblems(iosReadme, changed), [
      "bundle ID 'app.other' is not the recorded 'app.fivvi.pro'",
    ]);
  });

  it('Android: the application ID of build.gradle.kts is the one of apps/android/README.md', () => {
    assert.deepEqual(androidProblems(androidReadme, gradle), []);
  });

  it('Android: fails when the README records another ID, or none', () => {
    assert.deepEqual(
      androidProblems(
        androidReadme.replace(
          'application ID `app.fivvi.pro` (final',
          'application ID `app.other` (final',
        ),
        gradle,
      ),
      ["application ID 'app.fivvi.pro' is not the recorded 'app.other'"],
    );
    assert.deepEqual(
      androidProblems(
        androidReadme.replace(
          'application ID `app.fivvi.pro` (final',
          'application ID `app.fivvi.pro` (provisional',
        ),
        gradle,
      ),
      ['apps/android/README.md records no final application ID'],
    );
  });

  it('Android: fails when build.gradle.kts uses another ID', () => {
    assert.deepEqual(
      androidProblems(
        androidReadme,
        gradle.replace('applicationId = "app.fivvi.pro"', 'applicationId = "app.other"'),
      ),
      ["application ID 'app.other' is not the recorded 'app.fivvi.pro'"],
    );
  });
});

// E017 #504 (AC4 of #469): Fivvi, the client app, is a second application module beside Fivvi Pro, with the application ID
// `app.fivvi` that the README records as final, and both are built on the same shared modules.
describe('E017 #504 AC4: two Android apps, distinct IDs, shared generated sources', () => {
  const clientGradle = read('apps/android/client/build.gradle.kts');
  const proGradle = read('apps/android/app/build.gradle.kts');
  const readme = read('apps/android/README.md');
  const recordedClientId = (text) => text.match(/client app's own ID, `([^`]+)` \(final/)?.[1];
  const clientProblems = (text, gradle) => {
    const recorded = recordedClientId(text);
    if (!recorded)
      return ['apps/android/README.md records no final application ID of the client app'];
    const id = androidProjectId(gradle);
    return id === recorded ? [] : [`application ID '${id}' is not the recorded '${recorded}'`];
  };

  it('the client app uses the application ID its README records, and it is not the one of Fivvi Pro', () => {
    assert.deepEqual(clientProblems(readme, clientGradle), []);
    assert.equal(androidProjectId(clientGradle), 'app.fivvi');
    assert.equal(androidProjectId(proGradle), 'app.fivvi.pro');
  });

  it('fails when the README records another client ID, or none', () => {
    assert.deepEqual(
      clientProblems(
        readme.replace(
          "client app's own ID, `app.fivvi` (final",
          "client app's own ID, `app.other` (final",
        ),
        clientGradle,
      ),
      ["application ID 'app.fivvi' is not the recorded 'app.other'"],
    );
    assert.deepEqual(
      clientProblems(
        readme.replace(
          "client app's own ID, `app.fivvi` (final",
          "client app's own ID, `app.fivvi` (provisional",
        ),
        clientGradle,
      ),
      ['apps/android/README.md records no final application ID of the client app'],
    );
  });

  it('both apps are built on :core, and neither copies the generated client, strings or tokens', () => {
    for (const gradle of [clientGradle, proGradle]) {
      assert.match(gradle, /implementation\(project\(":core"\)\)/);
      const code = gradle
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');
      assert.doesNotMatch(code, /packages\/(i18n|contract|design-tokens)/);
    }
    assert.match(read('apps/android/settings.gradle.kts'), /include\(":app", ":client", ":core"/);
  });

  it('pnpm test:android runs the unit and the Compose UI tests of every module, and the build number check of both apps', () => {
    const script = read('scripts/android.sh');
    // gradle_tests and gradle_connected (scripts/_android.sh, E002 #1363) are gradle with the quarantine list applied.
    const helpers = read('scripts/_android.sh');
    // An unqualified task runs in every module that has it, so a module added later is covered; a task of :app or :client
    // alone would leave the other app out.
    const gradleLines = (text) =>
      text.split('\n').filter((line) => /^\s*gradle(_tests|_connected)?\b/.test(line));
    const unqualified = (lines, task) =>
      lines.filter((line) => new RegExp(`(^|\\s)${task}(\\s|$)`).test(line.trim()));
    assert.equal(
      unqualified(gradleLines(script), 'testDebugUnitTest').length,
      3,
      'test, verify and quarantine run testDebugUnitTest',
    );
    // The two ways gradle_connected runs it, with and without the quarantine filter; neither names a module.
    assert.equal(unqualified(gradleLines(helpers), 'connectedDebugAndroidTest').length, 2);
    assert.doesNotMatch(`${script}${helpers}`, /:(app|client):connectedDebugAndroidTest/);
    assert.match(script, /^ {2}gradle_connected$/m);
    assert.match(script, /--tests app\.fivvi\.pro\.BuildInfoTest/);
    assert.match(script, /:client:testDebugUnitTest --tests app\.fivvi\.client\.BuildInfoTest/);
  });
});

// E002 #1442: the Compose UI tests ran past the 25-minute step limit of "Android tests" on a slow runner, with no test
// failing. The step was slow, not hung (:app's 436 tests take 13 to 17 minutes on the two-core runner, :client's 85 about
// 2.5), so the step has room now; and a test that does hang fails by name, after UI_TEST_TIMEOUT_MS, instead of
// running out the step.
describe('E002 #1442: the Compose UI tests fail fast on a hung test and fit their step', () => {
  const SCRIPTS = join(ROOT, 'scripts');
  /** Runs a bash snippet with _android.sh sourced, `gradle` printing its arguments and `adb` a fixed logcat. */
  const run = (snippet, env = {}) =>
    spawnSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_android.sh"
gradle() { printf 'gradle %s\\n' "$*"; }
adb() { printf '%s\\n' "$FAKE_LOGCAT"; }
${snippet}`,
      ],
      { encoding: 'utf8', env: { ...process.env, ...env } },
    );
  const TIMEOUT_ARGUMENT = '-Pandroid.testInstrumentationRunnerArguments.timeout_msec';

  it('every connected run gives each test 120 s, and UI_TEST_TIMEOUT_MS changes it', () => {
    const plain = run('quarantine_android() { echo; }; gradle_connected');
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(
      plain.stdout.trim(),
      `gradle connectedDebugAndroidTest ${TIMEOUT_ARGUMENT}=120000`,
    );
    const changed = run('quarantine_android() { echo; }; gradle_connected', {
      UI_TEST_TIMEOUT_MS: '5000',
    });
    assert.match(changed.stdout, new RegExp(`${TIMEOUT_ARGUMENT}=5000\\b`));
  });

  it('the run with a quarantine list keeps its filter arguments next to the timeout', () => {
    const result = run('quarantine_android() { echo app.fivvi.pro.X#y; }; gradle_connected');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${TIMEOUT_ARGUMENT}=120000`));
    assert.match(result.stdout, /quarantineTests=app\.fivvi\.pro\.X#y/);
    assert.match(result.stdout, /filter=app\.fivvi\.core\.quarantine\.QuarantineRunFilter/);
  });

  it('last-test names the tests the instrumentation started last, from the device log', () => {
    const logcat = [
      'I/TestRunner( 1): started: a(app.fivvi.pro.A)',
      'I/TestRunner( 1): finished: a(app.fivvi.pro.A)',
      'I/Other( 2): noise',
      'I/TestRunner( 1): started: hung(app.fivvi.pro.Hung)',
    ].join('\n');
    const result = run('last_ui_tests', { FAKE_LOGCAT: logcat });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /started: hung\(app\.fivvi\.pro\.Hung\)/);
    assert.doesNotMatch(result.stdout, /noise/);
    // Said plainly when the device has no such line (a run that never started a test).
    const none = run('last_ui_tests', { FAKE_LOGCAT: 'I/Other( 2): noise' });
    assert.equal(none.status, 0, none.stderr);
    assert.match(none.stdout, /no test started/i);
  });

  it('a failed connected run names the tests that failed and the one that started last, in the step log', () => {
    // AGP's own output says only "There were failing tests" and points to a report.
    const logcat = [
      'E/TestRunner( 1): failed: bad(app.fivvi.pro.Bad)',
      'I/TestRunner( 1): finished: bad(app.fivvi.pro.Bad)',
      'I/TestRunner( 1): started: hung(app.fivvi.pro.Hung)',
    ].join('\n');
    const result = run('gradle() { return 1; }; quarantine_android() { echo; }; gradle_connected', {
      FAKE_LOGCAT: logcat,
    });
    assert.equal(result.status, 1, 'the exit status of the failed run is kept');
    assert.match(result.stdout, /failed: bad\(app\.fivvi\.pro\.Bad\)/);
    assert.match(result.stdout, /started: hung\(app\.fivvi\.pro\.Hung\)/);
  });

  it('android.sh has the last-test command', () => {
    const script = read('scripts/android.sh');
    assert.match(script, /^ {2}last-test\) shift; cmd_last_test "\$@" ;;$/m);
  });

  describe('ci.yml: Android tests', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const job = ci.slice(ci.indexOf('\n  android-tests:\n'), ci.indexOf('\n  android-maestro:\n'));
    // The first timeout-minutes of a job is the job's own, of a step the step's.
    const minutes = (text) => Number(text.match(/^ {4,8}timeout-minutes: (\d+)$/m)[1]);
    const step = (name) => {
      const at = job.indexOf(`- name: ${name}\n`);
      assert.ok(at >= 0, `the job has the step ${name}`);
      const rest = job.slice(at + 1);
      const next = rest.search(/\n {6}(- |# )/);
      return rest.slice(0, next < 0 ? undefined : next);
    };

    it('the verify step has 1.5 times the longest run measured, with its job around it', () => {
      // Measured on 25 runs of 16 to 17 November: the step took 1033 to 1466 s when it passed, and the three runs that
      // ran out of 1500 s were 10 to 50 s from the end (:client's 2.5 minutes came last). So 40 minutes is 1.6 times
      // the slowest of those runs (1513 s counted whole), and the job holds the setup (up to 3 minutes), the step and
      // 2 minutes of post steps.
      const verify = step('Unit tests, release bundle and Compose UI tests');
      assert.match(verify, /run: scripts\/android\.sh verify\n/);
      assert.ok(minutes(verify) * 60 >= 1.5 * 1513, `${minutes(verify)} minutes`);
      assert.ok(3 + minutes(verify) + 2 <= minutes(job), 'job room');
    });

    it('prints the test that ran last when a step fails or times out, before the emulator stops', () => {
      const last = step('The Compose UI test that ran last');
      assert.match(last, /run: scripts\/android\.sh last-test\n/);
      assert.match(last, /^ {8}if: failure\(\)$/m);
      assert.ok(
        job.indexOf('- name: The Compose UI test that ran last') <
          job.indexOf('- name: Stop the emulator'),
        'before the emulator is stopped, which clears its log',
      );
    });
  });
});

/** The deployment targets a project.pbxproj sets, one per build configuration that sets one. */
const deploymentTargets = (pbxproj) =>
  [...pbxproj.matchAll(/^\s*IPHONEOS_DEPLOYMENT_TARGET = ([^;\s]+);/gm)].map((match) => match[1]);

/** What disagrees with iOS 26 and Liquid Glass as the system draws them (ADR-029). */
const iosTargetProblems = (name, pbxproj) => {
  const targets = deploymentTargets(pbxproj);
  const problems = targets
    .filter((target) => target !== '26.0')
    .map((t) => `${name} targets iOS ${t}, not 26.0`);
  if (targets.length === 0) problems.push(`${name} sets no IPHONEOS_DEPLOYMENT_TARGET`);
  if (/UIDesignRequiresCompatibility/.test(pbxproj))
    problems.push(`${name} sets UIDesignRequiresCompatibility, which opts out of Liquid Glass`);
  return problems;
};

describe('E020 AC7: every iOS app targets iOS 26.0 and none opts out of Liquid Glass', () => {
  const projects = readdirSync(join(ROOT, 'apps/ios')).filter((name) =>
    name.endsWith('.xcodeproj'),
  );
  const pbxprojOf = (project) => read(`apps/ios/${project}/project.pbxproj`);

  it('finds the iOS projects', () => {
    assert.ok(projects.includes('FivviPro.xcodeproj'));
  });

  it('every project sets 26.0 and no compatibility flag', () => {
    for (const project of projects)
      assert.deepEqual(iosTargetProblems(project, pbxprojOf(project)), []);
  });

  it('no Info.plist or xcconfig of the app sets the compatibility flag', () => {
    const configs = readdirSync(join(ROOT, 'apps/ios/Config')).filter((file) =>
      /\.(plist|xcconfig)$/.test(file),
    );
    assert.ok(configs.length > 0);
    for (const file of configs)
      assert.doesNotMatch(read(`apps/ios/Config/${file}`), /UIDesignRequiresCompatibility/, file);
  });

  it('E017 #500: the local shared packages (apps/ios/Packages) target iOS 26 like the apps', () => {
    const packages = readdirSync(join(ROOT, 'apps/ios/Packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    assert.ok(packages.includes('FivviShared'));
    for (const name of packages)
      assert.match(
        read(`apps/ios/Packages/${name}/Package.swift`),
        /platforms: \[\.iOS\(\.v26\)\]/,
        `${name} must set platforms: [.iOS(.v26)]`,
      );
  });

  it('fails on another deployment target, on none, and on the compatibility flag', () => {
    const pbxproj = pbxprojOf('FivviPro.xcodeproj');
    assert.deepEqual(
      iosTargetProblems(
        'App',
        pbxproj.replace('IPHONEOS_DEPLOYMENT_TARGET = 26.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 17.0;'),
      ),
      ['App targets iOS 17.0, not 26.0'],
    );
    assert.deepEqual(
      iosTargetProblems('App', pbxproj.replaceAll('IPHONEOS_DEPLOYMENT_TARGET', 'OTHER')),
      ['App sets no IPHONEOS_DEPLOYMENT_TARGET'],
    );
    assert.deepEqual(
      iosTargetProblems('App', `${pbxproj}\nINFOPLIST_KEY_UIDesignRequiresCompatibility = YES;`),
      ['App sets UIDesignRequiresCompatibility, which opts out of Liquid Glass'],
    );
  });
});

// scripts/native-jobs.sh ignores every .md path, so nothing a native build, test or lint reads may be a Markdown file.
describe('E002 #242: no native build or test reads a Markdown file', () => {
  const sources = [
    ...filesUnder('apps/ios', (name) =>
      /\.(swift|pbxproj|xcconfig|xctestplan|plist|yml)$/.test(name),
    ),
    ...filesUnder('apps/android', (name) => /\.(kt|kts|gradle|properties|toml|xml)$/.test(name)),
    ...filesUnder('e2e/maestro', (name) => /\.ya?ml$/.test(name)),
    ...['test-ios', '_ios', 'android', '_android', 'maestro'].map((name) => `scripts/${name}.sh`),
  ];
  const isComment = (line) => /^\s*(#|\/\/|\/\*|\*)/.test(line);

  it('finds the native sources', () => {
    for (const path of ['scripts/test-ios.sh', 'apps/android/app/build.gradle.kts'])
      assert.ok(sources.includes(path), path);
    assert.ok(sources.some((path) => path.endsWith('.swift')));
    assert.ok(sources.some((path) => path.endsWith('.kt')));
  });

  it('has no line outside a comment that names a README or a .md file', () => {
    const reads = [];
    for (const path of sources) {
      read(path)
        .split('\n')
        .forEach((line, index) => {
          if (!isComment(line) && /README|\.md(["'`]|$)/.test(line))
            reads.push(`${relative('.', path)}:${index + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(reads, []);
  });
});

describe('E017 #576, #594: a change to a native or Maestro file these tests read is not served from the test cache', () => {
  it('turbo.json lists as inputs of the root tests every Android, iOS and Maestro file read above', () => {
    for (const prefix of ['apps/android/', 'apps/ios/', 'e2e/maestro/'])
      assert.ok(
        [...nativeReads].filter((file) => file.startsWith(prefix)).length > 2,
        `the tests read files of ${prefix}`,
      );
    assert.deepEqual(uncovered([...nativeReads]), [], UNCOVERED_MESSAGE);
  });
});
