import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { UNCOVERED_MESSAGE, uncovered } from './turbo-inputs.mjs';

// E017 AC8 and E002 #242: the application ID of each native app is final (it can't change after the first upload),
// and the app's README records it. That is checked here, on Linux, not by the native builds: CI doesn't run the
// native jobs for a README-only change (scripts/native-jobs.sh), so no native build or test may read a README.

const ROOT = join(import.meta.dirname, '..', '..');
// The Android files this test reads: turbo caches `//#test:root` by its `inputs`, so each must be one of them (last test).
const androidReads = new Set();
const read = (path) => {
  if (path.startsWith('apps/android/')) androidReads.add(path);
  return readFileSync(join(ROOT, path), 'utf8');
};

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
    // An unqualified task runs in every module that has it, so a module added later is covered; a task of :app or :client
    // alone would leave the other app out.
    const gradleLines = script.split('\n').filter((line) => /^\s*gradle\b/.test(line));
    const unqualified = (task) =>
      gradleLines.filter((line) => new RegExp(`(^|\\s)${task}(\\s|$)`).test(line.trim()));
    assert.equal(
      unqualified('testDebugUnitTest').length,
      2,
      'test and verify run testDebugUnitTest',
    );
    assert.equal(unqualified('connectedDebugAndroidTest').length, 1);
    assert.match(script, /--tests app\.fivvi\.pro\.BuildInfoTest/);
    assert.match(script, /:client:testDebugUnitTest --tests app\.fivvi\.client\.BuildInfoTest/);
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
  const files = (dir, accept) => {
    const found = [];
    for (const name of readdirSync(join(ROOT, dir))) {
      if (['.build', 'build', '.gradle', 'node_modules', 'DerivedData'].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(join(ROOT, path)).isDirectory()) found.push(...files(path, accept));
      else if (accept(name)) found.push(path);
    }
    return found;
  };
  const sources = [
    ...files('apps/ios', (name) => /\.(swift|pbxproj|xcconfig|xctestplan|plist|yml)$/.test(name)),
    ...files('apps/android', (name) => /\.(kt|kts|gradle|properties|toml|xml)$/.test(name)),
    ...files('e2e/maestro', (name) => /\.ya?ml$/.test(name)),
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

describe('E017 #576: a change to an Android file these tests read is not served from the test cache', () => {
  it('turbo.json lists as inputs of the root tests every Android file read above', () => {
    assert.ok(androidReads.size > 2, 'the tests read the Android files');
    assert.deepEqual(uncovered([...androidReads]), [], UNCOVERED_MESSAGE);
  });
});
