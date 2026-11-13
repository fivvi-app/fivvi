import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  filesUnder,
  readRecorder,
  rootTestInputs,
  uncovered,
  uncoveredBy,
} from './turbo-inputs.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

describe('E017 #576: the turbo inputs check of the root tests', () => {
  it('names a file that no input covers and passes one that an input covers', () => {
    const inputs = ['scripts/**', 'apps/android/**/*.kt'];
    assert.deepEqual(
      uncoveredBy(inputs, [
        'scripts/a.sh',
        'apps/android/app/src/main/kotlin/A.kt',
        'apps/android/gradle/libs.versions.toml',
        'apps/android/gradle/libs.versions.toml',
      ]),
      ['apps/android/gradle/libs.versions.toml'],
    );
  });

  it('needs no input for turbo.json itself', () => {
    assert.deepEqual(uncoveredBy([], ['turbo.json']), []);
  });

  it('reads the inputs of //#test:root from the real turbo.json', () => {
    assert.ok(rootTestInputs().includes('scripts/**'));
    assert.deepEqual(uncovered(['scripts/test/turbo-inputs.mjs']), []);
    assert.deepEqual(uncovered(['apps/nowhere/file.txt']), ['apps/nowhere/file.txt']);
  });

  it('records the files read under its prefixes, as relative paths, and expands a folder', () => {
    const { reads, note } = readRecorder('scripts/test/', 'apps/ios/Config/');
    assert.equal(
      note(join(ROOT, 'scripts/test/turbo-inputs.mjs')),
      join(ROOT, 'scripts/test/turbo-inputs.mjs'),
    );
    note('apps/ios/Config');
    note(join(ROOT, 'scripts/risk.sh'));
    note('/etc/hosts');
    assert.ok(reads.has('scripts/test/turbo-inputs.mjs'));
    assert.ok(reads.has('apps/ios/Config/Debug.xcconfig'));
    assert.ok(!reads.has('scripts/risk.sh'), 'outside the prefixes');
    assert.ok(![...reads].some((file) => file.startsWith('/') || file.startsWith('..')));
  });

  it('records only the files of a folder that match the pattern it is given, as `grep --include` reads them', () => {
    const { reads, note } = readRecorder('apps/ios/');
    note('apps/ios/Config', /\.xcconfig$/);
    assert.deepEqual(
      [...reads].sort(),
      ['Debug', 'Release', 'Simulator'].map((name) => `apps/ios/Config/${name}.xcconfig`),
    );
  });

  it('skips build output inside a folder, and records a path that does not exist, as a read of it fails the test', () => {
    const { reads, note } = readRecorder('apps/ios/');
    note('apps/ios');
    note('apps/ios/nothing.swift');
    assert.ok(reads.has('apps/ios/README.md'));
    assert.ok(reads.has('apps/ios/nothing.swift'));
    assert.ok(![...reads].some((file) => file.includes('/.build/')));
  });

  it('records only the files git sees in a folder, not one it ignores, such as .DS_Store', () => {
    const ignored = join(ROOT, 'apps/ios/Config/.DS_Store');
    writeFileSync(ignored, '');
    try {
      const { reads, note } = readRecorder('apps/ios/');
      note('apps/ios/Config');
      assert.ok(reads.has('apps/ios/Config/Debug.xcconfig'));
      assert.ok(!reads.has('apps/ios/Config/.DS_Store'));
      assert.ok(!filesUnder('apps/ios/Config').includes('apps/ios/Config/.DS_Store'));
    } finally {
      rmSync(ignored, { force: true });
    }
  });

  it('lists the files under a folder that a filter accepts, as relative paths', () => {
    assert.deepEqual(
      filesUnder('apps/ios/Config', (name) => name.endsWith('.xcconfig')).sort(),
      ['Debug', 'Release', 'Simulator'].map((name) => `apps/ios/Config/${name}.xcconfig`),
    );
  });
});
