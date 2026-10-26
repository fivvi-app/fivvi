import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

// E017 AC8 and E002 #242: the application ID of each native app is final (it can't change after the first upload),
// and the app's README records it. That is checked here, on Linux, not by the native builds: CI doesn't run the
// native jobs for a README-only change (scripts/native-jobs.sh), so no native build or test may read a README.

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

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
    const configs = readdirSync(join(ROOT, 'apps/ios/Config')).filter((file) =>
      file.endsWith('.xcconfig'),
    );
    assert.ok(configs.length > 0);
    for (const file of configs) {
      assert.doesNotMatch(read(`apps/ios/Config/${file}`), /PRODUCT_BUNDLE_IDENTIFIER/, file);
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
